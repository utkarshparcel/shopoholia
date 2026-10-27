/** Human "why this outfit" line from occasion + weatherCtx. */

export function outfitWhyThis(input: {
  occasion?: string | null;
  weatherCtx?: Record<string, unknown> | null;
  itemCategories?: string[];
}): string {
  const parts: string[] = [];
  const occasion = (input.occasion ?? 'CASUAL').toLowerCase();
  const weather = input.weatherCtx ?? {};
  const temp =
    typeof weather.tempC === 'number'
      ? weather.tempC
      : typeof weather.temp === 'number'
        ? weather.temp
        : null;
  const condition =
    typeof weather.condition === 'string' ? weather.condition : null;

  if (temp != null && condition) {
    parts.push(`${temp}°C and ${condition}`);
  } else if (temp != null) {
    parts.push(`${temp}°C today`);
  } else if (condition) {
    parts.push(`${condition} weather`);
  }

  if (occasion === 'work') {
    parts.push('kept it work-appropriate');
  } else if (occasion === 'formal' || occasion === 'party') {
    parts.push(`leaned ${occasion}`);
  } else {
    parts.push('kept it easy and clean');
  }

  const cats = (input.itemCategories ?? []).filter(Boolean);
  if (cats.length > 0) {
    parts.push(`from your ${cats.slice(0, 3).join(', ')}`);
  }

  if (parts.length === 0) {
    return 'Picked from what’s clean and closest to your taste.';
  }
  return `Why this: ${parts.join(' · ')}.`;
}

export function morningGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
