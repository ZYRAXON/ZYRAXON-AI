# ZYRAXON AI — Mobile Agent System

Android device automation powered by AI. Combines a React Native chat interface with a native Android AccessibilityService for real device control.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
<<<<<<< HEAD
│                        ☁️ Render (Backend)                             │
│  packages/mobile-server/ (Bun + Hono)                                 │
│                                                                        │
│  GET  /health              ← Health check                             │
│  POST /api/mobile/agent    ← 🤖 AI Agent (zyraxon.ai free models)    │
│  POST /api/mobile/agent/stream ← SSE streaming (word-by-word)         │
│                                                                        │
│         ▲ HTTPS (JSON)                    │ HTTPS (OpenAI API)         │
│         │                                 ▼                            │
│         │                    🆓 zyraxon.ai /zen/v1/chat/completions    │
│         │                    (mimo-v2.5-free / big-pickle — NO KEY!)   │
└─────────┼──────────────────────────────────────────────────────────────┘
          │
          │
┌─────────┴──────────────────────────────────────────────────────────────┐
│                     📱 Android Phone                                   │
│                                                                         │
│  ┌─────────────────────────────────────┐    ┌─────────────────────────┐ │
│  │  APK 1: ZyraxonAutomation (Helper)   │    │  APK 2: ZYRAXON AI     │ │
│  │  (Native Android — Kotlin)           │    │  (Expo / React Native) │ │
│  │                                      │    │                        │ │
│  │  AccessibilityService + HttpServer   │◄──►│  Chat UI + Agent UI    │ │
│  │  Port 19091 — REST API               │    │                        │ │
│  │                                      │    │  ┌──────────────────┐  │ │
│  │  Endpoints:                          │    │  │ Settings Screen  │  │ │
│  │  GET  /health                        │    │  │ Render URL:      │  │ │
│  │  GET  /ui-tree          ← UI dump    │    │  │ https://zyraxon- │  │ │
│  │  GET  /screen-text      ← all text   │    │  │ mobile-agent.on  │  │ │
│  │  POST /click/text       ← tap by txt │    │  │ render.com       │  │ │
│  │  POST /click/coordinate ← tap at xy  │    │  └──────────────────┘  │ │
│  │  POST /swipe            ← swipe      │    │                        │ │
│  │  POST /type             ← type text  │    │  ┌──────────────────┐  │ │
│  │  POST /go-back          ← back btn   │    │  │ ADB Proxy (opt)  │  │ │
│  │  POST /go-home          ← home btn   │    │  │ Port 19090       │  │ │
│  │  POST /scroll           ← scroll     │    │  │ (laptop-side)    │  │ │
=======
│                     ☁️ Zyraxon.ai (Free AI)                          │
│                                                                        │
│  Direct API call (no server needed!):                                 │
│  POST https://opencode.ai/zen/v1/chat/completions                   │
│  (No Authorization header required)                                   │
│                                                                        │
│  Returns reasoning field with JSON actions                            │
└────────────────────────────────────────────────────────────────────────┘
          │
          │ HTTPS (JSON)
          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     📱 Android Phone                                  │
│                                                                         │
│  ┌─────────────────────────────────────┐    ┌─────────────────────────┐ │
│  │  APK 1: ZyraxonAutomation (Helper)   │    │  APK 2: ZYRAXON AI    │ │
│  │  (Native Android — Kotlin)           │    │  (Expo / React Native)  │ │
│  │                                      │    │                        │ │
│  │  AccessibilityService + HttpServer   │◄──►│  Chat UI + Agent UI    │ │
│  │  Port 19091 — REST API               │    │                        │ │
│  │                                      │    │  Connects to Helper    │ │
│  │  Endpoints:                          │    │  on port 19091        │ │
│  │  GET  /health                        │    │                        │ │
│  │  GET  /ui-tree          ← UI dump    │    │                        │ │
│  │  GET  /screen-text      ← all text   │    │                        │ │
│  │  POST /click/text       ← tap by txt │    │                        │ │
│  │  POST /click/coordinate ← tap at xy   │    │                        │ │
│  │  POST /swipe            ← swipe      │    │                        │ │
│  │  POST /type             ← type text   │    │                        │ │
│  │  POST /go-back          ← back btn   │    │                        │ │
│  │  POST /go-home          ← home btn   │    │                        │ │
│  │  POST /scroll           ← scroll     │    │                        │ │
>>>>>>> origin/mobile-sdk-compatibility-fix
│  └─────────────────────────────────────┘    └─────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Two APKs, One System

