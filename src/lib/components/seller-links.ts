export function sellerProfileUrl(sellerName: string): string {
  return `https://www.discogs.com/seller/${encodeURIComponent(sellerName)}/profile`;
}

/** The seller's shop filtered to the user's wantlist. */
export function sellerWantsUrl(sellerName: string): string {
  return `https://www.discogs.com/seller/${encodeURIComponent(sellerName)}/mywants`;
}
