const axios = require("axios");

const DEFAULT_TIMEOUT_MS = 2500;

async function isProductUrlValid(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const response = await axios.head(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    return response.status >= 200 && response.status < 400;
  } catch (err) {
    return false;
  }
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
