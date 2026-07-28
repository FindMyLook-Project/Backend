require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const searchRoutes = require("./routes/searchRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

const ALLOWED_ORIGINS = [
    "http://findmylook.cs.colman.ac.il",
    "https://findmylook.cs.colman.ac.il",
    "http://193.106.55.155", // raw IP, kept during the domain migration
    "http://localhost:5173", // local frontend dev server, for testing against the real server
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api/search", searchRoutes);
app.use("/api/auth", authRoutes);

connectDB();

app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));