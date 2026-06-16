import { createWork } from "@/lib/content/works";
import { createChapter } from "@/lib/content/chapters";
import { writeMemory } from "@/lib/memory/store";
import type { WorkMemory } from "@/lib/types";
import { newMemoryId } from "@/lib/memory/store";

async function main() {
  console.log("Seeding demo work: 雨夜來客 (short) ...");

  const work = await createWork({
    title: "雨夜來客",
    type: "short",
    synopsis: "梅雨季某個深夜，獨居老作家迎來一位不速之客，對話揭開一段被遺忘的往事。",
    genre: "短篇小說",
    tags: ["奇幻", "懸疑"],
  });

  const memory: WorkMemory = {
    characters: [
      {
        id: newMemoryId(),
        name: "沈墨",
        aliases: ["老沈", "墨叔"],
        role: "主角",
        description: "七十歲的退休作家，獨居山城舊宅，左手有舊傷。",
        traits: ["寡言", "觀察敏銳", "念舊"],
        relationships: [],
        arc: "從對過去閉口不談，到正視自己的創傷。",
      },
      {
        id: newMemoryId(),
        name: "雨夜來客",
        aliases: ["撐傘的少年"],
        role: "謎樣訪客",
        description: "十七八歲模樣，撐一把褪色油紙傘，自稱要採訪沈墨。",
        traits: ["禮貌", "對細節過分熟悉"],
        relationships: [{ characterName: "沈墨", relation: "與沈墨某段過去有關" }],
        arc: "來訪的真正目的逐步揭露。",
      },
    ],
    worldbuilding: [
      {
        id: newMemoryId(),
        name: "山城舊宅",
        category: "地點",
        description: "沈墨獨居的木造老屋，據傳建於日治時期。",
        notes: "屋內有一架無人彈奏的鋼琴。",
      },
    ],
    plot: [
      {
        id: newMemoryId(),
        title: "來客的真實身份",
        status: "setup",
        summary: "來客似乎知道沈墨從未公開的某段往事，究竟是誰？",
        linkedChapters: [],
        foreshadowing: "來客對屋內擺設的熟悉程度，超出尋常採訪者。",
      },
    ],
    style:
      "# 風格指南\n\n- 視角：第三人稱有限，貼近沈墨\n- 語氣：節制、留白、潮濕\n- 用字：偏文言與書面語，避免口語\n- motif：雨、傘、鋼琴、舊信\n- 禁忌：不直接點破超自然元素\n",
  };
  await writeMemory(work.slug, memory);

  await createChapter(work.slug, {
    title: "雨夜來客",
    content:
      "那年梅雨季的某個深夜，雨下得像有人在天上傾倒一整缸的舊事。\n\n" +
      "沈墨正把當天寫壞的稿紙一張張揉掉，聽見門鈴響。他沒有立刻起身。山城這一帶入夜後少有人走動，更何況是這樣的雨。\n\n" +
      "門鈴又響了一次，比剛才輕，像怕驚擾了誰。\n\n" +
      "他終於開了門。門外站著一個十七八歲模樣的少年，撐著一把褪了色的油紙傘，傘緣的水珠一顆顆滴落，在門廊的木地板上砸出淺淺的漥。\n\n" +
      "「沈老師，」少年說，聲音被雨聲壓得有些扁，「這個時間打擾，真不好意思。」\n\n" +
      "沈墨沒有讓開。他望著少年的眼睛，望了許久，才發現自己忘記呼吸。\n\n" +
      "那雙眼睛——他在某個地方見過。\n",
    status: "draft",
  });

  console.log(`✓ Seeded "${work.title}" at content/works/${work.slug}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
