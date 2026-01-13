import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import express from "express";
import { MongoClient } from "mongodb";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

/* ================= APP CONFIG ================= */
const app = express();
const PORT = process.env.PORT || 5000;

/* ================= MIDDLEWARE ================= */
// CORS ko properly configure kiya gaya hai
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://fresher-frontend.onrender.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.use(express.json());

/* ================= STATIC FILES ================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/images", express.static(path.join(__dirname, "images")));

/* ================= DB CONNECTION ================= */
const DB_NAME = "formdata";
const MONGO_URL = process.env.MONGO_URL;
const client = new MongoClient(MONGO_URL);
let db;

/* ================= MAIL ================= */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587, // Port badal diya (465 ki jagah 587)
  secure: false, // Port 587 ke liye false hona chahiye
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false // Self-signed certificate issues ko bypass karne ke liye
  }
});

// Server startup pe check karne ke liye
transporter.verify((error, success) => {
  if (error) {
    console.log("❌ Mail Configuration Error:", error);
  } else {
    console.log("✅ Mail Server is ready to take our messages");
  }
});
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
app.post("/api/auth/send-otp", async (req, res) => {
  console.log("1. Received OTP request for:", req.body.email);
  try {
    if (!db) {
      console.log("2. DB connection missing, trying to reconnect...");
      await client.connect();
      db = client.db(DB_NAME);
    }

    const { email } = req.body;
    const otp = generateOTP();
    console.log("3. Generated OTP:", otp);

    // DB Operations
    await db.collection("otp").deleteMany({ email });
    await db.collection("otp").insertOne({ email, otp, createdAt: new Date() });
    console.log("4. OTP saved in Database");

    // Mail Sending
    console.log("5. Attempting to send email via:", process.env.EMAIL_USER);
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP",
      text: `Your OTP is ${otp}`,
    });

    console.log("6. Email sent successfully!");
    res.json({ message: "OTP sent" });

  } catch (err) {
    console.error("❌ CRITICAL ERROR IN SEND-OTP:", err.message);
    res.status(500).json({ 
      message: "Internal Server Error", 
      error: err.message // Isse frontend par asli error dikhega
    });
  }
});
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;
    if (!name || !email || !password || !otp)
      return res.status(400).json({ message: "All fields are required" });

    const otpData = await db.collection("otp").findOne({ email, otp: otp.toString() });
    
    if (!otpData) return res.status(400).json({ message: "Invalid OTP" });

    // Expiry Check (5 Minutes)
    const diff = (Date.now() - new Date(otpData.createdAt).getTime()) / 1000 / 60;
    if (diff > 5) return res.status(400).json({ message: "OTP expired" });

    const exists = await db.collection("student").findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection("student").insertOne({
      name,
      email,
      pass: hashedPassword,
      createdAt: new Date()
    });

    await db.collection("otp").deleteMany({ email });

    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    console.error("❌ SIGNUP ERROR:", err);
    res.status(500).json({ message: "Signup failed" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.collection("student").findOne({ email });
    
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.pass);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    res.json({
      token: "dummy-token-" + Date.now(), // Real app mein JWT use karein
      email: user.email,
      name: user.name,
      Imgsrc: user.Imgsrc || "/images/fresher.jpg",
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed" });
  }
});

/* ================= OTHER ROUTES ================= */

app.get("/students", async (req, res) => {
  try {
    const students = await db.collection("votesection").find().toArray();
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: "Error fetching students" });
  }
});

app.post("/vote", async (req, res) => {
  try {
    const { email, enrollmentnum } = req.body;
    const voted = await db.collection("votes").findOne({ email });
    if (voted) return res.status(400).json({ message: "Already voted" });

    await db.collection("votes").insertOne({ email, enrollmentnum });
    await db.collection("votesection").updateOne(
      { enrollmentnum }, 
      { $inc: { votes: 1 } }
    );

    res.json({ message: "Vote cast successfully" });
  } catch (err) {
    res.status(500).json({ message: "Vote failed" });
  }
});

/* ================= START SERVER ================= */
async function startServer() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    console.log("✅ MongoDB Connected Successfully");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ DB CONNECTION ERROR:", err);
    process.exit(1);
  }
}

startServer();