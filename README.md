# zai

多使用者小說創作、發表與朗讀平台。用 Google 帳號註冊、每人有自己的作品 / 記憶 / 對話空間，AI 創作輔助走 server 統一的 z.ai GLM key。

## 功能

- **多使用者** — Google OAuth 註冊 + 登入，每人一個 handle 跟自己的內容 namespace
- **創作端** `/studio/*` — 作品、章節、記憶、對話、Design Thinking 工作流，全部 per-user 隔離
- **發表端** `/works/<handle>/<slug>` — 公開閱讀，多作者陳列
- **記憶系統** — 每個作品獨立的角色 / 世界觀 / 情節 / 風格 + 向量檢索
- **AI 對話** — 六種模式：brainstorm / continue / check / roleplay / edit / research。串流回應。
- **Design Thinking** — 4 階段（發散→收斂→細節→草稿）結構化創作 + 背景 auto-continue
- **章節版本快照** — 任何破壞性寫入（AI 改寫、Design commit、還原）前自動快照
- **TTS 朗讀** — CosyVoice 3（zero-shot voice cloning）/ Edge / OpenAI 三 provider；per-user 快取
- **段落式編輯器** — 每段獨立編輯 + 行內 TTS 播放

## 系統需求

- **Node.js 20+**
- **npm 10+**
- **ffmpeg**（TTS WAV→MP3 轉檔用；CosyVoice provider 必須）
- macOS / Linux（Windows 沒測過，理論可行但 better-sqlite3 需 build tools）

## 安裝

### 1. Clone + 裝依賴

```bash
git clone https://github.com/jinyaolin/zai_studio.git
cd zai_studio
npm install
```

### 2. 產 secrets 並寫進 .env

```bash
cp .env.example .env

# 產兩個 secrets
openssl rand -hex 32  # 貼到 .env 的 AUTH_SECRET（加密 OAuth tokens 用）
openssl rand -hex 32  # 貼到 .env 的 AUTH_COOKIE_SECRET（簽 session cookie 用）
```

### 3. 設 z.ai API key（AI 創作功能用）

到 https://z.ai/ 註冊 + 拿 API key。code plan 跟標準 plan 的 base URL 不同：

| 帳號類型 | `ZAI_BASE_URL` |
|---|---|
| Code Plan 訂閱 | `https://api.z.ai/api/coding/paas/v4` |
| Pay-as-you-go | `https://api.z.ai/api/paas/v4` |

填進 `.env`：
```
ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
ZAI_API_KEY=<你的 key>
ZAI_MODEL=glm-5.1
```

### 4. 設 Google OAuth（使用者註冊用）

每個使用者用 Google 帳號註冊，需要 OAuth Client。

1. 開 https://console.cloud.google.com/ → 建 project
2. **APIs & Services → Library** → 搜尋 `Generative Language API` → Enable
3. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create
   - 填 App name（例如 `zai`）、support email、developer email
   - Scopes 頁：加 `userinfo.email` + `userinfo.profile`（不需要 `generative-language.retriever`，目前 AI 走 z.ai）
   - Test users 頁：加你自己 + 測試帳號（consent screen 在 Testing 模式時必須）
4. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs:
     - 開發：`http://localhost:3100/api/auth/google/callback`
     - 產品：你的 domain + 同路徑
   - 建立後複製 Client ID + Secret
5. 填進 `.env`：
   ```
   GOOGLE_CLIENT_ID=<貼上>
   GOOGLE_CLIENT_SECRET=<貼上>
   GOOGLE_REDIRECT_URI=http://localhost:3100/api/auth/google/callback
   ```

### 5. 啟動

```bash
npm run dev
```

打開 http://localhost:3100 → 應該看到首頁。

## 第一次使用

1. 開 http://localhost:3100/studio/login
2. 按「用 Google 帳號登入」→ 跳 Google 同意畫面 → 同意
3. 第一次登入會跳到 `/studio/welcome` 選 handle（例如 `alice`）→ 確認
4. 進 `/studio` → 應該看到空作品列表
5. 「＋ 新作品」→ 建作品 → 寫章節 → 試 chat / Design Thinking
6. 切換作品 status 到「published」→ 開 `/works/alice/<work-slug>` 公開閱讀

