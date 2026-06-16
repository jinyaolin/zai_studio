# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

zai 是一個**個人**小說創作、發表、朗讀平台。單一作者（這個 repo 的擁有者）寫長 / 中 / 短篇小說、和 zai 模型一起發展情節、發表給公開讀者閱讀（可選 TTS 朗讀）。

兩端完全分離：
- `/studio/*` — 作者工作台（需密碼登入）
- `/`, `/works/*` — 公開發表站

## 核心設計原則（修改任何程式碼前，記得這四條）

1. **檔案為真相、DB 為索引** — 內容用 markdown + JSON 存於 `content/works/<slug>/`；`data/index.db`（SQLite）只是查詢索引，**隨時可從檔案重建**（`syncIndex()` / `npm run db:sync`）。新增欄位時，先加進檔案的 JSON / frontmatter，再加進 DB schema。

2. **Provider 抽象** — `lib/ai/provider.ts` 與 `lib/tts/provider.ts` 各定義介面；env 切換實作。要換 zai 模型、TTS 服務，新增一個 class 即可，不要把業務邏輯跟特定 provider 綁死。

3. **作品孤島原則** — 每個 `content/works/<slug>/` 自給自足（chapters + memory + conversations）。**不要**把跨作品的東西塞進單一作品目錄。

4. **創作端 vs 發表端分離** — 路由、layout、middleware 各自獨立。讀者永遠碰不到未發表的作品（`status !== "published"` 在讀者端會 `notFound()`）。

## 開發指令

```bash
npm run dev        # 開發 server (http://localhost:3100)
npm run build      # production build
npm run typecheck  # tsc --noEmit（沒有測試，typecheck 是主要防線）
npm run db:sync    # 掃 content/works/ → upsert SQLite；刪除孤兒索引列
npm run seed       # 建立示範作品「雨夜來客」
```

在 dev server 跑起來之前，環境變數必須存在（即使是空白）：`cp .env.example .env`。
若只關心創作端不測 AI/TTS，留空 `ZAI_API_KEY` / `TTS_API_KEY` 即可，UI 會顯示「未設定」而不是崩潰。

## 目錄結構（重點層）

```
app/
├── page.tsx                       # 讀者首頁
├── works/
│   ├── page.tsx                   # 已發表作品列表
│   ├── [slug]/page.tsx            # 作品目錄（讀者）
│   └── [slug]/[chapter]/          # 閱讀 + 朗讀（含 AudioPlayer 浮動元件）
├── studio/                        # 創作端（受 middleware 保護）
│   ├── login/                     # 密碼登入頁
│   ├── works/
│   │   ├── new/
│   │   └── [slug]/
│   │       ├── editor/[chapter]/  # 章節編輯器（debounce autosave）
│   │       ├── memory/            # 4 個 tab：角色 / 世界觀 / 情節 / 風格
│   │       └── chat/              # zai 對話（5 種模式、串流）
│   └── settings/                  # 顯示目前 AI/TTS 配置
└── api/
    ├── works/                     # 作品 + 章節 + 記憶 CRUD
    ├── ai/chat/route.ts           # zai 對話串流（NDJSON）
    ├── tts/route.ts               # TTS manifest 產生 + lazy 合成 + 快取
    ├── conversations/             # 對話歷史
    └── auth/                      # login / logout

lib/
├── types.ts                       # 全部共享型別（Work / Chapter / WorkMemory / ...）
├── utils/params.ts                # decodeParam — 動態路由 params 不會自動 decode
├── content/
│   ├── paths.ts                   # 所有檔案路徑的單一來源
│   ├── markdown.ts                # frontmatter parse / serialize / slugify / countWords
│   ├── works.ts                   # 作品 CRUD（含 scaffold 子目錄）
│   ├── chapters.ts                # 章節 CRUD
│   ├── db.ts                      # better-sqlite3 wrapper + 所有 prepared statements
│   └── sync.ts                    # syncIndex() — 檔案→DB 全雙向同步
├── memory/
│   ├── store.ts                   # server-only：readMemory/writeMemory（用 node:fs）
│   ├── id.ts                      # newMemoryId — 純函數，client component 可安全 import
│   ├── retrieve.ts                # 訊息→相關記憶的關鍵字檢索（未來可換成 vector）
│   └── conversations.ts           # 對話歷史讀寫 + DB index 同步
├── ai/
│   ├── provider.ts                # AIProvider 介面 + OpenAI 相容實作（zai）
│   ├── prompts.ts                 # 五種模式（brainstorm/continue/check/roleplay/edit）的系統提示詞
│   └── context.ts                 # 記憶 → system prompt 注入
├── tts/
│   ├── provider.ts                # TTSProvider 介面 + OpenAI TTS + ensureChunk 快取
│   └── chunker.ts                 # markdown → 純文字 → 段落 / 句子分段
└── auth/
    ├── token.ts                   # Web Crypto 實作的 HMAC token（edge 相容，給 middleware 用）
    └── session.ts                 # server-only：cookies() 包裝（route handler / RSC 用）
```

