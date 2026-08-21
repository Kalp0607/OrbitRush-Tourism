const { Schema, model } = require("mongoose");

const commentSchema = new Schema(
  {
    content: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number between 1 and 5",
      },
    },
    tourId: {
      type: Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "USER",
      required: true,
    },
    photos: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true }
);

commentSchema.index({ tourId: 1, createdAt: -1 });

const Comment = model("Comment", commentSchema);
module.exports = Comment;
