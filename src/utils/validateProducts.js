const axios = require("axios");

const DEFAULT_TIMEOUT_MS = 1200;
const CACHE_TTL_MS = 7 * 60 * 1000; // 7 minutes

const cache = new Map(); // url -> { valid, expiresAt }

async function isProductUrlValid(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.valid;
  }

  let valid;
  try {
    const response = await axios.head(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    valid = response.status >= 200 && response.status < 400;
  } catch (err) {
    valid = false;
  }

  cache.set(url, { valid, expiresAt: Date.now() + CACHE_TTL_MS });
  return valid;
}

async function filterValidProducts(products, { limit = 20, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const checks = await Promise.allSettled(
    products.map(async (product) => ({
      product,
      valid: await isProductUrlValid(product.productUrl, timeoutMs),
    }))
  );

  const validProducts = checks
    .filter((result) => result.status === "fulfilled" && result.value.valid)
    .map((result) => result.value.product);

  return validProducts.slice(0, limit);
}

module.exports = { isProductUrlValid, filterValidProducts };
