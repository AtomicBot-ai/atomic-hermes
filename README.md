<p align="center">
  <img src="desktop/assets/icon-simple-splash.png" alt="Atomic Hermes" width="140" height="140">
</p>

<h1 align="center">Atomic Hermes</h1>
<h3 align="center">A native macOS AI agent that actually sees your screen, edits your files, and runs locally if you want it to.</h3>

<p align="center">
  Not a chatbot — a real AI assistant that lives on your desktop. Chat, terminal, file browser with time-travel snapshots, a built-in computer-use agent, free local models, and a mission control for 16+ messengers — all in one beautiful, self-contained app.
</p>

<p align="center">
  <a href="https://github.com/AtomicBot-ai/atomic-hermes/releases/latest"><img src="https://img.shields.io/badge/⬇%20Download%20for%20macOS-latest%20release-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS"></a>
</p>

<p align="center">
  <a href="https://github.com/AtomicBot-ai/atomic-hermes/releases/latest"><img src="https://img.shields.io/github/v/release/AtomicBot-ai/atomic-hermes?style=for-the-badge&color=FF9100&label=version" alt="Latest release"></a>
  <a href="https://github.com/AtomicBot-ai/atomic-hermes/releases/latest"><img src="https://img.shields.io/github/downloads/AtomicBot-ai/atomic-hermes/total?style=for-the-badge&color=4CAF50" alt="Downloads"></a>
  <a href="https://github.com/AtomicBot-ai/atomic-hermes/stargazers"><img src="https://img.shields.io/github/stars/AtomicBot-ai/atomic-hermes?style=for-the-badge&color=FFD700" alt="Stars"></a>
  <a href="https://github.com/AtomicBot-ai/atomic-hermes/issues"><img src="https://img.shields.io/github/issues/AtomicBot-ai/atomic-hermes?style=for-the-badge" alt="Issues"></a>
  <a href="https://polyformproject.org/licenses/noncommercial/1.0.0"><img src="https://img.shields.io/badge/license-PolyForm%20NC-green?style=for-the-badge" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-macOS%2013%2B-black?style=for-the-badge&logo=apple" alt="macOS 13+">
  <img src="https://img.shields.io/badge/electron-33-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron 33">
  <img src="https://img.shields.io/badge/node-%E2%89%A518-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node 18+">
</p>

<p align="center">
  <img src="assets/banner.png" alt="Atomic Hermes banner" width="100%">
</p>

---

## A full-stack AI agent, not a chat window

Atomic Hermes is a native macOS AI assistant — not a browser tab, not a CLI wrapper, not "ChatGPT with buttons". It's an autonomous agent with hands, eyes, memory, and a real workspace. Launch it from `/Applications`, live in the tray, autostart on login, get delta auto-updates. Everything below is one app, one install, one window.

- **Chat** — streaming conversations with a tool-using AI agent, native approval modals for dangerous actions, voice-memo input, skill slash-commands.
- **Files** — a real workspace browser with Monaco-powered editing, side-by-side diffs, and automatic version history for every file the AI agent touches.
- **Terminal** — built-in PTY where the AI agent can run commands for you: background processes, streaming output, per-command approval.
- **Computer Use** — the AI agent literally sees and operates your Mac, with native OCR so it clicks the right pixel the first time.
- **Dashboard** — a local admin panel for configuring the agent's skills, tools, memory, cron jobs, and the messaging gateway.
- **Settings** — one-click switch between cloud AI models and a fully local llama.cpp engine we bundle for you.

---

## An AI agent that actually lands the click

Most "AI computer use" tools downscale your 2560×1600 screen to something the model can swallow, then make the agent guess coordinates. Small text turns to mush. Buttons get missed. Retries burn tokens.

**Atomic Hermes does it properly.** Every screenshot the AI agent takes is paired with **native OCR** — Apple Vision on macOS, Windows.Media.Ocr on Windows — fully offline, zero API keys. The agent gets back pixel-accurate coordinates for every label, field, and button on screen, so it clicks the right thing the first time — fewer retries, fewer wrong clicks, lower bills.

