require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const searchRoutes = require("./routes/searchRoutes");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const profileRoutes = require("./routes/profileRoutes"); 

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://findmylook.cs.colman.ac.il",
  "https://findmylook.cs.colman.ac.il",
  "http://193.106.55.155"
];

app.use(cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
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
app.use("/api/products", productRoutes);

app.use("/api/profile", profileRoutes); 

connectDB();

app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));