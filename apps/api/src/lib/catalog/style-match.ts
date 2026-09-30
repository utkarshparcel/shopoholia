/**
 * What each style-quiz tag (STYLE_QUIZ_QUESTIONS) looks like in catalog text. Scraped
 * rows carry no tags of their own (only "src:<site>"), so this leans on the words in
 * titles and categories, e.g. "Black Floral V-Neck Mini Dress" or "T-Shirts". Listing
 * tags are matched the same way, so a seller's "streetwear" tag counts too.
 */
export const STYLE_TAG_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  // Vibe
  casual: ["casual", "everyday", "lounge", "loungewear", "denim", "jeans", "joggers", "shorts"],
  streetwear: [
    "streetwear", "graphic", "hoodie", "hoodies", "sweatshirt", "sweatshirts", "cargo",
    "cargos", "varsity", "bomber",
  ],
  tees: ["tees", "tee", "t shirt", "t shirts", "tshirt", "tshirts"],
  minimal: ["minimal", "minimalist", "solid", "basic", "basics", "monochrome"],
  formal: [
    "formal", "formals", "tailored", "blazer", "blazers", "trousers", "suit", "suits",
    "waistcoat", "pencil skirt", "peplum",
  ],
  dresses: ["dresses", "dress", "gown", "gowns"],
  statement: [
    "statement", "bold", "embellished", "sequin", "sequins", "sequined", "sequinned",
    "metallic", "feather", "feathers", "fringe", "cape",
  ],
  prints: [
    "prints", "print", "printed", "floral", "florals", "graphic", "leopard", "zebra",
    "animal print", "polka", "polka dot", "polka dots", "stripe", "stripes", "striped",
    "checked", "checkered", "checks", "plaid", "tie dye", "paisley", "abstract", "geometric",
    "tropical",
  ],
  oversized: [
    "oversized", "oversize", "baggy", "boxy", "slouchy", "wide leg", "drop shoulder",
    "dropped shoulder",
  ],
  classic: ["classic", "classics", "timeless", "trench", "cashmere", "tweed"],
  ethnic: [
    "ethnic", "indo western", "kurta", "kurtas", "kurti", "kurtis", "saree", "sarees", "sari",
    "lehenga", "lehengas", "anarkali", "salwar", "dupatta", "sharara", "churidar", "kaftan",
    "bandhani", "ikat", "chikankari",
  ],
  kurtas: ["kurtas", "kurta", "kurti", "kurtis"],

  // Palette: most scraped titles start with the colour ("Sage Ruched Bodycon Mini Dress").
  neutral: [
    "neutral", "neutrals", "black", "white", "off white", "ivory", "cream", "beige", "nude",
    "taupe", "ecru", "grey", "gray", "charcoal",
  ],
  earth: [
    "earth", "earthy", "brown", "olive", "rust", "tan", "camel", "khaki", "mustard",
    "terracotta", "chocolate", "coffee", "mocha", "copper", "maroon", "burgundy", "wine",
    "sage",
  ],
  pastel: [
    "pastel", "pastels", "pink", "light pink", "baby pink", "blush", "mint", "lavender",
    "lilac", "peach", "baby blue", "powder blue", "sky blue", "light blue", "light yellow",
    "lemon",
  ],
  vivid: [
    "vivid", "bright", "neon", "red", "scarlet", "crimson", "cobalt", "royal blue",
    "electric blue", "emerald", "yellow", "orange", "coral", "fuchsia", "magenta", "hot pink",
    "purple", "turquoise",
  ],

  // Budget: a price band isn't a style, the catalog's prices aren't comparable rupee
  // amounts (scraped coin prices are raw site prices), and the words collide with
  // product names ("Mid-Rise Jeans"). So these match nothing.
  budget: [],
  mid: [],
  premium: [],
  luxury: [],

  // Occasion
  office: ["office", "officewear", "workwear", "work wear"],
  daily: ["daily", "everyday", "essentials", "basics"],
  party: [
    "party", "partywear", "night out", "going out", "evening", "club", "clubwear", "sequin",
    "sequins", "sequined", "glitter", "shimmer", "satin", "corset", "bodycon", "halter",
    "cut out",
  ],
  cocktail: ["cocktail", "mini dress", "slip dress"],
  festive: ["festive", "wedding", "diwali", "sangeet", "mehendi", "haldi", "zari", "brocade", "gota"],

  // Fit
  slim: ["slim", "slim fit", "skinny", "tailored", "pencil", "sheath"],
  fitted: ["fitted", "bodycon", "corset", "bodysuit", "sheath"],
  regular: ["regular", "regular fit", "relaxed", "straight", "straight fit"],
  cropped: ["cropped", "crop"],
};

/** Keywords for a style profile's tags; a tag the quiz adds later matches as itself. */
export function styleKeywordsForTags(tags: readonly string[]): string[] {
  const keywords = new Set<string>();
  for (const tag of tags) {
    const expanded = Object.hasOwn(STYLE_TAG_KEYWORDS, tag) ? STYLE_TAG_KEYWORDS[tag]! : [tag];
    for (const keyword of expanded) keywords.add(keyword);
  }
  return [...keywords];
}
