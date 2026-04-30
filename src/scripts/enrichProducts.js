const mongoose = require("mongoose");
const axios = require("axios");
const Product = require("../models/productModel");
require("dotenv").config();

const PYTHON_ML_URL = "http://localhost:8000/process-url";

async function enrich() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🚀 Connected to DB. Starting enrichment...");

    const products = await Product.find({
      "images.0": { $exists: true }, 
      $or: [
        { imageEmbedding: { $exists: false } }, 
        { imageEmbedding: { $size: 0 } },       
        { imageEmbedding: { $all: [0] } }       
      ]
    }).limit(1200);

    console.log(`Found ${products.length} products to process.`);

    for (const product of products) {
      try {
        const imageUrl = typeof product.images[0] === 'string' 
                         ? product.images[0] 
                         : product.images[0].url;

        if (!imageUrl) {
          console.log(`⏩ No URL found for product ${product.title}`);
          continue;
        }

        const mlResult = await axios.post(PYTHON_ML_URL, {
          image_url: imageUrl
        });

        if (mlResult.data.items?.length > 0) {
          product.imageEmbedding = mlResult.data.items[0].embedding;
          
          await product.save({ validateBeforeSave: false });
          console.log(`✅ Success: ${product.title}`);
        } else {
          console.log(`⚠️ No items detected for: ${product.title}`);
        }

      } catch (err) {
        const status = err.response ? err.response.status : 'Network Error';
        console.log(`⚠️ Skipped product ${product.title} (${product._id}): ${status} - ${err.message}`);
      }
    }
    console.log("🏁 Enrichment complete!");
  } catch (err) {
    console.error("❌ Global Error:", err.message);
  } finally {
    await mongoose.connection.close();
    process.exit();
  }
}

enrich();

//node src/scripts/enrichProducts.js