require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const searchRoutes = require("./routes/searchRoutes");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");

const profileRoutes = require("./routes/profileRoutes"); 

const app = express();

app.use(cors({
    origin: "*", 
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