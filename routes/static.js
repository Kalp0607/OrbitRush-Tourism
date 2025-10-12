const express = require("express");
const router = express.Router();
const Tour = require("../models/tour");
const Enquiry = require("../models/enquiry");

// Homepage Route
router.get("/", async (req, res) => {
  try {
    const allTours = await Tour.find({});
    return res.render("homepage", {
      user: req.user,
      tours: allTours,
    });
  } catch (error) {
    console.error("Error loading homepage:", error);
    return res.render("homepage", {
      user: req.user,
      tours: [],
    });
  }
});

// About Us Route
router.get("/about-us", async (req, res) => {
  try {
    const allTours = await Tour.find({});
    return res.render("about-us", {
      user: req.user,
      tours: allTours,
    });
  } catch (error) {
    console.error("Error loading about-us:", error);
    return res.render("about-us", {
      user: req.user,
      tours: [],
    });
  }
});

// Contact Us Route
router.get("/contact-us", async (req, res) => {
  try {
    const allTours = await Tour.find({});
    return res.render("contact-us", {
      user: req.user,
      tours: allTours,
    });
  } catch (error) {
    console.error("Error loading contact-us:", error);
    return res.render("contact-us", {
      user: req.user,
      tours: [],
    });
  }
});

// Profile Route
router.get("/profile", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  try {
    const tours = await Tour.find({}).select("name").limit(10);
    const userEnquiries = await Enquiry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.render("profile", {
      user: req.user,
      tours: tours,
      enquiries: userEnquiries,
      error: null,
      success: null,
    });
  } catch (error) {
    console.error("Error loading profile:", error);
    const tours = await Tour.find({}).select("name").limit(10);
    res.render("profile", {
      user: req.user,
      tours: tours,
      enquiries: [],
      error: "Error loading profile data",
      success: null,
    });
  }
});

// My Enquiries Route - NEW ROUTE
router.get("/my-enquiries", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  try {
    const tours = await Tour.find({}).select("name").limit(10);

    // Get all user's enquiries, sorted by newest first
    const userEnquiries = await Enquiry.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    res.render("my-enquiries", {
      user: req.user,
      tours: tours,
      enquiries: userEnquiries,
      error: null,
      success: null,
    });
  } catch (error) {
    console.error("Error loading my-enquiries:", error);
    const tours = await Tour.find({}).select("name").limit(10);
    res.render("my-enquiries", {
      user: req.user,
      tours: tours,
      enquiries: [],
      error: "Error loading your enquiries",
      success: null,
    });
  }
});

module.exports = router;
