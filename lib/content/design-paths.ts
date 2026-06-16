import path from "node:path";
import { designSessionsDir as designSessionsDirBase } from "./paths";

// Re-export the per-user helper under the same name (now takes userId).
export function designSessionsDir(userId: string, workSlug: string) {
  return designSessionsDirBase(userId, workSlug);
}

export function designSessionPath(userId: string, workSlug: string, sessionId: string) {
  return path.join(designSessionsDir(userId, workSlug), `${sessionId}.json`);
}
