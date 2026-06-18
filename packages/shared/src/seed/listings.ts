export type SeedListingVariant = {
  size: string;
  color: string;
};

export type SeedListing = {
  title: string;
  category: string;
  tags: string[];
  coinPrice: number;
  variants: SeedListingVariant[];
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

    listings.push({
      title: `${brand} ${piece}`,
      category,
      tags,
      coinPrice: 28 + (i % 17) * 3,
      variants,
    });
  }

  return listings;
}
