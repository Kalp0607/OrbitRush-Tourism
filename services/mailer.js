const nodemailer = require("nodemailer");

const gmailUser = process.env.GMAIL_USER || process.env.GMAIL_ID;
const gmailPass = process.env.GMAIL_PASS || process.env.GMAIL_PASSWORD;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailUser,
    pass: gmailPass,
  },
});

/**
 * Helper to safely send email with error handling and fallback
 */
async function sendEmail({ to, subject, html, text }) {
  if (!gmailUser || !gmailPass) {
    console.warn("⚠️ Gmail credentials missing in .env (GMAIL_USER & GMAIL_PASS required). Skipping email send.");
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"OrbitRush Tourism" <${gmailUser}>`,
      to: to,
      subject: subject,
      html: html,
      text: text,
    });
    return info;
  } catch (error) {
    console.error("❌ Email dispatch failed:", error.message);
    return false;
  }
}

module.exports = {
  transporter,
  sendEmail,
};
