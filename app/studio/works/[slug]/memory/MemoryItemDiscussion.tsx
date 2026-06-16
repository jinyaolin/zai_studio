"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Character,
  ChatMessage,
  MemoryKind,
  PlotThread,
  WorldEntry,
} from "@/lib/types";
import { extractProposal, parseProposalJson } from "@/lib/ai/proposal";

interface Props {
  workSlug: string;
  kind: MemoryKind;
  itemId: string;
  /** Called when user accepts a proposed update. Receives the parsed JSON object. */
  onAdopt: (newItem: Character | WorldEntry | PlotThread) => Promise<void>;
}

interface MessageMeta {
  conversationId: string | null;
}

export default function MemoryItemDiscussion({ workSlug, kind, itemId, onAdopt }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const streamingRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing scoped conversation on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/conversations/${encodeURIComponent(workSlug)}`);
      if (!res.ok) return;
      const data = await res.json();
      const match = data.conversations?.find((c: { id: string; title: string }) => true);
      // The conversation list endpoint returns summaries; we need to find by scope.
      // Simpler: hit the chat endpoint with empty message? No — just iterate and load.
      // For now, skip preloading. The first send will pick up the right conversation
      // because the chat API looks up by scope server-side.
      void match;
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [workSlug, kind, itemId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    streamingRef.current = "";
    setStreamingText("");

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workSlug,
        conversationId,
        mode: "brainstorm",
        message: text,
        scope: { kind: "memory", memoryKind: kind, itemId },
      }),
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "（連線失敗）",
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantId: string | null = null;
    let assistantText = "";
    let convId = conversationId;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "meta") {
              convId = evt.conversationId;
            } else if (evt.type === "delta") {
              assistantText += evt.text;
              streamingRef.current = assistantText;
              setStreamingText(assistantText);
            } else if (evt.type === "done") {
              assistantId = evt.messageId;
              convId = evt.conversationId;
            } else if (evt.type === "error") {
              assistantText += `\n\n[錯誤] ${evt.error}`;
              streamingRef.current = assistantText;
              setStreamingText(assistantText);
            }
          } catch {
            // partial
          }
        }
      }
    } finally {
      setStreaming(false);
      const finalText = streamingRef.current;
      streamingRef.current = "";
      setStreamingText("");
      if (finalText) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId ?? `a-${Date.now()}`,
            role: "assistant",
            content: finalText,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      if (convId) setConversationId(convId);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="mt-3 border-t border-stone-200 pt-3">
      <div
        ref={scrollRef}
        className="bg-stone-50 border border-stone-200 rounded-md p-3 h-64 overflow-y-auto space-y-3"
      >
        {messages.length === 0 && !streaming && (
          <p className="text-xs text-stone-400 text-center mt-12">
            問 zai 怎麼深化這個項目。例：「這角色可以加什麼矛盾？」「這條情節線怎麼收束比較好？」
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onAdopt={onAdopt}
          />
        ))}
        {streaming && (
          <MessageBubble
            message={{
              id: "streaming",
              role: "assistant",
              content: streamingText,
              createdAt: new Date().toISOString(),
            }}
            isStreaming
            onAdopt={onAdopt}
          />
        )}
      </div>

      <form onSubmit={send} className="mt-2 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="問問題、要建議…  (⌘/Ctrl+Enter 送出)"
          className="flex-1 px-3 py-2 bg-white border border-stone-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="self-stretch px-4 bg-stone-900 text-stone-50 rounded text-sm hover:bg-stone-800 disabled:opacity-40"
        >
          {streaming ? "…" : "送出"}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
  onAdopt,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  onAdopt: (item: Character | WorldEntry | PlotThread) => Promise<void>;
}) {
  const isUser = message.role === "user";
  const { proposal, discussion } = extractProposal(message.content);

  let parsedItem: Character | WorldEntry | PlotThread | null = null;
  if (proposal) {
    parsedItem = parseProposalJson<Character | WorldEntry | PlotThread>(proposal);
  }

  const [adopting, setAdopting] = useState(false);
  const [adopted, setAdopted] = useState(false);

  async function adopt() {
    if (!parsedItem) return;
    setAdopting(true);
    try {
      await onAdopt(parsedItem);
      setAdopted(true);
    } finally {
      setAdopting(false);
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] px-3 py-2 rounded-lg text-sm ${
          isUser ? "bg-stone-900 text-stone-50" : "bg-white border border-stone-200 text-stone-800"
        }`}
      >
        <div className="whitespace-pre-wrap leading-relaxed">
          {discussion || (isStreaming && !message.content ? "…" : message.content)}
          {isStreaming && <span className="inline-block w-1.5 h-3 ml-0.5 bg-stone-500 animate-pulse align-text-bottom" />}
        </div>

        {proposal && (
          <div className="mt-2 pt-2 border-t border-stone-200">
            <div className="text-xs font-medium text-stone-700 mb-1">
              {parsedItem ? "✨ 提議的更新內容：" : "⚠️ 提案解析失敗（JSON 格式錯誤）"}
            </div>
            {parsedItem && (
              <>
                <pre className="text-xs bg-stone-50 p-2 rounded overflow-x-auto max-h-40">
                  {JSON.stringify(parsedItem, null, 2)}
                </pre>
                <button
                  type="button"
                  onClick={adopt}
                  disabled={adopting || adopted}
                  className="mt-2 px-3 py-1 bg-emerald-700 text-white rounded text-xs hover:bg-emerald-800 disabled:opacity-50"
                >
                  {adopted ? "✓ 已採用" : adopting ? "採用中…" : "採用為此項目的新內容"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export type { MessageMeta };
