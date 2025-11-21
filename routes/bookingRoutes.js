const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const Booking = require("../models/bookings");
const Tour = require("../models/tour");
const nodemailer = require("nodemailer");

//tours fetch for all nav bars (ADD THIS)
async function getTours() {
  try {
    return await Tour.find({}).select("name").limit(10); // Only get name field, limit to 10
  } catch (error) {
    return [];
  }
}

// Initialize Razorpay with your keys
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Mail transporter setup (ADD THIS)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "orbitrushtourism@gmail.com",
    pass: "akijwifxnqpfvrhl", // Your Gmail App Password
  },
});

// Route 1: Show Booking Page (GET)
router.get("/book/:tourId", async (req, res) => {
  // Check if user is logged in
  if (!req.user) {
    return res.redirect("/user/login?message=Please login to book a tour");
  }

  try {
    // Get tour details from database
    const tour = await Tour.findById(req.params.tourId);

    if (!tour) {
      return res.redirect("/tours?error=Tour not found");
    }

    // Render booking page with tour and user info
    res.render("booking", {
      user: req.user,
      tour: tour,
      error: null,
      success: null,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/tours?error=Something went wrong");
  }
});

// Route 2: Create Razorpay Order (POST)
router.post("/create-order", async (req, res) => {
  try {
    const { tourId, travelDate, numberOfPeople } = req.body;

    // Get tour to calculate price
    const tour = await Tour.findById(tourId);
    if (!tour) {
      return res.status(404).json({ error: "Tour not found" });
    }

    // Calculate total amount in paise (Razorpay needs paise)
    const amountInRupees = tour.price * numberOfPeople;
    const amountInPaise = amountInRupees * 100;

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `order_${Date.now()}`,
    });

    // Send order details to frontend
    res.json({
      orderId: order.id,
      amount: amountInPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Route 3: Verify Payment & Save Booking (POST) - UPDATED WITH EMAILS
router.post("/verify-payment", async (req, res) => {
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

    // Verify payment signature (security check)
    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    // Check if signature matches
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment signature",
      });
    }

    // Validate travelers array
    if (!travelers || travelers.length !== numberOfPeople) {
      return res.status(400).json({
        success: false,
        error: "Traveler details are incomplete",
      });
    }

    // Validate each traveler has name and Aadhaar
    for (let i = 0; i < travelers.length; i++) {
      if (!travelers[i].name || !travelers[i].aadhaarNumber) {
        return res.status(400).json({
          success: false,
          error: `Traveler ${i + 1} details are incomplete`,
        });
      }

      // Validate Aadhaar is 12 digits
      if (!/^\d{12}$/.test(travelers[i].aadhaarNumber)) {
        return res.status(400).json({
          success: false,
          error: `Invalid Aadhaar number for Traveler ${i + 1}`,
        });
      }
    }

    // Payment verified - Save booking to database
    const booking = new Booking({
      userId: req.user._id,
      fullName: req.user.fullName,
      email: req.user.email,
      tourId: tourId,
      tourName: tourName,
      travelDate: travelDate,
      numberOfPeople: numberOfPeople,
      travelers: travelers,
      amount: amount / 100, // Convert back to rupees
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      paymentStatus: "completed",
    });

    await booking.save();
    console.log("✅ Booking saved to database:", booking._id);

    // ============================================
    // 📧 SEND EMAIL NOTIFICATIONS - NEW SECTION
    // ============================================
    try {
      const amountInRupees = (amount / 100).toLocaleString("en-IN");
      const formattedDate = new Date(travelDate).toLocaleDateString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Generate travelers list HTML
      const travelersListHTML = travelers
        .map(
          (traveler, index) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px; color: #374151;">${index + 1}</td>
          <td style="padding: 12px; color: #374151; font-weight: 500;">${
            traveler.name
          }</td>
          <td style="padding: 12px; color: #374151;">${
            traveler.aadhaarNumber
          }</td>
        </tr>
      `
        )
        .join("");

      // 1️⃣ Send notification to business owner
      await transporter.sendMail({
        from: "orbitrushtourism@gmail.com",
        to: "orbitrushtourism@gmail.com",
        subject: `💰 New Booking Confirmed: ${tourName} - ₹${amountInRupees}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 12px;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 25px; border-radius: 10px; text-align: center; margin-bottom: 25px;">
              <h1 style="margin: 0; font-size: 28px;">🎉 New Booking Alert!</h1>
              <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.95;">OrbitRush Tourism</p>
            </div>
            
            <!-- Payment Summary -->
            <div style="background: #dcfce7; border-left: 5px solid #10b981; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <h2 style="margin: 0 0 15px 0; color: #065f46; font-size: 20px;">💵 Payment Confirmed</h2>
              <p style="margin: 5px 0; color: #047857; font-size: 32px; font-weight: bold;">₹${amountInRupees}</p>
              <p style="margin: 5px 0; color: #065f46;"><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
              <p style="margin: 5px 0; color: #065f46;"><strong>Order ID:</strong> ${razorpay_order_id}</p>
            </div>
            
            <!-- Tour Details -->
            <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px;">
              <h3 style="color: #1f2937; border-bottom: 3px solid #667eea; padding-bottom: 12px; margin-bottom: 18px;">📍 Tour Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #6b7280; width: 40%;">Tour Name:</td>
                  <td style="padding: 10px 0; color: #1f2937; font-weight: 600;">${tourName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6b7280;">Travel Date:</td>
                  <td style="padding: 10px 0; color: #1f2937; font-weight: 600;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6b7280;">Number of People:</td>
                  <td style="padding: 10px 0; color: #1f2937; font-weight: 600;">${numberOfPeople} Person(s)</td>
                </tr>
              </table>
            </div>
            
            <!-- Customer Details -->
            <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px;">
              <h3 style="color: #1f2937; border-bottom: 3px solid #667eea; padding-bottom: 12px; margin-bottom: 18px;">👤 Customer Information</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #6b7280; width: 40%;">Name:</td>
                  <td style="padding: 10px 0; color: #1f2937; font-weight: 600;">${
                    req.user.fullName
                  }</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #6b7280;">Email:</td>
                  <td style="padding: 10px 0; color: #1f2937; font-weight: 600;">${
                    req.user.email
                  }</td>
                </tr>
              </table>
            </div>
            
            <!-- Travelers List -->
            <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px;">
              <h3 style="color: #1f2937; border-bottom: 3px solid #667eea; padding-bottom: 12px; margin-bottom: 18px;">👥 Traveler Details</h3>
              <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background: #667eea; color: white;">
                    <th style="padding: 12px; text-align: left;">#</th>
                    <th style="padding: 12px; text-align: left;">Name</th>
                    <th style="padding: 12px; text-align: left;">Aadhaar Number</th>
                  </tr>
                </thead>
                <tbody>
                  ${travelersListHTML}
                </tbody>
              </table>
            </div>
            
            <!-- Booking Time -->
            <div style="background: #eff6ff; padding: 18px; border-radius: 8px; text-align: center; border: 2px solid #3b82f6;">
              <p style="margin: 0; color: #1e40af; font-size: 15px;"><strong>⏰ Booking Time:</strong> ${new Date().toLocaleString(
                "en-IN",
                {
                  dateStyle: "full",
                  timeStyle: "short",
                }
              )}</p>
            </div>
          </div>
        `,
      });

      // 2️⃣ Send confirmation email to customer
      await transporter.sendMail({
        from: "orbitrushtourism@gmail.com",
        to: req.user.email,
        subject: `🎉 Booking Confirmed: ${tourName} | OrbitRush Tourism`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f9fafb;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 25px;">
              <h1 style="margin: 0; font-size: 32px;">✅ Booking Confirmed!</h1>
              <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">Your adventure awaits</p>
            </div>
            
            <!-- Success Message -->
            <div style="background: white; padding: 25px; border-radius: 10px; text-align: center; margin-bottom: 25px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
              <p style="font-size: 18px; color: #1f2937; line-height: 1.7; margin: 0;">
                Dear <strong>${req.user.fullName}</strong>,<br>
                Thank you for booking with <strong style="color: #667eea;">OrbitRush Tourism</strong>! 
                Your payment has been successfully processed and your booking is confirmed.
              </p>
            </div>
            
            <!-- Booking Details -->
            <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px;">
              <h2 style="color: #1f2937; border-bottom: 3px solid #ff6b35; padding-bottom: 12px; margin-top: 0;">📋 Your Booking Details</h2>
              
              <div style="background: #fef3c7; border-left: 5px solid #f59e0b; padding: 18px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e; font-size: 16px;"><strong>🎫 Booking ID:</strong> ${booking._id}</p>
              </div>
              
              <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <tr>
                  <td style="padding: 12px 0; color: #6b7280; width: 45%; border-bottom: 1px solid #e5e7eb;">Tour Package:</td>
                  <td style="padding: 12px 0; color: #1f2937; font-weight: 600; border-bottom: 1px solid #e5e7eb;">${tourName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Travel Date:</td>
                  <td style="padding: 12px 0; color: #1f2937; font-weight: 600; border-bottom: 1px solid #e5e7eb;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Number of Travelers:</td>
                  <td style="padding: 12px 0; color: #1f2937; font-weight: 600; border-bottom: 1px solid #e5e7eb;">${numberOfPeople} Person(s)</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Total Amount Paid:</td>
                  <td style="padding: 12px 0; color: #10b981; font-weight: 700; font-size: 20px; border-bottom: 1px solid #e5e7eb;">₹${amountInRupees}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; color: #6b7280;">Payment Status:</td>
                  <td style="padding: 12px 0;">
                    <span style="background: #dcfce7; color: #065f46; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 14px;">
                      ✓ Completed
                    </span>
                  </td>
                </tr>
              </table>
            </div>
            
            <!-- Travelers -->
            <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px;">
              <h3 style="color: #1f2937; border-bottom: 3px solid #ff6b35; padding-bottom: 12px; margin-top: 0;">👥 Traveler Information</h3>
              <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-top: 15px;">
                <thead>
                  <tr style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;">
                    <th style="padding: 14px; text-align: left; font-weight: 600;">#</th>
                    <th style="padding: 14px; text-align: left; font-weight: 600;">Name</th>
                    <th style="padding: 14px; text-align: left; font-weight: 600;">Aadhaar</th>
                  </tr>
                </thead>
                <tbody>
                  ${travelersListHTML}
                </tbody>
              </table>
            </div>
            
            <!-- Payment Info -->
            <div style="background: #eff6ff; padding: 20px; border-radius: 10px; border: 2px solid #3b82f6; margin-bottom: 20px;">
              <h4 style="margin: 0 0 12px 0; color: #1e40af;">💳 Payment Information</h4>
              <p style="margin: 5px 0; color: #1e3a8a; font-size: 14px;"><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
              <p style="margin: 5px 0; color: #1e3a8a; font-size: 14px;"><strong>Order ID:</strong> ${razorpay_order_id}</p>
              <p style="margin: 5px 0; color: #1e3a8a; font-size: 14px;"><strong>Payment Method:</strong> Razorpay (Secure)</p>
            </div>
            
            <!-- What's Next -->
            <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px;">
              <h3 style="color: #1f2937; border-bottom: 3px solid #ff6b35; padding-bottom: 12px; margin-top: 0;">📌 What Happens Next?</h3>
              <ul style="color: #374151; line-height: 2; padding-left: 20px; margin: 15px 0;">
                <li>Our team will contact you <strong>within 24 hours</strong> with complete tour details</li>
                <li>You will receive pickup location and timing information via email/SMS</li>
                <li>Please carry valid <strong>ID proofs</strong> matching the Aadhaar numbers provided</li>
                <li>Arrive at the pickup point <strong>15 minutes early</strong></li>
                <li>For any changes or queries, contact us immediately</li>
              </ul>
            </div>
            
            <!-- Important Notes -->
            <div style="background: #fef2f2; border-left: 5px solid #ef4444; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h4 style="margin: 0 0 12px 0; color: #991b1b;">⚠️ Important Reminders</h4>
              <ul style="color: #7f1d1d; line-height: 1.8; padding-left: 20px; margin: 0;">
                <li>Keep this email for your records</li>
                <li>Carry original Aadhaar cards for all travelers</li>
                <li>Cancellation policy: Free cancellation up to 48 hours before travel</li>
                <li>Contact us immediately if you need to reschedule</li>
              </ul>
            </div>
            
            <!-- Contact Section -->
            <div style="background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; padding: 25px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0;">📞 Need Assistance?</h3>
              <p style="margin: 8px 0; font-size: 16px;">We're here to help 24/7!</p>
              <p style="margin: 8px 0; font-size: 22px; font-weight: bold;">+91 98765 43210</p>
              <p style="margin: 8px 0; font-size: 16px;">orbitrushtourism@gmail.com</p>
            </div>
            
            <!-- Footer -->
            <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px;">
              <p style="margin: 5px 0;">Thank you for choosing OrbitRush Tourism!</p>
              <p style="margin: 5px 0;">We look forward to making your journey memorable 🌟</p>
              <p style="margin: 15px 0 5px 0; font-size: 12px; color: #9ca3af;">
                This is an automated confirmation email. Please do not reply to this email.
              </p>
            </div>
          </div>
        `,
      });

      console.log("📧 Booking confirmation emails sent successfully!");
    } catch (emailError) {
      console.error("❌ Email notification failed:", emailError);
      // Don't fail the booking if email fails - just log it
    }
    // END EMAIL SECTION

    // Send success response
    res.json({
      success: true,
      message: "Booking confirmed!",
      bookingId: booking._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Payment verification failed",
    });
  }
});

// Route 4: User's Bookings Page (GET)
router.get("/my-bookings", async (req, res) => {
  // Check if user is logged in
  if (!req.user) {
    return res.redirect("/user/login?message=Please login to view bookings");
  }

  try {
    // Get all bookings for this user
    const bookings = await Booking.find({ userId: req.user._id })
      .populate("tourId", "name location duration coverImage")
      .sort({ createdAt: -1 }); // Newest first
    const tours = await getTours();
    console.log(tours);
    res.render("booking/my-bookings", {
      user: req.user,
      bookings: bookings,
      tours,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/?error=Failed to load bookings");
  }
});

// Route 5: Admin - All Bookings by Tour (GET)
router.get("/admin/bookings", async (req, res) => {
  // Check if user is admin
  if (!req.user || req.user.role !== "ADMIN") {
    return res.redirect("/?error=Unauthorized access");
  }

  try {
    // Get all tours
    const tours = await Tour.find({}).select("name").sort({ name: 1 });

    // Get selected tour from query
    const selectedTourId = req.query.tour;
    let bookings = [];
    let selectedTour = null;

    if (selectedTourId) {
      // Get bookings for selected tour
      bookings = await Booking.find({ tourId: selectedTourId })
        .populate("userId", "fullName email")
        .populate("tourId", "name location price")
        .sort({ createdAt: -1 });

      selectedTour = await Tour.findById(selectedTourId);
    }

    res.render("admin/admin-bookings", {
      user: req.user,
      tours: tours,
      bookings: bookings,
      selectedTour: selectedTour,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/?error=Failed to load bookings");
  }
});

module.exports = router;
