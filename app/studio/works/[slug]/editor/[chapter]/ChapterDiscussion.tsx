"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatMode } from "@/lib/types";
import { extractProposal } from "@/lib/ai/proposal";
import { countWords } from "@/lib/content/markdown";
import { formatWordCount } from "@/lib/utils";

interface Props {
  workSlug: string;
  chapterSlug: string;
  onAdopt: (newContent: string, reason?: string) => Promise<void>;
}

export default function ChapterDiscussion({ workSlug, chapterSlug, onAdopt }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("edit");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const streamingRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

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
      mode,
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
        mode,
        message: text,
        scope: { kind: "chapter", chapterSlug },
      }),
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
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
            mode,
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
    <div className="flex flex-col h-full">
      <div className="flex gap-1 mb-3 flex-wrap">
        {(["edit", "continue", "brainstorm", "check"] as ChatMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-2 py-0.5 rounded text-xs ${
              mode === m ? "bg-stone-900 text-stone-50" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}
          >
            {m === "edit" ? "改寫" : m === "continue" ? "續寫" : m === "brainstorm" ? "討論" : "檢查"}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-stone-50 border border-stone-200 rounded-md p-3 space-y-3 min-h-[300px]"
      >
        {messages.length === 0 && !streaming && (
          <p className="text-xs text-stone-400 text-center mt-12">
            告訴 zai 你想怎麼改這章。例：「開頭三段太急，把節奏放慢」「這裡的對話不像沈墨會說的話」。
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onAdopt={onAdopt} />
        ))}
        {streaming && (
          <MessageBubble
            message={{
              id: "streaming",
              role: "assistant",
              content: streamingText,
              mode,
              createdAt: new Date().toISOString(),
            }}
            isStreaming
            onAdopt={onAdopt}
          />
        )}
      </div>

      <form onSubmit={send} className="mt-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="你的指示…  (⌘/Ctrl+Enter 送出)"
          className="w-full px-3 py-2 bg-white border border-stone-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <div className="flex justify-end mt-1">
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="px-4 py-1.5 bg-stone-900 text-stone-50 rounded text-sm hover:bg-stone-800 disabled:opacity-40"
          >
            {streaming ? "回應中…" : "送出"}
          </button>
        </div>
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
  onAdopt: (newContent: string, reason?: string) => Promise<void>;
}) {
  const isUser = message.role === "user";
  const { proposal, discussion } = extractProposal(message.content);
  const [adopting, setAdopting] = useState(false);
  const [adopted, setAdopted] = useState(false);

  async function adopt() {
    if (!proposal) return;
    setAdopting(true);
    try {
      await onAdopt(proposal, "chapter-chat");
      setAdopted(true);
    } finally {
      setAdopting(false);
    }
  }

  const proposalWordCount = proposal ? countWords(proposal) : 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[95%] px-3 py-2 rounded-lg text-sm ${
          isUser ? "bg-stone-900 text-stone-50" : "bg-white border border-stone-200 text-stone-800"
        }`}
      >
        <div className="whitespace-pre-wrap leading-relaxed">
          {discussion || (isStreaming && !message.content ? "思考中…" : message.content)}
          {isStreaming && <span className="inline-block w-1.5 h-3 ml-0.5 bg-stone-500 animate-pulse align-text-bottom" />}
        </div>

        {proposal && (
          <div className="mt-2 pt-2 border-t border-stone-200">
            <div className="text-xs font-medium text-stone-700 mb-1">
              ✨ 改寫後的整章（{formatWordCount(proposalWordCount)}）：
            </div>
            <pre className="text-xs bg-stone-50 p-2 rounded overflow-auto max-h-60 font-serif whitespace-pre-wrap">
              {proposal.slice(0, 600)}
              {proposal.length > 600 ? "\n…（點採用看完整）" : ""}
            </pre>
            <button
              type="button"
              onClick={adopt}
              disabled={adopting || adopted}
              className="mt-2 px-3 py-1 bg-emerald-700 text-white rounded text-xs hover:bg-emerald-800 disabled:opacity-50"
            >
              {adopted ? "✓ 已採用為新版本" : adopting ? "採用中…" : "採用為新版本（自動備份舊版）"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
