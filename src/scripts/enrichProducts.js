const mongoose = require("mongoose");
const axios = require("axios");
const FormData = require("form-data");
const Product = require("../models/productModel");
require("dotenv").config();

const PYTHON_ML_URL = "http://localhost:8000/process-look";

async function enrich() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🚀 Connected to DB. Starting enrichment...");

    // מחפשים רק מוצרים שיש להם תמונה ואין להם אימבדינג
    const products = await Product.find({
     "images.0": { $exists: true } 
    }).limit(1200);

    console.log(`Found ${products.length} products to process.`);

    for (const product of products) {
      try {
        const imageUrl = product.images[0].url;
        
        const imgResponse = await axios.get(imageUrl, { 
          responseType: 'arraybuffer',
          timeout: 5000 
        });
        
        const form = new FormData();
        form.append('file', imgResponse.data, { filename: 'image.jpg' });

        const mlResult = await axios.post(PYTHON_ML_URL, form, {
          headers: form.getHeaders()
        });

        if (mlResult.data.items?.length > 0) {
          product.imageEmbedding = mlResult.data.items[0].embedding;
          await product.save({ validateBeforeSave: false }); 
          console.log(`✅ Success: ${product.title}`);
        }
      } catch (err) {
        console.log(`⚠️ Skipped ${product._id}: ${err.message}`);
      }
    }

    console.log("🏁 Finished processing all products!");
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
  } finally {
    process.exit();
  }
}

enrich();