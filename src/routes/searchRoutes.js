const express = require('express');
const router = express.Router();
const Product = require('../models/productModel');
const Store = require('../models/storeModel'); 
const UserStyleProfile = require('../models/userStyleProfileModel');
const axios = require('axios');
const { isColorCompatible } = require('../constants/colorTaxonomy');
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_PROCESS_LOOK_ENDPOINT =
  process.env.ML_URL ||
  (ML_SERVICE_URL.endsWith('/process-look-base64')
    ? ML_SERVICE_URL
    : `${ML_SERVICE_URL}/process-look-base64`);

// Strict DB category groups per ML-detected garment type
const CATEGORY_MAP = {
  top:    ['tops', 'blouses', 'bodysuits', 'coats', 'jackets', 'knitwear', 'outerwear', 'sweatshirts', 'basics', 'casual', 'activewear'],
  bottom: ['bottoms', 'jeans', 'trousers', 'shorts', 'overalls', 'suits', 'basics', 'casual', 'activewear'],
  skirt:  ['skirts', 'dresses_and_skirts'],
  dress:  ['dresses', 'dresses_and_overalls', 'dresses_and_skirts'],
  shoes:  ['shoes', 'shoes_general', 'sneakers', 'boots', 'ankle_boots', 'flats', 'heels', 'leather_shoes'],
};

// Fallback used only when ML classification is unavailable
const LOOK_ALLOWED_CATEGORIES = [...new Set(Object.values(CATEGORY_MAP).flat())];

