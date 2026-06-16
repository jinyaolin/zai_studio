import { syncIndex } from "@/lib/content/sync";
import { getDb } from "@/lib/content/db";

async function main() {
  const db = getDb();
  console.log(`SQLite: ${db.name}`);
  const report = await syncIndex();
  console.log("Sync complete:");
  console.log(`  works:    +${report.works.added} ~${report.works.updated} -${report.works.removed}`);
  console.log(`  chapters: +${report.chapters.added} ~${report.chapters.updated} -${report.chapters.removed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
