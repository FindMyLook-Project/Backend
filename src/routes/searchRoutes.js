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
  bottom: ['bottoms', 'jeans', 'trousers', 'overalls', 'suits', 'basics', 'casual', 'activewear'],
  shorts: ['shorts'],
  skirt:  ['skirts', 'dresses_and_skirts'],
  dress:  ['dresses', 'dresses_and_overalls', 'dresses_and_skirts'],
  shoes:  ['shoes', 'shoes_general', 'sneakers', 'boots', 'ankle_boots', 'flats', 'heels', 'leather_shoes'],
  belt:   ['accessories', 'other'],
};

// Narrow shoe vector search when ML detects a specific sub-style
const SHOE_STYLE_CATEGORY_MAP = {
  slide_sandal:  ['shoes', 'shoes_general', 'flats'],
  puffy_slide:   ['shoes', 'shoes_general', 'flats'],
  birkenstock:   ['shoes', 'shoes_general', 'flats'],
  heeled_sandal: ['heels', 'shoes', 'shoes_general'],
  espadrille:    ['flats', 'shoes', 'shoes_general'],
  heeled_boot:   ['ankle_boots', 'boots', 'heels', 'leather_shoes', 'shoes'],
  flat_shoe:     ['flats', 'shoes', 'shoes_general'],
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
      let contrastColorVector = [];
      let greyContrastVector = [];
      let beigeContrastVector = [];
      let blueContrastVector = [];
      let styleContrastVector = [];
      let shoeStyle = "";
      let topStyle = "";
      let bottomLength = "";
      let mlCategory = "";
      let allowedCategories = LOOK_ALLOWED_CATEGORIES;

      try {
        const mlResponse = await axios.post(ML_PROCESS_LOOK_ENDPOINT, {
          image: itemData.image
        });

        const mlItems = mlResponse?.data?.items;
        if (!Array.isArray(mlItems) || mlItems.length === 0 || !mlItems[0]?.embedding) {
          console.warn(`?? ML returned no usable items for item ${index}`);
          return { itemIndex: index, results: [] };
        }

        embedding = mlItems[0].embedding;
        detectedColor = mlItems[0].color;
        colorVector = mlItems[0].colorVector || [];
        contrastColorVector = mlItems[0].contrastColorVector || [];
        greyContrastVector = mlItems[0].greyContrastVector || [];
        beigeContrastVector = mlItems[0].beigeContrastVector || [];
        blueContrastVector = mlItems[0].blueContrastVector || [];
        styleContrastVector = mlItems[0].styleContrastVector || [];
        shoeStyle = mlItems[0].shoeStyle || "";
        topStyle = mlItems[0].topStyle || "";
        bottomLength = mlItems[0].bottomLength || "";
        mlCategory = mlItems[0].categoryGroup || "";

        if (bottomLength === 'shorts' && CATEGORY_MAP.shorts) {
          allowedCategories = CATEGORY_MAP.shorts;
          console.log(`?? Item ${index} ? ML detected bottom/shorts ? filtering to: [${allowedCategories.join(', ')}]`);
        } else if (shoeStyle && SHOE_STYLE_CATEGORY_MAP[shoeStyle]) {
          allowedCategories = SHOE_STYLE_CATEGORY_MAP[shoeStyle];
          console.log(`?? Item ${index} ? ML detected shoe/${shoeStyle} ? filtering to: [${allowedCategories.join(', ')}]`);
        } else if (mlCategory && CATEGORY_MAP[mlCategory]) {
          allowedCategories = CATEGORY_MAP[mlCategory];
          console.log(`?? Item ${index} ? ML detected category: "${mlCategory}" ? filtering to: [${allowedCategories.join(', ')}]`);
        } else {
          console.warn(`?? Item ${index} ? ML categoryGroup "${mlCategory}" unrecognised, using full category list`);
        }
      } catch (mlErr) {
        console.error(`ML Service Error on item ${index}:`, mlErr.message);
        return { itemIndex: index, results: [] };
      }

      // "pattern" skips DB colour taxonomy — but still uses pattern vector re-ranking
      const isPattern = detectedColor === "pattern";
      const hasColor = detectedColor && detectedColor !== "other" && !isPattern;
      const hasColorRerank = colorVector.length > 0 && detectedColor && detectedColor !== "other";
      const hasStyleRerank = styleContrastVector.length > 0 && (!!shoeStyle || !!topStyle || !!bottomLength || mlCategory === 'belt');
      const PASTEL_COLORS = new Set(['lavender', 'purple', 'pink']);
      console.log(`?? Item ${index} ? mlCategory: "${mlCategory || 'unknown'}", detectedColor: "${detectedColor}", hasColor: ${hasColor}, patternRerank: ${isPattern}, shoeStyle: "${shoeStyle || 'none'}", topStyle: "${topStyle || 'none'}", bottomLength: "${bottomLength || 'none'}"`);

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
      console.log(`?? Item ${index}: vector search returned ${products.length} candidates`);

      // -- Post-filter: remove only explicitly incompatible colors (colorTaxonomy) --
      // This is the sole color hard-gate. It only blocks products that carry an
      // explicit incompatible tag — untagged or neutral products always pass through.
      if (hasColor) {
        const before = products.length;
        products = products.filter(p => isColorCompatible(detectedColor, p.colors));
        const removed = before - products.length;
        if (removed > 0) {
          console.log(`?? Item ${index}: color post-filter removed ${removed} incompatible products`);
        }
      }

      // -- Blended visual + color scoring ---------------------------------------
      // Scale note: colorScore (image׳text cosine) clusters ~0.20–0.30 while
      // searchScore (image׳image cosine) clusters ~0.75–0.90. Multiplying
      // colorScore by 3 normalizes the scales before blending.
      //
      // MIN_COLOR_SCORE: hard gate based on CLIP semantics, not DB metadata.
      // Products whose image embedding has < 0.21 cosine similarity with the
      // color text vector are off-color regardless of what their DB tag says.
      // 0.20 instead of 0.23 — fashion-clip produces lower absolute colorScores
      // than ViT-B/32. The relative floor (85% of max) handles per-query calibration.
      const MIN_COLOR_SCORE = 0.20;
      const dotEmbedding = (emb, vec) => {
        if (!Array.isArray(emb) || !Array.isArray(vec) || emb.length === 0 || vec.length === 0) return 0;
        const len = Math.min(vec.length, emb.length);
        let score = 0;
        for (let i = 0; i < len; i++) score += vec[i] * emb[i];
        return score;
      };

      if (hasColorRerank && products.length > 0) {
        let anyEmbFound = false;
        const hasContrast = contrastColorVector.length > 0;
        const hasPastelContrast = greyContrastVector.length > 0;
        const vectorCandidates = [...products];
        products = products.map(p => {
          const emb = p.imageEmbedding;
          let colorScore = 0;
          let contrastScore = 0;
          let greyScore = 0;
          let beigeScore = 0;
          let blueScore = 0;
          let styleScore = 0;
          if (Array.isArray(emb) && emb.length > 0) {
            anyEmbFound = true;
            colorScore = dotEmbedding(emb, colorVector);
            if (hasContrast) contrastScore = dotEmbedding(emb, contrastColorVector);
            if (greyContrastVector.length) greyScore = dotEmbedding(emb, greyContrastVector);
            if (beigeContrastVector.length) beigeScore = dotEmbedding(emb, beigeContrastVector);
            if (blueContrastVector.length) blueScore = dotEmbedding(emb, blueContrastVector);
            if (hasStyleRerank) styleScore = dotEmbedding(emb, styleContrastVector);
          }
          return { ...p, colorScore, contrastScore, greyScore, beigeScore, blueScore, styleScore };
        });

        if (anyEmbFound) {
          const scoredProducts = products;
          const MIN_RESULTS = 8;

          const applyRelativeThreshold = (pool, relativePct) => {
            if (pool.length === 0) return pool;
            const maxColorScore = Math.max(...pool.map(p => p.colorScore));
            const threshold = Math.max(MIN_COLOR_SCORE, maxColorScore * relativePct);
            const filtered = pool.filter(p => p.colorScore >= threshold);
            if (filtered.length >= MIN_RESULTS) return filtered;
            return [...pool].sort((a, b) => b.colorScore - a.colorScore).slice(0, MIN_RESULTS);
          };

          const applyPastelContrast = (pool, margins) => pool.filter(p =>
            p.colorScore >= p.contrastScore + margins.white &&
            p.colorScore >= p.greyScore + margins.grey &&
            p.colorScore >= p.beigeScore + margins.beige &&
            p.colorScore >= p.blueScore + margins.blue
          );

          // Progressive relaxation: try strict colour gates first, then loosen
          // until we have enough results. Never return zero when vector search
          // already found candidates.
          const tiers = hasStyleRerank ? (
            mlCategory === 'belt' ? [
              { name: 'belt-strict', styleMargin: 0.022, relativePct: 0.90, visualWeight: 0.28 },
              { name: 'belt-light',  styleMargin: 0.012, relativePct: 0.87, visualWeight: 0.34 },
              { name: 'belt-visual', relativePct: 0.85, visualWeight: 0.48 },
            ] : bottomLength ? [
              { name: 'bottom-length-strict', styleMargin: 0.020, greyMargin: 0.012, navyMargin: 0.010, relativePct: 0.90, visualWeight: 0.32 },
              { name: 'bottom-length-light',  styleMargin: 0.012, greyMargin: 0.008, navyMargin: 0.006, relativePct: 0.87, visualWeight: 0.38 },
              { name: 'bottom-visual',       relativePct: 0.85, visualWeight: 0.52 },
            ] : topStyle ? [
              { name: 'top-style-strict', styleMargin: 0.024, brownMargin: 0.010, relativePct: 0.90, visualWeight: 0.30 },
              { name: 'top-style-light',  styleMargin: 0.014, brownMargin: 0.006, relativePct: 0.87, visualWeight: 0.36 },
              { name: 'top-visual',       relativePct: 0.85, visualWeight: 0.50 },
            ] : shoeStyle ? [
            { name: 'shoe-style-strict', styleMargin: 0.024, relativePct: 0.90, visualWeight: 0.28 },
            { name: 'shoe-style-light',  styleMargin: 0.014, relativePct: 0.87, visualWeight: 0.34 },
            { name: 'shoe-visual',       relativePct: 0.85, visualWeight: 0.48 },
            ] : [
            { name: 'shoe-style-strict', styleMargin: 0.022, relativePct: 0.90, visualWeight: 0.30 },
            { name: 'shoe-style-light',  styleMargin: 0.012, relativePct: 0.87, visualWeight: 0.35 },
            { name: 'shoe-visual',       relativePct: 0.85, visualWeight: 0.50 },
            ]
          ) : isPattern ? [
            { name: 'pattern-strict', solidMargin: 0.012, relativePct: 0.88, visualWeight: 0.45 },
            { name: 'pattern-light',  solidMargin: 0.006, relativePct: 0.85, visualWeight: 0.50 },
            { name: 'pattern-visual', relativePct: 0.85, visualWeight: 0.65 },
          ] : hasPastelContrast ? [
            { name: 'strict-pastel', pastel: { white: 0.025, grey: 0.022, beige: 0.022, blue: 0.018 }, relativePct: 0.92, visualWeight: 0.40 },
            { name: 'medium-pastel', pastel: { white: 0.018, grey: 0.014, beige: 0.014, blue: 0.010 }, relativePct: 0.88, visualWeight: 0.45 },
            { name: 'light-pastel',  pastel: { white: 0.012, grey: 0.008, beige: 0.008, blue: 0.006 }, relativePct: 0.85, visualWeight: 0.50 },
            { name: 'white-only',    whiteMargin: 0.015, relativePct: 0.85, visualWeight: 0.55 },
            { name: 'visual-only',   relativePct: 0.85, visualWeight: 0.65 },
          ] : hasContrast ? [
            { name: 'white-contrast', whiteMargin: 0.015, relativePct: 0.85, visualWeight: 0.55 },
            { name: 'visual-only', relativePct: 0.85, visualWeight: 0.65 },
          ] : [
            { name: 'standard', relativePct: 0.85, visualWeight: 0.65 },
          ];

          let chosenTier = tiers[tiers.length - 1];
          for (const tier of tiers) {
            let pool = scoredProducts;
            if (tier.pastel) {
              pool = applyPastelContrast(pool, tier.pastel);
            } else {
              if (tier.styleMargin != null && hasStyleRerank) {
                pool = pool.filter(p => p.colorScore >= p.styleScore + tier.styleMargin);
              }
              if (tier.solidMargin != null && hasContrast) {
                pool = pool.filter(p => p.colorScore >= p.contrastScore + tier.solidMargin);
              }
              if (tier.whiteMargin != null) {
                pool = pool.filter(p => p.colorScore >= p.contrastScore + tier.whiteMargin);
              }
              if (tier.greyMargin != null && greyContrastVector.length) {
                pool = pool.filter(p => p.colorScore >= p.greyScore + tier.greyMargin);
              }
              if (tier.navyMargin != null && contrastColorVector.length) {
                pool = pool.filter(p => p.colorScore >= p.contrastScore + tier.navyMargin);
              }
              if (tier.brownMargin != null && beigeContrastVector.length) {
                pool = pool.filter(p => p.colorScore >= p.beigeScore + tier.brownMargin);
              }
            }
            pool = applyRelativeThreshold(pool, tier.relativePct);
            if (pool.length >= MIN_RESULTS) {
              products = pool;
              chosenTier = tier;
              break;
            }
            // Last tier must always win — use whatever we have
            if (tier === tiers[tiers.length - 1]) {
              products = pool.length > 0
                ? pool
                : [...scoredProducts].sort((a, b) => b.colorScore - a.colorScore).slice(0, MIN_RESULTS);
              chosenTier = tier;
            }
          }

          if (chosenTier.name !== tiers[0].name) {
            console.log(`?? Item ${index}: relaxed colour filter to "${chosenTier.name}" (${products.length} products)`);
          }

          const visualWeight = chosenTier.visualWeight;
          const colorWeight = 1 - visualWeight;
          products = products
            .map(p => ({
              ...p,
              blendedScore: visualWeight * p.searchScore
                + colorWeight * (p.colorScore * 3)
                - (hasStyleRerank ? (p.styleScore || 0) * 1.2 : 0)
            }))
            .sort((a, b) => b.blendedScore - a.blendedScore);
          console.log(`?? Item ${index}: blended visual+color scoring applied (${products.length} products, tier=${chosenTier.name})`);
        }

        if (products.length === 0 && vectorCandidates.length > 0) {
          console.warn(`?? Item ${index}: colour pipeline returned 0 — falling back to vector order`);
          products = vectorCandidates.slice(0, 10);
        }
      }

      // -- Personalization & Dynamic Weighting -----------------------------
      if (userProfile) {
        const favoriteStores = userProfile.topStores ? userProfile.topStores.map(s => s.toLowerCase()) : [];
        const storeScores = userProfile.storeScores || new Map();

        products = products.map(product => {
          const baseScore = product.blendedScore ?? product.searchScore ?? 0;
          const pStore = (product.storeName || '').toLowerCase();

          const activeScore = storeScores.get(pStore) || 0;
          let boost = 0;
          if (activeScore > 0) {
            boost = Math.min(activeScore * 0.01, 0.12);
          } else if (activeScore < 0) {
            boost = Math.max(activeScore * 0.02, -0.15);
          } else if (favoriteStores.includes(pStore)) {
            boost = 0.05;
          }

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

      // Shoe style queries: rank matching sub-type above birkenstocks/heels/etc.
      if (hasStyleRerank && products.some(p => p.colorScore != null)) {
        const stylePriority = (p) => (p.colorScore || 0) - (p.styleScore || 0);
        products.sort((a, b) => {
          const byStyle = stylePriority(b) - stylePriority(a);
          if (Math.abs(byStyle) > 0.001) return byStyle;
          const byColor = (b.colorScore || 0) - (a.colorScore || 0);
          if (Math.abs(byColor) > 0.001) return byColor;
          return (b.finalScore || 0) - (a.finalScore || 0);
        });
        const styleLabel = mlCategory === 'belt' ? 'belt' : bottomLength ? 'bottom length' : topStyle ? 'top style' : 'shoe style';
        const styleIcon = mlCategory === 'belt' ? '??' : bottomLength ? '??' : topStyle ? '??' : '??';
        const styleDetail = mlCategory === 'belt' ? 'belt' : (shoeStyle || topStyle || bottomLength);
        console.log(`${styleIcon} Item ${index}: ${styleLabel}-priority reorder applied (${styleDetail})`);
      } else if (isPattern && products.some(p => p.colorScore != null)) {
        const patternPriority = (p) => (p.colorScore || 0) - (p.contrastScore || 0);
        products.sort((a, b) => {
          const byPattern = patternPriority(b) - patternPriority(a);
          if (Math.abs(byPattern) > 0.001) return byPattern;
          return (b.finalScore || 0) - (a.finalScore || 0);
        });
        console.log(`?? Item ${index}: pattern-priority reorder applied`);
      } else if (PASTEL_COLORS.has(detectedColor) && products.some(p => p.colorScore != null)) {
        const colorPriority = (p) => p.colorScore - Math.max(
          p.contrastScore || 0,
          p.greyScore || 0,
          p.beigeScore || 0,
          p.blueScore || 0
        );
        products.sort((a, b) => {
          const byPriority = colorPriority(b) - colorPriority(a);
          if (Math.abs(byPriority) > 0.001) return byPriority;
          const byColor = (b.colorScore || 0) - (a.colorScore || 0);
          if (Math.abs(byColor) > 0.001) return byColor;
          return (b.finalScore || 0) - (a.finalScore || 0);
        });
        console.log(`?? Item ${index}: pastel color-priority reorder applied`);
      }

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
