const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/random', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const db = mongoose.connection.db;
    const products = await db
      .collection('products')
      .aggregate([
        { $match: { 'images.0': { $exists: true }, isAvailable: true } },
        { $sample: { size: limit } },
        { $project: { _id: 1, images: 1 } },
      ])
      .toArray();
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('[/api/products/random] error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch random products' });
  }
});

module.exports = router;
