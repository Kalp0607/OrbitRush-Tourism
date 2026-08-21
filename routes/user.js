const express = require("express");
const USER = require("../models/user");
const router = express.Router();
const crypto = require("crypto");
const otpStore = {};
const { createTokenForUser } = require("../services/authentication");
const { sendEmail } = require("../services/mailer");

// Alias for /login or /user/login -> /user/signin
router.get(["/login", "/user/login"], (req, res) => {
  const query = req.url.includes("?")
    ? req.url.substring(req.url.indexOf("?"))
    : "";
  return res.redirect("/user/signin" + query);
});

router.get("/forgot-password", (req, res) => {
  return res.render("forgot-password", { error: null });
});

router.post("/forgot-password/send", async (req, res) => {
  const { email } = req.body;

  const user = await USER.findOne({ email }).lean();
  if (!user)
    return res.render("forgot-password", { error: "Email not found!" });

  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 };

  await sendEmail({
    to: email,
    subject: "Your Password Reset OTP",
    text: `Your OTP is ${otp}. It expires in 5 minutes.`,
  });

  return res.render("verify-otp", {
    email,
    message: "OTP sent to your email",
    error: null,
  });
});

router.post("/forgot-password/reset", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const record = otpStore[email];

  if (!record)
    return res.render("verify-otp", {
      error: "No OTP requested!",
      message: null,
      email,
    });
  if (Date.now() > record.expires)
    return res.render("verify-otp", {
      error: "OTP expired!",
      message: null,
      email,
    });
  if (otp !== record.otp)
    return res.render("verify-otp", {
      error: "Invalid OTP!",
      message: null,
      email,
    });

  const user = await USER.findOne({ email });
  user.password = newPassword;
  await user.save();

  delete otpStore[email];
  return res.render("signin", {
    success: "Password reset successfully!",
    error: null,
    message: null,
  });
});

router.get("/signin", (req, res) => {
  return res.render("signin", {
    message: req.query.message || null,
    error: req.query.error || null,
  });
});

router.get("/signup", (req, res) => {
  return res.render("signup", {
    user: null,
    error: null,
    message: req.query.message || null,
  });
});

router.get("/logout", (req, res) => {
  res.clearCookie("token").redirect("/");
});

router.post("/signup", async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    const user = await USER.create({
      fullName,
      email,
      password,
    });
    const token = createTokenForUser(user);
    return res.cookie("token", token).redirect("/");
  } catch (error) {
    return res.render("signup", {
      user: null,
      error: "Signup failed. Email may already be in use.",
      message: null,
    });
  }
});

router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  try {
    const token = await USER.matchPasswordAndGenerateToken(email, password);

    return res.cookie("token", token).redirect("/");
  } catch (error) {
    return res.render("signin", {
      error: "Incorrect Email or Password",
      message: null,
    });
  }
});

module.exports = router;