`drizzle/schema.ts` 是型別參考；實際 schema 由 `lib/content/db.ts` 的 `SCHEMA` 字串在 `getDb()` 首次呼叫時建立。改 schema 時兩邊都要改。

## 內容檔案格式（作者會直接編輯這些檔案，格式要穩定）

**`work.json`**
```json
{
  "slug": "雨夜來客",
  "title": "雨夜來客",
  "type": "long" | "medium" | "short",
  "status": "draft" | "published" | "archived",
  "synopsis": "...",
  "genre": "奇幻",
  "tags": ["成長"],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "publishedAt": null | "ISO-8601"
}
```

**`chapters/<NN>-<slug>.md`** — frontmatter + markdown body
```markdown
---
order: 1
title: 第一章 雨夜來客
status: draft
wordCount: 3200
createdAt: "..."
updatedAt: "..."
---

那年梅雨季的某個深夜...
```

**`memory/characters.json` / `worldbuilding.json` / `plot.json`** — 見 `lib/types.ts` 的 `Character` / `WorldEntry` / `PlotThread`。
**`memory/style.md`** — 整段會原樣放進每次對話的 system prompt。

**`versions/<chapterSlug>/<timestamp>.md`** — 章節歷史快照。`applyChapterUpdate()` 在覆寫前自動快照、restore 時也會先快照當前。檔名是 ISO-8601 但 colon 換成 dash（Windows-safe），見 `lib/content/versions.ts`。

**`design-sessions/<id>.json`** — Design Thinking 工作流的 session 狀態。見下方「Design Thinking」段。

## 記憶系統（核心價值，動這塊要小心）

每個作品有 4 個記憶檔。對話時的注入策略在 `lib/ai/context.ts` 的 `preparePrompt()`：
1. `style.md` 永遠全帶
2. `check` 模式：帶入全部 characters / world / plot（找矛盾需要全貌）
3. 其他模式：top-K 語意檢索（embeddings → cosine）；fallback 到關鍵字匹配
4. 最近 N 章節摘要：尚未實作（hook 點在 `preparePrompt`）

對話模式定義在 `lib/ai/chat-modes.ts` 的 `CHAT_MODES`（client-safe；`prompts.ts` 再 re-export 給 server 用）。每個模式有：label / hint / systemPrefix / temperature。要新增模式，加進這個 map 即可（記得同步改 `lib/types.ts` 的 `ChatMode` 與 `app/api/ai/chat/route.ts` 的 zod enum）。

目前 6 種模式：`brainstorm` / `continue` / `check` / `roleplay` / `edit` / `research`（田野調查，傾向輸出具體可考據的歷史 / 地理 / 工藝資料）。

### 對話 → 記憶（chat 的「總結進記憶」）

