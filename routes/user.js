const express = require("express");
const USER = require("../models/user");
const TOUR = require("../models/tour"); // Add this line only
const router = express.Router();
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const otpStore = {};
const jwt = require("jsonwebtoken");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "orbitrushtourism@gmail.com",
    pass: "akijwifxnqpfvrhl",
  },
});

// Helper function to get tours (add this only)
async function getTours() {
  try {
    return await TOUR.find({}).select("name").limit(10); // Only get name field, limit to 10
  } catch (error) {
    return [];
  }
}

router.get("/forgot-password", async (req, res) => {
  // Add async here only
  const tours = await getTours(); // Add this line only
  return res.render("forgot-password", { error: null, tours }); // Add tours here only
});

router.post("/forgot-password/send", async (req, res) => {
  const { email } = req.body;
  const tours = await getTours(); // Add this line only

  const user = await USER.findOne({ email });
  if (!user)
    return res.render("forgot-password", { error: "Email not found!", tours }); // Add tours here only

  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };

  await transporter.sendMail({
    from: "orbitrushtourism@gmail.com",
    to: email,
    subject: "Your Password Reset OTP",
    text: `Your OTP is ${otp}. It expires in 5 minutes.`,
  });

  return res.render("verify-otp", {
    email,
    message: "OTP sent to your email",
    error: null,
    tours, // Add this line only
  });
});

router.post("/forgot-password/reset", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const record = otpStore[email];
  const tours = await getTours(); // Add this line only

  if (!record)
    return res.render("verify-otp", {
      error: "No OTP requested!",
      message: null,
      email,
      tours, // Add this line only
    });
  if (Date.now() > record.expires)
    return res.render("verify-otp", {
      error: "OTP expired!",
      message: null,
      email,
      tours, // Add this line only
    });
  if (otp !== record.otp)
    return res.render("verify-otp", {
      error: "Invalid OTP!",
      message: null,
      email,
      tours, // Add this line only
    });

  const user = await USER.findOne({ email });
  user.password = newPassword;
  await user.save();

  delete otpStore[email];
  return res.render("signin", {
    success: "Password reset successfully!",
    tours,
  }); // Add tours here only
});

router.get("/signin", async (req, res) => {
  // Add async here only
  const tours = await getTours(); // Add this line only
  return res.render("signin", { tours }); // Add tours here only
});

router.get("/signup", async (req, res) => {
  // Add async here only
  const tours = await getTours(); // Add this line only
  return res.render("signup", {
    user: null,
    error: null,
    message: req.query.message || null,
    tours, // Add this line only
  });
});

router.get("/logout", (req, res) => {
  res.clearCookie("token").redirect("/");
});

router.post("/signup", async (req, res) => {
  const { fullName, email, password } = req.body;
  await USER.create({
    fullName,
    email,
    password,
  });
  return res.redirect("/");
});

router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  const tours = await getTours(); // Add this line only
  try {
    const token = await USER.matchPasswordAndGenerateToken(email, password);

    return res.cookie("token", token).redirect("/");
  } catch (error) {
    return res.render("signin", {
      error: "Incorrect Password",
      tours, // Add this line only
    });
  }
});

module.exports = router;
