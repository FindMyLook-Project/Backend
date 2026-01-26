require("dotenv").config();
const connectDB = require("../config/db");
const Store = require("../models/storeModel");

async function seedStores() {
  await connectDB();

  const stores = [
    {
      key: "castro",
      name: "CASTRO",
      baseUrl: "https://www.castro.com",
    },
    {
      key: "zara",
      name: "ZARA",
      baseUrl: "https://www.zara.com",
    },
    {
      key: "renuar",
      name: "RENUAR",
      baseUrl: "https://www.renuar.co.il",
    },
    {
      key: "twentyfourseven",
      name: "TWENTYFOURSEVEN",
      baseUrl: "https://www.twentyfourseven.co.il",
    },
    {
      key: "tamnoon",
      name: "תמנון",
      baseUrl: "https://www.tamnoon.co.il",
    },
    {
      key: "hoodies",
      name: "HOODIES",
      baseUrl: "https://www.hoodies.co.il",
    },
    {
      key: "bershka",
      name: "BERSHKA",
      baseUrl: "https://www.bershka.com",
    },
    {
      key: "pullandbear",
      name: "PULL&BEAR",
      baseUrl: "https://www.pullandbear.com",
    },
  ];

  try {
    await Store.deleteMany({});        
    await Store.insertMany(stores);
    console.log("✅ Seeded 8 stores");
  } catch (err) {
    console.error("❌ Error seeding stores:", err.message);
  } finally {
    process.exit(0);
  }
}

seedStores();