| Component | What It Does | How It Connects |
|-----------|-------------|-----------------|
<<<<<<< HEAD
| **APK 1: Helper** (`android-automation/`) | Native Android service running on the phone. Uses AccessibilityService API to perform REAL touch, scroll, swipe, and text input. Exposes a local HTTP REST API on port 19091. | Main app sends HTTP requests to `http://127.0.0.1:19091` for all device actions |
| **APK 2: Main** (`Expo/RN app`) | User-facing chat interface. Connects to Render for AI, connects to Helper APK for device control, connects to laptop ADB Proxy as fallback. | Talks to Render (`/api/mobile/agent`) for AI, talks to Helper (`:19091`) for device actions |
| **ADB Proxy** (optional, runs on laptop) | Bridges ADB commands from the phone to the laptop. Used when Helper APK's AccessibilityService is unavailable. | Mobile app sends HTTP to `YOUR_LAPTOP_IP:19090` |

### Data Flow (Chat → AI → Action)

```
User types "Open YouTube and play cat videos"
        │
        ▼
Main App → POST /api/mobile/agent → Render → zyraxon.ai AI
        │                                              │
        │                     AI responds with JSON:   │
        │          {"text":"Opening YouTube...",        │
        │           "actions":[{"type":"open_app",      │
        │           "target":"youtube"}],               │
        │           "finish_reason":"working"}          │
        │                                              │
        ▼                                              │
Main App parses response                               │
        │                                              │
        ▼                                              │
Main App → POST http://127.0.0.1:19091/click/text      │
        → Helper APK → AccessibilityService → REAL TAP │
        │                                              │
        ▼                                              │
Main App → POST /api/mobile/agent (with screenshot) → AI checks result
        │                                              │
        ▼                                              │
    Loop until finish_reason: "complete" ──────────────┘
=======
| **APK 1: Helper** (`android-automation/`) | Native Android service. Uses AccessibilityService API for REAL touch, scroll, swipe, text input. HTTP server on port 19091. | Main app sends HTTP to `http://127.0.0.1:19091` |
| **APK 2: Main** (`Expo/RN app`) | Chat interface. Calls Zyraxon.ai directly for AI, Helper APK for device control. | Calls `zyraxon.ai/zen/v1` for AI, `:19091` for actions |

### Data Flow

```
User: "Open YouTube"
        │
        ▼
Main App → POST zyraxon.ai/zen/v1/chat/completions
        │
        │ AI returns reasoning field with JSON:
        │ {"text":"Opening YouTube...","actions":[{"type":"open_app","target":"youtube"}]}
        ▼
Main App parses JSON from reasoning
        │
        ▼
Main App → POST http://127.0.0.1:19091/click/text
        → Helper APK → AccessibilityService → REAL TAP
        │
        ▼
    Loop until done
>>>>>>> origin/mobile-sdk-compatibility-fix
```

---

<<<<<<< HEAD
## How to Build — Step by Step

### Prerequisites

1. **Android Studio** (for Helper APK)
   - Download from https://developer.android.com/studio
   - Install Android SDK 34

2. **Node.js 18+** (for Main APK)
   - Download from https://nodejs.org
   - `node --version` should be 18 or higher

3. **Bun** (for running the mobile-server locally)
   - `powershell -c "irm bun.sh/install.ps1 | iex"`
   - `bun --version` should be 1.x

4. **Expo CLI** (for building the Main APK)
   - `npm install -g expo-cli`

5. **EAS CLI** (for building the Main APK via Expo)
   - `npm install -g eas-cli`

---

### APK 1: Build the Helper (ZyraxonAutomation)

```bash
# 1. Go to the android-automation directory
cd packages/Mobile/android-automation

# 2. Build the debug APK (requires Android Studio + SDK 34)
./gradlew assembleDebug

# 3. The APK will be at:
#    app/build/outputs/apk/debug/app-debug.apk
```

