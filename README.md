# FIND MY LOOK - Backend API

Welcome to the backend repository for **FIND MY LOOK**. 
Built with Node.js and Express, this server acts as the central brain of the application. It orchestrates communication between the React frontend, the MongoDB database, and the Python-based Machine Learning service.

## Note for the Evaluator
To evaluate the full flow of the system, this server must run concurrently with the **Frontend** and the **ML Service**. 
This backend utilizes **MongoDB Atlas Vector Search** for semantic image matching and incorporates a dynamic personalization engine based on user interactions.

## Prerequisites
* **Node.js** (v20+ recommended)
* **MongoDB Atlas** account (or local MongoDB with Vector Search capabilities)
* **Git**

## Installation & Setup

**1. Clone the Repository**
```bash
git clone [https://github.com/FindMyLook-Project/backend.git](https://github.com/FindMyLook-Project/backend.git)
cd backend

2. Install Dependencies 
npm install

3. Environment Variables
Create a .env file in the root directory. You will need to provide the following keys:
PORT=3000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
ML_SERVICE_URL=http://localhost:8000
VALIDATE_PRODUCTS=true

4. Run the Server
npm run dev

----------------------------------------------------------
Key Architectural Components
- Semantic Vector Search: Integrates with MongoDB to query imageEmbedding arrays using vector dot-product comparisons.

- Personalization & Scoring Algorithm (profileRoutes.js & garmentSearch.js): A dynamic, dual-layer recommendation engine.

- Learning Phase: It continuously tracks user interactions (clicks, saves, likes/dislikes) to calculate an average mathematical "style vector", identify top stores, and define a custom price comfort zone.

- Re-Ranking Phase: During a search, the algorithm calculates a blendedScore (combining visual similarity and color matching) and applies a personalizationBoost. This boost dynamically re-ranks the final products based on the user's explicit feedback and implicit store affinities, ensuring highly tailored fashion matches.

- Color Taxonomy (colorTaxonomy.js): A strict compatibility matrix preventing visually clashing colors in search results.

- Concurrency Validation (validateProducts.js): Employs a custom queue system with Axios HEAD requests to ensure product URLs are active before returning them to the client.

----------------------------------------------------------
Data Ingestion & Scraping Strategy

- To maintain a clean separation of concerns and ensure high performance, this backend acts solely as a data consumer.

- External Scraping: Product data is ingested using external Python-based scraping scripts executed in Google Colab (utilizing Playwright/Selenium for dynamic websites).

- Direct Insertion: Scraped products are normalized to match the MongoDB schema and inserted directly into the database via pymongo.

- Rationale: This architecture allows for faster iteration when dealing with anti-scraping mechanisms, better integration with data preprocessing workflows, and keeps the Node.js application logic decoupled from raw data collection.

