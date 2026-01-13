import express from "express";
import { MongoClient } from "mongodb";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const app = express();
app.use(cors({
  origin: ["http://localhost:3000", "https://your-frontend-domain.onrender.com"],
}));
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/images", express.static(path.join(__dirname, "images")));

// ================= DB =================
const DB_NAME = "formdata";
const MONGO_URL =
  "mongodb+srv://abhishekh:rani181149@firstclauster.9csvrwh.mongodb.net/formdata?retryWrites=true&w=majority";

const client = new MongoClient(MONGO_URL);
let db;

async function startServer() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    console.log("✅ MongoDB Atlas Connected");

    app.listen(5000, () => {
      console.log("🚀 Server running on port 5000");
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}
startServer();


// ================= MAIL =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // ✅
    pass: process.env.EMAIL_PASS, // ✅ App Password
  },
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ================= AUTH =================

// 👉 SEND OTP
app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const otp = generateOTP();

    await db.collection("otp").deleteMany({ email });
    await db.collection("otp").insertOne({
      email,
      otp,
      createdAt: new Date(),
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP for Signup",
      text: `Your OTP is ${otp}. Valid for 5 minutes.`,
    });

    console.log("OTP sent:", otp);
    res.json({ message: "OTP sent" });
  } catch (err) {
  console.error("OTP ERROR FULL:", err);
  res.status(500).json({ message: err.message });

  }
});

// 👉 SIGNUP
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;

    if (!name || !email || !password || !otp)
      return res.status(400).json({ message: "All fields required" });

    const otpData = await db.collection("otp").findOne({ email, otp });
    if (!otpData) return res.status(400).json({ message: "Invalid OTP" });

    if (new Date() - otpData.createdAt > 5 * 60 * 1000)
      return res.status(400).json({ message: "OTP expired" });

    const exists = await db.collection("student").findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });

    await db.collection("student").insertOne({
      name,
      email,
      pass: password,
    });

    await db.collection("otp").deleteMany({ email });

    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    res.status(500).json({ message: "Signup failed" });
  }
});

// 3️⃣ Login
app.post("/api/auth/login", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  const { email, password } = req.body;
  try {
    const user = await db.collection("student").findOne({ email, pass: password });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    res.json({
      token: "dummy-token",
      email: user.email,
      name: user.name,
      enrollmentnum: user.enrollmentnum || null,
      Imgsrc: user.Imgsrc || "/images/fresher.jpg",
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// ================= OTHER ROUTES (UNCHANGED) =================

app.get("/students", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });
  const students = await db.collection("votesection").find().toArray();
  res.json(students);
});

app.post("/vote", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  const { email, enrollmentnum } = req.body;
  const voted = await db.collection("votes").findOne({ email });
  if (voted) return res.status(400).json({ message: "Already voted" });

  await db.collection("votes").insertOne({ email, enrollmentnum });
  await db.collection("votesection").updateOne(
    { enrollmentnum },
    { $inc: { votes: 1 } }
  );

  res.json({ message: "Vote successful" });
});

app.get("/vote/status/:email", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });
  const vote = await db.collection("votes").findOne({ email: req.params.email });
  res.json({ hasVoted: !!vote });
});

let profecerCache = null;
app.get("/profecers", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  if (profecerCache) return res.json(profecerCache);

  const profecers = await db
    .collection("profecerinfo")
    .find({}, { projection: { name: 1, role: 1, imgsrc: 1 } })
    .toArray();

  profecerCache = profecers;
  res.json(profecers);
});

app.get("/students/top", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  const topStudents = await db
    .collection("votesection")
    .find()
    .sort({ votes: -1 })
    .limit(1)
    .toArray();

  res.json(topStudents);
});
