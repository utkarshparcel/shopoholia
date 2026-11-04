import { tagAffiliateUrl, type AffiliateIds } from "../affiliate-ids.js";

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

type SeedCategory = "Outerwear" | "Dresses" | "Bags" | "Tops" | "Bottoms" | "Shoes" | "Accessories";

/** Each piece with the category it belongs in, so the feed's category filter is right. */
const PIECES: ReadonlyArray<{ name: string; category: SeedCategory }> = [
  { name: "wool-blend trench coat", category: "Outerwear" },
  { name: "draped silk midi dress", category: "Dresses" },
  { name: "leather crossbody bag", category: "Bags" },
  { name: "cropped wool blazer", category: "Outerwear" },
  { name: "cashmere crewneck", category: "Tops" },
  { name: "pleated wide-leg trousers", category: "Bottoms" },
  { name: "suede ankle boots", category: "Shoes" },
  { name: "quilted liner jacket", category: "Outerwear" },
  { name: "ribbed knit tank", category: "Tops" },
  { name: "structured tote", category: "Bags" },
  { name: "satin slip skirt", category: "Bottoms" },
  { name: "double-breasted coat", category: "Outerwear" },
  { name: "merino turtleneck", category: "Tops" },
  { name: "canvas shoulder bag", category: "Bags" },
  { name: "tailored vest", category: "Tops" },
  { name: "poplin shirt dress", category: "Dresses" },
  { name: "leather belt bag", category: "Bags" },
  { name: "chunky knit cardigan", category: "Tops" },
  { name: "high-rise denim", category: "Bottoms" },
  { name: "silk twill scarf", category: "Accessories" },
];

/** Sizes that fit the category: shoe sizes for shoes, one size for bags and accessories. */
const SIZES_BY_CATEGORY: Record<SeedCategory, readonly string[]> = {
  Outerwear: ["XS", "S", "M", "L", "XL"],
  Dresses: ["XS", "S", "M", "L", "XL"],
  Tops: ["XS", "S", "M", "L", "XL"],
  Bottoms: ["XS", "S", "M", "L", "XL"],
  Shoes: ["UK 4", "UK 5", "UK 6", "UK 7", "UK 8"],
  Bags: ["One size"],
  Accessories: ["One size"],
};
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

function affiliateUrlForPlatform(
  platform: (typeof PLATFORMS)[number],
  title: string,
  ids: AffiliateIds | undefined,
): string {
  const q = searchQuery(title);
  const urls: Record<(typeof PLATFORMS)[number], string> = {
    flipkart: `https://www.flipkart.com/search?q=${q}`,
    amazon: `https://www.amazon.in/s?k=${q}`,
    myntra: `https://www.myntra.com/${q}`,
    ajio: `https://www.ajio.com/search/?text=${q}`,
    nykaa: `https://www.nykaafashion.com/search/?q=${q}`,
  };
  return tagAffiliateUrl(platform, urls[platform], ids);
}

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

export function buildSeedListings(
  count = 50,
  opts: { affiliateIds?: AffiliateIds } = {},
): SeedListing[] {
  const listings: SeedListing[] = [];

  for (let i = 0; i < count; i += 1) {
    const brand = pick(BRANDS, i);
    const { name: piece, category } = pick(PIECES, i + 3);
    const sizes = SIZES_BY_CATEGORY[category];
    const variantCount = 2 + (i % 3);
    const variants: SeedListingVariant[] = [];

    for (let v = 0; v < variantCount; v += 1) {
      // One-size pieces vary by colour only.
      variants.push({
        size: pick(sizes, i + v),
        color: pick(COLORS, i + v * (sizes.length === 1 ? 1 : 2)),
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
          url: affiliateUrlForPlatform(mainPlatform, title, opts.affiliateIds),
          label: `Buy on ${mainPlatform.charAt(0).toUpperCase() + mainPlatform.slice(1)}`,
          platform: mainPlatform,
        },
        {
          url: affiliateUrlForPlatform(secondPlatform, title, opts.affiliateIds),
          label: `Buy on ${secondPlatform.charAt(0).toUpperCase() + secondPlatform.slice(1)}`,
          platform: secondPlatform,
        },
      ],
    });
  }

  return listings;
}
