const express = require('express');
const router = express.Router();
const Product = require('../models/productModel');
const axios = require('axios'); 
const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

router.post('/visual-search', async (req, res) => {
  try {
    const { images, filters } = req.body; 

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "At least one cropped image is required" });
    }

    const resultsPerItem = await Promise.all(images.map(async (base64Image, index) => {
      
      let embedding = [];
      try {
        const mlResponse = await axios.post(process.env.ML_URL || `${ML_URL}/process-look`, { 
          image: base64Image 
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
              categoryGroup: { $eq: labelFromYolo } 
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
            searchScore: { $gte: 0.7 }, // Threshold 
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