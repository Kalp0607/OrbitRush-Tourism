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

// Configure Socket.io with fast ping/pong detection (detects disconnects in ~3-5s)
const io = new Server(server, {
  pingTimeout: 3000,
  pingInterval: 5000,
});

const PORT = process.env.PORT || 8008;

// Favicon Setup
app.use(favicon(path.join(__dirname, "public", "images", "favicon.png")));

// Routes Import
const userRoute = require("./routes/user");
const tourRoute = require("./routes/tour");
const staticRoute = require("./routes/static");
const bookingRoutes = require("./routes/bookingRoutes");
const aiAssistantRoute = require("./routes/aiAssistant");

// Database Models
const Tour = require("./models/tour");
const Enquiry = require("./models/enquiry");
const Comment = require("./models/comments");
const ChatMessage = require("./models/chat");
const Booking = require("./models/bookings");

// Services & Middlewares
const { checkForAuthenticationCookie } = require("./middlewares/authentication");
const { getNavTours } = require("./services/navCache");
const { cloudinaryDevFallbackMiddleware } = require("./services/imageStorage");

// Database Connection & Initializations
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("MongoDB Connected");
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
app.use("/api/ai-assistant", aiAssistantRoute);
app.use("/", staticRoute);

// Active Connected Customer Rooms Store: room -> Map(socketId -> { senderName, connectedAt })
const activeCustomerSockets = new Map();

// Helper to get connected customer chat rooms list for admin panel
async function getConnectedRoomsList() {
  const connectedRoomIds = Array.from(activeCustomerSockets.keys());
  if (connectedRoomIds.length === 0) return [];

  const roomsList = [];
  for (const room of connectedRoomIds) {
    const socketMap = activeCustomerSockets.get(room);
    if (!socketMap || socketMap.size === 0) continue;

    const firstSocketInfo = Array.from(socketMap.values())[0];
    const customerName = firstSocketInfo ? firstSocketInfo.senderName : "Customer";

    let lastMsgData = await ChatMessage.findOne({ room }).sort({ createdAt: -1 }).lean();

    if (!lastMsgData) {
      lastMsgData = {
        _id: room,
        message: "Connected to live chat",
        senderName: customerName,
        senderRole: "NORMAL",
        createdAt: new Date(),
      };
    }

    roomsList.push({
      _id: room,
      lastMessage: lastMsgData.message || "Connected to live chat",
      lastSenderName: customerName,
      lastSenderRole: lastMsgData.senderRole || "NORMAL",
      updatedAt: lastMsgData.createdAt || new Date(),
    });
  }

  roomsList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return roomsList;
}

// Helper to broadcast connected rooms list to all admins
async function broadcastConnectedRoomsToAdmins() {
  try {
    const rooms = await getConnectedRoomsList();
    io.to("admin_room").emit("all_chat_rooms", rooms);
  } catch (err) {
    console.error("Error broadcasting connected rooms:", err);
  }
}

// Helper to handle customer disconnection or room leave
function handleCustomerLeave(socket, optionalRoom) {
  let changed = false;

  const roomToClean = optionalRoom || socket.customerRoom;
  if (roomToClean && activeCustomerSockets.has(roomToClean)) {
    const socketMap = activeCustomerSockets.get(roomToClean);
    if (socketMap) {
      socketMap.delete(socket.id);
      if (socketMap.size === 0) {
        activeCustomerSockets.delete(roomToClean);
      }
      changed = true;
    }
    try {
      socket.leave(roomToClean);
    } catch (e) {}
  }

  // Exhaustive sweep across active customer sockets
  for (const [room, socketMap] of activeCustomerSockets.entries()) {
    if (socketMap.has(socket.id)) {
      socketMap.delete(socket.id);
      changed = true;
      if (socketMap.size === 0) {
        activeCustomerSockets.delete(room);
      }
    }
    try {
      socket.leave(room);
    } catch (e) {}
  }

  if (changed) {
    broadcastConnectedRoomsToAdmins();
  }
}

// Socket.io Live Support Chat Implementation
io.on("connection", (socket) => {
  // Client or Admin joins a chat room
  socket.on("join_room", async (data) => {
    const { room, user } = data;
    if (!room) return;

    socket.join(room);

    const isAdmin = user && user.role === "ADMIN";

    if (!isAdmin) {
      socket.customerRoom = room;
      socket.customerName = (user && user.fullName) || data.senderName || "Customer";

      if (!activeCustomerSockets.has(room)) {
        activeCustomerSockets.set(room, new Map());
      }
      activeCustomerSockets.get(room).set(socket.id, {
        senderName: socket.customerName,
        connectedAt: new Date(),
      });

      broadcastConnectedRoomsToAdmins();
    }

    // Send historical chat messages for this room
    try {
      const history = await ChatMessage.find({ room }).sort({ createdAt: 1 }).lean();
      socket.emit("chat_history", history);
    } catch (err) {
      console.error("Error fetching chat history:", err);
    }
  });

  // Client leaves room explicitly (e.g. closing widget / beforeunload / pagehide)
  socket.on("leave_room", (data) => {
    handleCustomerLeave(socket, data && data.room);
  });

  // Admin joins global admin channel to monitor live connected rooms
  socket.on("join_admin", async () => {
    socket.join("admin_room");
    const connectedRooms = await getConnectedRoomsList();
    socket.emit("all_chat_rooms", connectedRooms);
  });

  // Send message event
  socket.on("send_message", async (data) => {
    const { room, senderId, senderName, senderRole, message } = data;
    if (!message || !message.trim() || !room) return;

    try {
      const chatMsg = await ChatMessage.create({
        room,
        sender: senderId && mongoose.isValidObjectId(senderId) ? new mongoose.Types.ObjectId(senderId) : null,
        senderName: senderName || "Customer",
        senderRole: senderRole || "NORMAL",
        message: message.trim(),
      });

      // Broadcast message to the specific chat room
      io.to(room).emit("receive_message", chatMsg);

      // Notify admins listening on admin_room
      io.to("admin_room").emit("new_room_activity", chatMsg);
      broadcastConnectedRoomsToAdmins();
    } catch (err) {
      console.error("Error saving/emitting chat message:", err);
    }
  });

  // Disconnecting & Disconnect handlers to clean up connected customer sockets immediately
  socket.on("disconnecting", () => {
    handleCustomerLeave(socket);
  });

  socket.on("disconnect", () => {
    handleCustomerLeave(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Server Started at Port ${PORT}`);
});
