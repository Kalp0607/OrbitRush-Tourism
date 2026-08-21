try {
  const express = require("express");
  const mongoose = require("mongoose");
  const { Server } = require("socket.io");
  const nodemailer = require("nodemailer");
  const Razorpay = require("razorpay");

  const Tour = require("../models/tour");
  const Booking = require("../models/bookings");
  const Comment = require("../models/comments");
  const ChatMessage = require("../models/chat");

  const mailer = require("../services/mailer");
  const imageStorage = require("../services/imageStorage");

  console.log("✅ All required modules and services imported successfully!");
  process.exit(0);
} catch (err) {
  console.error("❌ Verification failed:", err);
  process.exit(1);
}
