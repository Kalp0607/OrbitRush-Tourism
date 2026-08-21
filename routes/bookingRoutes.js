const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const Booking = require("../models/bookings");
const Tour = require("../models/tour");
const { sendEmail } = require("../services/mailer");

// Initialize Razorpay with credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper: Calculate trip end date from start date and tour duration
function getTripEndDate(startDate, durationStr) {
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return new Date();

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

// Helper: Get list of valid upcoming departure dates configured by admin
function getValidUpcomingDates(tour) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let validDates = [];
  if (tour.availableDates && Array.isArray(tour.availableDates) && tour.availableDates.length > 0) {
    validDates = tour.availableDates
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()) && d >= startOfToday);
  }

  // Fallback to tripStartDate if availableDates is empty and tripStartDate is upcoming
  if (validDates.length === 0 && tour.tripStartDate) {
    const sDate = new Date(tour.tripStartDate);
    if (!isNaN(sDate.getTime()) && sDate >= startOfToday) {
      validDates.push(sDate);
    }
  }

  // Sort chronologically ascending
  validDates.sort((a, b) => a.getTime() - b.getTime());
  return validDates;
}

// Helper: Verify if a date string is in the valid fixed dates
function isValidDepartureDate(tour, dateInput) {
  if (!dateInput) return false;
  const inputDate = new Date(dateInput);
  if (isNaN(inputDate.getTime())) return false;
  const inputDateStr = inputDate.toISOString().split("T")[0];

  const validDates = getValidUpcomingDates(tour);
  return validDates.some((d) => d.toISOString().split("T")[0] === inputDateStr);
}

// Route 1: Show Booking Page (GET)
router.get("/book/:tourId", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin?message=Please login to book a tour");
  }

  if (req.user.role === "ADMIN") {
    return res.redirect("/tour?error=Admins are not allowed to book tours.");
  }

  try {
    const tour = await Tour.findById(req.params.tourId).lean();

    if (!tour) {
      return res.redirect("/tours?error=Tour not found");
    }

    const validDates = getValidUpcomingDates(tour);
    const selectedDate = req.query.date ? new Date(req.query.date).toISOString().split("T")[0] : null;

    res.render("booking", {
      user: req.user,
      tour: tour,
      validDates: validDates,
      selectedDate: selectedDate,
      error: null,
      success: null,
    });
  } catch (error) {
    res.redirect("/tours?error=Something went wrong");
  }
});

