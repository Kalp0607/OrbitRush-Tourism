//Importing express and creating app
require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const PORT = process.env.PORT || 8008;

// Routes Import
const userRoute = require("./routes/user");
const tourRoute = require("./routes/tour");
const staticRoute = require("./routes/static");

//Database Connection
const mongoose = require("mongoose");
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const cookieParser = require("cookie-parser");
const {
  checkForAuthenticationCookie,
} = require("./middlewares/authentication");

const Tour = require("./models/tour");
const Enquiry = require("./models/enquiry");
//Data Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(checkForAuthenticationCookie("token"));
app.use(express.static(path.resolve("./public")));

//EJS Connections

app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

// Routes
app.use("/user", userRoute);
app.use("/tour", tourRoute);
app.use("/", staticRoute);

app.listen(PORT, () => {
  console.log(`Server Started at Port ${PORT}`);
});
