const Enquiry = require("../models/enquiry");
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Tour = require("../models/tour");
const Comment = require("../models/comments");
const { requireAdmin } = require("../middlewares/authentication");
const User = require("../models/user");
const nodemailer = require("nodemailer");

//All tours function
async function getTours() {
  try {
    return await Tour.find({}); // Remove .select("name") to get all fields
  } catch (error) {
    return [];
  }
}

// Simple storage configuration - upload to general folder first
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.resolve(`./public/uploads/tours/`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const fileExt = path.extname(file.originalname);
    const random = Math.random().toString(36).substr(2, 5);

    let fileName;
    if (file.fieldname === "coverImage") {
      fileName = `cover-${timestamp}-${random}${fileExt}`;
    } else if (file.fieldname === "moreImages") {
      fileName = `gallery-${timestamp}-${random}${fileExt}`;
    } else {
      fileName = `${file.fieldname}-${timestamp}${fileExt}`;
    }

    cb(null, fileName);
  },
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 5MB limit per file
    files: 10, // Maximum 10 files total
  },
});

const router = express.Router();

//mail transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "orbitrushtourism@gmail.com",
    pass: "akijwifxnqpfvrhl", // Your Gmail App Password
  },
});

// GET Routes (Public Access)

// 1. Display all tours
router.get("/", async (req, res) => {
  try {
    const tours = await Tour.find({}).sort({ createdAt: -1 });
    res.render("tours", {
      user: req.user,
      tours,
    });
  } catch (error) {
    const tours = await getTours(); // ADD THIS LINE
    res.status(500).render("error", {
      message: "Error fetching tours",
      user: req.user,
      tours,
    }); // ADD tours
  }
});

//These are Enquiry Routes

router.get("/enquire", async (req, res) => {
  // Simple check - if not logged in, show alert and redirect to signup
  if (!req.user) {
    return res.redirect(
      "/user/signup?message=Please create an account to make an enquiry"
    );
  }

  try {
    // Get all tours for dropdown
    const tours = await Tour.find({}).select("name").sort({ name: 1 });

    res.render("enquire", {
      user: req.user,
      tours: tours, // Pass tours for dropdown
      error: null,
      success: null,
    });
  } catch (error) {
    res.render("enquire", {
      user: req.user,
      tours: [],
      error: "Error loading enquiry form",
      success: null,
    });
  }
});