聊天室側邊欄有「🧠 總結進記憶」按鈕。點下後：
1. 拿現在 conversation 的所有訊息 + 現有記憶
2. POST `/api/works/<slug>/memory/extract-from-conversation`（串流）
3. AI 把討論中確定的東西整理成完整新記憶 JSON，包在 `<PROPOSAL>...</PROPOSAL>`
4. 開 `MemorySyncModal` 顯示變更摘要、作者採用

`MemorySyncModal`（`app/studio/works/<slug>/design/[chapter]/MemorySyncModal.tsx`）是共用的，依 `source` prop 切換資料來源：
- `{ kind: "chapter", chapterSlug }` → chapter commit / 編輯器「🧠 同步記憶」
- `{ kind: "conversation", conversationId }` → chat「總結進記憶」

提示詞模板在 `lib/ai/memory-extract.ts`（chapter 版）與 `app/api/works/<slug>/memory/extract-from-conversation/route.ts`（conversation 版，inline）。兩者規則一致：保守新增、不刪既有、保留 id、風格只 append。

### Vector 檢索（embedding-based）

`content/works/<slug>/memory/vectors.json` 存每個記憶項目的向量，讓 prompt 不必每次塞整份記憶。

- **Provider 抽象**（`lib/ai/embeddings.ts`）：
  - `ZAI_EMBEDDING_MODEL` env 有設 → 用 z.ai embedding API（需付費餘額）
  - 沒設 → fallback 到純 JS 中文 bigram TF-IDF（無 API、即時、對短項目夠用）
- **Vector store**（`lib/memory/vectors.ts`）：
  - JSON 檔案儲存，每個 entry 帶原始 text（用來判斷是否需要 re-embed）
  - `syncVectors()` 在 `writeMemory()` 後自動呼叫——只 re-embed 改過的項目
  - `retrieveByQuery()` 做 cosine top-K；`findNearestItem()` 找單一最近鄰（給 update detection 用）
- **手動重建**：`npm run vectors:sync` 掃所有作品、重建 vectors.json（切換 provider 後必跑）
- **改 provider 後**：vectors.json 的 `provider` 欄位會不符，`syncVectors` 會自動 re-embed 全部

注意：純 JS fallback 是 sparse vector（dimension 因 batch 而異），不能跨請求重用。但同一請求內 cosine 是合法的。ZAI provider 是固定 dimension（如 embedding-3 的 2048d），可永久儲存與重用。

## Conversation Scope（記憶 / 章節 / 設計 的子對話）

每個 Conversation 帶一個 `scope` 決定它附著在哪裡（見 `lib/types.ts` 的 `ConversationScope`）：

- `{ kind: "general" }` — 通用對話（chat 頁）
- `{ kind: "memory", memoryKind, itemId }` — 記憶項目討論（卡片內展開）
- `{ kind: "chapter", chapterSlug }` — 章節討論（編輯器抽屜）
- `{ kind: "design", sessionId }` — Design Thinking session 的子對話

`/api/ai/chat` 接受 `scope` 欄位。`lib/ai/context.ts` 的 `preparePrompt` 依 scope 路由：
- `memory` scope → `buildMemoryItemSystemPrompt`（注入該項目 JSON）
- `chapter` scope → `buildChapterSystemPrompt`（注入整章 markdown）
- 其他 → 原本行為

`scope=memory` 或 `chapter` 時，server 找同 scope 的現有 conversation 接續（不是每次都建新的）；見 `app/api/ai/chat/route.ts`。

### PROPOSAL 協議

當 zai 覺得討論收斂到具體變更，要在回應中輸出 `<PROPOSAL>...</PROPOSAL>` 包住**完整的更新後內容**：
- memory scope → PROPOSAL 內是該項目的完整 JSON
- chapter scope → PROPOSAL 內是整章的完整 markdown（不是 diff）

`extractProposal()` (`lib/ai/prompts.ts`) 把訊息拆成 `{ proposal, discussion }`。前端「採用」按鈕呼叫對應 API 寫回檔案。這個 tag 的契約在 system prompt 裡寫死，要改協議記得同步改 prompts 與前端。

