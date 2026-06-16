// Next.js does NOT auto-decode dynamic route params in App Router when they
// contain non-ASCII / percent-encoded chars. Always run params through this.
export function decodeParam(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
