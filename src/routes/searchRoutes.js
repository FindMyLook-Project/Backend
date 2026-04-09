const express = require('express');
const router = express.Router();
const Product = require('../models/productModel');
const axios = require('axios'); 
const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

const CATEGORY_MAP = {
  top: [
    'tops', 'blouses', 'bodysuits', 'coats', 'jackets', 
    'knitwear', 'outerwear', 'sweatshirts', 'dresses', 
    'dresses_and_overalls', 'dresses_and_skirts', 
    'suits', 'basics', 'casual', 'activewear'
  ],
  bottom: [
    'bottoms', 'jeans', 'trousers', 'shorts', 'skirts', 
    'dresses_and_skirts', 'overalls', 'suits', 
    'basics', 'casual', 'activewear'
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
      const userSelectedCategory = itemData.category; 
      const allowedCategories = CATEGORY_MAP[userSelectedCategory] || [];

      try {
        const mlResponse = await axios.post(process.env.ML_URL || `${ML_URL}/process-look-base64`, { 
          image: itemData.image 
        });
        embedding = mlResponse.data.items[0].embedding;
      } catch (mlErr) {
        console.error(`ML Service Error on item ${index}:`, mlErr.message);
        return { itemIndex: index, results: [] };
      }

      const products = await Product.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "imageEmbedding",
            queryVector: embedding,
            numCandidates: 200,
            limit: 10,
            filter: {
              categoryGroup: { $in: allowedCategories } 
            }
          }
        },
        {
          $addFields: {
            searchScore: { $meta: "vectorSearchScore" } 
          }
        },
        {
          $match: {
            searchScore: { $gte: 0.8 }, // רף גבוה לתוצאות מדויקות בלבד
            price: { $lte: Number(filters?.priceRange) || 2000 }
          }
        }
      ]);

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

module.exports = router;