/**
 * ZYRAXON Ecosystem Publish System Prompt
 *
 * This file defines what fields are available when publishing to the
 * ZYRAXON Ecosystem marketplace, and how each AI mode should handle them.
 *
 * STORAGE ARCHITECTURE:
 * ====================
 * - All metadata (name, description, tags, etc.) → GitHub JSON files
 * - Actual files (APK, EXE, PDF, images) → User's GitHub repo or GitHub Releases
 * - Websites → GitHub Pages (liveDemo URL)
 * - Plugins/Modules → npm registry (installCommand)
 * - Source code → GitHub repo (githubRepo URL)
 *
 * EVERYTHING IS REAL. No fake data. Every download works. Every link works.
 */

export const PUBLISH_FIELD_DEFINITIONS = {
  // === REQUIRED FIELDS ===
  name: {
    label: "Product Name",
    description: "The display name of your product. This is what users see in the marketplace.",
    examples: ["ZYRAXON AI Desktop", "CodeBot Pro", "Modern Landing Template"],
    required: true,
  },
  description: {
    label: "Description",
    description: "What does it do? Why should someone use it? Be detailed and clear.",
    examples: ["Full-featured AI desktop app with 136+ tools, WebRTC calls, and ecosystem marketplace"],
    required: true,
  },
  category: {
    label: "Category",
    description: "The category your product belongs to. Determines what file types are accepted and how it's displayed.",
    options: [
      { id: "ai-bots", label: "AI Bots", accepts: "JSON, YAML config files", action: "Import to ZYRAXON" },
      { id: "plugins", label: "Plugins", accepts: "JS, TS, JSON, ZIP", action: "Install" },
      { id: "website-templates", label: "Website Templates", accepts: "ZIP, HTML, CSS, JS", action: "View Live" },
      { id: "themes", label: "Themes", accepts: "CSS, JSON, ZIP", action: "Install" },
      { id: "components", label: "Components", accepts: "TSX, JSX, Vue, Svelte, ZIP", action: "Install" },
      { id: "startkits", label: "Starter Kits", accepts: "ZIP, TAR.GZ", action: "Download" },
      { id: "workflows", label: "Workflows", accepts: "JSON, YAML", action: "Import" },
      { id: "ai-models", label: "AI Models", accepts: "BIN, GGUF, ONNX, PT, ZIP", action: "Download" },
      { id: "tools", label: "Dev Tools", accepts: "EXE, DMG, AppImage, ZIP", action: "Download" },
      { id: "sdks", label: "SDKs", accepts: "ZIP, TAR.GZ", action: "Download" },
      { id: "pdfs", label: "PDFs", accepts: "PDF", action: "Download PDF" },
      { id: "books", label: "Books", accepts: "PDF, EPUB, MOBI", action: "Download" },
      { id: "apis", label: "APIs", accepts: "JSON, YAML", action: "View Docs" },
      { id: "mobile-apps", label: "Mobile Apps", accepts: "APK, IPA, AAB", action: "Download APK" },
      { id: "browser-extensions", label: "Browser Extensions", accepts: "CRX, XPI, ZIP", action: "Install" },
      { id: "cli-tools", label: "CLI Tools", accepts: "EXE, DMG, AppImage, ZIP", action: "Copy Command" },
      { id: "prompts", label: "AI Prompts", accepts: "TXT, JSON, MD", action: "Copy Prompt" },
      { id: "datasets", label: "Datasets", accepts: "CSV, JSON, JSONL, Parquet, ZIP", action: "Download" },
      { id: "icons", label: "Icon Packs", accepts: "SVG, PNG, ZIP", action: "Download" },
      { id: "ui-kits", label: "UI Kits", accepts: "FIG, Sketch, ZIP", action: "Download" },
      { id: "landing-pages", label: "Landing Pages", accepts: "HTML, ZIP", action: "View Live" },
      { id: "desktop-apps", label: "Desktop Apps", accepts: "EXE, DMG, AppImage, DEB, ZIP", action: "Download" },
      { id: "iso-images", label: "ISO Images", accepts: "ISO", action: "Download ISO" },
      { id: "fonts", label: "Fonts", accepts: "TTF, OTF, WOFF, WOFF2, ZIP", action: "Download" },
      { id: "code-snippets", label: "Code Snippets", accepts: "Any code file, ZIP", action: "Copy Code" },
      { id: "devops", label: "DevOps", accepts: "YAML, Terraform, Dockerfile, ZIP", action: "Copy Command" },
      { id: "website-games", label: "Website Games", accepts: "HTML, JS, CSS, ZIP, JSON (game config)", action: "Play Game" },
    ],
    required: true,
  },

  // === OPTIONAL FIELDS ===
  version: {
    label: "Version",
    description: "Semantic version number (e.g., 1.0.0, 2.1.3)",
    default: "1.0.0",
  },
  tags: {
    label: "Tags",
    description: "Comma-separated keywords for search. Max 10 tags.",
    examples: ["ai, productivity, code, desktop, windows"],
  },
  license: {
    label: "License",
    options: ["MIT", "BSL-1.1", "Apache-2.0", "GPL-3.0", "BSD-3-Clause", "Unlicense", "None"],
    default: "MIT",
  },
  platforms: {
    label: "Platforms",
    description: "Which platforms does this run on?",
    options: ["windows", "macos", "linux", "android", "ios", "web"],
  },

  // === FILE UPLOADS ===
  coverImage: {
    label: "Cover Image",
    description: "Hero image displayed at the top of your product page. Recommended: 1200x630px",
    type: "image/*",
    storedIn: "User's GitHub repo (marketplace/assets/{itemId}/)",
  },
  logo: {
    label: "Logo",
    description: "Small icon displayed next to your product name. Recommended: 256x256px",
    type: "image/*",
    storedIn: "User's GitHub repo (marketplace/assets/{itemId}/)",
  },
  screenshots: {
    label: "Screenshots",
    description: "Up to 5 screenshots showing your product in action. Users can browse these.",
    type: "image/*",
    maxCount: 5,
    storedIn: "User's GitHub repo (marketplace/assets/{itemId}/)",
  },
  downloadFile: {
    label: "Download File",
    description: "The actual file users download (APK, EXE, PDF, ZIP, etc.). Uploaded to GitHub Releases.",
    type: "Per category",
    storedIn: "User's GitHub Releases (browser_download_url)",
  },

  // === LINKS ===
  liveDemo: {
    label: "Live Demo URL",
    description: "For websites/templates: URL where users can see a live preview. Can be GitHub Pages.",
    examples: ["https://username.github.io/my-project"],
  },
  githubRepo: {
    label: "GitHub Repo",
    description: "Link to source code repository. Users can view/contribute.",
    examples: ["https://github.com/username/project"],
  },
  installCommand: {
    label: "Install Command",
    description: "For npm packages/plugins: the command to install this package.",
    examples: ["npm install @zyraxon/my-plugin", "npx create-my-app"],
  },
}

