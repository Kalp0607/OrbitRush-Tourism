require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const favicon = require("serve-favicon");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8008;

// Favicon Setup
app.use(favicon(path.join(__dirname, "public", "images", "favicon.png")));

// Routes Import
const userRoute = require("./routes/user");
const tourRoute = require("./routes/tour");
const staticRoute = require("./routes/static");
const bookingRoutes = require("./routes/bookingRoutes");

// Database Models
const Tour = require("./models/tour");
const Enquiry = require("./models/enquiry");
const Comment = require("./models/comments");
const ChatMessage = require("./models/chat");

// Services & Middlewares
const { checkForAuthenticationCookie } = require("./middlewares/authentication");
const { getNavTours } = require("./services/navCache");
const { cloudinaryDevFallbackMiddleware } = require("./services/imageStorage");

// Database Connection & Initializations
mongoose
  .connect(process.env.MONGO_URL)
  .then(async () => {
    console.log("MongoDB Connected");

    // Requirement 3: Remove all existing reviews on startup
    try {
      await Comment.deleteMany({});
    } catch (err) {
      console.error("Error clearing existing reviews:", err);
    }

    // Remove any existing bookings or enquiries made by admin users
    try {
      const User = require("./models/user");
      const Booking = require("./models/bookings");
      const Enquiry = require("./models/enquiry");

      const adminUsers = await User.find({ role: "ADMIN" }).select("_id email");
      const adminIds = adminUsers.map((u) => u._id);
      const adminEmails = adminUsers.map((u) => u.email);

      if (adminIds.length > 0) {
        await Booking.deleteMany({
          $or: [{ userId: { $in: adminIds } }, { email: { $in: adminEmails } }],
        });
        await Enquiry.deleteMany({
          $or: [{ userId: { $in: adminIds } }, { email: { $in: adminEmails } }],
        });
      }
    } catch (err) {
      console.error("Error purging admin bookings/enquiries:", err);
    }

    // Requirement 2: Backfill 10-12 random dates (from tomorrow up to 6-7 months) for tours
    try {
      const tours = await Tour.find({});
      for (const t of tours) {
        let modified = false;

        // Ensure every tour has 10 to 12 available dates spanning next 6-7 months
        if (!t.availableDates || t.availableDates.length < 10) {
          const offsets = new Set();
          const datesCount = Math.floor(Math.random() * 3) + 10; // 10 to 12
          while (offsets.size < datesCount) {
            offsets.add(Math.floor(Math.random() * 210) + 1); // 1 to 210 days
          }
          const sortedOffsets = Array.from(offsets).sort((a, b) => a - b);
          const baseDate = new Date();
          baseDate.setHours(0, 0, 0, 0);

          t.availableDates = sortedOffsets.map((offset) => {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + offset);
            return d;
          });
          modified = true;
        }

        if (!t.tripStartDate || modified) {
          t.tripStartDate = t.availableDates[0];
          modified = true;
        }

        if (!t.tripEndDate || modified) {
          let days = 1;
          if (t.duration) {
            const match = t.duration.match(/(\d+)\s*day/i);
            if (match) days = parseInt(match[1], 10);
          }
          const endDate = new Date(t.tripStartDate);
          endDate.setDate(endDate.getDate() + (days > 1 ? days - 1 : 0));
          t.tripEndDate = endDate;
          modified = true;
        }

        if (modified) {
          await t.save();
        }
      }
      console.log("🗓️ All tours verified and backfilled with 10-12 random dates across 6-7 months.");
    } catch (err) {
      console.error("Error backfilling tour start/end dates:", err);
    }
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Compression & Body Parsing
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(checkForAuthenticationCookie("token"));

// Global Navigation Tours Middleware
app.use(async (req, res, next) => {
  try {
    res.locals.tours = await getNavTours();
  } catch (err) {
    res.locals.tours = [];
  }
  next();
});

// Development Cloudinary Fallback for /uploads
app.use("/uploads", cloudinaryDevFallbackMiddleware);

// Static File Serving
app.use(
  express.static(path.resolve("./public"), {
    maxAge: "1d",
    etag: true,
  })
);

// EJS Setup
app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

// Routes Setup
app.use("/user", userRoute);
app.use("/tour", tourRoute);
app.use("/booking", bookingRoutes);
app.use("/", staticRoute);

// Socket.io Live Support Chat Implementation
io.on("connection", (socket) => {
  // Client or Admin joins a chat room (room ID is customer's userId or room string)
  socket.on("join_room", async (data) => {
    const { room } = data;
    socket.join(room);

    // Send historical chat messages for this room
    try {
      const history = await ChatMessage.find({ room }).sort({ createdAt: 1 }).lean();
      socket.emit("chat_history", history);
    } catch (err) {
      console.error("Error fetching chat history:", err);
    }
  });

  // Admin joins global admin channel to monitor and manage all active rooms
  socket.on("join_admin", async () => {
    socket.join("admin_room");

    try {
      const roomsAggregate = await ChatMessage.aggregate([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$room",
            lastMessage: { $first: "$message" },
            lastSenderName: { $first: "$senderName" },
            lastSenderRole: { $first: "$senderRole" },
            updatedAt: { $first: "$createdAt" },
          },
        },
        { $sort: { updatedAt: -1 } },
      ]);
      socket.emit("all_chat_rooms", roomsAggregate);
    } catch (err) {
      console.error("Error fetching all chat rooms for admin:", err);
    }
  });

  // Send message event
  socket.on("send_message", async (data) => {
    const { room, senderId, senderName, senderRole, message } = data;
    if (!message || !message.trim()) return;

    try {
      const chatMsg = await ChatMessage.create({
        room,
        sender: senderId ? new mongoose.Types.ObjectId(senderId) : null,
        senderName: senderName || "Customer",
        senderRole: senderRole || "NORMAL",
        message: message.trim(),
      });

      // Broadcast message to the specific chat room
      io.to(room).emit("receive_message", chatMsg);

      // Notify admins listening on admin_room
      io.to("admin_room").emit("new_room_activity", chatMsg);
    } catch (err) {
      console.error("Error saving/emitting chat message:", err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server Started at Port ${PORT}`);
});
