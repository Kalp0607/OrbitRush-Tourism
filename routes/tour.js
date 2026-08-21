const express = require("express");
const path = require("path");
const fs = require("fs");
const Tour = require("../models/tour");
const Comment = require("../models/comments");
const Booking = require("../models/bookings");
const Enquiry = require("../models/enquiry");
const User = require("../models/user");
const { requireAdmin } = require("../middlewares/authentication");
const { sendEmail } = require("../services/mailer");
const { getNavTours, clearNavToursCache } = require("../services/navCache");
const {
  upload,
  processUploadedFile,
  processUploadedFiles,
} = require("../services/imageStorage");

const router = express.Router();

// Helper: Calculate trip end date from start date and duration string
function calculateTripEndDate(startDate, durationStr) {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;

  let days = 1;
  if (durationStr && typeof durationStr === "string") {
    const match = durationStr.match(/(\d+)\s*day/i);
    if (match) {
      days = parseInt(match[1], 10);
    }
  }
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + (days > 1 ? days - 1 : 0));
  return endDate;
}

// GET Routes (Public Access)

// 1. Display all tours
router.get("/", async (req, res) => {
  try {
    const tours = await Tour.find({}).sort({ createdAt: -1 }).lean();
    res.render("tours", {
      user: req.user,
      tours,
    });
  } catch (error) {
    const tours = await getNavTours();
    res.status(500).render("error", {
      message: "Error fetching tours",
      user: req.user,
      tours,
    });
  }
});

