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

      // Single wide query — no score gate post-filter (ANN ordering is the ranking).
      // numCandidates at 10x limit ensures good ANN recall before the category pre-filter.
      const fetchFromMongo = async () => {
        const matchStage = {
          price: { $lte: Number(filters?.priceRange) || 2000 }
        };

        if (filters?.preferredStores && filters.preferredStores.length > 0) {
          matchStage.storeName = { $in: filters.preferredStores };
        }

        return await Product.aggregate([
          {
            $vectorSearch: {
              index: "vector_index",
              path: "imageEmbedding",
              queryVector: embedding,
              numCandidates: 600,
              limit: 80,
              filter: { categoryGroup: { $in: allowedCategories } }
            }
          },
          { $addFields: { searchScore: { $meta: "vectorSearchScore" } } },
          { $match: matchStage }
        ]);
      };

      let products = await fetchFromMongo();
      console.log(`🔎 Item ${index}: vector search returned ${products.length} candidates`);

      // ── Post-filter: remove only explicitly incompatible colors (colorTaxonomy) ──
      // This is the sole color hard-gate. It only blocks products that carry an
      // explicit incompatible tag — untagged or neutral products always pass through.
      if (hasColor) {
        const before = products.length;
        products = products.filter(p => isColorCompatible(detectedColor, p.colors));
        const removed = before - products.length;
        if (removed > 0) {
          console.log(`🚫 Item ${index}: color post-filter removed ${removed} incompatible products`);
        }
      }

      // ── Blended visual + color scoring ───────────────────────────────────────
      // Replace the old hard 30% cut with a weighted blend so color supports
      // rather than overrides visual similarity.
      //
      // Scale note: colorScore (image×text cosine) clusters ~0.20–0.30 while
      // searchScore (image×image cosine) clusters ~0.75–0.90. Multiplying
      // colorScore by 3 normalizes the scales before blending.
      if (hasColor && colorVector.length > 0 && products.length > 0) {
        let anyEmbFound = false;
        products = products.map(p => {
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
          products = products
            .map(p => ({
              ...p,
              blendedScore: 0.80 * p.searchScore + 0.20 * (p.colorScore * 3)
            }))
            .sort((a, b) => b.blendedScore - a.blendedScore);
          console.log(`🎨 Item ${index}: blended visual+color scoring applied (${products.length} products)`);
        }
      }

      if (userProfile && userProfile.topStores && userProfile.topStores.length > 0) {
        const favoriteStores = userProfile.topStores.map(store => store.toLowerCase());

        products = products.map(product => {
          const baseScore = product.blendedScore ?? product.searchScore;
          const boost = favoriteStores.includes((product.storeName || '').toLowerCase()) ? 0.05 : 0;
          return {
            ...product,
            personalizationBoost: boost,
            finalScore: baseScore + boost
          };
        });

        products.sort((a, b) => b.finalScore - a.finalScore);
      } else {
        products = products.map(product => ({
          ...product,
          personalizationBoost: 0,
          finalScore: product.blendedScore ?? product.searchScore
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

