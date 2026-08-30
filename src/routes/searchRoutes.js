const express = require('express');
const router = express.Router();
const Store = require('../models/storeModel');
const UserStyleProfile = require('../models/userStyleProfileModel');
const axios = require('axios');
const { searchProductsFromMlItem } = require('../services/garmentSearch');

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
const ML_PROCESS_LOOK_ENDPOINT =
  process.env.ML_URL ||
  (ML_SERVICE_URL.endsWith('/process-look-base64')
    ? ML_SERVICE_URL
    : `${ML_SERVICE_URL}/process-look-base64`);
const ML_TOTAL_LOOK_ENDPOINT = `${ML_SERVICE_URL}/process-total-look-base64`;

const SLOT_META = {
  dress:  { label: 'Dress',  labelHe: 'שמלה' },
  top:    { label: 'Top',    labelHe: 'חולצה / טופ' },
  bottom: { label: 'Bottom', labelHe: 'מכנסיים' },
  shorts: { label: 'Shorts', labelHe: 'שורטס' },
  skirt:  { label: 'Skirt',  labelHe: 'חצאית' },
  shoes:  { label: 'Shoes',  labelHe: 'נעליים' },
  belt:   { label: 'Belt',   labelHe: 'חגורה' },
};

router.post('/visual-search', async (req, res) => {
  try {
    const { items, filters, userId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    let userProfile = null;
    if (userId) {
      userProfile = await UserStyleProfile.findOne({ userId });
    }

    const resultsPerItem = await Promise.all(items.map(async (itemData, index) => {
      try {
        const mlResponse = await axios.post(ML_PROCESS_LOOK_ENDPOINT, {
          image: itemData.image,
        });

        const mlItems = mlResponse?.data?.items;
        if (!Array.isArray(mlItems) || mlItems.length === 0 || !mlItems[0]?.embedding) {
          console.warn(`Item ${index}: ML returned no usable items`);
          return { itemIndex: index, results: [] };
        }

        const mlItem = mlItems[0];

        const results = await searchProductsFromMlItem(
          mlItem,
          filters,
          userProfile,
          `[Item ${index}]`
        );

        return {
          itemIndex: index,
          detected: {
            categoryGroup: mlItem.categoryGroup || null,
            category: mlItem.category || null,
            color: mlItem.color || null,
            fabricGroup: mlItem.fabricGroup || null,
            confidence: mlItem.confidence || null,
            shoeStyle: mlItem.shoeStyle || null,
            topStyle: mlItem.topStyle || null,
            isStripe: mlItem.isStripe || false,
            bottomLength: mlItem.bottomLength || null,
          },
          results,
        };
      } catch (mlErr) {
        console.error(`ML Service Error on item ${index}:`, mlErr.message);
        return { itemIndex: index, results: [] };
      }
    }));

    res.status(200).json({
      success: true,
      isPersonalized: !!userProfile,
      appliedStores: userProfile ? userProfile.topStores : [],
      data: resultsPerItem,
    });
  } catch (error) {
    console.error('Search Route Error:', error);
    res.status(500).json({ error: 'Server error during visual search' });
  }
});

router.post('/total-look', async (req, res) => {
  try {
    const { image, filters, userId } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    let userProfile = null;
    if (userId) {
      userProfile = await UserStyleProfile.findOne({ userId });
    }

    const mlResponse = await axios.post(
      ML_TOTAL_LOOK_ENDPOINT,
      { image },
      { timeout: 180000 }
    );

    const mlItems = mlResponse?.data?.items || [];
    const detectionMeta = mlResponse?.data?.detectionMeta || {};

    if (!mlItems.length) {
      return res.status(200).json({
        success: true,
        mode: 'totalLook',
        isPersonalized: !!userProfile,
        appliedStores: userProfile ? userProfile.topStores : [],
        look: {
          summary: { garmentCount: 0, totalMatches: 0, detectionMeta },
          slots: [],
        },
      });
    }

    const slots = await Promise.all(mlItems.map(async (mlItem) => {
      const slotId = mlItem.slotId || mlItem.categoryGroup || 'item';
      const meta = SLOT_META[slotId] || { label: slotId, labelHe: slotId };
      const results = await searchProductsFromMlItem(
        mlItem,
        filters,
        userProfile,
        `[TotalLook/${slotId}]`
      );

      return {
        slotId,
        label: meta.label,
        labelHe: meta.labelHe,
        detected: {
          categoryGroup: mlItem.categoryGroup,
          color: mlItem.color,
          fabricGroup: mlItem.fabricGroup,
          confidence: mlItem.confidence,
          shoeStyle: mlItem.shoeStyle || null,
          topStyle: mlItem.topStyle || null,
          isStripe: mlItem.isStripe || false,
          bottomLength: mlItem.bottomLength || null,
          skirtLength: mlItem.skirtLength || null,
          bbox: mlItem.bbox || null,
          cropImage: mlItem.cropBase64 || null,
          detectionSource: mlItem.detectionSource || null,
        },
        matchCount: results.length,
        results,
      };
    }));

    const totalMatches = slots.reduce((sum, s) => sum + s.matchCount, 0);

    res.status(200).json({
      success: true,
      mode: 'totalLook',
      isPersonalized: !!userProfile,
      appliedStores: userProfile ? userProfile.topStores : [],
      look: {
        summary: {
          garmentCount: slots.length,
          totalMatches,
          detectionMeta,
        },
        slots,
      },
    });
  } catch (error) {
    console.error('Total Look Search Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'ML service is not running' });
    }
    res.status(500).json({ error: 'Server error during total look search' });
  }
});

router.get('/random', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const Product = require('../models/productModel');
    const products = await Product.aggregate([{ $sample: { size: limit } }]);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching random products:', error);
    res.status(500).json({ error: 'Failed to fetch random products' });
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
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
});

router.get('/fix-db', async (req, res) => {
  try {
    const collection = Store.collection;
    const updateResult = await collection.updateMany(
      { domain: { $exists: true } },
      { $rename: { domain: 'baseUrl' } }
    );
    res.json({ success: true, message: 'Database updated successfully', modifiedCount: updateResult.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
