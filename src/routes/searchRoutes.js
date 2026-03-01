const express = require('express');
const router = express.Router();
const Product = require('../models/productModel');
const axios = require('axios'); 

router.post('/visual-search', async (req, res) => {
  try {
    const { image, crops, filters } = req.body;

    if (!image || !crops || crops.length === 0) {
      return res.status(400).json({ error: "Image and at least one crop are required" });
    }

    const resultsPerCrop = await Promise.all(crops.map(async (crop, index) => {
      
      // שלב 1: שליחה לשרת הפייתון לקבלת Embedding אמיתי עבור החיתוך
      // נניח ששרת הפייתון שלך רץ ומוכן לקבל את ה-Crop
      let embedding = [];
      try {
        const mlResponse = await axios.post(process.env.ML_URL || "http://localhost:8000/process-look", { 
          image: image, 
          crop: crop 
        });
        embedding = mlResponse.data.items[0].embedding;
      } catch (mlErr) {
        console.error("ML Service Error:", mlErr.message);
        // אם ה-ML נכשל, נחזיר מערך ריק לחיתוך הזה
        return { cropIndex: index, results: [] };
      }

      // שלב 2: חיפוש וקטורי ב-MongoDB Atlas
      const results = await Product.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "imageEmbedding",
            queryVector: embedding,
            numCandidates: 100, // MongoDB בודק 100 מועמדים קרובים
            // limit: 10 // ומחזיר את ה-10 הכי קרובים

          }
        },
        {
          $addFields: {
      // הוספת הציון ש-MongoDB נתן לכל תוצאה
         searchScore: { $meta: "vectorSearchScore" } 
        }
      },
      {
    // כאן את מגדירה את ה-Threshold!
       $match: {
        searchScore: { $gte: 0.6 } // רק תוצאות עם דמיון של 70% ומעלה
        }
      }
    ]);

      return {
        cropIndex: index,
        originalCrop: crop,
        results: products
      };
    }));

    res.status(200).json({
      success: true,
      data: resultsPerCrop
    });

  } catch (error) {
    console.error("Search Route Error:", error);
    res.status(500).json({ error: "Server error during visual search" });
  }
});

module.exports = router;