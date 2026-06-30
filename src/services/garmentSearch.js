const Product = require('../models/productModel');
const { isColorCompatible } = require('../constants/colorTaxonomy');

const CATEGORY_MAP = {
  top:    ['tops', 'blouses', 'bodysuits', 'coats', 'jackets', 'knitwear', 'outerwear', 'sweatshirts', 'basics', 'casual', 'activewear'],
  bottom: ['bottoms', 'jeans', 'trousers', 'overalls', 'suits', 'basics', 'casual', 'activewear'],
  shorts: ['shorts'],
  skirt:  ['skirts', 'dresses_and_skirts'],
  dress:  ['dresses', 'dresses_and_overalls', 'dresses_and_skirts'],
  shoes:  ['shoes', 'shoes_general', 'sneakers', 'boots', 'ankle_boots', 'flats', 'heels', 'leather_shoes'],
  belt:   ['accessories', 'other'],
};

const TOP_STYLE_CATEGORY_MAP = {
  tshirt:    ['top', 'tops'],
  tank:      ['top', 'tops'],
  strapless: ['top', 'tops'],
  halter:    ['top', 'tops'],
  coat:      ['jackets', 'coats', 'outerwear', 'tops'],
  vest:      ['tops', 'jackets', 'outerwear'],
  shirt:     ['tops', 'blouses', 'jackets', 'shirts', 'basics'],
};

