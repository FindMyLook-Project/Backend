const mongoose = require("mongoose");
const Product = require("./models/productModel");
require("dotenv").config();

async function getAllCategories() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🚀 Connected to DB. Fetching categories...");

    const uniqueCategories = await Product.distinct("categoryGroup");
    
    console.log("✅ Found the following unique categories in DB:");
    console.log(uniqueCategories);

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.connection.close();
    process.exit();
  }
}

getAllCategories();

//node src/getCategories.js