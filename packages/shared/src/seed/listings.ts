export type SeedListingVariant = {
  size: string;
  color: string;
};

export type AffiliateSeedLink = {
  url: string;
  label: string;
  platform: "flipkart" | "amazon" | "myntra" | "ajio" | "nykaa" | "other";
};

export type SeedListing = {
  title: string;
  category: string;
  tags: string[];
  coinPrice: number;
  realPrice: string;
  variants: SeedListingVariant[];
  affiliateLinks?: AffiliateSeedLink[];
};

const BRANDS = [
  "Totême",
  "Khaite",
  "The Row",
  "Lemaire",
  "Jil Sander",
  "Acne Studios",
  "Staud",
  "Nanushka",
  "Ganni",
  "COS",
] as const;

const PIECES = [
  "wool-blend trench coat",
  "draped silk midi dress",
  "leather crossbody bag",
  "cropped wool blazer",
  "cashmere crewneck",
  "pleated wide-leg trousers",
  "suede ankle boots",
  "quilted liner jacket",
  "ribbed knit tank",
  "structured tote",
  "satin slip skirt",
  "double-breasted coat",
  "merino turtleneck",
  "canvas shoulder bag",
  "tailored vest",
  "poplin shirt dress",
  "leather belt bag",
  "chunky knit cardigan",
  "high-rise denim",
  "silk scarf top",
] as const;

const CATEGORIES = [
  "Outerwear",
  "Dresses",
  "Bags",
  "Tops",
  "Bottoms",
  "Shoes",
  "Accessories",
] as const;

const SIZES = ["XS", "S", "M", "L", "XL"] as const;
const COLORS = ["Black", "Ivory", "Navy", "Camel", "Olive", "Rose", "Sand"] as const;

const TAG_POOL = ["New", "Trending", "Editor's pick", "Low stock", "Bestseller"] as const;

const REAL_PRICES = [
  "₹4,299", "₹8,999", "₹12,499", "₹3,799", "₹6,499",
  "₹9,999", "₹5,299", "₹7,499", "₹2,999", "₹14,999",
  "₹3,499", "₹11,999", "₹4,999", "₹6,999", "₹8,499",
  "₹5,999", "₹3,299", "₹7,999", "₹4,299", "₹10,499",
] as const;

const PLATFORMS = ["flipkart", "amazon", "myntra", "ajio", "nykaa"] as const;

function platformForIndex(i: number): "flipkart" | "amazon" | "myntra" | "ajio" | "nykaa" {
  return PLATFORMS[i % PLATFORMS.length];
}

function searchQuery(title: string): string {
  return encodeURIComponent(title.toLowerCase().replace(/[^a-z0-9 ]/g, ""));
}

function affiliateUrlForPlatform(platform: string, title: string): string {
  const q = searchQuery(title);
  const urls: Record<string, (q: string) => string> = {
    flipkart: (q) => `https://www.flipkart.com/search?q=${q}&affid=yourshopoholia`,
    amazon: (q) => `https://www.amazon.in/s?k=${q}&tag=shopoholia-21`,
    myntra: (q) => `https://www.myntra.com/${q}?ref=shopoholia`,
    ajio: (q) => `https://www.ajio.com/search/?text=${q}&affiliate=shopoholia`,
    nykaa: (q) => `https://www.nykaafashion.com/search/?q=${q}&utm_source=shopoholia`,
  };
  return (urls[platform] ?? urls.flipkart)(q);
}

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

export function buildSeedListings(count = 50): SeedListing[] {
  const listings: SeedListing[] = [];

  for (let i = 0; i < count; i += 1) {
    const brand = pick(BRANDS, i);
    const piece = pick(PIECES, i + 3);
    const category = pick(CATEGORIES, i);
    const variantCount = 2 + (i % 3);
    const variants: SeedListingVariant[] = [];

    for (let v = 0; v < variantCount; v += 1) {
      variants.push({
        size: pick(SIZES, i + v),
        color: pick(COLORS, i + v * 2),
      });
    }

    const tags: string[] = [pick(TAG_POOL, i)];
    if (i % 4 === 0) tags.push("Limited");

    const title = `${brand} ${piece}`;
    const mainPlatform = platformForIndex(i);
    const secondPlatform = PLATFORMS[(i + 2) % PLATFORMS.length];

    listings.push({
      title,
      category,
      tags,
      coinPrice: 28 + (i % 17) * 3,
      realPrice: pick(REAL_PRICES, i),
      variants,
      affiliateLinks: [
        {
          url: affiliateUrlForPlatform(mainPlatform, title),
          label: `Buy on ${mainPlatform.charAt(0).toUpperCase() + mainPlatform.slice(1)}`,
          platform: mainPlatform,
        },
        {
          url: affiliateUrlForPlatform(secondPlatform, title),
          label: `Buy on ${secondPlatform.charAt(0).toUpperCase() + secondPlatform.slice(1)}`,
          platform: secondPlatform,
        },
      ],
    });
  }

  return listings;
}
