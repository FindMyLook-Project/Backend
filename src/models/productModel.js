const mongoose = require("mongoose");
const { STORE_KEYS } = require("./storeModel");

const CATEGORY_GROUPS = ["top","tops", "bottom", "shoes", "other"];
const GENDERS = ["women"]; 

const productSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    storeName: { type: String, required: true, enum: STORE_KEYS }, // גם string של החנות

    externalId: { type: String, default: null },    // SKU/ID אם קיים באתר
    productUrl: { type: String, required: true, unique: true },

    title: { type: String, required: true },
    brand: { type: String, default: "" },
    gender: { type: String, enum: GENDERS, default: "women" },

    categoryGroup: { type: String, enum: CATEGORY_GROUPS, required: true },
    categoryFine: { type: String, default: "" },    // אופציונלי: tshirt, jeans וכו'

    price: { type: Number, required: true },
    currency: { type: String, default: "ILS" },
    originalPrice: { type: Number, default: null }, // אם יש מחיר לפני הנחה

    images: {
      type: [{ url: String, isPrimary: Boolean }],
      default: [],
    },

    colors: [{ type: String, default: [] }],
    sizes: [{ type: String, default: [] }],

    isAvailable: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now },

    imageEmbedding: {
      type: [Number],
      default: [],
    },
    embeddingModel: { type: String, default: "clip" },
    embeddingVersion: { type: String, default: "v1" },

    source: { type: String, default: "scraper_v1" },
  },
  { timestamps: true }
);

productSchema.index({ storeName: 1, categoryGroup: 1 });
productSchema.index({ lastSeenAt: -1 });
productSchema.index({ price: 1 });

module.exports = mongoose.model("Product", productSchema);
module.exports.CATEGORY_GROUPS = CATEGORY_GROUPS;
