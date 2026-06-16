import { nanoid } from "nanoid";

// Standalone helper so client components can generate memory IDs without
// pulling lib/memory/store.ts (which imports node:fs).
export function newMemoryId(): string {
  return nanoid(10);
}
