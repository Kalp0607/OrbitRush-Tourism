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

    // NEW: Simple array of available dates
    availableDates: [Date],
  },
  {
    timestamps: true,
  }
);

// Simple middleware to remove past dates before save
tourSchema.pre("save", function (next) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day

  // Keep only future dates
  this.availableDates = this.availableDates.filter((date) => {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate >= today;
  });

  next();
});

// Simple method to add a date
tourSchema.methods.addDate = function (dateString) {
  const newDate = new Date(dateString);
  newDate.setHours(0, 0, 0, 0);

  // Check if date is in future
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (newDate < today) {
    throw new Error("Cannot add past dates");
  }

  // Check if date already exists
  const exists = this.availableDates.some(
    (date) => date.getTime() === newDate.getTime()
  );

  if (exists) {
    throw new Error("Date already exists");
  }

  this.availableDates.push(newDate);
  this.availableDates.sort((a, b) => a - b); // Keep dates sorted
  return this.save();
};

const Tour = mongoose.model("Tour", tourSchema);
module.exports = Tour;
