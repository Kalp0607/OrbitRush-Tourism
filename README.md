# 🚀 OrbitRush — Ultra-Luxury Tourism & Curated Global Expeditions

OrbitRush is a state-of-the-art, full-stack luxury travel and expedition booking platform. Designed with an ultra-modern aesthetic, it features real-time live customer support, an AI-powered custom trip architect powered by Google Gemini, automated Razorpay payment processing, dynamic tour catalog management, and a comprehensive administrator dashboard.

---

## ✨ Key Features

### 🌍 Traveler Experience
- **Cinematic Homepage & Destinations Catalog**: Curated expedition packages with rich imagery, detailed day-by-day itineraries, interactive pricing, and authentic user reviews.
- **🤖 AI Trip Architect**: Powered by Gemini API, travelers can conversationally design custom travel plans, optimize budgets, and submit bespoke expedition proposals directly to curators.
- **💬 Real-Time Live Concierge**: Instant WebSocket-based live chat (Socket.IO) allowing travelers to connect directly with support specialists on-demand with automatic connection lifecycle management.
- **💳 Seamless Razorpay Payments**: End-to-end payment integration with HMAC-SHA256 signature verification, automated booking confirmations, and instant cancellation/refund processing.
- **🔐 Secure Authentication & Profiles**: JWT cookie authentication, password hashing with cryptographic salts, OTP verification, password recovery, and personalized dashboards for tracking bookings and inquiries.

### 🛡️ Administrator Command Suite
- **Comprehensive Tour Management**: Full CRUD operations to create, edit, customize, and delete tour packages with Cloudinary media uploads.
- **🎧 Live Support Workspace**: Real-time admin chat console to manage live active customer sessions with instant disconnect/reconnect sync.
- **📋 Inquiries & AI Custom Trips**: Centralized dashboard to review standard inquiries and AI-generated trip plans, with status tracking and customer notifications.
- **🎫 Bookings Management**: Monitor all confirmed bookings, traveler counts, total revenue, and manage customer cancellations with automated Razorpay refunds.
- **👥 User Details Management**: Admin directory of all registered travelers and account roles.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Backend Runtime** | [Node.js](https://nodejs.org/) (v18+) |
| **Web Framework** | [Express.js 5](https://expressjs.com/) |
| **Real-Time Engine** | [Socket.io](https://socket.io/) |
| **Database & ODM** | [MongoDB](https://www.mongodb.com/) with [Mongoose](https://mongoosejs.com/) |
| **AI Integration** | [Google Gemini REST API](https://ai.google.dev/) |
| **Payment Gateway** | [Razorpay SDK](https://razorpay.com/) |
| **Media Pipeline** | [Cloudinary SDK](https://cloudinary.com/) & [Multer](https://github.com/expressjs/multer) |
| **Email Service** | [Nodemailer](https://nodemailer.com/) (Gmail SMTP / Brevo) |
| **View Engine & UI** | [EJS](https://ejs.co/), [Bootstrap 5.3](https://getbootstrap.com/), Vanilla CSS Design Tokens, [FontAwesome 6](https://fontawesome.com/) |
| **Security** | [JSON Web Tokens (JWT)](https://jwt.io/), [Cookie-Parser](https://github.com/expressjs/cookie-parser), [Crypto](https://nodejs.org/api/crypto.html) |

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the root directory and configure the following variables:

```env
# Server Configuration
PORT=8008

# Database Configuration
MONGO_URL=mongodb://localhost:27017/Orbit-Rush

# Authentication
JWT_SECRET=your_super_secret_jwt_key

# Cloudinary Storage Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Razorpay Payment Gateway
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Email Dispatcher (Gmail SMTP)
GMAIL_USER=your_email@gmail.com
GMAIL_PASS=your_16_character_app_password

# Google Gemini AI Integration
GEMINI_API_KEY=your_gemini_api_key
```

### Configuration Details

| Variable | Required | Description |
| :--- | :---: | :--- |
| `PORT` | Optional | Port on which the Express server runs (defaults to `8008`). |
| `MONGO_URL` | **Yes** | MongoDB connection URI (Local or Atlas). |
| `JWT_SECRET` | **Yes** | Secret cryptographic key used to sign authentication tokens. |
| `CLOUDINARY_*` | **Yes** | Cloudinary credentials for handling cover images and tour galleries. |
| `RAZORPAY_*` | **Yes** | Razorpay Test/Live API keys for booking transactions and refunds. |
| `GMAIL_USER` & `GMAIL_PASS` | **Yes** | SMTP credentials for automated OTPs, inquiry emails, and booking receipts. |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key powering the AI Tour Assistant. |

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/Kalp0607/OrbitRush-Tourism.git
cd OrbitRush-Tourism
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
```bash
cp .env.example .env
# Edit .env and enter your credentials
```

### 4. Run the Application

**Development Mode (with Nodemon file watching):**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

Open [http://localhost:8008](http://localhost:8008) in your browser.

---

## 📂 Project Architecture

```
OrbitRush-Hosted/
├── models/               # Mongoose Schemas (User, Tour, Booking, Enquiry, CustomEnquiry, Chat)
├── routes/               # Express Route Handlers (User, Tour, Static, Booking, AIAssistant)
├── services/             # Business Logic (Authentication, ImageStorage, Mailer, NavCache)
├── middlewares/          # Authentication & Role Verification Middlewares
├── views/                # EJS Templates
│   ├── admin/            # Admin Management Dashboards & Live Chat Workspace
│   ├── booking/          # Booking Process & Ticket Views
│   ├── partials/         # Reusable Components (Nav, Footer, Chat-Widget, AI-Widget, Head)
│   └── ...               # Core Views (Homepage, Tour Detail, Profile, Contact, About)
├── public/               # Static Assets (Images, CSS, Client Scripts)
├── app.js                # Server Entrypoint & Socket.IO Orchestration
└── package.json          # Dependencies & Scripts
```

---

## 🔒 Security Best Practices
- **Never commit your `.env` file** to public version control repositories.
- Keep Razorpay Secret Keys and Cloudinary API Secrets secure.
- Use App Passwords for Gmail SMTP integration.

---

## 📄 License
This project is licensed under the **ISC License**.
