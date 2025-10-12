const { Schema, model } = require("mongoose");

const commentSchema = new Schema(
  {
    content: {
      type: String,
      required: true,
    },
    tourId: {
      type: Schema.Types.ObjectId,
      ref: "Tour",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "USER",
    },
  },
  { timestamps: true }
);

const Comment = model("Comment", commentSchema);
module.exports = Comment;
