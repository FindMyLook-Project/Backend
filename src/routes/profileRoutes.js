const express = require('express');
const router = express.Router();
const UserEvent = require('../models/userEventModel');
const UserStyleProfile = require('../models/userStyleProfileModel');
const Product = require('../models/productModel'); 


router.post('/track', async (req, res) => {
  try {
    const { userId, eventType, productId, metadata } = req.body;

    const newEvent = new UserEvent({ userId, eventType, productId, metadata });
    await newEvent.save();

    const recentEvents = await UserEvent.find({ userId })
                                        .sort({ createdAt: -1 })
                                        .limit(50);

    const storeCounts = {};
    let totalPrice = 0;
    const productIds = [];

    recentEvents.forEach(ev => {
      if (ev.metadata && ev.metadata.store) {
        storeCounts[ev.metadata.store] = (storeCounts[ev.metadata.store] || 0) + 1;
      }
      if (ev.metadata && ev.metadata.price) {
        totalPrice += ev.metadata.price;
      }
      productIds.push(ev.productId);
    });

    const topStores = Object.keys(storeCounts)
      .sort((a, b) => storeCounts[b] - storeCounts[a])
      .slice(0, 3);

    const avgPrice = recentEvents.length > 0 ? (totalPrice / recentEvents.length) : 0;
    const minPrice = Math.max(0, avgPrice * 0.7);
    const maxPrice = avgPrice * 1.3;

    const products = await Product.find({ _id: { $in: productIds } }, 'imageEmbedding');
    let styleVector = [];
    
    if (products.length > 0 && products[0].imageEmbedding.length > 0) {
      const vectorLength = products[0].imageEmbedding.length;
      const sumVector = new Array(vectorLength).fill(0);
      
      products.forEach(p => {
        if (p.imageEmbedding && p.imageEmbedding.length === vectorLength) {
          for (let i = 0; i < vectorLength; i++) {
            sumVector[i] += p.imageEmbedding[i];
          }
        }
      });
      
      styleVector = sumVector.map(val => val / products.length);
    }

    const updatedProfile = await UserStyleProfile.findOneAndUpdate(
      { userId },
      { 
        topStores,
        preferredPriceRange: { min: minPrice, max: maxPrice },
        styleVector,
        lastUpdated: Date.now()
      },
      { new: true, upsert: true } 
    );

    res.status(200).json({ success: true, message: "Event tracked & Profile updated" });
  } catch (error) {
    console.error("Error updating personalization:", error);
    res.status(500).json({ error: "Server error tracking event" });
  }
});


router.get('/debug/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await UserStyleProfile.findOne({ userId });
    const totalClicks = await UserEvent.countDocuments({ userId, eventType: 'click' });
    
    const recentClicks = await UserEvent.find({ userId })
                                        .sort({ createdAt: -1 })
                                        .limit(5)
                                        .populate('productId', 'title storeName price');

    if (!profile) {
      return res.status(404).json({ message: "No profile found yet for this user. Click some items first!" });
    }

    res.status(200).json({
      status: "ACTIVE",
      totalInteractions: totalClicks,
      insights: {
        favoriteStores: profile.topStores,
        priceComfortZone: `${Math.round(profile.preferredPriceRange.min)}₪ - ${Math.round(profile.preferredPriceRange.max)}₪`,
        hasStyleVector: profile.styleVector.length > 0 ? "Yes (Learned user style)" : "No"
      },
      recentActivity: recentClicks.map(click => ({
        action: click.eventType,
        item: click.productId?.title || "Unknown",
        price: click.metadata?.price,
        store: click.metadata?.store,
        time: click.createdAt
      }))
    });

  } catch (error) {
    res.status(500).json({ error: "Error fetching debug info" });
  }
});

module.exports = router;