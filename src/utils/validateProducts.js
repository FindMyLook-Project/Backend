const axios = require("axios");

const DEFAULT_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 7 * 60 * 1000; // 7 minutes

// Some stores' WAF/CDN slow-paths requests carrying axios's default
// User-Agent, pushing otherwise-fast responses past DEFAULT_TIMEOUT_MS and
// causing false "invalid" results. A standard browser User-Agent avoids this.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const cache = new Map(); // url -> { valid, expiresAt }

// Caps total concurrent HEAD checks across the whole process, not just
// within one filterValidProducts() call. /total-look validates multiple
// slots in parallel (via Promise.all in searchRoutes.js), so without a
// process-wide limit the per-slot concurrency stacks up (e.g. 8 + 11 = 19
// simultaneous requests), which was pushing otherwise-fast, healthy URLs
// past the timeout and causing false "invalid" results under load.
const MAX_CONCURRENT_CHECKS = 8;
let activeChecks = 0;
const waitQueue = [];

function acquireSlot() {
  if (activeChecks < MAX_CONCURRENT_CHECKS) {
    activeChecks++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitQueue.push(resolve));
}

function releaseSlot() {
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    activeChecks--;
  }
}

async function isProductUrlValid(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.valid;
  }

  await acquireSlot();
  let valid;
  try {
    const response = await axios.head(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { "User-Agent": USER_AGENT },
    });
    valid = response.status >= 200 && response.status < 400;
  } catch (err) {
    valid = false;
  } finally {
    releaseSlot();
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
