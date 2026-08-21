const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Tour = require("../models/tour");
const Comment = require("../models/comments");
const Booking = require("../models/bookings");
const Enquiry = require("../models/enquiry");
const User = require("../models/user");
const CustomEnquiry = require("../models/customEnquiry");
const { requireAdmin } = require("../middlewares/authentication");
const { sendEmail } = require("../services/mailer");
const { getNavTours, clearNavToursCache } = require("../services/navCache");
const {
  upload,
  processUploadedFile,
  processUploadedFiles,
} = require("../services/imageStorage");

const router = express.Router();

// Helper: Escape special characters for regex string
function escapeRegex(text) {
  if (!text) return "";
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// Helper: Recalculate and update ratings statistics for a Tour
async function updateTourRatingStats(tourId) {
  try {
    const stats = await Comment.aggregate([
      { $match: { tourId: new mongoose.Types.ObjectId(tourId) } },
      {
        $group: {
          _id: "$tourId",
          nRating: { $sum: 1 },
          avgRating: { $avg: "$rating" },
        },
      },
    ]);

    if (stats.length > 0) {
      await Tour.findByIdAndUpdate(tourId, {
        ratingsQuantity: stats[0].nRating,
        ratingsAverage: Math.round(stats[0].avgRating * 10) / 10,
      });
    } else {
      await Tour.findByIdAndUpdate(tourId, {
        ratingsQuantity: 0,
        ratingsAverage: 4.9,
      });
    }
  } catch (err) {
    console.error("Error updating tour rating statistics:", err);
  }
}

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
    const safeRegexPattern = "^" + escapeRegex(tourNameDecoded) + "$";
    const tour = await Tour.findOne({
      name: { $regex: new RegExp(safeRegexPattern, "i") },
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
    const totalCustomEnquiries = await CustomEnquiry.countDocuments({});
    res.render("admin/tour-dashboard", {
      user: req.user,
      totalUsers,
      tours,
      totalEnquiries,
      totalCustomEnquiries,
    });
  } catch (error) {
    console.error("Error fetching tours dashboard:", error);
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

// Helper parsers for form data (arrays, itineraries, guides)
function parseArrayField(body, fieldName) {
  let val = body[fieldName] !== undefined ? body[fieldName] : body[`${fieldName}[]`];
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean);
  }
  if (typeof val === "string") {
    if (val.includes("\n")) {
      return val.split("\n").map((s) => s.trim()).filter(Boolean);
    }
    return [val.trim()].filter(Boolean);
  }
  return [];
}

function parseItineraryField(body) {
  if (Array.isArray(body.itinerary)) {
    return body.itinerary
      .map((item, index) => {
        if (typeof item === "object" && item !== null) {
          return {
            day: parseInt(item.day, 10) || index + 1,
            title: item.title ? String(item.title).trim() : "",
            description: item.description ? String(item.description).trim() : "",
          };
        }
        return null;
      })
      .filter((item) => item && (item.title || item.description));
  }

  const itineraryMap = {};
  for (const key of Object.keys(body)) {
    const match = key.match(/^itinerary\[(\d+)\]\[(\w+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const prop = match[2];
      if (!itineraryMap[idx]) itineraryMap[idx] = { day: idx + 1, title: "", description: "" };
      itineraryMap[idx][prop] = body[key];
    }
  }

  const indices = Object.keys(itineraryMap).sort((a, b) => a - b);
  if (indices.length > 0) {
    return indices
      .map((idx, i) => ({
        day: i + 1,
        title: itineraryMap[idx].title ? String(itineraryMap[idx].title).trim() : "",
        description: itineraryMap[idx].description ? String(itineraryMap[idx].description).trim() : "",
      }))
      .filter((item) => item.title || item.description);
  }

  return [];
}

function parseGuidesField(body) {
  if (Array.isArray(body.guides)) {
    return body.guides
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          return {
            name: item.name ? String(item.name).trim() : "",
            role: item.role ? String(item.role).trim() : "",
          };
        }
        return null;
      })
      .filter((item) => item && item.name);
  }

  const guidesMap = {};
  for (const key of Object.keys(body)) {
    const match = key.match(/^guides\[(\d+)\]\[(\w+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const prop = match[2];
      if (!guidesMap[idx]) guidesMap[idx] = { name: "", role: "" };
      guidesMap[idx][prop] = body[key];
    }
  }

  const indices = Object.keys(guidesMap).sort((a, b) => a - b);
  if (indices.length > 0) {
    return indices
      .map((idx) => ({
        name: guidesMap[idx].name ? String(guidesMap[idx].name).trim() : "",
        role: guidesMap[idx].role ? String(guidesMap[idx].role).trim() : "",
      }))
      .filter((item) => item.name);
  }

  return [];
}

// 5. Create new tour (Admin only) controller handler
async function handleCreateTour(req, res) {
  try {
    const {
      name,
      location,
      price,
      duration,
      overview,
      maxGroupSize,
      difficulty,
      startLocation,
      video,
      ageRestriction,
      tripStartDate,
    } = req.body;

    if (!name || !location || !price || !duration || !overview) {
      return res.status(400).render("admin/create-tour", {
        user: req.user,
        error: "Please fill in all required fields (Name, Location, Price, Duration, Overview).",
      });
    }

    let coverImagePath = "/images/default-tour.jpg";
    let moreImagesPaths = [];

    if (req.files && req.files["coverImage"] && req.files["coverImage"][0]) {
      coverImagePath = await processUploadedFile(req.files["coverImage"][0], "tours");
    }

    if (req.files && req.files["moreImages"]) {
      moreImagesPaths = await processUploadedFiles(req.files["moreImages"], "tours");
    }

    const processedItinerary = parseItineraryField(req.body);
    const processedGuides = parseGuidesField(req.body);
    const processedHighlights = parseArrayField(req.body, "highlights");
    const processedIncluded = parseArrayField(req.body, "included");
    const processedExcluded = parseArrayField(req.body, "excluded");

    let processedDates = [];
    const rawDates = parseArrayField(req.body, "availableDates");
    if (rawDates.length > 0) {
      processedDates = rawDates
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d.getTime()));
    }

    let startDate = tripStartDate ? new Date(tripStartDate) : null;
    if (!startDate || isNaN(startDate.getTime())) {
      if (processedDates.length > 0) {
        startDate = processedDates[0];
      } else {
        startDate = new Date();
        startDate.setDate(startDate.getDate() + 7);
        startDate.setHours(0, 0, 0, 0);
      }
    }
    if (processedDates.length === 0) {
      processedDates = [startDate];
    }
    const endDate = calculateTripEndDate(startDate, duration);

    const tour = await Tour.create({
      name: name.trim(),
      location: location.trim(),
      price: parseFloat(price),
      duration: duration.trim(),
      overview: overview.trim(),
      coverImage: coverImagePath,
      moreImages: moreImagesPaths,
      maxGroupSize: maxGroupSize ? parseInt(maxGroupSize, 10) : 20,
      difficulty: difficulty || "Moderate",
      startLocation: startLocation ? startLocation.trim() : "",
      highlights: processedHighlights,
      itinerary: processedItinerary,
      guides: processedGuides,
      ageRestriction: ageRestriction ? parseInt(ageRestriction, 10) : 0,
      video: video ? video.trim() : "",
      included: processedIncluded,
      excluded: processedExcluded,
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
        error: "Tour name already exists. Please choose a unique name.",
      });
    }
    res.status(500).render("error", {
      message: "Error creating tour: " + error.message,
      user: req.user,
    });
  }
}