// Enquiry Routes
router.get("/enquire", async (req, res) => {
  if (!req.user) {
    return res.redirect(
      "/user/signup?message=Please create an account to make an enquiry"
    );
  }

  if (req.user.role === "ADMIN") {
    return res.redirect("/tour?error=Admins are not allowed to submit tour enquiries.");
  }

  try {
    const tours = await getNavTours();
    res.render("enquire", {
      user: req.user,
      tours: tours,
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
  if (req.user && req.user.role === "ADMIN") {
    const tours = await getNavTours();
    return res.render("enquire", {
      user: req.user,
      tours: tours,
      error: "Admins are not allowed to submit tour enquiries.",
      success: null,
    });
  }

  try {
    const { phone, tourName, numberOfPeople, preferredDate, message } = req.body;

    if (!phone || !tourName || !numberOfPeople || !message) {
      const tours = await getNavTours();
      return res.render("enquire", {
        user: req.user,
        tours: tours,
        error: "Please fill all required fields",
        success: null,
      });
    }

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

    const recipientOwner = process.env.GMAIL_USER || process.env.GMAIL_ID;
    if (recipientOwner) {
      await sendEmail({
        to: recipientOwner,
        subject: `🎯 New Tour Enquiry: ${tourName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2>🚀 New Enquiry Received!</h2>
            <p><strong>Tour:</strong> ${tourName}</p>
            <p><strong>Customer:</strong> ${req.user.fullName} (${req.user.email})</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Message:</strong> ${message}</p>
          </div>
        `,
      });
    }

    await sendEmail({
      to: req.user.email,
      subject: `✅ Enquiry Confirmation - ${tourName} | OrbitRush Tourism`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2>🎉 Thank You for Your Enquiry!</h2>
          <p>Dear <strong>${req.user.fullName}</strong>,</p>
          <p>We have received your enquiry for <strong>${tourName}</strong> and will contact you within 24 hours.</p>
        </div>
      `,
    });

    const tours = await getNavTours();

    res.render("enquire", {
      user: req.user,
      tours: tours,
      error: null,
      success: `Thank you ${req.user.fullName}! Your enquiry for "${tourName}" has been submitted successfully. We'll contact you within 24 hours.`,
    });
  } catch (error) {
    console.error("❌ Error creating enquiry:", error);
    const tours = await getNavTours();
    res.render("enquire", {
      user: req.user,
      tours: tours,
      error: "Something went wrong. Please try again.",
      success: null,
    });
  }
});

// 2. Show single tour by name (with review eligibility check)
router.get("/:tourName", async (req, res) => {
  try {
    const tourNameDecoded = req.params.tourName.replace(/-/g, " ");
    const tour = await Tour.findOne({
      name: { $regex: new RegExp("^" + tourNameDecoded + "$", "i") },
    }).lean();

    if (!tour) {
      return res.status(404).render("error", {
        message: "Tour not found",
        user: req.user,
      });
    }

    // Auto calculate tripEndDate if missing on tour
    if (tour.tripStartDate && !tour.tripEndDate) {
      tour.tripEndDate = calculateTripEndDate(tour.tripStartDate, tour.duration);
    }

    const comments = await Comment.find({ tourId: tour._id })
      .populate("createdBy", "fullName profileImageURL")
      .sort({ createdAt: -1 })
      .lean();

    // Check if user is eligible to submit a review
    let canReview = false;
    let reviewRestrictionReason = "";

    if (req.user) {
      const userBookings = await Booking.find({
        userId: req.user._id,
        tourId: tour._id,
        status: { $ne: "CANCELLED" },
        paymentStatus: "completed",
      }).sort({ createdAt: -1 });

      if (!userBookings || userBookings.length === 0) {
        reviewRestrictionReason = "You can only write a review if you have booked this tour.";
      } else {
        const now = new Date();
        const completedBooking = userBookings.find((b) => {
          const endDate = b.tripEndDate ? new Date(b.tripEndDate) : calculateTripEndDate(b.travelDate, tour.duration);
          return now >= endDate;
        });

        if (completedBooking) {
          canReview = true;
        } else {
          reviewRestrictionReason = "You can only write a review after your trip has been completed.";
        }
      }
    } else {
      reviewRestrictionReason = "Please sign in to write a review.";
    }

    res.render("tour-detail", {
      user: req.user,
      tour,
      comments,
      canReview,
      reviewRestrictionReason,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    console.error("Error fetching tour details:", error);
    res.status(500).render("error", {
      message: "Error fetching tour details",
      user: req.user,
    });
  }
});

// ADMIN ONLY Routes

// 3. Show create tour form (Admin only)
router.get("/admin/create", requireAdmin, async (req, res) => {
  res.render("admin/create-tour", {
    user: req.user,
  });
});

// 3b. Show edit tour form (Admin only)
router.get("/admin/edit/:id", requireAdmin, async (req, res) => {
  try {
    const tour = await Tour.findById(req.params.id).lean();
    if (!tour) {
      return res.status(404).render("error", {
        message: "Tour not found",
        user: req.user,
      });
    }
    res.render("admin/edit-tour", {
      user: req.user,
      tour,
    });
  } catch (error) {
    res.status(500).render("error", {
      message: "Error loading edit tour page",
      user: req.user,
    });
  }
});

// 4. Admin dashboard - manage all tours
router.get("/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: { $ne: "ADMIN" } });
    const tours = await Tour.find({}).sort({ createdAt: -1 }).lean();
    const totalEnquiries = await Enquiry.countDocuments({});
    res.render("admin/tour-dashboard", {
      user: req.user,
      totalUsers,
      tours,
      totalEnquiries,
    });
  } catch (error) {
    res.status(500).render("error", {
      message: "Error fetching tours dashboard",
      user: req.user,
    });
  }
});

// Admin Live Support Chat Dashboard
router.get("/admin/chat", requireAdmin, async (req, res) => {
  res.render("admin/chat", {
    user: req.user,
  });
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
        tripStartDate,
        availableDates,
      } = req.body;

      let coverImagePath = "";
      let moreImagesPaths = [];

      if (req.files && req.files["coverImage"] && req.files["coverImage"][0]) {
        coverImagePath = await processUploadedFile(req.files["coverImage"][0], "tours");
      }

      if (req.files && req.files["moreImages"]) {
        moreImagesPaths = await processUploadedFiles(req.files["moreImages"], "tours");
      }

      let processedItinerary = [];
      if (itinerary && Array.isArray(itinerary)) {
        processedItinerary = itinerary.map((day, index) => ({
          day: index + 1,
          title: day.title || "",
          description: day.description || "",
        }));
      }

      const startDate = tripStartDate ? new Date(tripStartDate) : new Date();
      const endDate = calculateTripEndDate(startDate, duration);

      let processedDates = [startDate];
      if (availableDates) {
        let rawDates = Array.isArray(availableDates)
          ? availableDates
          : [availableDates];
        processedDates = rawDates
          .filter((d) => d && d.trim())
          .map((d) => new Date(d));
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
        tripStartDate: startDate,
        tripEndDate: endDate,
        availableDates: processedDates,
      });

      clearNavToursCache();
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

// 5b. Update existing tour (Admin only)
router.post(
  "/admin/edit/:id",
  requireAdmin,
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "moreImages", maxCount: 8 },
  ]),
  async (req, res) => {
    try {
      const existingTour = await Tour.findById(req.params.id);
      if (!existingTour) {
        return res.status(404).render("error", {
          message: "Tour not found",
          user: req.user,
        });
      }

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
        tripStartDate,
        availableDates,
      } = req.body;

      let coverImagePath = existingTour.coverImage;
      let moreImagesPaths = existingTour.moreImages || [];

      if (req.files && req.files["coverImage"] && req.files["coverImage"][0]) {
        coverImagePath = await processUploadedFile(req.files["coverImage"][0], "tours");
      }

      if (req.files && req.files["moreImages"] && req.files["moreImages"].length > 0) {
        moreImagesPaths = await processUploadedFiles(req.files["moreImages"], "tours");
      }

      let processedItinerary = [];
      if (itinerary && Array.isArray(itinerary)) {
        processedItinerary = itinerary.map((day, index) => ({
          day: index + 1,
          title: day.title || "",
          description: day.description || "",
        }));
      }

      const startDate = tripStartDate ? new Date(tripStartDate) : (existingTour.tripStartDate || new Date());
      const endDate = calculateTripEndDate(startDate, duration);

      let processedDates = [startDate];
      if (availableDates) {
        let rawDates = Array.isArray(availableDates)
          ? availableDates
          : [availableDates];
        processedDates = rawDates
          .filter((d) => d && String(d).trim())
          .map((d) => new Date(d));
      }

      existingTour.name = name;
      existingTour.location = location;
      existingTour.price = parseFloat(price);
      existingTour.duration = duration;
      existingTour.overview = overview;
      existingTour.coverImage = coverImagePath;
      existingTour.moreImages = moreImagesPaths;
      existingTour.video = video || "";
      existingTour.included = Array.isArray(included)
        ? included
        : included
        ? included.split("\n").filter((item) => item.trim())
        : [];
      existingTour.excluded = Array.isArray(excluded)
        ? excluded
        : excluded
        ? excluded.split("\n").filter((item) => item.trim())
        : [];
      existingTour.itinerary = processedItinerary;
      existingTour.tripStartDate = startDate;
      existingTour.tripEndDate = endDate;
      existingTour.availableDates = processedDates;

      await existingTour.save();
      clearNavToursCache();

      const tourUrlName = name.replace(/\s+/g, "-").toLowerCase();
      res.redirect(`/tour/${tourUrlName}`);
    } catch (error) {
      console.error("Error editing tour:", error);
      res.status(500).render("error", {
        message: "Error updating tour: " + error.message,
        user: req.user,
      });
    }
  }
);