If `./gradlew` is not found, use the Gradle wrapper:

```bash
# Windows
gradlew.bat assembleDebug

# Linux/macOS
chmod +x gradlew
./gradlew assembleDebug
```

**Install on phone:**
1. Copy `app-debug.apk` to your phone
2. Open the file on your phone → Install
3. Open the "ZYRAXON Automation" app
4. Follow the prompt to enable Accessibility Service
5. Go to Settings → Accessibility → Installed Apps → ZYRAXON Automation → Enable
6. Go back to the app → it will show "Server running on port 19091"

---

### APK 2: Build the Main App (ZYRAXON AI Mobile)

```bash
# 1. Go to the Mobile directory
cd packages/Mobile

# 2. Install dependencies
npm install

# 3. For local development (requires Expo Go app on phone):
npx expo start

# 4. For building a standalone APK:
eas build --platform android --profile preview

# 5. Or create a local APK (requires Android Studio SDK):
npx expo run:android
```

**Install on phone:**
1. After `eas build`, download the APK from the Expo URL
2. Install it on your phone
3. Open the app → Go to Settings tab
4. Set the server URL to: `https://zyraxon-mobile-agent.onrender.com`
5. Tap "Save" then "Test" to verify connection

---

### ADB Proxy (Optional — For Development)

If you don't want to use the Helper APK, you can control the device via ADB from your laptop:

```bash
# 1. Go to the adb-proxy directory
cd packages/Mobile/adb-proxy

# 2. Install dependencies
npm install

# 3. Connect your phone to the laptop via USB or Wireless Debugging
#    Wireless: adb pair ip:port → adb connect ip:port

# 4. Start the proxy server
bun run server.ts

# 5. The proxy runs on port 19090
#    In the Main App's Settings, set ADB Proxy IP to your laptop's local IP
```

---

## Directory Map