router.post("/enquire", async (req, res) => {
  // Check if user is logged in

  try {
    const { phone, tourName, numberOfPeople, preferredDate, message } =
      req.body;

    // Validate required fields
    if (!phone || !tourName || !numberOfPeople || !message) {
      const tours = await Tour.find({}).select("name").sort({ name: 1 });
      return res.render("enquire", {
        user: req.user,
        tours: tours,
        error: "Please fill all required fields",
        success: null,
      });
    }

    // Create new enquiry
    const enquiry = await Enquiry.create({
      fullName: req.user.fullName,
      email: req.user.email,
      phone: phone,
      tourName: tourName,
      numberOfPeople: parseInt(numberOfPeople),
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      message: message.trim(),
      userId: req.user._id,
    });

    console.log("✅ New enquiry created:", {
      id: enquiry._id,
      tourName: enquiry.tourName,
      user: enquiry.fullName,
    });

    // 📧 SEND EMAIL NOTIFICATIONS (ADD THIS SECTION)
    try {
      // Send notification to business owner
      await transporter.sendMail({
        from: "orbitrushtourism@gmail.com",
        to: "orbitrushtourism@gmail.com",
        subject: `🎯 New Tour Enquiry: ${tourName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
              <h2 style="margin: 0;">🚀 New Enquiry Received!</h2>
              <p style="margin: 5px 0;">OrbitRush Tourism</p>
            </div>
            
            <h3 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Tour Details</h3>
            <p><strong>📍 Tour:</strong> ${tourName}</p>
            <p><strong>👥 Number of People:</strong> ${numberOfPeople}</p>
            <p><strong>📅 Preferred Date:</strong> ${
              preferredDate
                ? new Date(preferredDate).toLocaleDateString("en-IN")
                : "Flexible"
            }</p>
            
            <h3 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Customer Information</h3>
            <p><strong>👤 Name:</strong> ${req.user.fullName}</p>
            <p><strong>📧 Email:</strong> ${req.user.email}</p>
            <p><strong>📱 Phone:</strong> ${phone}</p>
            
            <h3 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Customer Message</h3>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea;">
              <p style="margin: 0; line-height: 1.6;">${message}</p>
            </div>
            
            <div style="background: #e8f4f8; padding: 15px; border-radius: 5px; margin-top: 20px; text-align: center;">
              <p style="margin: 0; color: #2c3e50;"><strong>⏰ Enquiry Time:</strong> ${new Date().toLocaleString(
                "en-IN"
              )}</p>
            </div>
          </div>
        `,
      });

      // Send confirmation to customer
      await transporter.sendMail({
        from: "orbitrushtourism@gmail.com",
        to: req.user.email,
        subject: `✅ Enquiry Confirmation - ${tourName} | OrbitRush Tourism`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <div style="background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
              <h2 style="margin: 0;">🎉 Thank You for Your Enquiry!</h2>
              <p style="margin: 5px 0;">OrbitRush Tourism</p>
            </div>
            
            <p>Dear <strong>${req.user.fullName}</strong>,</p>
            <p>Thank you for your interest in our <strong>${tourName}</strong> tour! We have received your enquiry and our team will get back to you within <strong>24 hours</strong>.</p>
            
            <h3 style="color: #333; border-bottom: 2px solid #ff6b35; padding-bottom: 10px;">Your Enquiry Details</h3>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px;">
              <p><strong>📍 Tour:</strong> ${tourName}</p>
              <p><strong>👥 Number of People:</strong> ${numberOfPeople}</p>
              <p><strong>📅 Preferred Date:</strong> ${
                preferredDate
                  ? new Date(preferredDate).toLocaleDateString("en-IN")
                  : "Flexible"
              }</p>
              <p><strong>📱 Contact Number:</strong> ${phone}</p>
            </div>
            
            <div style="background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
              <h4 style="margin: 0 0 10px 0; color: #28a745;">What happens next?</h4>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Our tour expert will review your requirements</li>
                <li>We'll prepare a customized itinerary and quote</li>
                <li>You'll receive a detailed response within 24 hours</li>
                <li>We'll be available for any questions or modifications</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <p style="color: #666;">Need immediate assistance?</p>
              <p style="color: #333; font-size: 18px;"><strong>📞 +91 98765 43210</strong></p>
            </div>
          </div>
        `,
      });

      console.log("📧 Email notifications sent successfully!");
    } catch (emailError) {
      console.error("❌ Email notification failed:", emailError);
    }
    // END EMAIL SECTION

    // Get tours for dropdown
    const tours = await Tour.find({}).select("name").sort({ name: 1 });

    // Show success message
    res.render("enquire", {
      user: req.user,
      tours: tours,
      error: null,
      success: `Thank you ${req.user.fullName}! Your enquiry for "${tourName}" has been submitted successfully. Check your email for confirmation. We'll contact you within 24 hours.`,
    });
  } catch (error) {
    console.error("❌ Error creating enquiry:", error);

    const tours = await Tour.find({}).select("name").sort({ name: 1 });

    res.render("enquire", {
      user: req.user,
      tours: tours,
      error: "Something went wrong. Please try again.",
      success: null,
    });
  }
});

// 2. Show single tour by name
router.get("/:tourName", async (req, res) => {
  try {
    const tour = await Tour.findOne({
      name: { $regex: new RegExp(req.params.tourName.replace(/-/g, " "), "i") },
    });

    if (!tour) {
      const tours = await getTours(); // ADD THIS LINE
      return res.status(404).render("error", {
        message: "Tour not found",
        user: req.user,
        tours, // ADD THIS
      });
    }

    const comments = await Comment.find({ tourId: tour._id })
      .populate("createdBy")
      .sort({ createdAt: -1 });

    const tours = await getTours(); // ADD THIS LINE
    res.render("tour-detail", {
      user: req.user,
      tour,
      comments,
      tours, // ADD THIS
    });
  } catch (error) {
    const tours = await getTours(); // ADD THIS LINE
    res.status(500).render("error", {
      message: "Error fetching tour details",
      user: req.user,
      tours, // ADD THIS
    });
  }
});

// ADMIN ONLY Routes

// 3. Show create tour form (Admin only)
router.get("/admin/create", requireAdmin, async (req, res) => {
  // ADD async
  const tours = await getTours(); // ADD THIS LINE
  res.render("admin/create-tour", {
    user: req.user,
    tours, // ADD THIS
  });
});

// 4. Admin dashboard - manage all tours
router.get("/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: { $ne: "ADMIN" } });
    const tours = await Tour.find({}).sort({ createdAt: -1 });
    const totalEnquiries = await Enquiry.countDocuments({});
    const toursForNav = await getTours(); // ADD THIS LINE
    res.render("admin/tour-dashboard", {
      user: req.user,
      totalUsers,
      tours,
      totalEnquiries,
      tours: toursForNav, // ADD THIS (rename tours to toursForNav to avoid conflict)
    });
  } catch (error) {
    const tours = await getTours(); // ADD THIS LINE
    res.status(500).render("error", {
      message: "Error fetching tours dashboard",
      user: req.user,
      tours, // ADD THIS
    });
  }
});

