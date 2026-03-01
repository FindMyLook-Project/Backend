const mongoose = require("mongoose");
const { STORE_KEYS } = require("./storeModel");

// קבוצות קטגוריות כדי שנוכל לעשות חיפוש top/bottom/shoes
const CATEGORY_GROUPS = ["top","tops", "bottom", "shoes", "other"];
const GENDERS = ["women"]; // כרגע רק נשים

const productSchema = new mongoose.Schema(
  {
    // קשר לחנות
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    storeName: { type: String, required: true, enum: STORE_KEYS }, // גם string של החנות

    // זיהוי חיצוני
    externalId: { type: String, default: null },    // SKU/ID אם קיים באתר
    productUrl: { type: String, required: true, unique: true },

    // מידע בסיסי על המוצר
    title: { type: String, required: true },
    brand: { type: String, default: "" },
    gender: { type: String, enum: GENDERS, default: "women" },

    // קטגוריות
    categoryGroup: { type: String, enum: CATEGORY_GROUPS, required: true },
    categoryFine: { type: String, default: "" },    // אופציונלי: tshirt, jeans וכו'

    // מחיר
    price: { type: Number, required: true },
    currency: { type: String, default: "ILS" },
    originalPrice: { type: Number, default: null }, // אם יש מחיר לפני הנחה

    // תמונות
    images: {
      type: [{ url: String, isPrimary: Boolean }],
      default: [],
    },

    // וריאציות
    colors: [{ type: String, default: [] }],
    sizes: [{ type: String, default: [] }],

    // זמינות
    isAvailable: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now },

    // Embedding לתמונה (נמלא בהמשך כשנחבר מודל)
    imageEmbedding: {
      type: [Number],
      default: [],
    },
    embeddingModel: { type: String, default: "clip" },
    embeddingVersion: { type: String, default: "v1" },

    // מאיפה הגיע
    source: { type: String, default: "scraper_v1" },
  },
  { timestamps: true }
);

// אינדקסים קטנים לעתיד
productSchema.index({ storeName: 1, categoryGroup: 1 });
productSchema.index({ lastSeenAt: -1 });
productSchema.index({ price: 1 });

module.exports = mongoose.model("Product", productSchema);
module.exports.CATEGORY_GROUPS = CATEGORY_GROUPS;
