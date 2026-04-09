const mongoose = require("mongoose");
const axios = require("axios");
const Product = require("../models/productModel");
require("dotenv").config();

// הכתובת החדשה של ה-Endpoint בשרת הפייתון
const PYTHON_ML_URL = "http://localhost:8000/process-url";

async function enrich() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🚀 Connected to DB. Starting enrichment...");

    // חיפוש מוצרים שזקוקים לעדכון וקטור
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
        // חילוץ הלינק לתמונה (מוודא שאנחנו לוקחים את המחרוזת הנכונה)
        const imageUrl = typeof product.images[0] === 'string' 
                         ? product.images[0] 
                         : product.images[0].url;

        if (!imageUrl) {
          console.log(`⏩ No URL found for product ${product.title}`);
          continue;
        }

        // שליחת הלינק לשרת הפייתון בפורמט JSON
        const mlResult = await axios.post(PYTHON_ML_URL, {
          image_url: imageUrl
        });

        if (mlResult.data.items?.length > 0) {
          // שמירת הוקטור הראשון שחזר מהמודל
          product.imageEmbedding = mlResult.data.items[0].embedding;
          
          // שמירה ללא ולידציה כדי לא להיתקע על שדות חסרים אחרים
          await product.save({ validateBeforeSave: false });
          console.log(`✅ Success: ${product.title}`);
        } else {
          console.log(`⚠️ No items detected for: ${product.title}`);
        }

      } catch (err) {
        // הדפסת שגיאה מפורטת יותר כדי שנבין אם זה 403 או משהו אחר
        const status = err.response ? err.response.status : 'Network Error';
        console.log(`⚠️ Skipped product ${product.title} (${product._id}): ${status} - ${err.message}`);
      }
    }
    console.log("🏁 Enrichment complete!");
  } catch (err) {
    console.error("❌ Global Error:", err.message);
  } finally {
    await mongoose.connection.close(); // סגירה מסודרת של החיבור
    process.exit();
  }
}

enrich();

//node src/scripts/enrichProducts.js