const express = require('express');
const router = express.Router();
const Product = require('../models/productModel');
// אופציונלי: axios לצורך פנייה לשרת ה-Python
// const axios = require('axios'); 

router.post('/visual-search', async (req, res) => {
  try {
    const { image, crops, filters } = req.body;

    if (!image || !crops || crops.length === 0) {
      return res.status(400).json({ error: "Image and at least one crop are required" });
    }

    // שלב 1: שליחה ל-ML Service (Python) כדי לקבל Embeddings לכל חיתוך
    // בינתיים אנחנו מדמים את התשובה (Mock) לצורך ה-POC
    const resultsPerCrop = await Promise.all(crops.map(async (crop, index) => {
      
      // כאן בעתיד תבוא הקריאה לשרת ה-Python:
      // const mlResponse = await axios.post(process.env.ML_URL, { image, crop });
      // const embedding = mlResponse.data.embedding;

      // שלב 2: חיפוש וקטורי ב-MongoDB (באמצעות Vector Search) או FAISS
      // כרגע נשלוף מוצרים רלוונטיים לפי המסננים שהמשתמש בחר (Price, Store)
      const query = {
        price: { $lte: filters.priceRange || 2000 },
        isAvailable: true
      };

      if (filters.preferredStores && filters.preferredStores.length > 0) {
        query.storeName = { $in: filters.preferredStores.map(s => s.toLowerCase()) };
      }

      // שליפת מוצרים (בינתיים לפי פילטרים בלבד, ללא וקטורים עדיין)
      const products = await Product.find(query).limit(5).populate('storeId');

      return {
        cropIndex: index,
        originalCrop: crop, // הקואורדינטות של החיתוך
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