```
packages/Mobile/
│
├── README.md                          ← এই ফাইল (complete roadmap)
│
├── package.json                       ← Expo app config + dependencies
├── app.json                           ← Expo app name, icons, splash
├── tsconfig.json                      ← TypeScript config
├── babel.config.js                    ← Babel config for Expo
│
├── app/                               ← Expo Router (file-based routing)
│   ├── _layout.tsx                    ← Root layout: Tab navigator
│   │                                     (Chat, Sessions, Tools, Memory, Settings)
│   ├── index.tsx                      ← 🏠 Chat Screen (main UI)
│   ├── sessions.tsx                   ← 📋 Session History
│   ├── tools.tsx                      ← 🔧 Tools & Agents
│   ├── memory.tsx                     ← 🧠 Memory & Context
│   └── settings.tsx                   ← ⚙ Settings (Server URL, ADB config)
│
├── src/
│   ├── components/
│   │   ├── Header.tsx                 ← App header with title + actions
│   │   ├── ChatInput.tsx              ← Message input + voice button
│   │   ├── MessageBubble.tsx          ← Chat message display
│   │   ├── AgentModeSelector.tsx      ← Agent mode picker (General, Build, etc.)
│   │   ├── AgentModeCard.tsx          ← Agent mode card UI
│   │   └── MobileAgentUi.tsx          ← 🤖 Device control panel
│   │                                     (Quick actions: YouTube, Chrome, etc.)
│   │
│   ├── services/
│   │   ├── api.ts                     ← 🌐 Render API connector
│   │   ├── voice-service.ts           ← 🎤 Voice recognition (Speech-to-Text)
│   │   ├── voice.ts                   ← 🔊 Text-to-Speech (Speech)
│   │   ├── camera-service.ts          ← 📷 Camera / screen capture
│   │   ├── screen.ts                  ← Screen utilities
│   │   └── device.ts                  ← Device info + app launcher
│   │
│   ├── mobile-agent/                  ← Agent engine (runs on-device)
│   │   ├── agent-engine.ts            ← Agent loop logic
│   │   ├── action-executor.ts         ← Executes actions (talks to Helper APK or ADB)
│   │   ├── vision-service.ts          ← Screenshot capture for AI vision
│   │   └── protocol.ts                ← Action/event type definitions
│   │
│   ├── automation/                    ← Device automation backends
│   │   ├── adb-executor.ts            ← ADB commands (via proxy on port 19090)
│   │   ├── android-executor.ts        ← Unified automation (ADB + Accessibility)
│   │   ├── screen-reader.ts           ← Parse UI XML → structured data
│   │   └── types.ts                   ← Types for automation
│   │
│   ├── store/
│   │   └── chatStore.ts               ← State management (sessions, messages)
│   │
│   └── types/
│       ├── agents.ts                  ← Agent mode definitions
│       └── theme.ts                   ← UI theme (colors, fonts, spacing)
│
├── android-automation/                ← 🤖 Helper APK (separate Android project)
│   ├── build.gradle.kts               ← Root Gradle config
│   ├── settings.gradle.kts            ← project name: ZyraxonAutomation
│   ├── gradle.properties              ← Gradle properties
│   └── app/
│       ├── build.gradle.kts           ← App module (SDK 34, minSDK 26)
│       │                                 App ID: com.zyraxon.automation
│       └── src/main/
│           ├── AndroidManifest.xml     ← Permissions + Service + Activity
│           ├── java/com/zyraxon/automation/
│           │   ├── MainActivity.kt     ← Launcher (shows enable dialog)
│           │   ├── ZyraxonAccessibilityService.kt  ← 🤖 Core engine
│           │   │   - AccessibilityService lifecycle
│           │   │   - UI tree dump (nodeToMap)
│           │   │   - clickByText / clickAtCoordinate
│           │   │   - swipe / scroll / typeText
│           │   │   - getUiDump / getAllText / getForegroundApp
│           │   └── HttpServer.kt       ← REST API on localhost:19091
│           │       - GET  /health
│           │       - GET  /ui-tree
│           │       - GET  /screen-text
│           │       - GET  /foreground-app
│           │       - POST /click/text
│           │       - POST /click/coordinate
│           │       - POST /swipe
│           │       - POST /type
│           │       - POST /scroll
│           │       - POST /go-back, /go-home, /go-recents
│           │       - POST /notification, /quick-settings
│           └── res/
│               ├── layout/activity_main.xml
│               ├── values/themes.xml
│               └── xml/accessibility_service_config.xml
│
├── adb-proxy/                         ← 💻 ADB Proxy (laptop-side, optional)
│   ├── package.json
│   └── server.ts                      ← HTTP → ADB bridge on port 19090
│
└── assets/                            ← App icons, fonts, images
```

---

## API Reference

### Render Server (Backend AI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status check |
| `/api/mobile/agent` | POST | Send message to AI, get JSON response |
| `/api/mobile/agent/stream` | POST | Same as above but SSE streaming |

**POST `/api/mobile/agent` Request:**
```json
{
  "message": "Open YouTube and play cat videos",
  "history": [{"role": "user", "content": "previous message"}],
  "mode": "general"
}
```

**Response:**
```json
{
  "text": "Opening YouTube...",
  "actions": [{"type": "open_app", "target": "youtube"}],
  "finish_reason": "working"
}
```

### Helper APK (Device Control)

Base URL: `http://127.0.0.1:19091`

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/health` | GET | — | Server + foreground app status |
| `/ui-tree` | GET | — | Complete UI element tree |
| `/screen-text` | GET | — | All visible text on screen |
| `/foreground-app` | GET | — | Current app package/activity |
| `/click/text` | POST | `{"text":"YouTube","partial":true}` | Click element by text |
| `/click/coordinate` | POST | `{"x":500,"y":800}` | Click at coordinates |
| `/swipe` | POST | `{"x1":100,"y1":500,"x2":800,"y2":500}` | Swipe gesture |
| `/type` | POST | `{"text":"hello world"}` | Type text |
| `/scroll` | POST | `{"direction":"forward"}` | Scroll forward/backward |
| `/go-back` | POST | — | Press Back |
| `/go-home` | POST | — | Press Home |

---

## Free AI Models (No API Keys)

This system uses **zyraxon.ai** free models. No API keys needed — ever.

| Model | Provider | Context | Notes |
|-------|----------|---------|-------|
| `mimo-v2.5-free` | zyraxon | 200K | Default — fast, capable |
| `big-pickle` | zyraxon | 200K | General purpose |
| `deepseek-v4-flash-free` | zyraxon | 200K | Fast responses |

To change the model: Set `MOBILE_AI_MODEL` environment variable on Render, or change the model name in `packages/mobile-server/src/ai-agent.ts`.

---

=======
>>>>>>> origin/mobile-sdk-compatibility-fix
## Quick Start (5 Minutes)

```bash
# 1. Clone the repo
git clone https://github.com/onelpawarai/ZYRAXON-AI.git
cd ZYRAXON-AI

