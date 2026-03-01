require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const searchRoutes = require("./routes/searchRoutes");

const app = express();
app.use(express.json());
app.use("/api/search", searchRoutes);

connectDB();

app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