// Route 2: Create Razorpay Order (POST)
router.post("/create-order", async (req, res) => {
  if (req.user && req.user.role === "ADMIN") {
    return res.status(403).json({ error: "Admins are not allowed to make tour bookings." });
  }

  try {
    const { tourId, travelDate, numberOfPeople } = req.body;

    const tour = await Tour.findById(tourId);
    if (!tour) {
      return res.status(404).json({ error: "Tour not found" });
    }

    // Enforce fixed admin-scheduled departure date
    if (!travelDate || !isValidDepartureDate(tour, travelDate)) {
      return res.status(400).json({
        error: "Please select an available scheduled departure date configured for this tour.",
      });
    }

    const amountInRupees = tour.price * numberOfPeople;
    const amountInPaise = Math.round(amountInRupees * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `order_${Date.now()}`,
    });

    res.json({
      orderId: order.id,
      amount: amountInPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Route 3: Verify Payment & Save Booking (POST)
router.post("/verify-payment", async (req, res) => {
  if (req.user && req.user.role === "ADMIN") {
    return res.status(403).json({ success: false, error: "Admins are not allowed to make tour bookings." });
  }

  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      tourId,
      tourName,
      travelDate,
      numberOfPeople,
      amount,
      travelers,
    } = req.body;

    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment signature",
      });
    }

    const tour = await Tour.findById(tourId);
    if (!tour) {
      return res.status(404).json({ success: false, error: "Tour not found" });
    }

    if (!travelDate || !isValidDepartureDate(tour, travelDate)) {
      return res.status(400).json({
        success: false,
        error: "Invalid departure date selection. Please choose a scheduled departure batch.",
      });
    }

    if (!travelers || travelers.length !== parseInt(numberOfPeople, 10)) {
      return res.status(400).json({
        success: false,
        error: "Traveler details are incomplete",
      });
    }

    for (let i = 0; i < travelers.length; i++) {
      if (!travelers[i].name || !travelers[i].aadhaarNumber) {
        return res.status(400).json({
          success: false,
          error: `Traveler ${i + 1} details are incomplete`,
        });
      }

      if (!/^\d{12}$/.test(travelers[i].aadhaarNumber)) {
        return res.status(400).json({
          success: false,
          error: `Invalid Aadhaar number for Traveler ${i + 1}`,
        });
      }
    }

    const startDate = travelDate ? new Date(travelDate) : (tour ? tour.tripStartDate : new Date());
    const endDate = tour ? getTripEndDate(startDate, tour.duration) : startDate;

    const booking = new Booking({
      userId: req.user._id,
      fullName: req.user.fullName,
      email: req.user.email,
      tourId: tourId,
      tourName: tourName,
      travelDate: startDate,
      tripStartDate: startDate,
      tripEndDate: endDate,
      numberOfPeople: numberOfPeople,
      travelers: travelers,
      amount: amount / 100,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      paymentStatus: "completed",
      status: "BOOKED",
      refundStatus: "NONE",
    });

    await booking.save();

    // Email Notifications via Gmail Nodemailer Service
    const amountInRupees = (amount / 100).toLocaleString("en-IN");
    const formattedDate = new Date(startDate).toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedEndDate = new Date(endDate).toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // 1. Business Owner Notification
    const recipientOwner = process.env.GMAIL_USER || process.env.GMAIL_ID;
    if (recipientOwner) {
      await sendEmail({
        to: recipientOwner,
        subject: `💰 New Booking Confirmed: ${tourName} - ₹${amountInRupees}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 12px;">
            <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 25px; border-radius: 10px; text-align: center; margin-bottom: 25px;">
              <h1 style="margin: 0; font-size: 28px;">🎉 New Booking Alert!</h1>
              <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.95;">OrbitRush Tourism</p>
            </div>
            <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px;">
              <p><strong>Tour:</strong> ${tourName}</p>
              <p><strong>Trip Start Date:</strong> ${formattedDate}</p>
              <p><strong>Trip End Date:</strong> ${formattedEndDate}</p>
              <p><strong>Customer:</strong> ${req.user.fullName} (${req.user.email})</p>
              <p><strong>Amount:</strong> ₹${amountInRupees}</p>
            </div>
          </div>
        `,
      });
    }

    // 2. Customer Confirmation Email
    await sendEmail({
      to: req.user.email,
      subject: `🎉 Booking Confirmed: ${tourName} | OrbitRush Tourism`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f9fafb;">
          <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 25px;">
            <h1 style="margin: 0; font-size: 32px;">✅ Booking Confirmed!</h1>
          </div>
          <div style="background: white; padding: 25px; border-radius: 10px; margin-bottom: 20px;">
            <p>Dear <strong>${req.user.fullName}</strong>,</p>
            <p>Your booking for <strong>${tourName}</strong> has been successfully confirmed!</p>
            <p><strong>Trip Start Date:</strong> ${formattedDate}</p>
            <p><strong>Trip End Date:</strong> ${formattedEndDate}</p>
            <p><strong>Booking ID:</strong> ${booking._id}</p>
            <p><strong>Amount Paid:</strong> ₹${amountInRupees}</p>
          </div>
        </div>
      `,
    });

    res.json({
      success: true,
      message: "Booking confirmed!",
      bookingId: booking._id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Payment verification failed",
    });
  }
});

// Route 4: Booking Cancellation & Refund (POST)
router.post("/cancel/:bookingId", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Please log in to cancel your booking." });
  }

  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: "Booking not found." });
    }

    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "Unauthorized access to this booking." });
    }

    if (booking.status === "CANCELLED") {
      return res.status(400).json({ success: false, error: "Booking has already been cancelled." });
    }

    const createdAtTime = new Date(booking.createdAt).getTime();
    const currentTime = Date.now();
    const hoursElapsed = (currentTime - createdAtTime) / (1000 * 60 * 60);

    if (hoursElapsed > 24) {
      return res.status(400).json({
        success: false,
        error: "Cancellation period expired. Bookings can only be cancelled within 24 hours of booking.",
      });
    }

    let refund = null;
    let refundError = null;

    if (booking.paymentId) {
      try {
        const amountInPaise = Math.round(booking.amount * 100);
        refund = await razorpay.payments.refund(booking.paymentId, {
          amount: amountInPaise,
          notes: {
            reason: req.body.reason || "Customer cancelled within 24 hours",
            bookingId: booking._id.toString(),
          },
        });
      } catch (err) {
        refundError = err.message || "Failed to process Razorpay refund";
      }
    }

    booking.status = "CANCELLED";
    booking.cancelledAt = new Date();
    booking.cancellationReason = req.body.reason || "Cancelled by user within 24 hours";

    if (refund && refund.id) {
      booking.refundStatus = "REFUNDED";
      booking.refundId = refund.id;
      booking.refundAmount = booking.amount;
    } else if (refundError) {
      booking.refundStatus = "FAILED";
    } else {
      booking.refundStatus = "REFUNDED";
      booking.refundAmount = booking.amount;
    }

    await booking.save();

    // Send cancellation & refund email notification via Gmail Nodemailer
    await sendEmail({
      to: booking.email,
      subject: `⚠️ Booking Cancelled & Refund Initiated: ${booking.tourName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 12px;">
          <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 25px; border-radius: 10px; text-align: center; margin-bottom: 25px;">
            <h1 style="margin: 0; font-size: 26px;">Booking Cancelled</h1>
            <p style="margin: 5px 0 0 0;">OrbitRush Tourism</p>
          </div>
          <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <p>Dear <strong>${booking.fullName}</strong>,</p>
            <p>Your booking for <strong>${booking.tourName}</strong> (Booking ID: <code>${booking._id}</code>) has been successfully cancelled.</p>
            <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #15803d;">💰 Refund Details</h3>
              <p style="margin: 5px 0;"><strong>Refund Amount:</strong> ₹${booking.amount.toLocaleString("en-IN")}</p>
              <p style="margin: 5px 0;"><strong>Refund Status:</strong> ${booking.refundStatus}</p>
              ${booking.refundId ? `<p style="margin: 5px 0;"><strong>Refund ID:</strong> <code>${booking.refundId}</code></p>` : ""}
            </div>
            <p>The refunded amount will reflect in your bank account within 5-7 business days.</p>
          </div>
        </div>
      `,
    });

    return res.json({
      success: true,
      message: "Booking cancelled successfully and refund processed.",
      booking: {
        status: booking.status,
        refundStatus: booking.refundStatus,
        refundId: booking.refundId,
        refundAmount: booking.refundAmount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to process cancellation." });
  }
});

// Route 5: User's Bookings Page (GET)
router.get("/my-bookings", async (req, res) => {
  if (!req.user) {
    return res.redirect("/user/signin?message=Please login to view bookings");
  }

  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate("tourId", "name location duration coverImage tripStartDate tripEndDate")
      .sort({ createdAt: -1 })
      .lean();

    res.render("booking/my-bookings", {
      user: req.user,
      bookings: bookings,
    });
  } catch (error) {
    res.redirect("/?error=Failed to load bookings");
  }
});

// Route 6: Admin - All Bookings by Tour (GET)
router.get("/admin/bookings", async (req, res) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.redirect("/?error=Unauthorized access");
  }

  try {
    const tours = await Tour.find({}).select("name").sort({ name: 1 });
    const selectedTourId = req.query.tour;
    let bookings = [];
    let selectedTour = null;

    if (selectedTourId) {
      bookings = await Booking.find({ tourId: selectedTourId })
        .populate("userId", "fullName email")
        .populate("tourId", "name location price tripStartDate tripEndDate")
        .sort({ createdAt: -1 })
        .lean();

      selectedTour = await Tour.findById(selectedTourId).lean();
    } else {
      bookings = await Booking.find({})
        .populate("userId", "fullName email")
        .populate("tourId", "name location price tripStartDate tripEndDate")
        .sort({ createdAt: -1 })
        .lean();
    }

    res.render("admin/admin-bookings", {
      user: req.user,
      tours: tours,
      bookings: bookings,
      selectedTour: selectedTour,
    });
  } catch (error) {
    res.redirect("/?error=Failed to load bookings");
  }
});

module.exports = router;
