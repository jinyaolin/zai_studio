# zai

個人小說創作、發表與朗讀平台。一個地方寫長 / 中 / 短篇小說、和 zai 模型一起發展情節、然後發表出去讓讀者用讀的或用聽的。

## 功能

- **創作端** `/studio` — 作品列表、章節編輯器（markdown）、記憶管理、與 zai 對話
- **發表端** `/` `/works/*` — 公開閱讀 + TTS 朗讀
- **記憶系統** — 每個作品獨立的角色 / 世界觀 / 情節 / 風格，自動注入 AI 對話
- **AI 對話** — 五種模式：發想、續寫、找矛盾、角色扮演、改寫。串流回應。
- **TTS 朗讀** — 雲端 TTS API、段落級快取、浮動播放器、記住最後位置
- **檔案為真相** — 全部內容存於 `content/works/<slug>/`，SQLite 只是索引

## 快速開始

```bash
# 1. 複製 env
cp .env.example .env
# 編輯 .env：ZAI_API_KEY、TTS_API_KEY、AUTH_PASSWORD、AUTH_COOKIE_SECRET

# 2. 裝依賴
npm install

# 3. （可選）建立示範作品
npm run seed

# 4. 同步 SQLite 索引
npm run db:sync

# 5. 啟動 dev server
npm run dev
```

打開 `http://localhost:3100` → 讀者首頁；`/studio` → 創作端（會要求登入）。

## 環境變數

| 變數 | 用途 |
|---|---|
| `ZAI_BASE_URL` | OpenAI 相容 API 端點 |
| `ZAI_API_KEY` | 該 API 的 key |
| `ZAI_MODEL` | 對話用的模型名 |
| `TTS_BASE_URL` | TTS API 端點 |
| `TTS_API_KEY` | TTS API key |
| `TTS_MODEL` | TTS 模型（預設 `tts-1`） |
| `TTS_VOICE` | 語音（預設 `alloy`） |
| `AUTH_PASSWORD` | `/studio` 登入密碼 |
| `AUTH_COOKIE_SECRET` | cookie 簽名密鑰（用 `openssl rand -base64 32`） |
| `SQLITE_PATH` | SQLite 檔位置（預設 `./data/index.db`） |

## 內容檔案格式

```
content/works/<slug>/
├── work.json              # 作品 metadata
├── chapters/
│   └── 01-<slug>.md       # frontmatter (order/title/status/wordCount/...) + 正文
├── memory/
│   ├── characters.json    # 角色陣列
│   ├── worldbuilding.json # 世界觀條目
│   ├── plot.json          # 情節線
│   └── style.md           # 風格指南（整段放進 system prompt）
└── conversations/
    └── <id>.json          # 對話歷史
```

檔案是 source of truth，可直接用任何編輯器改，再跑 `npm run db:sync` 重建索引。

## 部署

Vercel 之外因為使用了 `better-sqlite3`（原生綁定），需要支援原生模組的平台（Vercel 不行）。建議：

- **最簡單**：自己的 VPS / Mac / NAS，用 `npm run build && npm start`
- **容器化**：寫個 Dockerfile（base image 用 `node:20`，記得裝 build tools）
- **若要部署 Vercel**：把 SQLite 換成 Turso（libSQL），把 `lib/content/db.ts` 改成 libSQL client。檔案儲存則維持本地 + git。

## 開發指令

```bash
npm run dev        # 開發 server
npm run build      # production build
npm run start      # 跑 production build
npm run typecheck  # tsc --noEmit
npm run db:sync    # 掃 content/ → 重建 SQLite 索引
npm run seed       # 建立示範作品「雨夜來客」
```

## 授權

私人使用。