// POST routes for create tour
router.post(
  "/admin/create",
  requireAdmin,
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "moreImages", maxCount: 8 },
  ]),
  handleCreateTour
);

router.post(
  "/",
  requireAdmin,
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "moreImages", maxCount: 8 },
  ]),
  handleCreateTour
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
        maxGroupSize,
        difficulty,
        startLocation,
        video,
        ageRestriction,
        tripStartDate,
      } = req.body;

      let coverImagePath = existingTour.coverImage || "/images/default-tour.jpg";
      let moreImagesPaths = existingTour.moreImages || [];

      if (req.files && req.files["coverImage"] && req.files["coverImage"][0]) {
        coverImagePath = await processUploadedFile(req.files["coverImage"][0], "tours");
      }

      if (req.files && req.files["moreImages"] && req.files["moreImages"].length > 0) {
        const uploadedGallery = await processUploadedFiles(req.files["moreImages"], "tours");
        moreImagesPaths = [...moreImagesPaths, ...uploadedGallery];
      }

      const processedItinerary = parseItineraryField(req.body);
      const processedGuides = parseGuidesField(req.body);
      const processedHighlights = parseArrayField(req.body, "highlights");
      const processedIncluded = parseArrayField(req.body, "included");
      const processedExcluded = parseArrayField(req.body, "excluded");

      let processedDates = [];
      const rawDates = parseArrayField(req.body, "availableDates");
      if (rawDates.length > 0) {
        processedDates = rawDates
          .map((d) => new Date(d))
          .filter((d) => !isNaN(d.getTime()));
      }

      let startDate = tripStartDate ? new Date(tripStartDate) : (existingTour.tripStartDate || new Date());
      if (isNaN(startDate.getTime())) startDate = new Date();
      if (processedDates.length === 0) {
        processedDates = existingTour.availableDates && existingTour.availableDates.length > 0 ? existingTour.availableDates : [startDate];
      }
      const endDate = calculateTripEndDate(startDate, duration || existingTour.duration);

      existingTour.name = name ? name.trim() : existingTour.name;
      existingTour.location = location ? location.trim() : existingTour.location;
      existingTour.price = price ? parseFloat(price) : existingTour.price;
      existingTour.duration = duration ? duration.trim() : existingTour.duration;
      existingTour.overview = overview ? overview.trim() : existingTour.overview;
      existingTour.coverImage = coverImagePath;
      existingTour.moreImages = moreImagesPaths;
      existingTour.maxGroupSize = maxGroupSize ? parseInt(maxGroupSize, 10) : existingTour.maxGroupSize;
      existingTour.difficulty = difficulty || existingTour.difficulty;
      existingTour.startLocation = startLocation !== undefined ? startLocation.trim() : existingTour.startLocation;
      existingTour.highlights = processedHighlights.length > 0 ? processedHighlights : existingTour.highlights;
      existingTour.itinerary = processedItinerary.length > 0 ? processedItinerary : existingTour.itinerary;
      existingTour.guides = processedGuides.length > 0 ? processedGuides : existingTour.guides;
      existingTour.ageRestriction = ageRestriction !== undefined ? parseInt(ageRestriction, 10) : existingTour.ageRestriction;
      existingTour.video = video !== undefined ? video.trim() : existingTour.video;
      existingTour.included = processedIncluded.length > 0 ? processedIncluded : existingTour.included;
      existingTour.excluded = processedExcluded.length > 0 ? processedExcluded : existingTour.excluded;
      existingTour.tripStartDate = startDate;
      existingTour.tripEndDate = endDate;
      existingTour.availableDates = processedDates;

      await existingTour.save();
      clearNavToursCache();

      const tourUrlName = existingTour.name.replace(/\s+/g, "-").toLowerCase();
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
    const tourNameDecoded = req.params.tourName.replace(/-/g, " ");
    const safeRegexPattern = "^" + escapeRegex(tourNameDecoded) + "$";
    const tour = await Tour.findOneAndDelete({
      name: { $regex: new RegExp(safeRegexPattern, "i") },
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
      const safeRegexPattern = "^" + escapeRegex(tourNameDecoded) + "$";
      const tour = await Tour.findOne({
        name: { $regex: new RegExp(safeRegexPattern, "i") },
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

      // Recalculate and persist updated rating averages
      await updateTourRatingStats(tour._id);

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

    const tourId = comment.tourId;
    await Comment.findByIdAndDelete(req.params.commentId);
    await updateTourRatingStats(tourId);

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
router.get(
  ["/admin/dashboard/enquiries-details", "/admin/dashboard/enquiries"],
  requireAdmin,
  async (req, res) => {
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

// Admin AI Custom Enquiries Management
router.get("/admin/dashboard/custom-enquiries", requireAdmin, async (req, res) => {
  try {
    const customEnquiries = await CustomEnquiry.find({}).sort({ createdAt: -1 }).lean();
    res.render("admin/custom-enquiries", {
      user: req.user,
      customEnquiries: customEnquiries,
    });
  } catch (error) {
    res.status(500).render("error", {
      message: "Error fetching custom enquiries",
      user: req.user,
    });
  }
});

router.post("/admin/dashboard/custom-enquiries/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;
    await CustomEnquiry.findByIdAndUpdate(id, { status: status });
    res.json({ success: true, message: "Status updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating status" });
  }
});

router.delete("/admin/custom-enquiry/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await CustomEnquiry.findByIdAndDelete(id);
    res.json({ success: true, message: "Custom enquiry deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting custom enquiry" });
  }
});

module.exports = router;
