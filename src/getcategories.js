const mongoose = require("mongoose");
const Product = require("./models/productModel"); // ודאי שהנתיב למודל נכון
require("dotenv").config();

async function getAllCategories() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🚀 Connected to DB. Fetching categories...");

    // הפונקציה הזו עוברת על כל המוצרים ומחזירה מערך של ערכים ייחודיים בלבד
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