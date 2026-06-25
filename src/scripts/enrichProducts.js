const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env"), override: true });
const mongoose = require("mongoose");
const axios = require("axios");
const Product = require("../models/productModel");

const PYTHON_ML_URL = "http://localhost:8000/process-url";

// FORCE_REENRICH=true  → re-embed ALL products (overwrites existing embeddings)
// default             → only products with missing/empty embeddings
const FORCE_REENRICH = process.env.FORCE_REENRICH === "true";

// How many products to fetch from DB at a time (avoids loading 17k docs into RAM at once)
const BATCH_SIZE = 200;

async function enrich() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🚀 Connected to DB. Starting enrichment...");
    console.log(`Mode: ${FORCE_REENRICH ? "FORCE (re-embed everything)" : "INCREMENTAL (missing only)"}`);

    const baseQuery = FORCE_REENRICH
      ? { "images.0": { $exists: true } }
      : {
          "images.0": { $exists: true },
          $or: [
            { imageEmbedding: { $exists: false } },
            { imageEmbedding: { $size: 0 } },
            { imageEmbedding: { $all: [0] } }
          ]
        };

    const total = await Product.countDocuments(baseQuery);
    console.log(`Found ${total} products to process.\n`);

    let success = 0;
    let skipped = 0;
    let offset = 0;

    while (offset < total) {
      const products = await Product.find(baseQuery).skip(offset).limit(BATCH_SIZE);
      if (products.length === 0) break;

      for (const product of products) {
        try {
          const imageUrl = typeof product.images[0] === "string"
            ? product.images[0]
            : product.images[0]?.url;

          if (!imageUrl) {
            skipped++;
            continue;
          }

          const mlResult = await axios.post(PYTHON_ML_URL, { image_url: imageUrl });

          if (mlResult.data.items?.length > 0) {
            product.imageEmbedding = mlResult.data.items[0].embedding;
            await product.save({ validateBeforeSave: false });
            success++;
            const pct = ((success + skipped) / total * 100).toFixed(1);
            console.log(`✅ [${success}/${total} · ${pct}%] ${product.title}`);
          } else {
            skipped++;
          }

        } catch (err) {
          const status = err.response ? err.response.status : "Network Error";
          console.log(`⚠️ Skipped: ${product.title} — ${status}`);
          skipped++;
        }
      }

      offset += BATCH_SIZE;
    }

    console.log(`\n🏁 Enrichment complete! ✅ ${success} embedded, ⏩ ${skipped} skipped`);
  } catch (err) {
    console.error("❌ Global Error:", err.message);
  } finally {
    await mongoose.connection.close();
    process.exit();
  }
}

enrich();

// Run modes:
//   node src/scripts/enrichProducts.js                              ← incremental (missing only)
//   $env:FORCE_REENRICH="true"; node src/scripts/enrichProducts.js ← re-embed everything
