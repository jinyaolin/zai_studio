import { promises as fs } from "node:fs";
import { nanoid } from "nanoid";
import type { ChatMessage, Conversation, ConversationScope } from "@/lib/types";
import { normalizeScope } from "@/lib/types";
import { conversationPath, conversationsDir } from "@/lib/content/paths";
import { upsertConversationRow } from "@/lib/content/db";

export async function listConversations(userId: string, workSlug: string): Promise<Conversation[]> {
  try {
    const entries = await fs.readdir(conversationsDir(userId, workSlug));
    const convs: Conversation[] = [];
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      try {
        convs.push(await readConversation(userId, workSlug, file.replace(/\.json$/, "")));
      } catch {
        // skip malformed
      }
    }
    return convs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function listConversationsByScope(
  userId: string,
  workSlug: string,
  scope: ConversationScope,
): Promise<Conversation[]> {
  const all = await listConversations(userId, workSlug);
  return all.filter((c) => scopesEqual(normalizeScope(c.scope), scope));
}

export async function readConversation(
  userId: string,
  workSlug: string,
  id: string,
): Promise<Conversation> {
  const raw = await fs.readFile(conversationPath(userId, workSlug, id), "utf8");
  const parsed = JSON.parse(raw) as Conversation;
  return { ...parsed, scope: normalizeScope(parsed.scope) };
}

export async function writeConversation(userId: string, conversation: Conversation): Promise<void> {
  const conv = { ...conversation, scope: normalizeScope(conversation.scope) };
  await fs.mkdir(conversationsDir(userId, conv.workSlug), { recursive: true });
  await fs.writeFile(
    conversationPath(userId, conv.workSlug, conv.id),
    JSON.stringify(conv, null, 2) + "\n",
    "utf8",
  );
  upsertConversationRow(userId, {
    id: conv.id,
    workSlug: conv.workSlug,
    title: conv.title,
    messageCount: conv.messages.length,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  });
}

export async function deleteConversation(userId: string, workSlug: string, id: string): Promise<void> {
  await fs.rm(conversationPath(userId, workSlug, id), { force: true });
}

export function newConversation(
  workSlug: string,
  scope: ConversationScope = { kind: "general" },
  title?: string,
): Conversation {
  const now = new Date().toISOString();
  return {
    id: nanoid(12),
    workSlug,
    title: title ?? "未命名對話",
    messages: [],
    scope,
    createdAt: now,
    updatedAt: now,
  };
}

function scopesEqual(a: ConversationScope, b: ConversationScope): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "general":
      return true;
    case "memory":
      return (
        b.kind === "memory" &&
        a.memoryKind === b.memoryKind &&
        a.itemId === b.itemId
      );
    case "chapter":
      return b.kind === "chapter" && a.chapterSlug === b.chapterSlug;
    case "design":
      return b.kind === "design" && a.sessionId === b.sessionId;
  }
}

export function appendMessage(conversation: Conversation, message: ChatMessage): Conversation {
  const updated: Conversation = {
    ...conversation,
    messages: [...conversation.messages, message],
    updatedAt: new Date().toISOString(),
  };
  if (
    conversation.title === "未命名對話" &&
    message.role === "user" &&
    message.content.trim().length > 0
  ) {
    updated.title = message.content.trim().slice(0, 30);
  }
  return updated;
}