// 6. Delete tour (Admin only)
router.delete("/:tourName", requireAdmin, async (req, res) => {
  try {
    const tour = await Tour.findOneAndDelete({
      name: { $regex: new RegExp("^" + req.params.tourName.replace(/-/g, " ") + "$", "i") },
    });

    if (!tour) {
      return res.status(404).json({ message: "Tour not found" });
    }

    clearNavToursCache();
    await Comment.deleteMany({ tourId: tour._id });

    res.json({ message: "Tour deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting tour" });
  }
});

// Review / Comment Routes with Strict Authorization & Photos
router.post(
  "/:tourName/comment",
  upload.array("photos", 5),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).redirect("/user/signin?message=Please login to review");
      }

      const tourNameDecoded = req.params.tourName.replace(/-/g, " ");
      const tour = await Tour.findOne({
        name: { $regex: new RegExp("^" + tourNameDecoded + "$", "i") },
      });

      if (!tour) {
        return res.status(404).render("error", {
          message: "Tour not found",
          user: req.user,
        });
      }

      // 1. Strict Check: User MUST have booked this tour
      const userBookings = await Booking.find({
        userId: req.user._id,
        tourId: tour._id,
        status: { $ne: "CANCELLED" },
        paymentStatus: "completed",
      });

      if (!userBookings || userBookings.length === 0) {
        const tourUrlName = tour.name.replace(/\s+/g, "-").toLowerCase();
        return res.redirect(
          `/tour/${tourUrlName}?error=You can only review tours that you have actually booked.`
        );
      }

      // 2. Strict Check: User's trip MUST be completed
      const now = new Date();
      const completedBooking = userBookings.find((b) => {
        const endDate = b.tripEndDate ? new Date(b.tripEndDate) : calculateTripEndDate(b.travelDate, tour.duration);
        return now >= endDate;
      });

      if (!completedBooking) {
        const tourUrlName = tour.name.replace(/\s+/g, "-").toLowerCase();
        return res.redirect(
          `/tour/${tourUrlName}?error=You cannot submit a review before completing your trip.`
        );
      }

      // 3. Process optional photos
      let photoPaths = [];
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        photoPaths = await processUploadedFiles(req.files, "reviews");
      }

      await Comment.create({
        content: req.body.content,
        rating: parseInt(req.body.rating, 10),
        tourId: tour._id,
        createdBy: req.user._id,
        photos: photoPaths,
      });

      const tourUrlName = tour.name.replace(/\s+/g, "-").toLowerCase();
      res.redirect(`/tour/${tourUrlName}?success=Thank you for your review!`);
    } catch (error) {
      console.error("Error adding review:", error);
      res.status(500).render("error", {
        message: "Error adding review: " + error.message,
        user: req.user,
      });
    }
  }
);

