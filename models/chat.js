const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    room: {
      type: String,
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "USER",
    },
    senderName: {
      type: String,
      required: true,
    },
    senderRole: {
      type: String,
      enum: ["NORMAL", "ADMIN"],
      default: "NORMAL",
    },
    message: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

chatSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", chatSchema);