A visual "AI agent active" overlay keeps you aware whenever the assistant is driving your mouse and keyboard, and a session lock stops two agents from fighting over the desktop.

Pre-wired into the Atomic Hermes AI agent out of the box. Also open source for anyone to use in their own agent:

- [`@atomicbotai/computer-use-mcp`](https://www.npmjs.com/package/@atomicbotai/computer-use-mcp) — MCP server, drop it into Claude Desktop, Cursor, Windsurf, or any MCP client
- [`@atomicbotai/computer-use`](https://www.npmjs.com/package/@atomicbotai/computer-use) — the core TypeScript library: OCR, actions, overlay, session lock

---

## Time travel for every file the AI agent touches

This is the feature that makes trusting an AI agent with your real project actually feasible.

Atomic Hermes silently saves a snapshot of every file **before and after** the AI agent edits it — into a hidden `.history` directory next to your workspace. No git required, no setup, no manual anything.

- **Watch the AI agent evolve your code.** Open any file in the **Files** tab and the right-hand panel lists every past version with relative timestamps — *"just now"*, *"12m ago"*, *"3d ago"* — plus file size.
- **Diff anything against anything.** Click a snapshot to open a side-by-side diff against the current file. See exactly what the agent changed, line by line.
- **One-click restore.** Any past version, any time. Restoring itself takes a fresh snapshot first, so there's never a dead end.
- **Safe by construction.** Writes are atomic (`tmp` + rename), stored locally in plain files, auto-purged by count and age so your disk doesn't fill up.

If the AI agent wrecks a file, it's one click away from being fine again. That's the deal.

---

## A fully local AI assistant. Zero cloud.

Want an AI agent that lives entirely on your machine, with no keys, no API bills, and no data ever leaving the Mac? **One click** in the app and Atomic Hermes does the whole thing for you: downloads a bundled **llama.cpp** inference engine, scans your hardware (RAM, chipset), picks a model that will actually run well, and starts an OpenAI-compatible server locally. No terminal. No config files. No "figure out which quant fits your GPU". Every feature — chat, computer use, tools, memory — works identically to cloud mode.

Or bring keys for 20+ cloud AI providers: OpenRouter, Anthropic, OpenAI, Gemini, DeepSeek, Kimi, Moonshot, MiniMax, Nous Portal, xAI, z.ai, Venice, NVIDIA, Alibaba Cloud, Xiaomi MiMo, Ollama, HuggingFace, and more. Switch the model powering your AI agent between local and cloud mid-conversation — no restart, no config reload.

---

## One AI agent, 16+ messengers

Turn on the messaging gateway from the dashboard and the same AI assistant picks up conversations from everywhere you already chat — one agent, one process, one shared memory, all of these platforms:

<p align="center">
  <img src="desktop/assets/messangers/Telegram.svg" height="28" alt="Telegram">
  <img src="desktop/assets/messangers/Discord.svg" height="28" alt="Discord">
  <img src="desktop/assets/messangers/Slack.svg" height="28" alt="Slack">
  <img src="desktop/assets/messangers/WhatsApp.svg" height="28" alt="WhatsApp">
  <img src="desktop/assets/messangers/Signal.svg" height="28" alt="Signal">
  <img src="desktop/assets/messangers/iMessage.svg" height="28" alt="iMessage">
  <img src="desktop/assets/messangers/SMS.svg" height="28" alt="SMS">
  <img src="desktop/assets/messangers/Email.svg" height="28" alt="Email">
  <img src="desktop/assets/messangers/Matrix.svg" height="28" alt="Matrix">
  <img src="desktop/assets/messangers/Microsoft-Teams.svg" height="28" alt="Microsoft Teams">
  <img src="desktop/assets/messangers/Feishu.svg" height="28" alt="Feishu">
  <img src="desktop/assets/messangers/DingTalk.svg" height="28" alt="DingTalk">
  <img src="desktop/assets/messangers/BlueBubbles.svg" height="28" alt="BlueBubbles">
  <img src="desktop/assets/messangers/mattermost.svg" height="28" alt="Mattermost">
  <img src="desktop/assets/messangers/HomeAssistant.svg" height="28" alt="Home Assistant">
  <img src="desktop/assets/messangers/twilio.svg" height="28" alt="Twilio">
</p>

Voice memo transcription, cross-platform conversation continuity, shared slash commands. Ask the AI agent something from your phone on the train and find the answer — and the side-effects — waiting on your Mac when you get home.

---

## The AI agent brain: powered by Hermes Agent

Under the desktop shell beats the full [**Hermes Agent**](https://github.com/NousResearch/hermes-agent) core by [Nous Research](https://nousresearch.com) — an open-source, self-improving AI agent with one of the most serious tool-calling loops around. It's what turns Atomic Hermes from a chat window into an AI assistant that actually gets smarter the more you use it:

- **Self-improving skills** — the AI agent writes its own procedures after finishing complex tasks; next time you ask, it already knows how.
- **Agent-curated memory** — the assistant decides what's worth remembering across sessions, with periodic nudges to persist knowledge. Dialectic user modeling via [Honcho](https://github.com/plastic-labs/honcho).
- **40+ tools** — the AI agent can use all of them: file ops, web search/extract, code execution, MCP client, subagent delegation, cron scheduling, browser automation, and more.
- **Full-text session search** — FTS5 + LLM-summarized recall across every conversation you've ever had with the agent.
- **Subagents & parallelism** — your AI assistant can spawn isolated sub-agents that tackle workstreams in parallel; multi-step pipelines collapse into zero-context-cost turns.
- **Six terminal backends** — local, Docker, SSH, Daytona, Singularity, Modal. Run the same AI agent on a $5 VPS or a GPU cluster.
- **Prompt caching done right** — the agent never breaks its own cache mid-conversation, so long sessions stay cheap.

We track upstream closely and contribute back. If you want the headless CLI agent, Linux / WSL / Termux installs, RL training environments, or the raw Python agent core, the [upstream repo](https://github.com/NousResearch/hermes-agent) is where to go.

---

## Teach your AI agent new tricks

- **Skills Hub** — browse and install curated skills from [agentskills.io](https://agentskills.io) inside the app and the AI agent gains new abilities on the spot (GitHub, Figma, Notion, Obsidian, Trello, Google, Web Search, media, and more).
- **MCP-native** — the `computer-use` MCP server is seeded for you at first launch; plug in any other MCP server from Settings and the agent auto-discovers its tools.
- **Cron** — tell the AI assistant *"every Monday at 9am, summarize last week's PRs to Slack"* and it runs unattended.
- **Profiles** — run multiple fully isolated AI agent instances (personal, work, research), each with its own keys, memory, skills, and gateway.
- **Approval & guardrails** — whenever the agent is about to run a dangerous shell command or write to a sensitive file, a native modal asks you first. You stay in control.

---

## Quickstart (for users)

1. **[Download the latest release for macOS](https://github.com/AtomicBot-ai/atomic-hermes/releases/latest)** and drag into `/Applications`.
2. Launch Atomic Hermes, pick an AI model for the agent to use (cloud key or free local), start chatting.
3. Hit the **Computer** button when you want the AI agent to operate your Mac. Open **Files** to watch the assistant's edits accumulate in real time as snapshots.
4. Optional: flip on the **Messaging Gateway** from Settings → Messaging and talk to the same AI agent from Telegram / Discord / Slack / anything.

macOS 13+ on Apple Silicon or Intel. Auto-updates ship deltas so subsequent versions are tiny.

---

## Build from source

Prerequisites:

- macOS 13+ (Apple Silicon or Intel)
- **Node.js** ≥ 18
- **Python** 3.11 (installed automatically via [`uv`](https://github.com/astral-sh/uv) on first build)
- **Xcode Command Line Tools** (`xcode-select --install`)
- **uv**, **rg** (ripgrep), optionally **ffmpeg**

```bash
git clone https://github.com/AtomicBot-ai/atomic-hermes.git
cd atomic-hermes

cd desktop
npm install
npm run dev
```

`npm run dev` will:

1. Rebuild native modules against your Electron version (`node-pty`).
2. Run [`scripts/bundle-dev.sh`](desktop/scripts/bundle-dev.sh) — symlinks the Python AI-agent sources into `desktop/build/`, creates a `uv`-managed venv, and links system binaries so edits to the agent core are picked up instantly.
3. Build the admin dashboard (`../web`) and the renderer (Vite).
4. Compile TypeScript in watch mode and launch Electron.

### Bundling the Python AI agent runtime

The desktop app ships with a self-contained Python 3.11, a `uv`-managed venv with all agent deps, the Hermes agent source, ripgrep / Node / ffmpeg, and the built-in skills — everything lives under `desktop/build/`. Two scripts manage that tree:

```bash
npm run bundle:dev      # lightweight dev bundle — symlinks repo sources into
                        # desktop/build/, reuses your existing venv. Called
                        # automatically by `npm run dev`; safe to re-run (~2s).

npm run bundle          # full production bundle — wipes desktop/build/,
                        # downloads relocatable Python 3.11 via uv, runs
                        # `uv sync --all-extras`, copies binaries, installs
                        # browser node_modules. Required before `npm run dist`.
```

### Production build / packaging

```bash
npm run build:all       # full TS + dashboard + renderer build (no bundle)
npm run dist            # full bundle + signed & notarized .zip in desktop/release/
npm run dist:local      # same, but without signing (for local smoke tests)
npm run release:patch   # tag, push, trigger GitHub release workflow
```

Full release flow: `npm run bundle && npm run dist`. Signing & notarization happen via the `electron-builder` hooks in `desktop/scripts/` and expect Apple Developer credentials in the environment.

---

## Project layout

```
atomic-hermes/
├── desktop/                  # Electron AI agent desktop app (this is what ships)
│   ├── src/main/             # Electron main process (IPC, windows, updaters)
│   ├── src/python-server/    # FastAPI bridge between Electron and the AI agent
│   ├── renderer/src/         # React UI (chat, files, terminal, settings, setup)
│   ├── scripts/              # dev bundler, release, afterSign hooks
│   └── package.json
├── agent/ tools/ gateway/    # Hermes AI agent Python core (imported by desktop)
├── hermes_cli/               # Headless CLI agent entrypoints & config wizard
├── cron/                     # Scheduler for unattended AI agent jobs
├── skills/ optional-skills/  # Built-in skill library the agent can load
├── web/                      # Admin dashboard (served inside the desktop app)
└── website/                  # Docs site (Next.js)
```

---

## Contributing

Issues and PRs welcome. For desktop-specific work, edit files under `desktop/`. For AI agent core work (adding tools, changing the reasoning loop, editing the tool registry, the skin engine, or profile-safe code patterns), follow [`AGENTS.md`](AGENTS.md) at the repo root — it covers the full Python agent architecture.

Please run the Python test suite before opening a PR:

```bash
source venv/bin/activate
python -m pytest tests/ -q
```

---

## Links

- Website — [atomicbot.ai/hermes](https://atomicbot.ai/hermes)
- Releases — [github.com/AtomicBot-ai/atomic-hermes/releases](https://github.com/AtomicBot-ai/atomic-hermes/releases)
- Issues — [github.com/AtomicBot-ai/atomic-hermes/issues](https://github.com/AtomicBot-ai/atomic-hermes/issues)
- Computer Use MCP — [@atomicbotai/computer-use-mcp](https://www.npmjs.com/package/@atomicbotai/computer-use-mcp)
- Computer Use Library — [@atomicbotai/computer-use](https://www.npmjs.com/package/@atomicbotai/computer-use)
- Upstream — [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
- Privacy — [atomicbot.ai/privacy-policy](https://atomicbot.ai/privacy-policy)
- Support — [support@atomicbot.ai](mailto:support@atomicbot.ai)

---

## License

The Atomic Hermes AI agent desktop distribution is licensed under [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).
The underlying Hermes Agent core is MIT-licensed by Nous Research.
