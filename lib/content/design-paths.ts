import path from "node:path";
import { workDir } from "./paths";

export function designSessionsDir(workSlug: string) {
  return path.join(workDir(workSlug), "design-sessions");
}

export function designSessionPath(workSlug: string, sessionId: string) {
  return path.join(designSessionsDir(workSlug), `${sessionId}.json`);
}