## 章節版本快照

`lib/content/chapters.ts` 提供 4 個函式：
- `saveVersion(workSlug, chapterSlug, reason)` — 把當前 chapter 複製到 `versions/<chapterSlug>/<timestamp>.md`，frontmatter 多 `archivedAt` / `archiveReason`
- `applyChapterUpdate(workSlug, chapterSlug, patch, reason)` — 先 saveVersion 再 updateChapter
- `listVersions` / `readVersionContent` / `restoreVersion`

**重要**：任何會破壞章節內容的寫入路徑都要走 `applyChapterUpdate` 而不是 `updateChapter`，否則舊版會永久遺失。目前走 applyUpdate 路徑的：
- Chapter discussion 的「採用」→ `/api/works/[slug]/chapters/[chapter]/apply-update`
- Design session 的 commit → `/api/works/[slug]/design/[sessionId]/commit`
- VersionHistory 的還原 → `/api/works/[slug]/chapters/[chapter]/restore`（restore 自己也會先快照當前版）

`reason` 值：`"manual"` / `"ai-edit"` / `"chapter-chat"` / `"design"` / `"restore"`，前端 VersionHistory 會依此 label。

### 章節 slug 跟標題連動（rule: 作品 draft 才 rename）

當章節標題被改，且**該作品的 status === "draft"** 時，`updateChapter` 會：
1. 重算 slug（`slugifyChapter(order, newTitle)`）
2. 若新 slug 跟其他章衝突，加 `-2`、`-3` suffix
3. Rename 檔案、`versions/` 目錄、`vectors.json` 內的 chapter key、DB row PK
4. 回 `{ ...chapter, renamedTo: newSlug }`

PATCH API 回 `{ chapter, renamedTo }`；ChapterEditor 收到非 null `renamedTo` 就 `router.replace()` 到新 URL。

**規則看「作品狀態」不是「章節狀態」**——URL 公開的時間點是作品 published 那刻。作品 published 後，即使章節是 draft，URL 已曝光不能改；作品 draft 時，即使章節是 final，URL 從未曝光改了安全。要改已 published 作品的章節 URL：把作品切回 draft → 改章節 → 重新 publish。

復原機制：rename 走 `fs.rename`（atomic on same filesystem）+ DB transaction-style「先 read old → delete → insert new」。失敗會 log 但不阻塞主流程。

### 作品 slug 跟標題連動（rule: 作品 draft 才 rename）

作品標題編輯入口：作品總覽頁（`/studio/works/<slug>`）標題列直接改。

`updateWork` 偵測 title 變 + 該作品 status=draft → `renameWorkDir`：
1. Rename 整個 `content/works/<oldSlug>/` 目錄（檔案、記憶、對話、向量、design sessions 全帶走）
2. DB cascade transaction：`works` PK、`chapters.work_slug`、`conversations.work_slug`、`chapters_fts.work_slug`（FTS5 不支援 UPDATE，所以是 copy-then-delete）
3. 回 `{ ...work, renamedTo }`；前端 `WorkTitleEditor` 收到非 null 後 `router.replace()` 到新 URL

Published / archived 一樣鎖住。

## 跨章節 Context（避免不連戲）

zai 寫 / 改任一章時，必須看得到前後章節，否則不同章會彼此矛盾。兩層做法：

**1. 鄰接章節（全文）**
- `getAdjacentChapters(workSlug, chapterSlug)` 回 `{ previous, next, currentIndex }`（`lib/content/chapters.ts`）
- `buildChapterSystemPrompt`（chapter-scope chat）會把前一章、後一章的完整 markdown 注入 system prompt
- `buildStagePrompt`（Design Thinking）在 Stage 4（draft）注入前一章
- Fresh chapter（Design mode=`fresh`）也會帶「目前最後一章」當 previous

