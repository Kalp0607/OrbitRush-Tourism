const mongoose = require("mongoose");
const CustomEnquiry = require("../models/customEnquiry");
const Tour = require("../models/tour");
const User = require("../models/user");

console.log("✅ Models imported successfully:");
console.log(" - CustomEnquiry model:", !!CustomEnquiry);
console.log(" - Tour model:", !!Tour);
console.log(" - User model:", !!User);
