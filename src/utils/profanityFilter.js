/**
 * PROFANITY FILTER CONFIGURATION
 *
 * This filter is designed to:
 * 1. Allow moderate swearing (casual expletives).
 * 2. Block high-severity slurs, hate speech, and discriminatory language.
 */

// ─── TIER 1: HIGH-SEVERITY SLURS & HATE SPEECH (Hard Block) ───
// This list contains terms related to racism, xenophobia, and discrimination.
const FORBIDDEN_WORDS = [
  // Racist Slurs
  'nigger',
  'nigga',
  'kike',
  'chink',
  'spic',
  'wetback',
  'coon',
  'gook',
  'paki',
  'raghead',
  'towelhead',
  'slopehead',

  // Xenophobic Slurs
  'beaner',
  'guinea',
  'mick',
  'polack',
  'wop',

  // LGBTQ+ Slurs
  'faggot',
  'fag',
  'tranny',
  'dyke',

  // Ableist Slurs
  'retard',

  // Generic Hate Speech
  'white trash',
  'whitey',
  'cracker',
  'jungle bunny',
  'ziphead',
];

/**
 * Common evasion substitutions
 */
const substitutions = {
  a: '[a@4*]',
  e: '[e3*]',
  i: '[i1l|*!]',
  o: '[o0*]',
  u: '[u*v]',
  s: '[s5$*]',
  t: '[t7*]',
  g: '[g9q*]',
  b: '[b8*]',
};

/**
 * Builds a robust regular expression for a given word that catches:
 * 1. Common substitutions (a -> @, e -> 3, etc.)
 * 2. Repeated characters (niiigger)
 * 3. Non-alphanumeric separators (n.i.g.g.e.r)
 */
function buildRobustRegex(word) {
  const pattern = word
    .split('')
    .map((char) => {
      const sub = substitutions[char.toLowerCase()];
      const base = sub || char.toLowerCase();
      // Allow the character (or its substitution) to be repeated,
      // and allow non-alphanumeric characters between letters.
      return `${base}+[^a-zA-Z0-9]*`;
    })
    .join('');

  // Use word boundaries or similar if needed, but for slurs we usually want any match.
  // We use "gi" for global and case-insensitive.
  try {
    return new RegExp(pattern, 'gi');
  } catch {
    // Fallback to literal if regex building fails for some reason
    return new RegExp(word.split('').join('[^a-zA-Z0-9]*'), 'gi');
  }
}

const robustPatterns = FORBIDDEN_WORDS.map(buildRobustRegex);

/**
 * checkContent(text)
 * @param {string} text - The content to validate.
 * @returns {Object} - { isBlocked: boolean, message?: string }
 */
export function checkContent(text) {
  if (!text || typeof text !== 'string') return { isBlocked: false };

  // Check against each robust pattern
  for (const pattern of robustPatterns) {
    if (pattern.test(text)) {
      return {
        isBlocked: true,
        message:
          'This content violates community guidelines regarding hate speech and discrimination.',
      };
    }
  }

  return { isBlocked: false };
}

export default { checkContent };
