const mongoose = require("mongoose");

const customEnquirySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: false,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: false,
    },
    duration: {
      type: String,
      required: false,
      default: "3 Days",
    },
    numberOfTravelers: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    budget: {
      type: String,
      required: false,
    },
    preferences: {
      type: String,
      required: false,
    },
    activities: [String],
    accommodation: {
      type: String,
      required: false,
    },
    transportation: {
      type: String,
      required: false,
    },
    specialRequests: {
      type: String,
      required: false,
    },
    suggestedTours: [
      {
        tourId: { type: mongoose.Schema.Types.ObjectId, ref: "Tour" },
        name: String,
        location: String,
        price: Number,
      },
    ],
    itinerary: [
      {
        day: Number,
        title: String,
        description: String,
      },
    ],
    aiSummary: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["PENDING", "REVIEWED", "CONTACTED", "CONFIRMED", "CANCELLED"],
      default: "PENDING",
    },
  },
  {
    timestamps: true,
  }
);

customEnquirySchema.index({ customerEmail: 1 });
customEnquirySchema.index({ userId: 1, createdAt: -1 });
customEnquirySchema.index({ status: 1 });
customEnquirySchema.index({ createdAt: -1 });

module.exports = mongoose.model("CustomEnquiry", customEnquirySchema);
