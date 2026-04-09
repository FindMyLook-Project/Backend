const mongoose = require("mongoose");

const STORE_KEYS = [
  "castro",
  "zara",
  "renuar",
  "twentyfourseven",
  "tamnoon",
  "hoodies",
  "bershka",
  "pullandbear",
  "terminalx",
  "story",
  "addict",
  "de_rococo",
  "blueberry",
  "brenda",
  "studiopasha",
  "fashionclub",
  "missnori",
  "fox",
  "ata",
  "golf",
];

const storeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, enum: STORE_KEYS }, 
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
module.exports.STORE_KEYS = STORE_KEYS;