router.post('/visual-search', async (req, res) => {
  try {
    const { items, filters, userId } = req.body; 

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    let userProfile = null;
    if (userId) {
      userProfile = await UserStyleProfile.findOne({ userId });
    }

    const resultsPerItem = await Promise.all(items.map(async (itemData, index) => {
      
      let embedding = [];
      let detectedColor = "";
      let colorVector = [];
      let allowedCategories = LOOK_ALLOWED_CATEGORIES;

      try {
        const mlResponse = await axios.post(ML_PROCESS_LOOK_ENDPOINT, {
          image: itemData.image
        });

        const mlItems = mlResponse?.data?.items;
        if (!Array.isArray(mlItems) || mlItems.length === 0 || !mlItems[0]?.embedding) {
          console.warn(`⚠️ ML returned no usable items for item ${index}`);
          return { itemIndex: index, results: [] };
        }

        embedding = mlItems[0].embedding;
        detectedColor = mlItems[0].color;
        colorVector = mlItems[0].colorVector || [];

        const mlCategory = mlItems[0].categoryGroup;
        if (mlCategory && CATEGORY_MAP[mlCategory]) {
          allowedCategories = CATEGORY_MAP[mlCategory];
          console.log(`🔍 Item ${index} → ML detected category: "${mlCategory}" → filtering to: [${allowedCategories.join(', ')}]`);
        } else {
          console.warn(`⚠️ Item ${index} → ML categoryGroup "${mlCategory}" unrecognised, using full category list`);
        }
      } catch (mlErr) {
        console.error(`ML Service Error on item ${index}:`, mlErr.message);
        return { itemIndex: index, results: [] };
      }

      const hasColor = detectedColor && detectedColor !== "other";
      console.log(`🎨 Item ${index} → detectedColor: "${detectedColor}", hasColor: ${hasColor}`);

      const fetchFromMongo = async (minScore, applyColorFilter) => {
        let matchStage = {
          searchScore: { $gte: minScore },
          price: { $lte: Number(filters?.priceRange) || 2000 }
        };

        if (applyColorFilter && hasColor) {
          // Case-insensitive match: covers "black", "Black", "BLACK" in the DB
          matchStage.colors = {
            $elemMatch: { $regex: `^${detectedColor}$`, $options: 'i' }
          };
        }

        if (filters?.preferredStores && filters.preferredStores.length > 0) {
          matchStage.storeName = { $in: filters.preferredStores };
        }

        return await Product.aggregate([
          {
            $vectorSearch: {
              index: "vector_index",
              path: "imageEmbedding",
              queryVector: embedding,
              numCandidates: 200,
              limit: 30,
              filter: { categoryGroup: { $in: allowedCategories } }
            }
          },
          { $addFields: { searchScore: { $meta: "vectorSearchScore" } } },
          { $match: matchStage }
        ]);
      };

      // Pass 1 – strict: high score + color filter
      let products = await fetchFromMongo(0.85, true);

      // Pass 2 – relax score threshold but KEEP color filter
      if (products.length === 0 && hasColor) {
        console.log(`⚠️ Item ${index}: no results at 0.85 with color. Trying 0.80 + color...`);
        products = await fetchFromMongo(0.80, true);
      }

      // Pass 3 – last resort: drop DB color filter (style match only)
      // The colorTaxonomy post-filter below still enforces incompatibility rules.
      if (products.length === 0) {
        console.log(`⚠️ Item ${index}: no results with color filter. Falling back to 0.78 without color...`);
        products = await fetchFromMongo(0.78, false);
      }

      // ── Post-filter: remove explicitly incompatible products ─────────────
      if (hasColor) {
        const before = products.length;
        products = products.filter(p => isColorCompatible(detectedColor, p.colors));
        const removed = before - products.length;
        if (removed > 0) {
          console.log(`🚫 Item ${index}: color post-filter removed ${removed} incompatible products`);
        }
      }

      // ── Colour re-ranking via CLIP text-image affinity ────────────────────
      // dot(product.imageEmbedding, colorVector) gives a cross-modal CLIP score
      // that measures how well each stored product image matches the target colour.
      // Guard: only run if we have products, a colorVector, and the embeddings
      // exist in the returned documents. Never produces 0 results.
      if (hasColor && colorVector.length > 0 && products.length > 0) {
        let anyEmbFound = false;
        const withColorScore = products.map(p => {
          let colorScore = 0;
          const emb = p.imageEmbedding;
          if (Array.isArray(emb) && emb.length > 0) {
            anyEmbFound = true;
            const len = Math.min(colorVector.length, emb.length);
            for (let i = 0; i < len; i++) colorScore += colorVector[i] * emb[i];
          }
          return { ...p, colorScore };
        });

        if (anyEmbFound) {
          // Sort by colour affinity, drop bottom 30 % — always keep ≥ 5
          withColorScore.sort((a, b) => b.colorScore - a.colorScore);
          const keepCount = Math.max(5, Math.ceil(withColorScore.length * 0.7));
          // Restore original search-score ordering within the kept set
          products = withColorScore
            .slice(0, keepCount)
            .sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));
          console.log(`🎨 Item ${index}: color re-ranking kept ${products.length}/${withColorScore.length} products`);
        }
        // If no embeddings were found in the documents, skip re-ranking silently
      }

      if (userProfile && userProfile.topStores && userProfile.topStores.length > 0) {
        const favoriteStores = userProfile.topStores.map(store => store.toLowerCase());

        products = products.map(product => {
          let boost = 0;
          let finalScore = product.searchScore;
          
          const pStore = product.storeName ? product.storeName.toLowerCase() : "";

          if (favoriteStores.includes(pStore)) {
            boost = 0.05;
            finalScore += boost;
          }

          return {
            ...product,
            personalizationBoost: boost,
            finalScore: finalScore
          };
        });

        products.sort((a, b) => b.finalScore - a.finalScore);
      } else {
        products = products.map(product => ({
          ...product,
          personalizationBoost: 0,
          finalScore: product.searchScore
        }));
      }

      // חותכים ל-10 התוצאות הטובות ביותר
      products = products.slice(0, 10);

      return {
        itemIndex: index,
        results: products
      };
    }));

    res.status(200).json({
      success: true,
      isPersonalized: !!userProfile, 
      appliedStores: userProfile ? userProfile.topStores : [],
      data: resultsPerItem
    });

  } catch (error) {
    console.error("Search Route Error:", error);
    res.status(500).json({ error: "Server error during visual search" });
  }
});

router.get('/random', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const products = await Product.aggregate([{ $sample: { size: limit } }]);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error("Error fetching random products:", error);
    res.status(500).json({ error: "Failed to fetch random products" });
  }
});

router.get('/stores', async (req, res) => {
  try {
    const storesData = await Store.find({ isActive: true }, 'name key');
    const sortedStores = storesData
      .map(storeDoc => ({ key: storeDoc.key, name: storeDoc.name }))
      .filter(store => store.name && store.name.trim() !== '')
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    res.status(200).json({ success: true, data: sortedStores });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stores" });
  }
});


router.get('/fix-db', async (req, res) => {
  try {
    const collection = Store.collection;
    const updateResult = await collection.updateMany(
      { domain: { $exists: true } },
      { $rename: { "domain": "baseUrl" } }
    );
    res.json({ success: true, message: "Database updated successfully", modifiedCount: updateResult.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

