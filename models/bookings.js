const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  // User details (from JWT)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "USER",
    required: true,
  },
  fullName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },

  // Tour details
  tourId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tour",
    required: true,
  },
  tourName: {
    type: String,
    required: true,
  },

  // Booking details
  travelDate: {
    type: Date,
    required: true,
  },

  // Tour Start & End Dates
  tripStartDate: {
    type: Date,
    required: true,
  },
  tripEndDate: {
    type: Date,
    required: true,
  },

  numberOfPeople: {
    type: Number,
    required: true,
    min: 1,
  },

  // Traveler details array
  travelers: [
    {
      name: {
        type: String,
        required: true,
      },
      aadhaarNumber: {
        type: String,
        required: true,
        minlength: 12,
        maxlength: 12,
      },
    },
  ],

  // Payment details
  amount: {
    type: Number,
    required: true,
  },
  paymentId: String,
  orderId: String,
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },

  // Cancellation & Refund details
  status: {
    type: String,
    enum: ["BOOKED", "CANCELLED"],
    default: "BOOKED",
  },
  cancelledAt: Date,
  refundStatus: {
    type: String,
    enum: ["NONE", "PENDING", "REFUNDED", "FAILED"],
    default: "NONE",
  },
  refundId: String,
  refundAmount: Number,
  cancellationReason: String,

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ tourId: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
