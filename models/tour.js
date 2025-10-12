const mongoose = require("mongoose");

const tourSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },

    location: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },

    duration: {
      type: String,
      required: true,
    },

    overview: {
      type: String,
      required: true,
    },

    coverImage: {
      type: String,
    },

    moreImages: [String],

    itinerary: [
      {
        day: Number,
        title: String,
        description: String,
      },
    ],

    video: {
      type: String,
    },

    included: [String],

    excluded: [String],
  },
  {
    timestamps: true,
  }
);

const Tour = mongoose.model("Tour", tourSchema);

module.exports = Tour;
