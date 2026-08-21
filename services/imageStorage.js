const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
const http = require("http");
const https = require("https");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isProduction = process.env.NODE_ENV === "production";

// Configure Multer storage based on environment
let storage;

if (isProduction) {
  // Production: Use memory storage for direct Cloudinary stream upload
  storage = multer.memoryStorage();
} else {
  // Development: Use Multer local disk storage
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      let subfolder = "tours";
      if (req.originalUrl && req.originalUrl.includes("comment")) {
        subfolder = "reviews";
      }
      const uploadPath = path.resolve(`./public/uploads/${subfolder}/`);

      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      const timestamp = Date.now();
      const fileExt = path.extname(file.originalname);
      const random = Math.random().toString(36).substr(2, 5);

      let fileName;
      if (file.fieldname === "coverImage") {
        fileName = `cover-${timestamp}-${random}${fileExt}`;
      } else if (file.fieldname === "photos" || file.fieldname === "moreImages") {
        fileName = `gallery-${timestamp}-${random}${fileExt}`;
      } else {
        fileName = `${file.fieldname}-${timestamp}-${random}${fileExt}`;
      }

      cb(null, fileName);
    },
  });
}

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
    files: 10,
  },
});

// Helper function to process single/multiple file uploads across environments
async function processUploadedFile(file, folderName = "tours") {
  if (!file) return "";

  if (isProduction) {
    // Upload buffer to Cloudinary in Production
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `tours/${folderName}` },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(file.buffer);
    });
  } else {
    // In Development, file is saved locally by Multer disk storage
    const subfolder = file.fieldname === "photos" ? "reviews" : folderName;
    return `/uploads/${subfolder}/${file.filename}`;
  }
}

async function processUploadedFiles(files, folderName = "tours") {
  if (!files || !Array.isArray(files) || files.length === 0) return [];
  const results = [];
  for (const file of files) {
    const url = await processUploadedFile(file, folderName);
    if (url) results.push(url);
  }
  return results;
}

// Fallback helper: In development mode, if a file is requested at /uploads/... but does not exist locally,
// download it from Cloudinary if available and save to disk.
function cloudinaryDevFallbackMiddleware(req, res, next) {
  if (isProduction) return next();

  const reqPath = req.path; // e.g. /tours/cover-123.jpg or /reviews/img.jpg
  const localFilePath = path.join(__dirname, "../public/uploads", reqPath);

  if (fs.existsSync(localFilePath)) {
    return next();
  }

  // File missing locally: Attempt Cloudinary download
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return next();

  // Construct Cloudinary URL based on path
  const cloudinaryUrl = `https://res.cloudinary.com/${cloudName}/image/upload/tours${reqPath}`;

  const client = cloudinaryUrl.startsWith("https") ? https : http;
  client
    .get(cloudinaryUrl, (cloudinaryRes) => {
      if (cloudinaryRes.statusCode === 200) {
        const dir = path.dirname(localFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const fileStream = fs.createWriteStream(localFilePath);
        cloudinaryRes.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          console.log(`[Dev Storage] Downloaded missing image from Cloudinary: ${reqPath}`);
          return res.sendFile(localFilePath);
        });
      } else {
        return next();
      }
    })
    .on("error", () => {
      return next();
    });
}

module.exports = {
  isProduction,
  upload,
  processUploadedFile,
  processUploadedFiles,
  cloudinaryDevFallbackMiddleware,
  cloudinary,
};