**2. 章節向量檢索（相關片段）**
處理長篇：第 1~N-1 章不可能全部全文塞 prompt，但訊息可能跟其中某段語意相關。

- 章節按段落 chunk（`lib/memory/chunker.ts`：strip markdown → 段落 → 必要時按句號細分，每 chunk ≤ 400 字）
- 每 chunk 獨立 embed，存於 `vectors.json` 的 `chapters.<slug>.chunks[]`
- `syncChapterVectors(workSlug, slug, title, content)` — 在 `createChapter` / `updateChapter` / `applyChapterUpdate` / `restoreVersion` 後自動呼叫
- `retrieveChapterChunks(workSlug, query, { excludeChapter, topK })` — query 用本次創作目標或最新訊息
- Design Stage 4 注入 top-4 chunk；chapter-scope chat 也注入 top-4（排除鄰章避免重複）
- `removeChapterVectors` 在 `deleteChapter` 時清掉
- `npm run vectors:sync` 會掃所有作品 + 所有章節重建

## Design Thinking 工作流

4-stage 結構化創作 session，存於 `content/works/<slug>/design-sessions/<id>.json`：

| Stage | 目的 | 收/發 |
|---|---|---|
| 1. directions | 列 3-5 個方向 | 發散 |
| 2. intent | 寫章節意圖聲明 | 收斂 |
| 3. details | 對話 / 意象 / 伏筆 / 節奏 / 感官 | 發散 |
| 4. draft | 寫整章正文 | 收斂 |

- 模型：`lib/design/session.ts`（read/write/updateStage/findOpenSessionForChapter/deleteSession）；提示詞：`lib/design/prompt.ts`
- **每階段可 Skip**。Skip 時可寫一段註解當作下階段的 context。如果 1-3 全跳過，Stage 4 直接從 goal + 記憶 + 前一章產出。
- **每階段可 Edit**。AI 生成後作者可改，再「採用並進下一步」鎖定為該 stage 的 `acceptedOutput`。
- **Context 流向**：每個 stage 的 system prompt 都會附上前面 stages 的 acceptedOutput（跳過的不附），見 `buildStagePrompt`。
- **Session 持續性**：離開頁面再回來，server 端 `findOpenSessionForChapter` 找該章節最近一個 `committed: false` 的 session 自動接續。要清除：按「↺ 重新設計思考」會 `DELETE /api/works/<slug>/design/<sessionId>` 並用 `?fresh=1` 重整。（全新章節 session 不接續——每次造訪都是新的意圖。）
- **背景 auto-continue**：按「⚡ 自動跑完全部」→ `POST /api/works/<slug>/design/[sessionId]/auto-continue` 立即回 200，server 端 fire-and-forget 跑完所有 pending stage（每個 stage auto-accept 為 acceptedOutput）。session 帶 `autoStatus: "running"|"done"|"failed"` + `autoStartedAt`。前端 polling `GET /auto-continue` 每 5s 更新。`lib/design/generate.ts: generateStage()` 是共用邏輯，manual 與 auto-continue 都用它。
  - **過時處理**：頁面 server-side load 時，若 `autoStatus="running"` 且 `autoStartedAt` 超過 10 分鐘，自動標為 `failed`（server 重啟會中斷背景工作）。
  - **限制**：fire-and-forget 在 self-hosted Node Next.js 可行；Vercel 等無狀態平台會在 response 後終止。
- **Commit**：把 Stage 4 的 acceptedOutput 寫進 chapter。`session.chapterSlug` 有值 → `applyChapterUpdate`（快照舊版）；為 null → `createChapter` 建新章節。
- **Stage 4 同時輸出 memory patch**：draft 的 prompt 要求正文寫完後接著輸出 `<MEMORY_PATCH>{diff json}</MEMORY_PATCH>`——只列**這章實際造成變更**的條目（`addX` / `updateX` by id / `removeX` / `styleAppend`）。commit 時同時套用 prose + patch，**省掉事後再跑 extract-memory 的一整輪 AI 呼叫**。作者可以在 commit 前選「只採用章節，略過記憶修正」。
  - 解析：`splitDraftAndPatch` + `parseMemoryPatchRaw`（`lib/ai/proposal.ts`）
  - 套用：`applyPatch`（`app/api/works/[slug]/design/[sessionId]/commit/route.ts`），對未知 id 的 update 會自動忽略、無效 status fallback
  - 空 patch（`{}`）視為「這章沒有觸發記憶修正」，commit 不顯示 patch 區塊
