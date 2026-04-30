const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, 
    name: { type: String, required: true },          
    country: { type: String, default: "IL" },
    baseUrl: { type: String, required: true },      
    womenCategoryUrls: [{ type: String }],                
    isActive: { type: Boolean, default: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Store", storeSchema);