import { listWorks } from "@/lib/content/works";
import { listChapters } from "@/lib/content/chapters";
import { readMemory } from "@/lib/memory/store";
import { syncChapterVectors, syncVectors } from "@/lib/memory/vectors";
import { describeEmbeddingProvider, isEmbeddingConfigured } from "@/lib/ai/embeddings";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: npm run vectors:sync <userId>");
    process.exit(1);
  }

  console.log(
    `Embedding provider: ${describeEmbeddingProvider()}${isEmbeddingConfigured() ? " (ZAI API)" : " (local fallback)"}`,
  );
  console.log(`User: ${userId}`);
  const works = await listWorks(userId);
  if (works.length === 0) {
    console.log("No works found.");
    return;
  }
  for (const work of works) {
    const memory = await readMemory(userId, work.slug);
    const total =
      memory.characters.length + memory.worldbuilding.length + memory.plot.length + (memory.style.trim() ? 1 : 0);
    if (total > 0) {
      const report = await syncVectors(userId, work.slug, memory);
      console.log(`  ${work.slug} memory: embedded=${report.embedded} reused=${report.reused} removed=${report.removed}`);
    }

    const chapters = await listChapters(userId, work.slug);
    for (const c of chapters) {
      const r = await syncChapterVectors(userId, work.slug, c.slug, c.title, c.content);
      console.log(`  ${work.slug} chapter "${c.title}": embedded=${r.embedded} reused=${r.reused}`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