- **Commit 後同步記憶（舊路徑，仍有用）**：手動在編輯器點「🧠 同步記憶」會走 `/api/works/[slug]/chapters/[chapter]/extract-memory`——給非 Design Thinking 流程（例如自己手寫、或 chapter discussion 改寫後）補擷取記憶。提示詞在 `lib/ai/memory-extract.ts`。

UI 入口：
- 作品總覽有「✨ 深度創作」按鈕 → `/studio/works/<slug>/design/new`（全新章節）
- 章節編輯器右上角「✨ 深度創作」→ `/studio/works/<slug>/design/<chapter>`（續寫 / 重寫既有章節）
- 章節編輯器「🧠 同步記憶」→ 手動觸發同一個記憶提取流程（不經過 Design）

## Provider 切換

- **AI**：實作一個 `AIProvider`（見 `lib/ai/provider.ts`），改 `getProvider()` 回傳它。
- **TTS**：三個 provider，用 `TTS_PROVIDER` env 切換：
  - `cosyvoice` — 開源 CosyVoice 3（最強中文），需 Python server 在 `~/dev/CosyVoice/server.py`（port 9880）。zero-shot voice cloning，WAV→MP3 自動轉檔（需 ffmpeg）。每段 ~0.36s/字（MPS）。
  - `edge` — 免費 Azure 引擎（快、品質中上）。prosody 強化 + 可選 dialogue voice。
  - `openai` — OpenAI TTS API。

### CosyVoice 3 整合

| 元件 | 位置 |
|---|---|
| Python inference server | `~/dev/CosyVoice/server.py`（port 9880, MPS） |
| Node provider | `lib/tts/cosyvoice.ts`（HTTP client + WAV→MP3） |
| 預生成 | `POST /api/tts/prefetch`（背景合成整章） |
| 編輯器按鈕 | ChapterEditor「🔊 預生成朗讀」 |

**啟動**：CosyVoice server 跟 zai dev server 要同時跑。model 載入 ~8s（warm），合成 ~0.36s/字。

**Voice cloning**：丟 5-30 秒聲音樣本到 `COSYVOICE_PROMPT_WAV` path，設 `COSYVOICE_PROMPT_TEXT` 為對應文字稿，重啟 server.py。

**Instruct 模式**：`COSYVOICE_INSTRUCT` env 可全域設定朗讀風格（如「請用說書人的語氣朗讀」），每段 inference 走 `inference_instruct2`。

### z.ai (Zhipu GLM) 端點提醒

z.ai 有兩條 OpenAI 相容端點，**key 通用但計費與可用模型不同**：

| 端點 | 用途 |
|---|---|
| `https://api.z.ai/api/paas/v4` | 標準 API（pay-as-you-go，付費模型需餘額） |
| `https://api.z.ai/api/coding/paas/v4` | **GLM Coding Plan** 訂閱（GLM-5.2、GLM-5-Turbo 等 code plan 模型） |

如果 key 是 code plan 的，`ZAI_BASE_URL` 必須用後者，否則付費模型會回 `1113 Insufficient balance`。
另外 `https://open.bigmodel.cn/api/paas/v4` 是中國境內對應端點（同 key、同帳號）。

GLM-5.x 預設會輸出 `reasoning_content`（思考過程），OpenAI SDK 的 `delta.content` 只會收到最終答案——串流時會感覺「卡住一下」其實是模型在思考，不是壞掉。

### Thinking 開關（任務分流）