<<<<<<< HEAD
# 2. Deploy backend to Render
#    (Already deployed at https://zyraxon-mobile-agent.onrender.com)

# 3. Build Helper APK
cd packages/Mobile/android-automation
./gradlew assembleDebug
# Install app-debug.apk on phone → Enable Accessibility

# 4. Build Main APK
cd packages/Mobile
npm install
npx expo run:android
# Install on phone → Open Settings → Set Render URL

# 5. Start chatting!
#    AI will respond and control your device automatically
=======
# 2. Build Helper APK
cd packages/mobile/android-automation
./gradlew assembleDebug
# Install app-debug.apk on phone → Enable Accessibility Service

# 3. Build Main APK
cd packages/mobile
npm install
npx expo run:android
# Install on phone

# 4. Start chatting!
>>>>>>> origin/mobile-sdk-compatibility-fix
```

---

<<<<<<< HEAD
## Troubleshooting

**"Failed to parse JSON" error:**
- Check that Render server's `ZYRAXON_API_URL` is `https://opencode.ai/zen/v1` (NOT `https://api.opencode.ai/v1`)
- Ensure `ZYRAXON_API_KEY` is empty/not set on Render (free API doesn't use auth)

**Helper APK not connecting:**
- Make sure Accessibility Service is enabled in Android Settings
- Check that the Helper app is running (open the app)
- Verify port 19091 is accessible from the Main app

**ADB not working:**
- Connect phone via USB or Wireless Debugging
- Run `adb devices` to verify connection
- Start the ADB Proxy: `bun run packages/Mobile/adb-proxy/server.ts`
=======
## Build Helper APK

```bash
cd packages/mobile/android-automation
./gradlew assembleDebug
```

**Install:**
1. Copy APK to phone
2. Install → Enable Accessibility Service
3. App shows "Server running on port 19091"

---

## Build Main APK

```bash
cd packages/mobile
npm install
eas build --platform android --profile preview
```

Or for local development:
```bash
npx expo start
```

---

## Helper APK Endpoints

Base URL: `http://127.0.0.1:19091`

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/health` | GET | — | Server status |
| `/ui-tree` | GET | — | Complete UI tree |
| `/screen-text` | GET | — | All visible text |
| `/click/text` | POST | `{"text":"YouTube","partial":true}` | Click by text |
| `/click/coordinate` | POST | `{"x":500,"y":800}` | Click at coords |
| `/swipe` | POST | `{"x1":100,"y1":500,"x2":800,"y2":500}` | Swipe gesture |
| `/type` | POST | `{"text":"hello"}` | Type text |
| `/scroll` | POST | `{"direction":"forward"}` | Scroll |
| `/go-back` | POST | — | Press Back |
| `/go-home` | POST | — | Press Home |
| `/open-app` | POST | `{"package":"com.youtube"}` | Open app |

---

## Free AI Models

Uses **zyraxon.ai** — no API keys needed.

| Model | Notes |
|-------|-------|
| `mimo-v2.5-free` | Default, fast, capable |
| `big-pickle` | General purpose |
| `deepseek-v4-flash-free` | Fast responses |

---

## Troubleshooting

**Helper APK not connecting:**
- Enable Accessibility Service in Android Settings
- Make sure Helper app is running

**AI not responding:**
- Check internet connection (required for Zyraxon.ai)

**Build errors:**
- Install Android SDK 34
- Run `npm install` in the mobile directory
>>>>>>> origin/mobile-sdk-compatibility-fix
