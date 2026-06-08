const mongoose = require('mongoose');

const userEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventType: { type: String, enum: ['click', 'save', 'like'], required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  metadata: {
    price: { type: Number },
    store: { type: String },
    color: { type: String }
  }
}, { timestamps: true });

module.exports = mongoose.model('UserEvent', userEventSchema);