GLM-5.x 接受 `thinking: { type: "disabled" }` 參數跳過 reasoning，TTFT 從 10+s 降到 ~1.5s。但複雜創作會傷品質，所以走 per-call 政策（`lib/ai/thinking-policy.ts`）：

| 任務 | disableThinking | 理由 |
|---|---|---|
| Chat: brainstorm / roleplay / research | `true` | 發散對話，不需深推理 |
| Chat: check / edit / continue | `false` | 找矛盾 / 改寫 / 續寫正文需要分析與規劃 |
| Memory item discussion | `true` | 圍繞單一項目的對話 |
| Chapter scope chat | `false` | 可能輸出整章 PROPOSAL |
| Design Stage 1 (directions) | `true` |發散探索 |
| Design Stage 2 (intent) | `true` | 短摘要，快就好 |
| Design Stage 3 (details) | `true` | 發散設計 |
| Design Stage 4 (draft) | `false` | 寫整章正文，需要規劃 |
| Memory extraction (chapter / conversation) | `false` | 結構化分析（什麼是新增、什麼是更新） |

Env `ZAI_DISABLE_THINKING` 是全域 default；per-call `disableThinking` option 覆寫它。要全部關就設 `ZAI_DISABLE_THINKING=true`，要走政策就設 `false`（預設）。

## 動態路由 params 不會自動 URL-decode

Next.js 14 App Router 對非 ASCII 動態段（如 `雨夜來客`）**不會**自動 decode `params`。所有 page handler 與 API route handler 必須用 `decodeParam(params.slug)`（`lib/utils/params.ts`）。若新加路由，記得套上。

## 客戶端元件不能 import `lib/memory/store.ts`

`store.ts` 匯入 `node:fs`，webpack 不會處理。client component 需要產 ID 時改匯 `lib/memory/id.ts`（純函數）。後續若新增含 `node:*` import 的 helper，遵循同樣原則：拆出 client-safe 的小檔。

## 同步邏輯（修改檔案格式或 schema 時要更新）

- `lib/content/sync.ts` 的 `syncIndex()` 掃 `content/works/`，把每個 work + 它的 chapters upsert 進 DB，並刪除 DB 中檔案已不存在的列。
- `syncWork(slug)` 是單作品版本，所有寫入 API（`/api/works/*`）都會在寫完檔案後呼叫它。
- FTS5 虛擬表 (`chapters_fts`) 不支援 UPSERT，所以在 `lib/content/db.ts` 的 `upsertChapterFts` 用 delete-then-insert。

## 部署注意

`better-sqlite3` 是原生綁定，**Vercel 等無狀態平台不能用**。選項：
- 自架（VPS / Mac / NAS）→ `npm run build && npm start`
- 容器化（Dockerfile，`node:20` base + build-essential）
- 改用 Turso（libSQL）→ 替換 `lib/content/db.ts` 為 libSQL client

`data/` 與 `public/audio/` 都 gitignore。前者可重建，後者是 TTS 快取（可重產）。

## 常見任務指引

- **新增章節欄位**：改 `lib/types.ts` 的 `Chapter` → 改 `lib/content/markdown.ts` 的 `ChapterFrontmatter` 與 `serializeChapter` → 改 `app/api/works/[slug]/chapters/route.ts` 的 zod schema → 改 chapter editor UI。
- **新增記憶檔**：加進 `WorkMemory` type → 加 `lib/memory/store.ts` 的 read/write helper → 加進 `lib/memory/retrieve.ts` 的注入邏輯 → 加進 memory editor UI 的 tab。
- **加新 AI provider**：實作 `AIProvider` → 在 `getProvider()` 加 switch。
- **加新對話模式**：加進 `ChatMode` type → 加進 `lib/ai/prompts.ts` 的 `CHAT_MODES` → chat UI 的模式選擇器自動包含。
- **改 TTS 語速選項**：`app/works/[slug]/[chapter]/ReaderChapter.tsx` 的 `<select>`。