// POST Routes

// 5. Create new tour (Admin only)
router.post(
  "/",
  requireAdmin,
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "moreImages", maxCount: 8 },
  ]),
  async (req, res) => {
    try {
      console.log("Files received:", req.files); // Debug log
      console.log("Body received:", req.body); // Debug log

      const {
        name,
        location,
        price,
        duration,
        overview,
        video,
        included,
        excluded,
        itinerary,
      } = req.body;

      // Handle file paths - simplified
      let coverImagePath = "";
      let moreImagesPaths = [];

      if (req.files && req.files["coverImage"]) {
        coverImagePath = `/uploads/tours/${req.files["coverImage"][0].filename}`;
      }

      if (req.files && req.files["moreImages"]) {
        moreImagesPaths = req.files["moreImages"].map(
          (file) => `/uploads/tours/${file.filename}`
        );
      }

      // Process itinerary if it exists
      let processedItinerary = [];
      if (itinerary && Array.isArray(itinerary)) {
        processedItinerary = itinerary.map((day, index) => ({
          day: index + 1,
          title: day.title || "",
          description: day.description || "",
        }));
      }

      const tour = await Tour.create({
        name,
        location,
        price: parseFloat(price),
        duration,
        overview,
        coverImage: coverImagePath,
        moreImages: moreImagesPaths,
        video: video || "",
        included: Array.isArray(included)
          ? included
          : included
          ? included.split("\n").filter((item) => item.trim())
          : [],
        excluded: Array.isArray(excluded)
          ? excluded
          : excluded
          ? excluded.split("\n").filter((item) => item.trim())
          : [],
        itinerary: processedItinerary,
      });

      console.log("Tour created successfully:", tour.name); // Debug log

      const tourUrlName = name.replace(/\s+/g, "-").toLowerCase();
      res.redirect(`/tour/${tourUrlName}`);
    } catch (error) {
      console.error("Error creating tour:", error);
      if (error.code === 11000) {
        return res.status(400).render("admin/create-tour", {
          user: req.user,
          error: "Tour name already exists. Please choose a different name.",
        });
      }
      res.status(500).render("error", {
        message: "Error creating tour: " + error.message,
        user: req.user,
      });
    }
  }
);

// 6. Delete tour (Admin only)
router.delete("/:tourName", requireAdmin, async (req, res) => {
  try {
    const tour = await Tour.findOneAndDelete({
      name: { $regex: new RegExp(req.params.tourName.replace(/-/g, " "), "i") },
    });

    if (!tour) {
      return res.status(404).json({ message: "Tour not found" });
    }

    // Delete associated comments
    await Comment.deleteMany({ tourId: tour._id });

    res.json({ message: "Tour deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting tour" });
  }
});

