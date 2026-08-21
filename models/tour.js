const mongoose = require("mongoose");

// Helper to calculate tripEndDate from tripStartDate and duration string
function calculateEndDate(startDate, durationStr) {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;

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

const tourSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    duration: {
      type: String,
      required: true,
      trim: true,
    },
    overview: {
      type: String,
      required: true,
    },
    coverImage: {
      type: String,
      default: "/images/default-tour.jpg",
    },
    moreImages: {
      type: [String],
      default: [],
    },
    maxGroupSize: {
      type: Number,
      default: 20,
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Moderate", "Challenging", "Difficult"],
      default: "Moderate",
    },
    startLocation: {
      type: String,
      default: "",
    },
    highlights: {
      type: [String],
      default: [],
    },
    itinerary: [
      {
        day: Number,
        title: String,
        description: String,
      },
    ],
    guides: [
      {
        name: String,
        role: String,
      },
    ],
    ageRestriction: {
      type: Number,
      default: 0,
    },
    video: {
      type: String,
      default: "",
    },
    included: {
      type: [String],
      default: [],
    },
    excluded: {
      type: [String],
      default: [],
    },
    ratingsAverage: {
      type: Number,
      default: 4.9,
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },

    // Tour Start & End Dates
    tripStartDate: {
      type: Date,
      default: function () {
        const d = new Date();
        d.setDate(d.getDate() + 7); // Default to 7 days from now
        d.setHours(0, 0, 0, 0);
        return d;
      },
    },
    tripEndDate: {
      type: Date,
    },

    availableDates: {
      type: [Date],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to calculate tripEndDate and filter past dates
tourSchema.pre("save", function (next) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!this.tripStartDate) {
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() + 7);
    defaultStart.setHours(0, 0, 0, 0);
    this.tripStartDate = defaultStart;
  }

  // Calculate tripEndDate automatically based on duration
  this.tripEndDate = calculateEndDate(this.tripStartDate, this.duration);

  // Keep availableDates in sync if provided
  if (!this.availableDates || this.availableDates.length === 0) {
    this.availableDates = [this.tripStartDate];
  } else {
    this.availableDates = this.availableDates.filter((date) => {
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      return checkDate >= today;
    });
  }

  next();
});

const Tour = mongoose.model("Tour", tourSchema);
module.exports = Tour;
