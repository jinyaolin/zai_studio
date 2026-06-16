// Centralized ID generation for content rows.
// nanoid for now; swap for ULID / UUID later if needed.

import { nanoid } from "nanoid";

export function newUserId(): string {
  return `u_${nanoid(16)}`;
}