// Comment Routes

// 7. Add comment to tour (Authenticated users)
router.post("/:tourName/comment", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).redirect("/user/signin");
    }

    const tour = await Tour.findOne({
      name: { $regex: new RegExp(req.params.tourName.replace(/-/g, " "), "i") },
    });

    if (!tour) {
      return res.status(404).render("error", {
        message: "Tour not found",
        user: req.user,
      });
    }

    await Comment.create({
      content: req.body.content,
      rating: parseInt(req.body.rating),
      tourId: tour._id,
      createdBy: req.user._id,
    });

    const tourUrlName = tour.name.replace(/\s+/g, "-").toLowerCase();
    res.redirect(`/tour/${tourUrlName}`);
  } catch (error) {
    res.status(500).render("error", {
      message: "Error adding comment",
      user: req.user,
    });
  }
});

// 8. Delete comment (Admin or comment owner)
router.delete("/comment/:commentId", async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Check if user is admin or comment owner
    if (
      req.user.role !== "ADMIN" &&
      comment.createdBy.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this comment" });
    }

    await Comment.findByIdAndDelete(req.params.commentId);
    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting comment" });
  }
});

// 5. Admin user management page (Admin only)
router.get("/admin/dashboard/user-details", requireAdmin, async (req, res) => {
  try {
    console.log("✅ Admin accessing user details page");

    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select("fullName email role createdAt");

    console.log(`📊 Found ${users.length} users in database`);

    const tours = await getTours(); // ADD THIS LINE
    res.render("admin/user-details", {
      user: req.user,
      users: users,
      tours, // ADD THIS
    });
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    const tours = await getTours(); // ADD THIS LINE
    res.status(500).render("error", {
      message: "Error fetching user details",
      user: req.user,
      tours, // ADD THIS
    });
  }
});

// 6. Delete user (Admin only)
router.delete("/admin/user/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const userToDelete = await User.findById(userId);

    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Can't delete admin users
    if (userToDelete.role === "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete admin users",
      });
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    console.log(`✅ Deleted user: ${userToDelete.fullName}`);

    res.json({
      success: true,
      message: `User deleted successfully`,
    });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting user",
    });
  }
});

// 7. Admin enquiries management page (Admin only)

// 7. Admin enquiries management page (Admin only)
router.get(
  "/admin/dashboard/enquiries-details",
  requireAdmin,
  async (req, res) => {
    try {
      console.log("✅ Admin accessing enquiries details page");

      const enquiries = await Enquiry.find({}).sort({ createdAt: -1 });

      console.log(`📊 Found ${enquiries.length} enquiries in database`);

      const tours = await getTours(); // ADD THIS LINE
      res.render("admin/enquiries-details", {
        user: req.user,
        enquiries: enquiries,
        tours, // ADD THIS
      });
    } catch (error) {
      console.error("❌ Error fetching enquiries:", error);
      const tours = await getTours(); // ADD THIS LINE
      res.status(500).render("error", {
        message: "Error fetching enquiries data",
        user: req.user,
        tours, // ADD THIS
      });
    }
  }
);

// 8. Delete enquiry (Admin only)
router.delete("/admin/enquiry/:enquiryId", requireAdmin, async (req, res) => {
  try {
    const enquiryId = req.params.enquiryId;
    console.log(`🗑️ Admin attempting to delete enquiry: ${enquiryId}`);

    // Find the enquiry first
    const enquiryToDelete = await Enquiry.findById(enquiryId);

    if (!enquiryToDelete) {
      console.log("❌ Enquiry not found for deletion");
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    // Delete the enquiry
    await Enquiry.findByIdAndDelete(enquiryId);

    console.log(
      `✅ Successfully deleted enquiry for tour: ${enquiryToDelete.tourName}`
    );

    res.json({
      success: true,
      message: `Enquiry deleted successfully`,
    });
  } catch (error) {
    console.error("❌ Error deleting enquiry:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting enquiry",
    });
  }
});

module.exports = router;