export const AI_MODE_PUBLISH_GUIDE = `
## ZYRAXON Ecosystem — AI Publish Guide

When a user asks you to publish something to the ZYRAXON Ecosystem, you must gather ALL relevant fields before publishing.

### FIELDS YOU MUST ASK FOR:

1. **Name** (REQUIRED) — What is the product called?
2. **Description** (REQUIRED) — What does it do? Why use it?
3. **Category** (REQUIRED) — Which category? (ai-bots, plugins, website-templates, desktop-apps, mobile-apps, etc.)
4. **Version** — What version? (default: 1.0.0)
5. **Tags** — Keywords for search (comma separated)
6. **License** — MIT, BSL-1.1, Apache-2.0, etc.
7. **Platforms** — Windows, macOS, Linux, Android, iOS, Web
8. **Cover Image** — Hero image URL or file
9. **Screenshots** — Up to 5 screenshots
10. **Download File** — The actual file (APK, EXE, PDF, etc.)
11. **Live Demo URL** — For websites: live preview URL
12. **GitHub Repo** — Source code link
13. **Install Command** — For npm packages

### HOW STORAGE WORKS:

- **Metadata** (name, description, tags) → Stored in GitHub JSON files
- **Files** (APK, EXE, PDF, images) → Uploaded to user's GitHub repo or GitHub Releases
- **Websites** → GitHub Pages (liveDemo URL)
- **Plugins** → npm registry (installCommand)
- **Source Code** → GitHub repo (githubRepo URL)

### WHAT EACH CATEGORY ACCEPTS:

| Category | File Types | Action Button |
|----------|-----------|---------------|
| AI Bots | JSON, YAML config | Import to ZYRAXON |
| Plugins | JS, TS, JSON, ZIP | Install |
| Website Templates | ZIP, HTML, CSS, JS | View Live |
| Desktop Apps | EXE, DMG, AppImage, DEB, ZIP | Download |
| Mobile Apps | APK, IPA, AAB | Download APK |
| PDFs/Books | PDF, EPUB, MOBI | Download PDF |
| CLI Tools | EXE, DMG, AppImage, ZIP | Copy Command |
| AI Models | BIN, GGUF, ONNX, PT, ZIP | Download |
| Fonts | TTF, OTF, WOFF, WOFF2, ZIP | Download |
| ISO Images | ISO | Download ISO |
| Datasets | CSV, JSON, JSONL, Parquet, ZIP | Download |
| Icon Packs | SVG, PNG, ZIP | Download |
| UI Kits | FIG, Sketch, ZIP | Download |
| DevOps | YAML, Terraform, Dockerfile, ZIP | Copy Command |

### EXAMPLE PUBLISH FLOW:

User: "Publish my Android app to the ecosystem"

AI should ask:
1. What's the app name?
2. What does it do? (description)
3. What version? (e.g., 1.0.0)
4. Tags? (e.g., android, productivity, free)
5. License? (e.g., MIT)
6. Do you have a cover image? (URL or upload)
7. Any screenshots? (up to 5)
8. Upload the APK file
9. GitHub repo link? (optional)
10. Live demo? (optional)

Then AI calls: publishItem({ name, description, category: "mobile-apps", ... }, { downloadFile: apkFile, coverImage: coverImageFile, screenshots: [...] })

### REMIX WORKFLOW — How Users Copy, Customize, Republish:

When a user says "I like this item" or "I want to remix this" or "Download this for me":

1. **Identify the item** — Find it in the marketplace by name, ID, or description
2. **Download the source** — Fetch the item's source code, config, or files from GitHub
3. **Set up locally** — Place files in the user's workspace, install dependencies if needed
4. **Let user customize** — User modifies name, description, code, settings, whatever they want
5. **Republish as remix** — When publishing, set \`remixedFrom: "original-item-id"\` so the original gets credit
6. **Track remix chain** — Each remix increments \`remixCount\` on the original item

REMIX RULES:
- ALWAYS credit the original creator (\`remixedFrom\` field)
- User MUST change at least the name or description (no exact copies)
- Original item's \`remixCount\` increases by 1
- The remix gets its own unique ID
- Remixes can be remixed again (chain of creativity)

EXAMPLE:
User: "I like CodeBot Pro, can I make my own version?"
AI: Downloads CodeBot Pro → sets up in workspace → user renames to "CodeBot Ultra" → changes description → publishes with \`remixedFrom: "codebot-pro"\`

### WEBSITE GAMES — How to Turn Any Website Into a Game:

Category: "website-games"
Accepted files: HTML, JS, CSS, ZIP, JSON (game config)

A "website game" is any website that users can PLAY directly inside ZYRAXON.
This includes:
- HTML5 games (canvas, WebGL, Phaser, PixiJS)
- Interactive websites with game mechanics
- Quizzes, puzzles, challenges
- Educational games
- Simulations
- Any web page with game-like interaction

When publishing a website game:
1. Set \`category: "website-games"\`
2. Set \`type: "website-game"\`
3. Provide \`liveDemo\` URL (GitHub Pages or hosted) — THIS IS REQUIRED for game/template/landing-page items
4. Optionally provide \`gameConfig\` with engine, dimensions, controls
5. Upload HTML/JS/CSS files or ZIP bundle

The game runs inside ZYRAXON's embedded viewer — no external browser needed.

### CRITICAL: LIVE URL RULE

When publishing ANY website-related item (website-templates, landing-pages, website-games):
- ALWAYS set the \`liveDemo\` field with the actual working URL
- The live URL is what powers the "Play Game" / "View Live" button in the marketplace
- Without liveDemo, the item shows but users can't interact with it
- After deploying a website, immediately set liveDemo to the deployed URL
- The marketplace viewer embeds this URL in an iframe for instant preview
`

