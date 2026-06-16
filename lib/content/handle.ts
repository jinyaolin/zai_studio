// Handle (user-facing slug) helpers.
// Rules: lowercase ASCII letters / digits / hyphens / underscores, 3-30 chars.
// Must be unique across all users (case-insensitive).

const HANDLE_RE = /^[a-z0-9_-]+$/;
const MIN_LEN = 3;
const MAX_LEN = 30;

/**
 * Normalize raw user input into a valid handle:
 * - lowercase
 * - replace invalid chars with hyphens
 * - collapse consecutive hyphens
 * - trim leading/trailing hyphens
 *
 * Returns empty string if nothing valid remains.
 */
export function handleSlugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, MAX_LEN);
}

export function isValidHandle(handle: string): boolean {
  if (handle.length < MIN_LEN || handle.length > MAX_LEN) return false;
  return HANDLE_RE.test(handle);
}

/**
 * Generate a non-conflicting fallback by appending `-2`, `-3`, …
 * The caller must provide a `isTaken(next) => boolean` predicate.
 */
export function resolveUniqueHandle(
  base: string,
  isTaken: (candidate: string) => boolean,
): string {
  if (!isTaken(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!isTaken(candidate)) return candidate;
  }
  // Extremely unlikely fallback.
  return `${base}-${Date.now()}`;
}

/** Suggest a handle from an email by stripping the domain + slugifying. */
export function suggestHandleFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return handleSlugify(local);
}
