const mongoose = require("mongoose");

const enquirySchema = new mongoose.Schema(
  {
    // User Information
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user", // Reference to your user model
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },

    // Tour Information (from dropdown)
    tourName: {
      type: String,
      required: true,
      trim: true,
    },

    // Travel Details
    numberOfPeople: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    preferredDate: {
      type: Date,
      required: false, // Optional
    },

    // Message
    message: {
      type: String,
      required: true,
      trim: true,
      maxLength: 500,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Index for email
enquirySchema.index({ email: 1 });
enquirySchema.index({ createdAt: -1 });

module.exports = mongoose.model("Enquiry", enquirySchema);