export const CATEGORY_FILE_GUIDE: Record<string, { accept: string; action: string; description: string }> = {
  "ai-bots": { accept: ".json,.yaml,.yml,.txt", action: "Import", description: "AI bot configurations, personas, prompt templates" },
  "plugins": { accept: ".js,.ts,.json,.zip", action: "Install", description: "Extend ZYRAXON functionality with plugins" },
  "website-templates": { accept: ".zip,.html,.css,.js", action: "View Live", description: "Ready-made website starters" },
  "themes": { accept: ".css,.json,.zip", action: "Install", description: "UI themes and appearance customizations" },
  "components": { accept: ".tsx,.jsx,.vue,.svelte,.zip", action: "Install", description: "Reusable UI components" },
  "startkits": { accept: ".zip,.tar.gz", action: "Download", description: "Full project starter kits" },
  "workflows": { accept: ".json,.yaml,.yml", action: "Import", description: "Automation workflows" },
  "ai-models": { accept: ".bin,.gguf,.onnx,.pt,.zip", action: "Download", description: "Pre-trained models and adapters" },
  "tools": { accept: ".exe,.dmg,.AppImage,.zip", action: "Download", description: "Developer utilities" },
  "sdks": { accept: ".zip,.tar.gz", action: "Download", description: "Software development kits" },
  "pdfs": { accept: ".pdf", action: "Download PDF", description: "Documentation and guides" },
  "books": { accept: ".pdf,.epub,.mobi", action: "Download", description: "E-books and learning material" },
  "apis": { accept: ".json,.yaml", action: "View Docs", description: "API integrations and wrappers" },
  "mobile-apps": { accept: ".apk,.ipa,.aab", action: "Download APK", description: "Mobile application templates" },
  "browser-extensions": { accept: ".crx,.xpi,.zip", action: "Install", description: "Chrome/Firefox extensions" },
  "cli-tools": { accept: ".exe,.dmg,.AppImage,.zip", action: "Copy Command", description: "Command-line utilities" },
  "prompts": { accept: ".txt,.json,.md", action: "Copy Prompt", description: "Prompt templates and libraries" },
  "datasets": { accept: ".csv,.json,.jsonl,.parquet,.zip", action: "Download", description: "Training and reference datasets" },
  "icons": { accept: ".svg,.png,.zip", action: "Download", description: "Icon sets and SVG packs" },
  "ui-kits": { accept: ".fig,.sketch,.zip", action: "Download", description: "Complete UI design systems" },
  "landing-pages": { accept: ".html,.zip", action: "View Live", description: "Marketing page templates" },
  "desktop-apps": { accept: ".exe,.dmg,.AppImage,.deb,.zip", action: "Download", description: "Windows, Mac, Linux applications" },
  "iso-images": { accept: ".iso", action: "Download ISO", description: "Bootable ISO images" },
  "fonts": { accept: ".ttf,.otf,.woff,.woff2,.zip", action: "Download", description: "Custom fonts and typefaces" },
  "code-snippets": { accept: ".js,.ts,.py,.java,.cpp,.zip", action: "Copy Code", description: "Reusable code snippets" },
  "devops": { accept: ".yml,.yaml,.tf,.dockerfile,.zip", action: "Copy Command", description: "CI/CD, Docker, K8s configs" },
  "website-games": { accept: ".html,.js,.css,.zip,.json", action: "Play Game", description: "Playable websites — turn any website into a game" },
}
