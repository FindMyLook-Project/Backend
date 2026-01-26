# Data Ingestion & Scraping Strategy

## Overview
Product data is ingested into the system using external Python-based scraping scripts
executed in Google Colab, rather than directly from the Node.js backend.

## Rationale
The decision to perform scraping in Python was made due to:
- Easier handling of dynamic websites (Playwright / Selenium)
- Faster iteration and debugging in Google Colab
- Better integration with data preprocessing workflows
- Cleaner separation between data ingestion and application logic

## Architecture
- MongoDB Atlas serves as the central database
- Python (Google Colab) connects directly to MongoDB Atlas using `pymongo`
- The Node.js backend only **consumes** data from the database and never scrapes websites

## Data Flow
1. Python script scrapes product data from fashion retailers (e.g., ZARA, CASTRO)
2. Scraped products are normalized to match the Product schema
3. Products are inserted directly into MongoDB Atlas
4. Backend APIs query MongoDB for search, similarity matching, and embeddings

## Security Notes
- MongoDB credentials are stored securely and are not committed to the repository
- Scraping notebooks are not public and are executed locally in private environments

## Future Work
- Automate scheduled scraping via cloud jobs
- Add validation layer before inserting products into the database
