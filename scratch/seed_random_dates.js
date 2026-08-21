require("dotenv").config();
const mongoose = require("mongoose");
const Tour = require("../models/tour");

function generateRandomDates(count = 12, minDays = 1, maxDays = 210) {
  const offsets = new Set();
  while (offsets.size < count) {
    const randomOffset = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
    offsets.add(randomOffset);
  }

  const sortedOffsets = Array.from(offsets).sort((a, b) => a - b);
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);

  return sortedOffsets.map((offset) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset);
    return d;
  });
}

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

async function seedDates() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("MongoDB Connected for seeding dates...");

    const tours = await Tour.find({});
    console.log(`Found ${tours.length} tours to update with random dates.`);

    for (const tour of tours) {
      const datesCount = Math.floor(Math.random() * 3) + 10; // 10 to 12 dates
      const randomDates = generateRandomDates(datesCount, 1, 210);

      tour.availableDates = randomDates;
      tour.tripStartDate = randomDates[0];
      tour.tripEndDate = calculateEndDate(randomDates[0], tour.duration);

      await tour.save();
      console.log(`✅ Updated "${tour.name}" with ${randomDates.length} random dates from ${randomDates[0].toISOString().split("T")[0]} to ${randomDates[randomDates.length - 1].toISOString().split("T")[0]}`);
    }

    console.log("🎉 All tours updated successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding dates:", err);
    process.exit(1);
  }
}

seedDates();
