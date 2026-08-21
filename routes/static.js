const express = require("express");
const router = express.Router();
const Tour = require("../models/tour");
const Enquiry = require("../models/enquiry");

// Homepage Route
router.get("/", async (req, res) => {
  try {
    const allTours = await Tour.find({})
      .select("name location price coverImage")
      .sort({ createdAt: -1 })
      .lean();
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
router.get("/about-us", (req, res) => {
  return res.render("about-us", {
    user: req.user,
  });
});

// Contact Us Route
router.get("/contact-us", (req, res) => {
  return res.render("contact-us", {
    user: req.user,
  });
});

// Profile Route
router.get("/profile", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  try {
    const userEnquiries = await Enquiry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.render("profile", {
      user: req.user,
      enquiries: userEnquiries,
      error: null,
      success: null,
    });
  } catch (error) {
    console.error("Error loading profile:", error);
    res.render("profile", {
      user: req.user,
      enquiries: [],
      error: "Error loading profile data",
      success: null,
    });
  }
});

// My Enquiries Route
router.get("/my-enquiries", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  try {
    const userEnquiries = await Enquiry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.render("my-enquiries", {
      user: req.user,
      enquiries: userEnquiries,
      error: null,
      success: null,
    });
  } catch (error) {
    console.error("Error loading my-enquiries:", error);
    res.render("my-enquiries", {
      user: req.user,
      enquiries: [],
      error: "Error loading your enquiries",
      success: null,
    });
  }
});

// Helper Aliases
router.get("/tours", (req, res) => {
  return res.redirect("/tour");
});

router.get(["/admin", "/admin/dashboard"], (req, res) => {
  return res.redirect("/tour/admin/dashboard");
});

module.exports = router;
