import { listWorks } from "@/lib/content/works";
import { listChapters } from "@/lib/content/chapters";
import { readMemory } from "@/lib/memory/store";
import { syncChapterVectors, syncVectors } from "@/lib/memory/vectors";
import { describeEmbeddingProvider, isEmbeddingConfigured } from "@/lib/ai/embeddings";

async function main() {
  console.log(`Embedding provider: ${describeEmbeddingProvider()}${isEmbeddingConfigured() ? " (ZAI API)" : " (local fallback)"}`);
  const works = await listWorks();
  if (works.length === 0) {
    console.log("No works found.");
    return;
  }
  for (const work of works) {
    const memory = await readMemory(work.slug);
    const total =
      memory.characters.length + memory.worldbuilding.length + memory.plot.length + (memory.style.trim() ? 1 : 0);
    if (total > 0) {
      const report = await syncVectors(work.slug, memory);
      console.log(`  ${work.slug} memory: embedded=${report.embedded} reused=${report.reused} removed=${report.removed}`);
    }

    const chapters = await listChapters(work.slug);
    for (const c of chapters) {
      const r = await syncChapterVectors(work.slug, c.slug, c.title, c.content);
      console.log(`  ${work.slug} chapter "${c.title}": embedded=${r.embedded} reused=${r.reused}`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
