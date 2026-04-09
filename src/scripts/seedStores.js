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
    { key: "terminalx", name: "TERMINAL X", baseUrl: "https://www.terminalx.com", notes: "Online Only" },
    { key: "blueberry", name: "BLUEBERRY", baseUrl: "https://www.blueberry-israel.co.il", notes: "Online Only" },
    { key: "missnori", name: "MISS NORI", baseUrl: "https://www.missnori.com", notes: "Online Only" },
    { key: "story", name: "STORY ONLINE", baseUrl: "https://www.storyonline.co.il" },
    { key: "addict", name: "ADDICT", baseUrl: "https://www.addict.co.il" },
    { key: "de_rococo", name: "DE ROCOCO", baseUrl: "https://www.derococo.com" },
    { key: "brenda", name: "BRENDA", baseUrl: "https://www.brendastudio.com" },
    { key: "studiopasha", name: "STUDIO PASHA", baseUrl: "https://www.studiopasha.co.il" },
    { key: "fashionclub", name: "FASHION CLUB", baseUrl: "https://www.fashionclub.co.il" },
    { key: "fox", name: "FOX", baseUrl: "https://www.fox.co.il" },
    { key: "ata", name: "ATA", baseUrl: "https://www.atawear.co.il" },
    { key: "golf", name: "GOLF", baseUrl: "https://www.golf-il.co.il" }
  ];

  try {
    await Store.deleteMany({});        
    await Store.insertMany(stores);
    console.log(`✅ Seeded ${stores.length} stores successfully!`);
  } catch (err) {
    console.error("❌ Error seeding stores:", err.message);
  } finally {
    process.exit(0);
  }
}

seedStores();