## 可選：CosyVoice TTS server

CosyVoice 3 是開源中文 TTS（zero-shot voice cloning）。要用的話：

```bash
# 在另一個目錄（zai repo 外）
git clone https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# 下載 model（看 CosyVoice README）
python server.py  # 跑在 port 9880
```

在 `.env` 設：
```
TTS_PROVIDER=cosyvoice
COSYVOICE_BASE_URL=http://127.0.0.1:9880
```

加新聲音樣本：放 `<name>.wav` + `<name>.txt` 到 `~/dev/CosyVoice/voices/`，重整「朗讀設定」就出現。

不用 CosyVoice 也可以：`TTS_PROVIDER=edge`（免費 Azure 引擎）。

## 環境變數一覽

| 類別 | 變數 | 用途 |
|---|---|---|
| **AI** | `ZAI_BASE_URL` | z.ai OpenAI 相容端點 |
|  | `ZAI_API_KEY` | z.ai API key |
|  | `ZAI_MODEL` | 模型（建議 `glm-5.1`） |
|  | `ZAI_DISABLE_THINKING` | `true` 關 reasoning（快但品質降） |
| **Auth** | `AUTH_SECRET` | OAuth token 加密金鑰 |
|  | `AUTH_COOKIE_SECRET` | session cookie 簽名金鑰 |
|  | `GOOGLE_CLIENT_ID` | OAuth Client ID |
|  | `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |
|  | `GOOGLE_REDIRECT_URI` | OAuth 回呼 URL |
| **TTS** | `TTS_PROVIDER` | `cosyvoice` / `edge` / `openai` |
|  | `TTS_VOICE` | 預設語音（provider 而定） |
|  | `COSYVOICE_BASE_URL` | CosyVoice server URL |
|  | `COSYVOICE_SPEED` | 語速（0.5–2.0） |
| **DB** | `SQLITE_PATH` | SQLite 檔位置（預設 `./data/index.db`） |

## 內容檔案格式

每個使用者的內容在 `content/users/<userId>/works/<slug>/`：

```
content/users/<userId>/works/<slug>/
├── work.json              # 作品 metadata + narration 設定
├── chapters/
│   └── 01-<slug>.md       # frontmatter + markdown 正文
├── memory/
│   ├── characters.json    # 角色陣列
│   ├── worldbuilding.json # 世界觀條目
│   ├── plot.json          # 情節線
│   ├── style.md           # 風格指南
│   └── vectors.json       # 向量索引（自動維護）
├── conversations/
│   └── <id>.json          # 對話歷史
├── versions/
│   └── <chapterSlug>/
│       └── <timestamp>.md # 章節歷史快照
└── design-sessions/
    └── <id>.json          # Design Thinking session
```

加密的 Google OAuth tokens 在 `data/users/<userId>/google-tokens.json`（如有連線）。

## 開發指令

```bash
npm run dev        # 開發 server（port 3100）
npm run build      # production build
npm run start      # 跑 production build
npm run typecheck  # tsc --noEmit（沒測試，這是主要防線）
npm run db:sync    # 掃 content/users/ → 重建 SQLite 索引
npm run vectors:sync  # 重建所有向量索引
npm run voices:gen    # 生成 CosyVoice voice 樣本（從 Edge TTS）
```

## 部署

`better-sqlite3` 是原生綁定，**Vercel 等無狀態平台不能用**。選項：

- **自架**（VPS / Mac / NAS）→ `npm run build && npm start`
- **Docker**：寫 Dockerfile（`node:20` base + build-essential）
- **改 Turso**（libSQL）：替換 `lib/content/db.ts` 為 libSQL client

OAuth redirect URI 要在 Google Cloud Console 加上產品 domain 的對應路徑。

## 已知限制

- **公開讀者端 TTS 关閉**：TTS API 需 auth，沒做 rate-limited 公開版（讀者要聽得登入）
- **沒有後台管理**：無法禁用使用者、審核內容（適合小規模 trusted 群體）
- **consent screen Testing 模式**：上限 100 個 test user。要公開發布得走 Google verification

## 授權

私人使用。
