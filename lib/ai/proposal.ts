// PROPOSAL protocol helpers. Pure string ops — safe for client components.
// (Kept separate from prompts.ts which transitively imports node:fs via
// memory/retrieve → memory/vectors.)

export const PROPOSAL_OPEN = "<PROPOSAL>";
export const PROPOSAL_CLOSE = "</PROPOSAL>";

export const MEMORY_PATCH_OPEN = "<MEMORY_PATCH>";
export const MEMORY_PATCH_CLOSE = "</MEMORY_PATCH>";

// Split Stage 4 output into prose + memory patch. The patch is whatever sits
// between the markers; everything else is the prose. Returns patch=null when
// the model didn't emit a patch block.
export function splitDraftAndPatch(
  text: string,
): { prose: string; patchRaw: string | null } {
  const start = text.indexOf(MEMORY_PATCH_OPEN);
  const end = text.indexOf(MEMORY_PATCH_CLOSE);
  if (start === -1 || end === -1 || end <= start) {
    return { prose: text, patchRaw: null };
  }
  const patchRaw = text.slice(start + MEMORY_PATCH_OPEN.length, end).trim();
  const prose = (text.slice(0, start) + text.slice(end + MEMORY_PATCH_CLOSE.length)).trim();
  return { prose, patchRaw };
}

// Lenient JSON extraction for the patch payload — same robustness as
// parseProposalJson (strips code fences, finds {...}, fixes smart quotes,
// tolerates trailing commas). Returns null on parse failure.
export function parseMemoryPatchRaw<T = unknown>(raw: string): T | null {
  return parseProposalJson<T>(raw);
}

export function extractProposal(text: string): { proposal: string | null; discussion: string } {
  const start = text.indexOf(PROPOSAL_OPEN);
  const end = text.indexOf(PROPOSAL_CLOSE);
  if (start === -1 || end === -1 || end <= start) {
    return { proposal: null, discussion: text };
  }
  const proposal = text.slice(start + PROPOSAL_OPEN.length, end).trim();
  const discussion = (text.slice(0, start) + text.slice(end + PROPOSAL_CLOSE.length)).trim();
  return { proposal, discussion };
}

// Try hard to extract a JSON object from a proposal string. Models often:
//   - wrap output in ```json ... ``` fences
//   - add commentary before/after the JSON
//   - use smart quotes / trailing commas
// We strip all of that before JSON.parse.
export function parseProposalJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim();

  // 1. Strip markdown code fences.
  const fenceMatch = s.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }

  // 2. Take from the first { to the last }.
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }

  // 3. Smart quotes → straight
  s = s
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'");

  // 4. Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
