// Heuristic prosody profiling for a chunk of novel text.
// Returns rate/pitch hints that msedge-tts accepts.
//
// Why: a flat TTS reads everything at the same pace. Real narrators slow down
// for atmospheric passages, speed up for action, lift pitch for questions.
// Tuned for AUDIBILITY — the changes here are big enough to notice on first
// listen, not subtle shades. Tune down via env TTS_PROSODY_STRENGTH if needed.

export interface ProsodyProfile {
  /** e.g. "-15%" (slower) / "+10%" (faster). msedge-tts requires the % suffix. */
  rate: string;
  /** e.g. "x-low" / "medium" / "x-high". Optional. */
  pitch?: string;
}

// Multiplier so the user can dial prosody up/down without editing this file.
// TTS_PROSODY_STRENGTH=2.0 → 2x the rate change; 0.5 → half; 0 → off.
function strength(): number {
  const v = Number(process.env.TTS_PROSODY_STRENGTH);
  return Number.isFinite(v) && v >= 0 ? v : 1.0;
}

function scaledRate(base: number): string {
  const k = strength();
  const scaled = Math.round(base * k);
  return `${scaled >= 0 ? "+" : ""}${scaled}%`;
}

export function analyzeChunkProsody(text: string): ProsodyProfile {
  const t = text.trim();
  if (!t) return { rate: "+0%" };

  const isDialogue = /^[「"「]/.test(t);
  const hasEllipsis = /(…|\.\.\.)/.test(t);
  const isAction = /[！!]/.test(t) && t.length < 60;
  const isQuestion = /[？?]/.test(t);
  const isSceneBreak = /^(\*\s*\*\s*\*|---|—\s*—\s*—)/.test(t);

  // Long + no dialogue + no exclamation → atmospheric / descriptive. Slow hard.
  const isAtmospheric = !isDialogue && !isAction && !isQuestion && t.length > 80;

  if (isSceneBreak) return { rate: scaledRate(-30) };
  if (isDialogue && hasEllipsis) return { rate: scaledRate(-25), pitch: "low" };
  if (isDialogue) return { rate: scaledRate(-8) };
  if (isAction) return { rate: scaledRate(+15) };
  if (hasEllipsis) return { rate: scaledRate(-30) };
  if (isQuestion) return { rate: scaledRate(-10), pitch: "high" };
  if (isAtmospheric) return { rate: scaledRate(-20) };
  return { rate: scaledRate(-12) };
}

// Detect whether a chunk is "dialogue-heavy" enough to warrant a different
// voice. Used to switch to TTS_DIALOGUE_VOICE if the user configured one.
export function isDialogueHeavy(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^[「"「]/.test(t)) return true;
  const matches = t.match(/[「「"][^」」"]{1,200}[」」"]/g);
  if (!matches) return false;
  const quotedChars = matches.reduce((s, m) => s + m.length, 0);
  return quotedChars / t.length > 0.4;
}
