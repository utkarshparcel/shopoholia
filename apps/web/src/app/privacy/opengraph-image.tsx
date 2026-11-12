// Worn Play's share card (a page that sets its own openGraph doesn't inherit the root's image file).
// Static export (Next 15 wants this on every metadata route under output: 'export').
export const dynamic = 'force-static';

export { default, alt, size, contentType } from '../opengraph-image';
