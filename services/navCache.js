const Tour = require("../models/tour");

let cachedNavTours = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory TTL

/**
 * Get optimized list of tours for navigation dropdowns.
 * Uses in-memory caching with lean queries for maximum speed.
 */
async function getNavTours() {
  const now = Date.now();
  if (cachedNavTours && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedNavTours;
  }

  try {
    cachedNavTours = await Tour.find({})
      .select("name")
      .sort({ name: 1 })
      .lean();
    lastCacheTime = now;
    return cachedNavTours;
  } catch (error) {
    console.error("Error fetching nav tours:", error);
    return cachedNavTours || [];
  }
}

/**
 * Invalidate the navigation tours cache.
 * Call this whenever a tour is created, updated, or deleted.
 */
function clearNavToursCache() {
  cachedNavTours = null;
  lastCacheTime = 0;
}

module.exports = {
  getNavTours,
  clearNavToursCache,
};
