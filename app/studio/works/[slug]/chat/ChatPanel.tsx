"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatMode, WorkMemory } from "@/lib/types";
import { CHAT_MODES } from "@/lib/ai/chat-modes";
import MemorySyncModal from "../design/[chapter]/MemorySyncModal";

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export default function ChatPanel({
  workSlug,
  initialConversations,
}: {
  workSlug: string;
  initialConversations: ConversationSummary[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<ChatMode>("brainstorm");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [loadingConv, setLoadingConv] = useState(false);
  const [syncTarget, setSyncTarget] = useState<{ conversationId: string; memory: WorkMemory } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Ref mirror of streamingText so the send() closure can read the final value
  // without nesting state updates (which React StrictMode would double-invoke).
  const streamingTextRef = useRef("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  async function loadConversation(id: string) {
    setLoadingConv(true);
    setActiveId(id);
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(workSlug)}?id=${encodeURIComponent(id)}`,
    );
    if (res.ok) {
      const { conversation } = await res.json();
      setMessages(conversation.messages);
      if (conversation.messages.length > 0) {
        const lastMode = [...conversation.messages].reverse().find((m: ChatMessage) => m.mode)?.mode;
        if (lastMode) setMode(lastMode);
      }
    }
    setLoadingConv(false);
  }

  function newConversation() {
    setActiveId(null);
    setMessages([]);
    setStreamingText("");
    streamingTextRef.current = "";
    inputRef.current?.focus();
  }

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
    setStreamingText("");
    streamingTextRef.current = "";

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workSlug,
        conversationId: activeId,
        mode,
        message: text,
      }),
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "（連線失敗，請檢查 AI 設定）",
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantId: string | null = null;
    let convId: string | null = activeId;

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
              streamingTextRef.current += evt.text;
              setStreamingText(streamingTextRef.current);
            } else if (evt.type === "done") {
              assistantId = evt.messageId;
            } else if (evt.type === "error") {
              streamingTextRef.current += `\n\n[錯誤] ${evt.error}`;
              setStreamingText(streamingTextRef.current);
            }
          } catch {
            // ignore partial
          }
        }
      }
    } finally {
      setStreaming(false);
      // Commit the accumulated streaming text as a real message — read from
      // the ref (not state) to avoid stale closure and to keep this side-effect
      // out of a state updater (StrictMode would otherwise double it).
      const finalText = streamingTextRef.current;
      streamingTextRef.current = "";
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
      // If this was a new conversation, refresh sidebar
      if (convId && convId !== activeId) {
        setActiveId(convId);
        const listRes = await fetch(`/api/conversations/${encodeURIComponent(workSlug)}`);
        if (listRes.ok) {
          const { conversations: fresh } = await listRes.json();
          setConversations(fresh);
        }
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  const spec = CHAT_MODES[mode];

  async function summarizeToMemory() {
    if (!activeId || messages.length === 0) return;
    const res = await fetch(`/api/works/${encodeURIComponent(workSlug)}/memory`);
    if (!res.ok) return;
    const { memory } = await res.json();
    setSyncTarget({ conversationId: activeId, memory });
  }

  return (
    <div className="grid grid-cols-[200px_1fr] gap-6 h-[calc(100vh-12rem)]">
      {/* Sidebar: conversations */}
      <aside className="border-r border-stone-200 pr-4 overflow-y-auto">
        <button
          onClick={newConversation}
          className="w-full mb-2 px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-100"
        >
          ＋ 新對話
        </button>
        <button
          onClick={summarizeToMemory}
          disabled={!activeId || messages.length === 0}
          className="w-full mb-3 px-3 py-1.5 text-sm border border-emerald-300 bg-emerald-50 text-emerald-900 rounded hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title="把這段對話討論到的東西整理進記憶"
        >
          🧠 總結進記憶
        </button>
        {loadingConv && <p className="text-xs text-stone-400 px-1">載入中…</p>}
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => loadConversation(c.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${
                  activeId === c.id
                    ? "bg-stone-900 text-stone-50"
                    : "hover:bg-stone-200 text-stone-700"
                }`}
                title={c.title}
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main column */}
      <div className="flex flex-col min-h-0">
        {/* Mode picker */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(Object.keys(CHAT_MODES) as ChatMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-sm transition ${
                mode === m
                  ? "bg-stone-900 text-stone-50"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
              title={CHAT_MODES[m].hint}
            >
              {CHAT_MODES[m].label}
            </button>
          ))}
          <span className="self-center text-xs text-stone-400 ml-2">{spec.hint}</span>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-white border border-stone-200 rounded-md p-6 space-y-4"
        >
          {messages.length === 0 && !streaming && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <p className="font-serif text-xl text-stone-700">{spec.label}模式</p>
                <p className="text-sm text-stone-500 mt-1">{spec.hint}</p>
                <p className="text-xs text-stone-400 mt-4">
                  記憶（角色、世界觀、情節、風格）會自動注入這次對話。
                </p>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
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
            />
          )}
        </div>

        {/* Composer */}
        <form onSubmit={send} className="mt-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder={`以「${spec.label}」模式提問…  (⌘/Ctrl+Enter 送出)`}
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 font-serif text-base leading-relaxed"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-stone-400">{input.length} 字</span>
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="px-5 py-1.5 bg-stone-900 text-stone-50 rounded-md text-sm hover:bg-stone-800 disabled:opacity-40"
            >
              {streaming ? "回應中…" : "送出"}
            </button>
          </div>
        </form>
      </div>

      {syncTarget && (
        <MemorySyncModal
          workSlug={workSlug}
          source={{ kind: "conversation", conversationId: syncTarget.conversationId }}
          currentMemory={syncTarget.memory}
          title="🧠 把這段對話總結進記憶…"
          onClose={() => setSyncTarget(null)}
          onApplied={() => {
            // Memory updated server-side; modal stays open showing "已同步".
          }}
        />
      )}
    </div>
  );
}

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-4 py-2.5 rounded-lg ${
          isUser
            ? "bg-stone-900 text-stone-50"
            : "bg-stone-100 text-stone-800"
        }`}
      >
        <div className="whitespace-pre-wrap font-serif text-base leading-relaxed">
          {message.content}
          {isStreaming && <span className="inline-block w-2 h-4 ml-0.5 bg-stone-500 animate-pulse align-text-bottom" />}
        </div>
      </div>
    </div>
  );
}
