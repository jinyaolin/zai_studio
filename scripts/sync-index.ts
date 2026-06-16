import { syncIndex } from "@/lib/content/sync";
import { getDb } from "@/lib/content/db";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: npm run db:sync <userId>");
    console.error("  (P3 will make this scan every known user automatically.)");
    process.exit(1);
  }

  const db = getDb();
  console.log(`SQLite: ${db.name}`);
  console.log(`User:   ${userId}`);
  const report = await syncIndex(userId);
  console.log("Sync complete:");
  console.log(`  works:    +${report.works.added} ~${report.works.updated} -${report.works.removed}`);
  console.log(`  chapters: +${report.chapters.added} ~${report.chapters.updated} -${report.chapters.removed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