const TOP_SEARCH_EXCLUDED_GROUPS = new Set(['bottom', 'shoes']);
const BOTTOM_TITLE_PATTERN = /\b(jeans?|pants|trousers|joggers|leggings|shorts|skirt|denim|מכנס|ג'?ינס|גינס)\b/i;
const TOP_TITLE_PATTERN = /\b(shirt|tshirt|t-shirt|tee|top|blouse|tank|camisole|חולצ|טי[\s-]?שירט|גופי)\b/i;
const COAT_TITLE_PATTERN = /\b(jacket|coat|outerwear|leather|bomber|blazer|מעיל|ז'?אקט|זאקט|בומר)\b/i;
const VEST_TITLE_PATTERN = /\b(vest|waistcoat|sleeveless|גופי|ואסט)\b/i;
const DENIM_TITLE_PATTERN = /\b(denim|jean|jeans|ג'?ינס|גינס)\b/i;
const MINI_SKIRT_PATTERN = /\b(mini|midi|maxi|skirt|חצאית|מיני|מידי|מקסי)\b/i;
const SHORTS_TITLE_PATTERN = /\b(shorts|short|שורט)\b/i;
const MAXI_MIDI_SKIRT_PATTERN = /\b(maxi|midi|מקסי|מידי|floor.?length)\b/i;
const BROWN_BELT_TITLE_PATTERN = /\b(brown|tan|cognac|camel|beige|חום|ג'?ינג'?י|בז')\b/i;
const BLACK_BELT_TITLE_PATTERN = /\b(black|שחור)\b/i;
const WHITE_TOP_STYLES = new Set(['tshirt', 'tank', 'halter', 'strapless']);

const SHOE_STYLE_CATEGORY_MAP = {
  slide_sandal:  ['shoes', 'shoes_general', 'flats'],
  puffy_slide:   ['shoes', 'shoes_general', 'flats'],
  birkenstock:   ['shoes', 'shoes_general', 'flats'],
  heeled_sandal: ['heels', 'shoes', 'shoes_general'],
  espadrille:    ['flats', 'shoes', 'shoes_general'],
  heeled_boot:   ['ankle_boots', 'boots', 'heels', 'leather_shoes', 'shoes'],
  flip_flop:     ['shoes', 'shoes_general', 'flats', 'heels'],
  flat_shoe:     ['flats', 'shoes', 'shoes_general'],
};

const LOOK_ALLOWED_CATEGORIES = [...new Set(Object.values(CATEGORY_MAP).flat())];
const PASTEL_COLORS = new Set(['lavender', 'purple', 'pink']);

const dotEmbedding = (emb, vec) => {
  if (!Array.isArray(emb) || !Array.isArray(vec) || emb.length === 0 || vec.length === 0) return 0;
  const len = Math.min(vec.length, emb.length);
  let score = 0;
  for (let i = 0; i < len; i++) score += vec[i] * emb[i];
  return score;
};

function resolveAllowedCategories(mlItem) {
  const mlCategory = mlItem.categoryGroup || '';
  const bottomLength = mlItem.bottomLength || '';
  const skirtLength = mlItem.skirtLength || '';
  const shoeStyle = mlItem.shoeStyle || '';
  const topStyle = mlItem.topStyle || '';

  if (bottomLength === 'shorts' && CATEGORY_MAP.shorts) {
    return CATEGORY_MAP.shorts;
  }
  if (topStyle && TOP_STYLE_CATEGORY_MAP[topStyle]) {
    return TOP_STYLE_CATEGORY_MAP[topStyle];
  }
  if (shoeStyle && SHOE_STYLE_CATEGORY_MAP[shoeStyle]) {
    return SHOE_STYLE_CATEGORY_MAP[shoeStyle];
  }
  if (mlCategory && CATEGORY_MAP[mlCategory]) {
    return CATEGORY_MAP[mlCategory];
  }
  return LOOK_ALLOWED_CATEGORIES;
}

function isLikelyTopProduct(product, mlCategory, topStyle) {
  if (mlCategory !== 'top') return true;
  if (TOP_SEARCH_EXCLUDED_GROUPS.has(product.categoryGroup)) return false;
  const title = product.title || '';
  if (BOTTOM_TITLE_PATTERN.test(title) && !TOP_TITLE_PATTERN.test(title)) return false;
  if (topStyle === 'coat') {
    if (TOP_TITLE_PATTERN.test(title) && !COAT_TITLE_PATTERN.test(title)) return false;
  }
  if (topStyle === 'shirt') {
    if (VEST_TITLE_PATTERN.test(title) && !TOP_TITLE_PATTERN.test(title)) return false;
    if (/\b(tank|camisole|גופייה)\b/i.test(title)) return false;
  }
  if (topStyle === 'vest') {
    if (DENIM_TITLE_PATTERN.test(title) && /\b(shirt|חולצ)\b/i.test(title) && !VEST_TITLE_PATTERN.test(title)) {
      return false;
    }
  }
  return true;
}

function isLikelyShortsProduct(product, mlCategory, bottomLength) {
  if (mlCategory !== 'bottom' || bottomLength !== 'shorts') return true;
  const title = product.title || '';
  if (MINI_SKIRT_PATTERN.test(title) && !SHORTS_TITLE_PATTERN.test(title)) return false;
  return true;
}

function isLikelySkirtProduct(product, mlCategory, skirtLength) {
  if (mlCategory !== 'skirt') return true;
  const title = product.title || '';
  if (skirtLength === 'mini') {
    return !MAXI_MIDI_SKIRT_PATTERN.test(title);
  }
  if (skirtLength === 'midi' || skirtLength === 'maxi') {
    if (MINI_SKIRT_PATTERN.test(title) && !MAXI_MIDI_SKIRT_PATTERN.test(title)) return false;
  }
  return true;
}

function isLikelyBeltProduct(product, mlCategory, detectedColor) {
  if (mlCategory !== 'belt') return true;
  const title = (product.title || '').toLowerCase();
  if (detectedColor === 'black' && BROWN_BELT_TITLE_PATTERN.test(title)) return false;
  return true;
}

async function searchProductsFromMlItem(mlItem, filters, userProfile, logLabel = '') {
  const embedding = mlItem.embedding || [];
  if (!embedding.length) return [];

  const detectedColor = mlItem.color || '';
  const colorVector = mlItem.colorVector || [];
  const contrastColorVector = mlItem.contrastColorVector || [];
  const greyContrastVector = mlItem.greyContrastVector || [];
  const beigeContrastVector = mlItem.beigeContrastVector || [];
  const blueContrastVector = mlItem.blueContrastVector || [];
  const brownContrastVector = mlItem.brownContrastVector || [];
  const styleContrastVector = mlItem.styleContrastVector || [];
  const shoeStyle = mlItem.shoeStyle || '';
  const topStyle = mlItem.topStyle || '';
  const isStripe = !!mlItem.isStripe;
  const bottomLength = mlItem.bottomLength || '';
  const skirtLength = mlItem.skirtLength || '';
  const mlCategory = mlItem.categoryGroup || '';
  const allowedCategories = resolveAllowedCategories(mlItem);

  const isPattern = detectedColor === 'pattern';
  const hasColorRerank = colorVector.length > 0 && detectedColor && detectedColor !== 'other';
  const hasStyleRerank = styleContrastVector.length > 0 && (!!shoeStyle || !!topStyle || !!bottomLength || !!skirtLength || mlCategory === 'belt');

  console.log(`${logLabel} mlCategory="${mlCategory || 'unknown'}", color="${detectedColor}", topStyle="${topStyle || 'none'}", isStripe=${isStripe}, shoeStyle="${shoeStyle || 'none'}", skirtLength="${skirtLength || 'none'}"`);

  const fetchFromMongo = async () => {
    const matchStage = {
      price: { $lte: Number(filters?.priceRange) || 2000 },
    };
    if (filters?.preferredStores?.length > 0) {
      matchStage.storeName = { $in: filters.preferredStores };
    }
    return Product.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'imageEmbedding',
          queryVector: embedding,
          numCandidates: 600,
          limit: 80,
          filter: { categoryGroup: { $in: allowedCategories } },
        },
      },
      { $addFields: { searchScore: { $meta: 'vectorSearchScore' } } },
      { $match: matchStage },
    ]);
  };

  let products = await fetchFromMongo();
  console.log(`${logLabel} vector search returned ${products.length} candidates`);

  if (mlCategory === 'top') {
    const before = products.length;
    products = products.filter(p => isLikelyTopProduct(p, mlCategory, topStyle));
    const removed = before - products.length;
    if (removed > 0) {
      console.log(`${logLabel} top slot filter removed ${removed} non-top products`);
    }
  }

  if (mlCategory === 'bottom' && bottomLength === 'shorts') {
    const before = products.length;
    products = products.filter(p => isLikelyShortsProduct(p, mlCategory, bottomLength));
    const removed = before - products.length;
    if (removed > 0) {
      console.log(`${logLabel} shorts slot filter removed ${removed} skirt products`);
    }
  }

  if (mlCategory === 'skirt') {
    const before = products.length;
    products = products.filter(p => isLikelySkirtProduct(p, mlCategory, skirtLength));
    const removed = before - products.length;
    if (removed > 0) {
      console.log(`${logLabel} skirt slot filter removed ${removed} maxi/midi products`);
    }
  }

  if (mlCategory === 'belt') {
    const before = products.length;
    products = products.filter(p => isLikelyBeltProduct(p, mlCategory, detectedColor));
    const removed = before - products.length;
    if (removed > 0) {
      console.log(`${logLabel} belt slot filter removed ${removed} wrong-color products`);
    }
  }

  if (detectedColor && detectedColor !== 'other' && !isPattern) {
    const before = products.length;
    products = products.filter(p => isColorCompatible(detectedColor, p.colors));
    const removed = before - products.length;
    if (removed > 0) {
      console.log(`${logLabel} color post-filter removed ${removed} products`);
    }
  }

  const MIN_COLOR_SCORE = 0.20;

  if (hasColorRerank && products.length > 0) {
    let anyEmbFound = false;
    const hasContrast = contrastColorVector.length > 0;
    const hasPastelContrast = greyContrastVector.length > 0;
    const vectorCandidates = [...products];

    products = products.map(p => {
      const emb = p.imageEmbedding;
      let colorScore = 0;
      let contrastScore = 0;
      let greyScore = 0;
      let beigeScore = 0;
      let blueScore = 0;
      let brownScore = 0;
      let styleScore = 0;
      if (Array.isArray(emb) && emb.length > 0) {
        anyEmbFound = true;
        colorScore = dotEmbedding(emb, colorVector);
        if (hasContrast) contrastScore = dotEmbedding(emb, contrastColorVector);
        if (greyContrastVector.length) greyScore = dotEmbedding(emb, greyContrastVector);
        if (beigeContrastVector.length) beigeScore = dotEmbedding(emb, beigeContrastVector);
        if (blueContrastVector.length) blueScore = dotEmbedding(emb, blueContrastVector);
        if (brownContrastVector.length) brownScore = dotEmbedding(emb, brownContrastVector);
        if (hasStyleRerank) styleScore = dotEmbedding(emb, styleContrastVector);
      }
      return { ...p, colorScore, contrastScore, greyScore, beigeScore, blueScore, brownScore, styleScore };
    });

    if (anyEmbFound) {
      const scoredProducts = products;
      const MIN_RESULTS = 8;

      const applyRelativeThreshold = (pool, relativePct) => {
        if (pool.length === 0) return pool;
        const maxColorScore = Math.max(...pool.map(p => p.colorScore));
        const threshold = Math.max(MIN_COLOR_SCORE, maxColorScore * relativePct);
        const filtered = pool.filter(p => p.colorScore >= threshold);
        if (filtered.length >= MIN_RESULTS) return filtered;
        return [...pool].sort((a, b) => b.colorScore - a.colorScore).slice(0, MIN_RESULTS);
      };

      const applyPastelContrast = (pool, margins) => pool.filter(p =>
        p.colorScore >= p.contrastScore + margins.white &&
        p.colorScore >= p.greyScore + margins.grey &&
        p.colorScore >= p.beigeScore + margins.beige &&
        p.colorScore >= p.blueScore + margins.blue
      );

      const tiers = hasStyleRerank ? (
        mlCategory === 'belt' && detectedColor === 'black' ? [
          { name: 'black-belt-strict', styleMargin: 0.020, brownMargin: 0.020, relativePct: 0.92, visualWeight: 0.24 },
          { name: 'black-belt-light',  styleMargin: 0.012, brownMargin: 0.012, relativePct: 0.88, visualWeight: 0.32 },
          { name: 'black-belt-visual', relativePct: 0.85, visualWeight: 0.48 },
        ] : mlCategory === 'belt' ? [
          { name: 'belt-strict', styleMargin: 0.022, relativePct: 0.90, visualWeight: 0.28 },
          { name: 'belt-light',  styleMargin: 0.012, relativePct: 0.87, visualWeight: 0.34 },
          { name: 'belt-visual', relativePct: 0.85, visualWeight: 0.48 },
        ] : bottomLength === 'shorts' && isPattern ? [
          { name: 'pattern-shorts-strict', styleMargin: 0.020, solidMargin: 0.012, relativePct: 0.90, visualWeight: 0.30 },
          { name: 'pattern-shorts-light',  styleMargin: 0.012, solidMargin: 0.006, relativePct: 0.87, visualWeight: 0.36 },
          { name: 'pattern-shorts-visual', relativePct: 0.85, visualWeight: 0.50 },
        ] : bottomLength ? [
          { name: 'bottom-length-strict', styleMargin: 0.020, greyMargin: 0.012, navyMargin: 0.010, relativePct: 0.90, visualWeight: 0.32 },
          { name: 'bottom-length-light',  styleMargin: 0.012, greyMargin: 0.008, navyMargin: 0.006, relativePct: 0.87, visualWeight: 0.38 },
          { name: 'bottom-visual',       relativePct: 0.85, visualWeight: 0.52 },
        ] : skirtLength === 'mini' ? [
          { name: 'mini-skirt-strict', styleMargin: 0.022, relativePct: 0.90, visualWeight: 0.28 },
          { name: 'mini-skirt-light',  styleMargin: 0.012, relativePct: 0.87, visualWeight: 0.34 },
          { name: 'mini-skirt-visual', relativePct: 0.85, visualWeight: 0.48 },
        ] : (skirtLength === 'midi' || skirtLength === 'maxi') && isPattern ? [
          { name: 'pattern-midi-skirt-strict', styleMargin: 0.022, solidMargin: 0.012, relativePct: 0.90, visualWeight: 0.28 },
          { name: 'pattern-midi-skirt-light',  styleMargin: 0.012, solidMargin: 0.006, relativePct: 0.87, visualWeight: 0.34 },
          { name: 'pattern-midi-skirt-visual', relativePct: 0.85, visualWeight: 0.48 },
        ] : (skirtLength === 'midi' || skirtLength === 'maxi') ? [
          { name: 'midi-maxi-skirt-strict', styleMargin: 0.022, relativePct: 0.90, visualWeight: 0.28 },
          { name: 'midi-maxi-skirt-light',  styleMargin: 0.012, relativePct: 0.87, visualWeight: 0.34 },
          { name: 'midi-maxi-skirt-visual', relativePct: 0.85, visualWeight: 0.48 },
        ] : PASTEL_COLORS.has(detectedColor) && topStyle ? [
          { name: 'pastel-top-strict', styleMargin: 0.024, pastel: { white: 0.020, grey: 0.016, beige: 0.014, blue: 0.010 }, relativePct: 0.90, visualWeight: 0.28 },
          { name: 'pastel-top-light',  styleMargin: 0.014, pastel: { white: 0.012, grey: 0.010, beige: 0.008, blue: 0.006 }, relativePct: 0.87, visualWeight: 0.34 },
          { name: 'pastel-top-visual', relativePct: 0.85, visualWeight: 0.48 },
        ] : topStyle === 'coat' && detectedColor === 'black' ? [
          { name: 'black-coat-strict', styleMargin: 0.026, whiteMargin: 0.020, relativePct: 0.92, visualWeight: 0.22 },
          { name: 'black-coat-light',  styleMargin: 0.014, whiteMargin: 0.012, relativePct: 0.88, visualWeight: 0.30 },
          { name: 'black-coat-visual', relativePct: 0.85, visualWeight: 0.45 },
        ] : isStripe ? [
          { name: 'stripe-top-strict', styleMargin: 0.026, whiteMargin: 0.020, relativePct: 0.92, visualWeight: 0.22 },
          { name: 'stripe-top-light',  styleMargin: 0.014, whiteMargin: 0.012, relativePct: 0.88, visualWeight: 0.30 },
          { name: 'stripe-top-visual', relativePct: 0.85, visualWeight: 0.48 },
        ] : WHITE_TOP_STYLES.has(topStyle) && detectedColor === 'white' ? [
          { name: 'white-top-strict', styleMargin: 0.028, whiteMargin: 0.020, relativePct: 0.92, visualWeight: 0.22 },
          { name: 'white-top-light',  styleMargin: 0.016, whiteMargin: 0.012, relativePct: 0.88, visualWeight: 0.30 },
          { name: 'white-top-visual', relativePct: 0.85, visualWeight: 0.45 },
        ] : topStyle === 'shirt' && (detectedColor === 'light_blue' || detectedColor === 'navy') ? [
          { name: 'denim-shirt-strict', styleMargin: 0.024, whiteMargin: 0.018, relativePct: 0.92, visualWeight: 0.24 },
          { name: 'denim-shirt-light',  styleMargin: 0.014, whiteMargin: 0.010, relativePct: 0.88, visualWeight: 0.32 },
          { name: 'denim-shirt-visual', relativePct: 0.85, visualWeight: 0.48 },
        ] : topStyle === 'tshirt' && detectedColor === 'white' ? [
          { name: 'white-tee-strict', styleMargin: 0.030, whiteMargin: 0.022, relativePct: 0.92, visualWeight: 0.22 },
          { name: 'white-tee-light',  styleMargin: 0.018, whiteMargin: 0.012, relativePct: 0.88, visualWeight: 0.30 },
          { name: 'white-tee-visual', relativePct: 0.85, visualWeight: 0.45 },
        ] : topStyle ? [
          { name: 'top-style-strict', styleMargin: 0.024, brownMargin: 0.010, relativePct: 0.90, visualWeight: 0.30 },
          { name: 'top-style-light',  styleMargin: 0.014, brownMargin: 0.006, relativePct: 0.87, visualWeight: 0.36 },
          { name: 'top-visual',       relativePct: 0.85, visualWeight: 0.50 },
        ] : shoeStyle ? [
          { name: 'shoe-style-strict', styleMargin: 0.024, relativePct: 0.90, visualWeight: 0.28 },
          { name: 'shoe-style-light',  styleMargin: 0.014, relativePct: 0.87, visualWeight: 0.34 },
          { name: 'shoe-visual',       relativePct: 0.85, visualWeight: 0.48 },
        ] : [
          { name: 'shoe-style-strict', styleMargin: 0.022, relativePct: 0.90, visualWeight: 0.30 },
          { name: 'shoe-style-light',  styleMargin: 0.012, relativePct: 0.87, visualWeight: 0.35 },
          { name: 'shoe-visual',       relativePct: 0.85, visualWeight: 0.50 },
        ]
      ) : isPattern ? [
        { name: 'pattern-strict', solidMargin: 0.012, relativePct: 0.88, visualWeight: 0.45 },
        { name: 'pattern-light',  solidMargin: 0.006, relativePct: 0.85, visualWeight: 0.50 },
        { name: 'pattern-visual', relativePct: 0.85, visualWeight: 0.65 },
      ] : hasPastelContrast ? [
        { name: 'strict-pastel', pastel: { white: 0.025, grey: 0.022, beige: 0.022, blue: 0.018 }, relativePct: 0.92, visualWeight: 0.40 },
        { name: 'medium-pastel', pastel: { white: 0.018, grey: 0.014, beige: 0.014, blue: 0.010 }, relativePct: 0.88, visualWeight: 0.45 },
        { name: 'light-pastel',  pastel: { white: 0.012, grey: 0.008, beige: 0.008, blue: 0.006 }, relativePct: 0.85, visualWeight: 0.50 },
        { name: 'white-only',    whiteMargin: 0.015, relativePct: 0.85, visualWeight: 0.55 },
        { name: 'visual-only',   relativePct: 0.85, visualWeight: 0.65 },
      ] : hasContrast ? [
        { name: 'white-contrast', whiteMargin: 0.015, relativePct: 0.85, visualWeight: 0.55 },
        { name: 'visual-only', relativePct: 0.85, visualWeight: 0.65 },
      ] : [
        { name: 'standard', relativePct: 0.85, visualWeight: 0.65 },
      ];

      let chosenTier = tiers[tiers.length - 1];
      for (const tier of tiers) {
        let pool = scoredProducts;
        if (tier.pastel) {
          pool = applyPastelContrast(pool, tier.pastel);
        } else {
          if (tier.styleMargin != null && hasStyleRerank) {
            pool = pool.filter(p => p.colorScore >= p.styleScore + tier.styleMargin);
          }
          if (tier.solidMargin != null && hasContrast) {
            pool = pool.filter(p => p.colorScore >= p.contrastScore + tier.solidMargin);
          }
          if (tier.whiteMargin != null) {
            pool = pool.filter(p => p.colorScore >= p.contrastScore + tier.whiteMargin);
          }
          if (tier.greyMargin != null && greyContrastVector.length) {
            pool = pool.filter(p => p.colorScore >= p.greyScore + tier.greyMargin);
          }
          if (tier.navyMargin != null && contrastColorVector.length) {
            pool = pool.filter(p => p.colorScore >= p.contrastScore + tier.navyMargin);
          }
          if (tier.brownMargin != null && (beigeContrastVector.length || brownContrastVector.length)) {
            pool = pool.filter(p => {
              const wrongBrown = Math.max(p.beigeScore || 0, p.brownScore || 0);
              return p.colorScore >= wrongBrown + tier.brownMargin;
            });
          }
        }
        pool = applyRelativeThreshold(pool, tier.relativePct);
        if (pool.length >= MIN_RESULTS) {
          products = pool;
          chosenTier = tier;
          break;
        }
        if (tier === tiers[tiers.length - 1]) {
          products = pool.length > 0
            ? pool
            : [...scoredProducts].sort((a, b) => b.colorScore - a.colorScore).slice(0, MIN_RESULTS);
          chosenTier = tier;
        }
      }

      const visualWeight = chosenTier.visualWeight;
      const colorWeight = 1 - visualWeight;
      products = products
        .map(p => ({
          ...p,
          blendedScore: visualWeight * p.searchScore
            + colorWeight * (p.colorScore * 3)
            - (hasStyleRerank ? (p.styleScore || 0) * 1.2 : 0),
        }))
        .sort((a, b) => b.blendedScore - a.blendedScore);
      console.log(`${logLabel} blended scoring tier=${chosenTier.name}`);
    }

    if (products.length === 0 && vectorCandidates.length > 0) {
      products = vectorCandidates.slice(0, 10);
    }
  }

  if (userProfile) {
    const favoriteStores = userProfile.topStores ? userProfile.topStores.map(s => s.toLowerCase()) : [];
    const storeScores = userProfile.storeScores || new Map();
    products = products.map(product => {
      const baseScore = product.blendedScore ?? product.searchScore ?? 0;
      const pStore = (product.storeName || '').toLowerCase();
      const activeScore = storeScores.get(pStore) || 0;
      let boost = 0;
      if (activeScore > 0) boost = Math.min(activeScore * 0.01, 0.12);
      else if (activeScore < 0) boost = Math.max(activeScore * 0.02, -0.15);
      else if (favoriteStores.includes(pStore)) boost = 0.05;
      return { ...product, personalizationBoost: boost, finalScore: baseScore + boost };
    });
    products.sort((a, b) => b.finalScore - a.finalScore);
  } else {
    products = products.map(product => ({
      ...product,
      personalizationBoost: 0,
      finalScore: product.blendedScore ?? product.searchScore,
    }));
  }

  if (hasStyleRerank && products.some(p => p.colorScore != null)) {
    const stylePriority = (p) => (p.colorScore || 0) - (p.styleScore || 0);
    products.sort((a, b) => {
      const byStyle = stylePriority(b) - stylePriority(a);
      if (Math.abs(byStyle) > 0.001) return byStyle;
      return (b.finalScore || 0) - (a.finalScore || 0);
    });
  } else if (isPattern && products.some(p => p.colorScore != null)) {
    const patternPriority = (p) => (p.colorScore || 0) - (p.contrastScore || 0);
    products.sort((a, b) => {
      const byPattern = patternPriority(b) - patternPriority(a);
      if (Math.abs(byPattern) > 0.001) return byPattern;
      return (b.finalScore || 0) - (a.finalScore || 0);
    });
  } else if (PASTEL_COLORS.has(detectedColor) && products.some(p => p.colorScore != null)) {
    const colorPriority = (p) => p.colorScore - Math.max(
      p.contrastScore || 0, p.greyScore || 0, p.beigeScore || 0, p.blueScore || 0
    );
    products.sort((a, b) => colorPriority(b) - colorPriority(a));
  }

  return products.slice(0, 10);
}

module.exports = { searchProductsFromMlItem };
