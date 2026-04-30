const express = require('express');
const router = express.Router();
const Product = require('../models/productModel');
const Store = require('../models/storeModel'); 
const axios = require('axios'); 
const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

const CATEGORY_MAP = {
  top: [
    'tops', 'blouses', 'bodysuits', 'coats', 'jackets', 
    'knitwear', 'outerwear', 'sweatshirts', 'basics', 'casual', 'activewear'
  ],
  bottom: [
    'bottoms', 'jeans', 'trousers', 'shorts', 'overalls', 'suits', 
    'basics', 'casual', 'activewear'
  ],
  skirt: [
    'skirts', 'dresses_and_skirts'
  ],
  dress: [
    'dresses', 'dresses_and_overalls', 'dresses_and_skirts'
  ],
  shoes: [
    'shoes', 'shoes_general', 'sneakers', 'boots', 
    'ankle_boots', 'flats', 'heels', 'leather_shoes'
  ]
};

router.post('/visual-search', async (req, res) => {
  try {
    const { items, filters } = req.body; 

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    const resultsPerItem = await Promise.all(items.map(async (itemData, index) => {
      
      let embedding = [];
      let detectedColor = ""; 
      const userSelectedCategory = itemData.category; 
      const allowedCategories = CATEGORY_MAP[userSelectedCategory] || [];

      try {
        const mlResponse = await axios.post(process.env.ML_URL || `${ML_URL}/process-look-base64`, { 
          image: itemData.image 
        });
        embedding = mlResponse.data.items[0].embedding;
        detectedColor = mlResponse.data.items[0].color; 
      } catch (mlErr) {
        console.error(`ML Service Error on item ${index}:`, mlErr.message);
        return { itemIndex: index, results: [] };
      }


      let products = await Product.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "imageEmbedding",
            queryVector: embedding,
            numCandidates: 200,
            limit: 10,
            filter: { categoryGroup: { $in: allowedCategories } }
          }
        },
        { $addFields: { searchScore: { $meta: "vectorSearchScore" } } },
        {
          $match: {
            searchScore: { $gte: 0.85 }, 
            price: { $lte: Number(filters?.priceRange) || 2000 },
            ...(detectedColor && detectedColor !== "other" ? { colors: { $in: [detectedColor] } } : {}),
            
            ...(filters?.preferredStores && filters.preferredStores.length > 0 
                ? { storeName: { $in: filters.preferredStores } } 
                : {})
          }
        }
      ]);

      if (products.length === 0) {
        console.log(`⚠️ No exact match for item ${index}. Falling back...`);
        
        products = await Product.aggregate([
          {
            $vectorSearch: {
              index: "vector_index",
              path: "imageEmbedding",
              queryVector: embedding,
              numCandidates: 200,
              limit: 10,
              filter: { categoryGroup: { $in: allowedCategories } }
            }
          },
          { $addFields: { searchScore: { $meta: "vectorSearchScore" } } },
          {
            $match: {
              searchScore: { $gte: 0.82 }, 
              price: { $lte: Number(filters?.priceRange) || 2000 },
              ...(filters?.preferredStores && filters.preferredStores.length > 0 
                ? { storeName: { $in: filters.preferredStores } } 
                : {})
            }
          }
        ]);
      }

      return {
        itemIndex: index,
        results: products
      };
    }));

    res.status(200).json({
      success: true,
      data: resultsPerItem
    });

  } catch (error) {
    console.error("Search Route Error:", error);
    res.status(500).json({ error: "Server error during visual search" });
  }
});


router.get('/stores', async (req, res) => {
  try {
    const storesData = await Store.find({ isActive: true }, 'name key');
    
    const sortedStores = storesData
      .map(storeDoc => ({ key: storeDoc.key, name: storeDoc.name }))
      .filter(store => store.name && store.name.trim() !== '')
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    res.status(200).json({
      success: true,
      data: sortedStores
    });
  } catch (error) {
    console.error("Error fetching stores:", error);
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

    res.json({ 
      success: true, 
      message: "Database updated successfully (direct collection access)!",
      modifiedCount: updateResult.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;