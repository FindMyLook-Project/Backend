const mongoose = require('mongoose');

const userStyleProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  topStores: { type: [String], default: [] },
  preferredPriceRange: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 2000 }
  },
  storeScores: {
    type: Map,
    of: Number,
    default: {}
  },
  styleVector: { type: [Number], default: [] }, 
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserStyleProfile', userStyleProfileSchema);