const mongoose = require("mongoose");

const PURCHASE_METHODS = ["online", "in-store", "both"];

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName:  { type: String, required: true },
    email:     { type: String, required: true, unique: true },
    password:  { type: String, required: true },

    priceRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 1000 },
    },

    purchaseMethod: {
      type: String,
      enum: PURCHASE_METHODS,
      default: "both",
    },

    favoriteStores: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
module.exports.PURCHASE_METHODS = PURCHASE_METHODS;
