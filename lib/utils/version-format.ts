// Pure string helpers for version filenames. Safe to import from client components
// (lib/content/versions.ts pulls in node:path, which webpack can't bundle).

// File-system-safe timestamp for version filenames: 2026-06-15T13-45-00-123Z
// (colons in ISO-8601 are illegal on Windows).
export function timestampForFilename(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-");
}

export function parseVersionTimestamp(filename: string): string | null {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.md$/);
  return m ? m[1] : null;
}

// Convert the filesystem timestamp back to ISO-8601 (with colons) for display.
export function filenameToIso(ts: string): string {
  return ts.replace(/-(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, ":$1:$2:$3.$4Z");
}
