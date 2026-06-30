/**
 * Strict color incompatibility rules.
 *
 * For each detected color, lists every DB color label that is visually
 * incompatible and must NEVER appear in the results.
 *
 * Rule of thumb used:
 *   – A colour is incompatible if it occupies the opposite end of the
 *     light/dark or warm/cool spectrum (e.g. black ? white, navy ? beige).
 *   – Close neighbours on the same spectrum are NOT listed as incompatible
 *     (e.g. black allows navy / dark-grey; navy allows black).
 */
const COLOR_INCOMPATIBLE = {
  black:      ['white', 'beige', 'light_blue', 'pink', 'yellow', 'red', 'green', 'grey', 'brown'],
  white:      ['black', 'navy', 'burgundy', 'olive', 'brown', 'grey', 'red', 'orange', 'tan', 'yellow', 'pink'],
  beige:      ['black', 'navy', 'burgundy', 'grey'],
  grey:       ['white', 'beige', 'yellow', 'pink', 'light_blue'],
  navy:       ['white', 'beige', 'light_blue', 'yellow', 'pink', 'red'],
  red:        ['navy', 'olive', 'grey', 'brown'],
  burgundy:   ['white', 'beige', 'light_blue', 'pink', 'yellow', 'green'],
  brown:      ['white', 'light_blue', 'pink', 'yellow', 'green'],
  olive:      ['white', 'light_blue', 'pink', 'yellow', 'red'],
  light_blue: ['black', 'navy', 'burgundy', 'olive', 'brown', 'grey', 'beige'],
  pink:       ['black', 'navy', 'olive', 'brown'],
  lavender:   ['black', 'navy', 'olive', 'brown', 'white'],
  purple:     ['black', 'navy', 'olive', 'brown', 'white', 'yellow'],
  green:      ['burgundy', 'pink', 'red'],
  yellow:     ['black', 'navy', 'burgundy', 'grey', 'brown'],
};

/**
 * Determines whether a product's color tags are compatible with the
 * detected search color.
 *
 * Rules (in order):
 *   1. Untagged products (empty or missing colors array) ? ALLOWED.
 *      Many DB products carry no color metadata. We cannot assume they are
 *      wrong-colored; vector similarity already makes them visually close.
 *      Only products with an EXPLICIT incompatible tag are blocked.
 *   2. Product explicitly carries the target color ? INCLUDED.
 *   3. Product carries at least one strictly incompatible color ? EXCLUDED.
 *   4. Everything else (neutral / unrecognised color tags) ? INCLUDED.
 *
 * @param {string}   detectedColor  – lowercase color from ML (e.g. "black")
 * @param {string[]} productColors  – colors array from the DB document
 * @returns {boolean}
 */
function isColorCompatible(detectedColor, productColors) {
  // Rule 1 – untagged products: benefit of the doubt, allow through
  if (!productColors || productColors.length === 0) return true;

  // Normalise DB values to lowercase for case-insensitive comparison
  const normalised = productColors.map(c => (c || '').toLowerCase().trim());

  // Rule 2 – exact match on target color
  if (normalised.includes(detectedColor)) return true;

  // Rule 3 – product carries an explicitly incompatible color ? block it
  const incompatible = COLOR_INCOMPATIBLE[detectedColor] || [];
  if (normalised.some(c => incompatible.includes(c))) return false;

  // Rule 4 – neutral / unknown tag: allow through
  return true;
}

module.exports = { COLOR_INCOMPATIBLE, isColorCompatible };