// Delete comment (Admin or comment owner)
router.delete("/comment/:commentId", async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

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

// Admin User Management
router.get("/admin/dashboard/user-details", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select("fullName email role createdAt")
      .lean();

    res.render("admin/user-details", {
      user: req.user,
      users: users,
    });
  } catch (error) {
    res.status(500).render("error", {
      message: "Error fetching user details",
      user: req.user,
    });
  }
});

router.delete("/admin/user/:userId", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const userToDelete = await User.findById(userId);

    if (!userToDelete) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (userToDelete.role === "ADMIN") {
      return res.status(403).json({ success: false, message: "Cannot delete admin users" });
    }

    await User.findByIdAndDelete(userId);
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting user" });
  }
});

// Admin Enquiries Management
router.get("/admin/dashboard/enquiries-details", requireAdmin, async (req, res) => {
  try {
    const enquiries = await Enquiry.find({}).sort({ createdAt: -1 }).lean();
    res.render("admin/enquiries-details", {
      user: req.user,
      enquiries: enquiries,
    });
  } catch (error) {
    res.status(500).render("error", {
      message: "Error fetching enquiries data",
      user: req.user,
    });
  }
});

router.delete("/admin/enquiry/:enquiryId", requireAdmin, async (req, res) => {
  try {
    const enquiryId = req.params.enquiryId;
    const enquiryToDelete = await Enquiry.findById(enquiryId);

    if (!enquiryToDelete) {
      return res.status(404).json({ success: false, message: "Enquiry not found" });
    }

    await Enquiry.findByIdAndDelete(enquiryId);
    res.json({ success: true, message: "Enquiry deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting enquiry" });
  }
});

module.exports = router;
