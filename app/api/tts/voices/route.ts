import { NextResponse } from "next/server";
import { discoverVoiceCharacters, STYLE_PRESETS, CUSTOM_PRESET_ID } from "@/lib/tts/narration-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/tts/voices
 * Returns the available voice characters (discovered by scanning
 * COSYVOICE_VOICES_DIR + the bundled default) and the full style preset
 * list. The narration settings UI calls this to populate its dropdowns.
 */
export async function GET() {
  const voices = await discoverVoiceCharacters();
  return NextResponse.json({
    voices: voices.map((v) => ({
      id: v.id,
      label: v.label,
      isDefault: v.isDefault ?? false,
    })),
    stylePresets: STYLE_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      hint: p.hint,
    })),
    customPresetId: CUSTOM_PRESET_ID,
  });
}
