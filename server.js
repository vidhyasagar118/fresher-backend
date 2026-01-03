// server.js
import express from "express";
import { MongoClient } from "mongodb";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

// ===== ES MODULE __dirname FIX =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Serve static images =====
app.use("/images", express.static(path.join(__dirname, "images")));

// ===== DB CONFIG =====
const DB_NAME = "formdata";
const url =
  "mongodb+srv://abhishekh:rani181149@firstclauster.9csvrwh.mongodb.net/formdata?retryWrites=true&w=majority";

const client = new MongoClient(url);
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

// ===== AUTH =====
app.post("/api/auth/signup", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  try {
    const { name, email, password } = req.body;

    const exists = await db.collection("student").findOne({ email });
    if (exists) return res.status(400).json({ message: "User already exists" });

    await db.collection("student").insertOne({ name, email, pass: password });
    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    res.status(500).json({ message: "Signup failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  try {
    const { email, password } = req.body;
    const user = await db.collection("student").findOne({ email, pass: password });

    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    res.json({
      token: "dummy-token",
      email: user.email,
      name: user.name,
      enrollmentnum: user.enrollmentnum || null,
      Imgsrc: user.Imgsrc || "/images/fresher.jpg", // fallback image
    });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

// ===== STUDENTS (VOTE SECTION) =====
app.get("/students", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });
  try {
    const students = await db.collection("votesection").find().toArray();
    res.json(students);
  } catch {
    res.status(500).json({ message: "Failed to fetch students" });
  }
});

// ===== VOTE =====
app.post("/vote", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  try {
    const { email, enrollmentnum } = req.body;
    const voted = await db.collection("votes").findOne({ email });
    if (voted) return res.status(400).json({ message: "Already voted" });

    await db.collection("votes").insertOne({ email, enrollmentnum });
    await db.collection("votesection").updateOne(
      { enrollmentnum },
      { $inc: { votes: 1 } }
    );
    res.json({ message: "Vote successful" });
  } catch {
    res.status(500).json({ message: "Vote failed" });
  }
});

app.get("/vote/status/:email", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  const vote = await db.collection("votes").findOne({ email: req.params.email });
  res.json({ hasVoted: !!vote });
});

// ===== PROFECERS =====
app.get("/profecers", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  try {
    const profecers = await db.collection("profecerinfo").find().toArray();
    res.json(profecers);
  } catch {
    res.status(500).json({ message: "Failed to fetch profecers" });
  }
});

// ===== HOME IMAGE =====
app.get("/home/image", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  try {
    const home = await db.collection("home").findOne({});
    if (!home) return res.status(404).json({ message: "No image found" });

    // Make sure imageUrl starts with /images/ if stored locally
    res.json({ imageUrl: home.imageUrl || "/images/fresher.jpg" });
  } catch {
    res.status(500).json({ message: "Failed to fetch home image" });
  }
});
// ===== TOP 5 MOST VOTED STUDENTS (FROM VOTESECTION) =====
app.get("/students/top", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB not connected" });

  try {
    const topStudents = await db
      .collection("votesection")   
      .find()
      .sort({ votes: -1 })       
      .limit(3)
      .toArray();

    res.json(topStudents);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch top students" });
  }
});
