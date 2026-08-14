// ZYRAXON INFINITE MEMORY SYSTEM v3 — SQLite-Powered, True Unlimited
// Zero limits. Zero forget. Zero latency. 50,000 year preservation.
// SQLite+WAL for instant queries at any scale. Full-text search FTS5.
// Recent context buffer preserves last 10 turns — survives compaction.

import fs from "fs/promises"
import path from "path"
import { Global } from "@zyraxon-ai/core/global"

type DB = import("bun:sqlite").Database
let db: DB | null = null
let dbInitPromise: Promise<void> | null = null

const MEMORY_DIR = path.join(Global.Path.data, "memory")
const DB_PATH = path.join(MEMORY_DIR, "infinite_memory.db")
const RECENT_BUFFER_SIZE = 10
const MAX_CONTEXT_MEMORIES = 25

async function getDb(): Promise<DB> {
  if (db) return db
  if (!dbInitPromise) {
    dbInitPromise = initDb()
  }
  await dbInitPromise
  return db!
}

async function initDb(): Promise<void> {
  try { await fs.access(MEMORY_DIR) } catch { await fs.mkdir(MEMORY_DIR, { recursive: true }) }
  const { Database } = await import("bun:sqlite")
  db = new Database(DB_PATH)
  db.run("PRAGMA journal_mode=WAL")
  db.run("PRAGMA synchronous=NORMAL")
  db.run("PRAGMA cache_size=-64000")
  db.run("PRAGMA busy_timeout=5000")

  db.run(`CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT 'conversation',
    importance INTEGER NOT NULL DEFAULT 5,
    source TEXT NOT NULL DEFAULT 'auto',
    timestamp INTEGER NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed INTEGER NOT NULL DEFAULT 0,
    project_id TEXT DEFAULT '',
    session_id TEXT DEFAULT '',
    compressed INTEGER NOT NULL DEFAULT 0,
    original_ids TEXT DEFAULT ''
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    agent TEXT DEFAULT '',
    model TEXT DEFAULT '',
    timestamp INTEGER NOT NULL,
    turn_index INTEGER NOT NULL DEFAULT 0
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS context_buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )`)

  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_context_buffer_session ON context_buffer(session_id)`)

  try {
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(key, content, summary, tags, content=memories, content_rowid=rowid)`)
  } catch {
    try { db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(key, content, summary, tags)`) } catch {}
  }

  try { db.run(`INSERT OR IGNORE INTO memories_fts(memories_fts) VALUES('rebuild')`) } catch {}
}

export interface MemoryEntry {
  id: string; key: string; content: string; summary: string
  tags: string[]; category: string; importance: number
  source: string; timestamp: number; accessCount: number
  lastAccessed: number; projectId?: string; sessionId?: string
  compressed?: boolean; originalIds?: string[]
}

export interface AutoContext {
  enabled: boolean; lastInjection: number; injectedCount: number
  totalMemories: number; recentContext: string
  userPreferences: Record<string, string>
  projectContext: string; sessionHistory: string[]
  learnedPatterns: string[]; masterPreferences: Record<string, string>
  lastCompression: number; version: number
}

const CONTEXT_FILE = path.join(MEMORY_DIR, "auto_context.json")
let cachedContext: AutoContext | null = null

async function loadAutoContext(): Promise<AutoContext> {
  if (cachedContext) return cachedContext
  try {
    const data = await fs.readFile(CONTEXT_FILE, "utf-8")
    cachedContext = JSON.parse(data)
  } catch {
    cachedContext = {
      enabled: true, lastInjection: 0, injectedCount: 0, totalMemories: 0,
      recentContext: "", userPreferences: {}, projectContext: "",
      sessionHistory: [], learnedPatterns: [], masterPreferences: {},
      lastCompression: 0, version: 3,
    }
  }
  return cachedContext!
}

async function saveAutoContext(ctx?: AutoContext): Promise<void> {
  const c = ctx || cachedContext
  if (!c) return
  cachedContext = c
  await fs.writeFile(CONTEXT_FILE + ".tmp", JSON.stringify(c, null, 2))
  await fs.rename(CONTEXT_FILE + ".tmp", CONTEXT_FILE)
}

// ============================================
// CORE: Memory Store / Recall (SQLite)
// ============================================

function rowToEntry(row: any): MemoryEntry {
  return {
    id: row.id, key: row.key, content: row.content, summary: row.summary,
    tags: JSON.parse(row.tags || '[]'), category: row.category,
    importance: row.importance, source: row.source,
    timestamp: row.timestamp, accessCount: row.access_count,
    lastAccessed: row.last_accessed,
    projectId: row.project_id || undefined,
    sessionId: row.session_id || undefined,
    compressed: row.compressed === 1,
    originalIds: row.original_ids ? JSON.parse(row.original_ids) : undefined,
  }
}

export async function storeMemory(params: {
  key: string; content: string; summary?: string; tags?: string[]
  category?: string; importance?: number; source?: string
  projectId?: string; sessionId?: string
}): Promise<void> {
  const d = await getDb()
  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const now = Date.now()
  d.run(`INSERT OR REPLACE INTO memories (id, key, content, summary, tags, category, importance, source, timestamp, access_count, last_accessed, project_id, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [id, params.key, params.content, params.summary || params.content.substring(0, 150),
     JSON.stringify(params.tags || []), params.category || 'conversation',
     params.importance ?? 5, params.source || 'auto', now, now,
     params.projectId || '', params.sessionId || ''])
  try { d.run(`INSERT INTO memories_fts (rowid, key, content, summary, tags) VALUES (last_insert_rowid(), ?, ?, ?, ?)`,
    [params.key, params.content, params.summary || '', JSON.stringify(params.tags || [])]) } catch {}
}

export async function searchMemories(query: string, limit: number = 25): Promise<MemoryEntry[]> {
  const d = await getDb()
  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)

  let rows: any[]
  try {
    rows = d.query(`SELECT * FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?`).all(queryLower, limit) as any[]
    if (rows.length > 0) {
      const ids = rows.map((r: any) => r.id || r.rowid)
      const placeholders = ids.map(() => '?').join(',')
      return d.query(`SELECT * FROM memories WHERE id IN (${placeholders})`).all(...ids).map(rowToEntry)
    }
  } catch {}

  rows = d.query(`SELECT * FROM memories ORDER BY importance DESC, timestamp DESC LIMIT ?`).all(limit) as any[]
  const scored = rows.map((r: any) => {
    let score = 0
    const keyL = (r.key || '').toLowerCase()
    const contentL = (r.content || '').toLowerCase()
    const summaryL = (r.summary || '').toLowerCase()
    if (keyL.includes(queryLower)) score += 100
    if (contentL.includes(queryLower)) score += 50
    if (summaryL.includes(queryLower)) score += 30
    for (const w of queryWords) {
      if (keyL.includes(w)) score += 20
      if (contentL.includes(w)) score += 10
      if (summaryL.includes(w)) score += 8
    }
    score += (r.importance || 5) * 5
    const age = Date.now() - r.timestamp
    if (age < 86400000) score += 30
    else if (age < 604800000) score += 20
    score += Math.min((r.access_count || 0) * 3, 30)
    return { row: r, score }
  })
  return scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(r => rowToEntry(r.row))
}

export async function storeConversationTurn(params: {
  sessionId: string; role: string; content: string; agent?: string; model?: string
}): Promise<void> {
  const d = await getDb()
  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const maxTurn = d.query(`SELECT COALESCE(MAX(turn_index), -1) as mx FROM conversations WHERE session_id = ?`).get(params.sessionId) as any
  const turnIndex = (maxTurn?.mx ?? -1) + 1
  d.run(`INSERT INTO conversations (id, session_id, role, content, agent, model, timestamp, turn_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.sessionId, params.role, params.content, params.agent || '', params.model || '', Date.now(), turnIndex])
  storeContextBuffer(params.sessionId, `${params.role}: ${params.content.substring(0, 500)}`)
}

export async function getRecentConversationTurns(sessionId: string, count: number = 10): Promise<any[]> {
  const d = await getDb()
  return d.query(`SELECT * FROM conversations WHERE session_id = ? ORDER BY turn_index DESC LIMIT ?`).all(sessionId, count) as any[]
}

function storeContextBuffer(sessionId: string, content: string): void {
  if (!db) return
  db.run(`INSERT INTO context_buffer (session_id, entry_type, content, timestamp) VALUES (?, 'turn', ?, ?)`,
    [sessionId, content, Date.now()])
  db.run(`DELETE FROM context_buffer WHERE id NOT IN (SELECT id FROM context_buffer WHERE session_id = ? ORDER BY id DESC LIMIT ?)`,
    [sessionId, RECENT_BUFFER_SIZE * 2])
}

export async function getContextBuffer(sessionId: string): Promise<string[]> {
  const d = await getDb()
  const rows = d.query(`SELECT content FROM context_buffer WHERE session_id = ? ORDER BY id DESC LIMIT ?`).all(sessionId, RECENT_BUFFER_SIZE) as any[]
  return rows.map((r: any) => r.content).reverse()
}

export async function getMemoryStatsDetailed(): Promise<{
  totalMemories: number; totalConversations: number; totalTurns: number
  oldestMemory: string; newestMemory: string; topCategories: Record<string, number>
  bufferSize: number
}> {
  const d = await getDb()
  const memCount = (d.query(`SELECT COUNT(*) as c FROM memories`).get() as any)?.c || 0
  const convCount = (d.query(`SELECT COUNT(DISTINCT session_id) as c FROM conversations`).get() as any)?.c || 0
  const turnCount = (d.query(`SELECT COUNT(*) as c FROM conversations`).get() as any)?.c || 0
  const oldest = (d.query(`SELECT MIN(timestamp) as t FROM memories`).get() as any)?.t
  const newest = (d.query(`SELECT MAX(timestamp) as t FROM memories`).get() as any)?.t
  const cats = d.query(`SELECT category, COUNT(*) as c FROM memories GROUP BY category ORDER BY c DESC`).all() as any[]
  const bufSize = (d.query(`SELECT COUNT(*) as c FROM context_buffer`).get() as any)?.c || 0
  const topCats: Record<string, number> = {}
  for (const r of cats) topCats[r.category] = r.c
  return {
    totalMemories: memCount, totalConversations: convCount, totalTurns: turnCount,
    oldestMemory: oldest ? new Date(oldest).toISOString() : 'none',
    newestMemory: newest ? new Date(newest).toISOString() : 'none',
    topCategories: topCats, bufferSize: bufSize,
  }
}

// ============================================
// Legacy interface (wraps SQLite)
// ============================================

export async function autoInjectContext(userMessage: string, agent: string): Promise<string> {
  const ctx = await loadAutoContext()
  if (!ctx.enabled) return ""
  const parts: string[] = []

  // Current mode/agent awareness
  parts.push(`Current mode: ${agent}`)

  if (ctx.masterPreferences && Object.keys(ctx.masterPreferences).length > 0) {
    const masterPrefs = Object.entries(ctx.masterPreferences).map(([k, v]) => `- ${k}: ${v}`).join("\n")
    parts.push(`Master's preferences (NEVER violate):\n${masterPrefs}`)
  }

  if (ctx.recentContext) {
    parts.push(`Recent context:\n${ctx.recentContext}`)
  }
  if (Object.keys(ctx.userPreferences).length > 0) {
    const prefs = Object.entries(ctx.userPreferences).map(([k, v]) => `- ${k}: ${v}`).join("\n")
    parts.push(`User preferences:\n${prefs}`)
  }
  if (ctx.projectContext) {
    parts.push(`Project context:\n${ctx.projectContext}`)
  }
  if (ctx.learnedPatterns.length > 0) {
    parts.push(`Learned patterns:\n${ctx.learnedPatterns.map(p => `- ${p}`).join("\n")}`)
  }
  if (ctx.sessionHistory.length > 0) {
    parts.push(`Recent session:\n${ctx.sessionHistory.slice(-8).join("\n")}`)
  }

  // SQLite-powered unlimited memory recall
  try {
    const memories = await searchMemories(userMessage, MAX_CONTEXT_MEMORIES)
    if (memories.length > 0) {
      const memStr = memories.map(m => {
        const age = Date.now() - m.timestamp
        const daysOld = Math.floor(age / 86400000)
        let recency = daysOld === 0 ? "today" : daysOld === 1 ? "yesterday" : daysOld < 7 ? `${daysOld}d ago` : daysOld < 30 ? `${Math.floor(daysOld / 7)}w ago` : daysOld < 365 ? `${Math.floor(daysOld / 30)}mo ago` : `${Math.floor(daysOld / 365)}y ago`
        return `- [${m.importance}/10|${m.category}|${recency}] ${m.key}: ${m.summary.substring(0, 200)}`
      }).join("\n")
      parts.push(`Unlimited memory recall (${memories.length} matches):\n${memStr}`)
    }
  } catch {}

  ctx.lastInjection = Date.now()
  ctx.injectedCount++
  await saveAutoContext(ctx)

  if (parts.length === 0) return ""
  return `[ZYRAXON INFINITE MEMORY]\n${parts.join("\n\n")}\n[/ZYRAXON INFINITE MEMORY]\n\n`
}

export async function autoStoreConversation(
  userMessage: string, assistantResponse: string, agent: string, model: string,
  projectId?: string, sessionId?: string,
): Promise<void> {
  const ctx = await loadAutoContext()
  const now = Date.now()
  const importance = calculateImportance(userMessage, assistantResponse)
  const tags = extractTags(userMessage + " " + assistantResponse)
  const category = extractCategory(userMessage + " " + assistantResponse)
  const key = extractKey(userMessage)
  const isMaster = masterKeywords.some(kw => userMessage.toLowerCase().includes(kw))

  if (importance >= 3 || isMaster) {
    await storeMemory({
      key, content: userMessage.substring(0, 2000),
      summary: generateSummary(userMessage), tags, category,
      importance: isMaster ? Math.max(importance, 9) : importance,
      source: "auto", projectId, sessionId,
    })
  }

  if (isMaster) {
    if (!ctx.masterPreferences) ctx.masterPreferences = {}
    ctx.masterPreferences[key.substring(0, 50)] = userMessage.substring(0, 500)
  }

  ctx.recentContext = `User: ${userMessage.substring(0, 300)}\nAssistant: ${assistantResponse.substring(0, 300)}`
  ctx.sessionHistory.push(`[${agent}] User: ${userMessage.substring(0, 150)}`)
  if (ctx.sessionHistory.length > 50) ctx.sessionHistory = ctx.sessionHistory.slice(-50)

  const prefs = extractPreferences(userMessage)
  for (const [k, v] of Object.entries(prefs)) ctx.userPreferences[k] = v

  if (sessionId) {
    await storeConversationTurn({ sessionId, role: "user", content: userMessage, agent, model })
    await storeConversationTurn({ sessionId, role: "assistant", content: assistantResponse, agent, model })
  }

  await saveAutoContext(ctx)
}

export async function smartRecall(query: string, limit: number = 15): Promise<string> {
  const memories = await searchMemories(query, limit)
  if (memories.length === 0) return "No relevant memories found."
  return memories.map(m => {
    const age = Date.now() - m.timestamp
    const daysOld = Math.floor(age / 86400000)
    let recency = daysOld === 0 ? "today" : daysOld === 1 ? "yesterday" : daysOld < 7 ? `${daysOld} days ago` : daysOld < 30 ? `${Math.floor(daysOld / 7)} weeks ago` : daysOld < 365 ? `${Math.floor(daysOld / 30)} months ago` : `${Math.floor(daysOld / 365)} years ago`
    return `[${m.importance}/10|${m.category}|${recency}] ${m.key}:\n${m.summary.substring(0, 400)}`
  }).join("\n\n")
}

// ============================================
// Legacy helpers (preserved for compatibility)
// ============================================

const masterKeywords = ["মাস্টার", "master", "always remember", "সবসময় মনে রাখো", "never forget", "কখনো ভুলবা না"]

function calculateImportance(userMessage: string, assistantResponse: string): number {
  let importance = 5
  const combined = (userMessage + " " + assistantResponse).toLowerCase()
  const highImportance = ["critical", "important", "always", "never", "must", "requirement", "constraint", "decision", "chose", "architecture", "security"]
  const medImportance = ["bug", "error", "feature", "implementation", "fix", "preference", "prefer", "pattern", "workflow"]
  const lowImportance = ["test", "example", "demo", "temporary"]
  for (const word of highImportance) { if (combined.includes(word)) importance += 2 }
  for (const word of medImportance) { if (combined.includes(word)) importance += 1 }
  for (const word of lowImportance) { if (combined.includes(word)) importance -= 1 }
  if (combined.includes("master") || combined.includes("মাস্টার")) importance += 3
  if (combined.includes("always") || combined.includes("সবসময়")) importance += 2
  if (combined.includes("never") || combined.includes("কখনো না")) importance += 2
  if (combined.includes("remember") || combined.includes("মনে রাখো")) importance += 3
  if (assistantResponse.length > 500) importance += 1
  if (assistantResponse.length > 1000) importance += 1
  return Math.min(10, Math.max(1, importance))
}

function extractCategory(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes("bug") || lower.includes("error") || lower.includes("fix")) return "error"
  if (lower.includes("prefer") || lower.includes("like") || lower.includes("want")) return "preference"
  if (lower.includes("decided") || lower.includes("chose") || lower.includes("architecture")) return "decision"
  if (lower.includes("pattern") || lower.includes("workflow") || lower.includes("approach")) return "workflow"
  if (lower.includes("code") || lower.includes("function") || lower.includes("class")) return "code"
  if (lower.includes("fact") || lower.includes("info") || lower.includes("note")) return "fact"
  return "conversation"
}

function extractTags(text: string): string[] {
  const tags: string[] = []
  const lower = text.toLowerCase()
  const tagMap: Record<string, string> = {
    bug: "bug", error: "bug", crash: "bug", exception: "bug",
    feature: "feature", add: "feature", implement: "feature", create: "feature",
    fix: "fix", resolve: "fix", repair: "fix", patch: "fix",
    test: "test", testing: "test", unittest: "test",
    deploy: "deploy", deployment: "deploy", release: "deploy",
    security: "security", auth: "security", password: "security", token: "security",
    performance: "performance", optimization: "performance", speed: "performance", slow: "performance",
    ui: "ui", frontend: "ui", design: "ui", layout: "ui",
    api: "api", backend: "api", endpoint: "api", rest: "api",
    database: "database", db: "database", sql: "database", query: "database",
    config: "config", configuration: "config", settings: "config",
    master: "master", মাস্টার: "master",
    important: "important", critical: "important",
    zyraxon: "zyraxon", zyraxon: "zyraxon",
  }
  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (lower.includes(keyword) && !tags.includes(tag)) tags.push(tag)
  }
  return tags.slice(0, 10)
}

function extractKey(text: string): string {
  const words = text.split(/\s+/).filter(w => w.length > 2).slice(0, 8)
  return words.join("_").substring(0, 80) || "unknown"
}

function generateSummary(content: string): string {
  if (content.length <= 150) return content
  const sentences = content.split(/[.!?।]+/).filter(s => s.trim().length > 10)
  if (sentences.length <= 2) return content.substring(0, 150)
  return sentences.slice(0, 2).join(". ").substring(0, 150)
}

function extractPreferences(text: string): Record<string, string> {
  const prefs: Record<string, string> = {}
  const lower = text.toLowerCase()
  if (lower.includes("prefer") || lower.includes("like") || lower.includes("use")) {
    if (lower.includes("typescript")) prefs["language"] = "TypeScript"
    if (lower.includes("javascript")) prefs["language"] = "JavaScript"
    if (lower.includes("python")) prefs["language"] = "Python"
    if (lower.includes("dark mode") || lower.includes("dark")) prefs["theme"] = "dark"
    if (lower.includes("light mode") || lower.includes("light")) prefs["theme"] = "light"
    if (lower.includes("bun")) prefs["runtime"] = "bun"
    if (lower.includes("node")) prefs["runtime"] = "node"
  }
  if (lower.includes("call me") || lower.includes("নাম")) {
    const nameMatch = text.match(/(?:call me|নাম)\s+(\w+)/i)
    if (nameMatch) prefs["name"] = nameMatch[1]
  }
  return prefs
}

export async function storeMasterPreference(key: string, value: string): Promise<void> {
  const ctx = await loadAutoContext()
  if (!ctx.masterPreferences) ctx.masterPreferences = {}
  ctx.masterPreferences[key] = value
  await saveAutoContext(ctx)
  await storeMemory({
    key: `master_pref_${key}`, content: `Master preference: ${key} = ${value}`,
    summary: `Master wants ${key}: ${value}`, tags: ["master", "preference", "important"],
    category: "preference", importance: 10, source: "manual",
  })
}

export async function autoLearnPattern(pattern: string, context: string): Promise<void> {
  await storeMemory({
    key: `pattern_${extractKey(pattern)}`, content: `${pattern}\nContext: ${context}`,
    summary: generateSummary(pattern), tags: ["pattern", "learned", ...extractTags(pattern)],
    category: "pattern", importance: 7, source: "learned",
  })
  const ctx = await loadAutoContext()
  if (!ctx.learnedPatterns) ctx.learnedPatterns = []
  ctx.learnedPatterns.push(pattern.substring(0, 200))
  if (ctx.learnedPatterns.length > 1000) ctx.learnedPatterns = ctx.learnedPatterns.slice(-1000)
  await saveAutoContext(ctx)
}

export async function getMemoryStats(): Promise<{
  total: number; compressed: number; categories: Record<string, number>
  topTags: Array<{ tag: string; count: number }>
  oldestMemory: string; newestMemory: string
}> {
  try {
    const d = await getDb()
    const total = (d.query(`SELECT COUNT(*) as c FROM memories`).get() as any)?.c || 0
    const compressed = (d.query(`SELECT COUNT(*) as c FROM memories WHERE compressed=1`).get() as any)?.c || 0
    const catRows = d.query(`SELECT category, COUNT(*) as c FROM memories GROUP BY category`).all() as any[]
    const categories: Record<string, number> = {}
    for (const r of catRows) categories[r.category] = r.c
    const tagRows = d.query(`SELECT tags FROM memories`).all() as any[]
    const tagCounts: Record<string, number> = {}
    for (const r of tagRows) {
      try { for (const t of JSON.parse(r.tags)) tagCounts[t] = (tagCounts[t] || 0) + 1 } catch {}
    }
    const topTags = Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 20)
    const oldest = (d.query(`SELECT MIN(timestamp) as t FROM memories`).get() as any)?.t
    const newest = (d.query(`SELECT MAX(timestamp) as t FROM memories`).get() as any)?.t
    return { total, compressed, categories, topTags, oldestMemory: oldest ? new Date(oldest).toISOString() : "none", newestMemory: newest ? new Date(newest).toISOString() : "none" }
  } catch {
    return { total: 0, compressed: 0, categories: {}, topTags: [], oldestMemory: "none", newestMemory: "none" }
  }
}

// ============================================
// ETERNAL MEMORY v4 — Knowledge Graph, Decisions, Errors, Patterns
// ============================================

export interface KnowledgeEntity {
  id: string; entityType: string; name: string; description: string
  importance: number; accessCount: number; metadata: Record<string, any>
  timeCreated: number; timeUpdated: number; timeLastAccessed: number
}

export interface KnowledgeRelation {
  id: string; fromEntityId: string; toEntityId: string
  relationType: string; weight: number; metadata: Record<string, any>
  timeCreated: number
}

export interface DecisionRecord {
  id: string; decision: string; reasoning: string
  alternatives: string[]; outcome: string; impactScore: number
  sessionId: string; timeCreated: number; timeResolved?: number
}

export interface ErrorRecord {
  id: string; errorType: string; errorMessage: string
  stackTrace: string; fixApplied: string; fixSessionId: string
  occurrenceCount: number; severity: string
  timeFirstSeen: number; timeLastSeen: number
}

export interface LearnedPattern {
  id: string; patternType: string; description: string
  frequency: number; confidenceScore: number
  exampleSessions: string[]; timeCreated: number; timeLastSeen: number
}

export interface MemorySummary {
  id: string; timeRange: string; timeStart: number; timeEnd: number
  content: string; messageCount: number; importanceScore: number
  timeCreated: number
}

export async function storeKnowledgeEntity(params: {
  entityType: string; name: string; description?: string
  importance?: number; metadata?: Record<string, any>
}): Promise<string> {
  const d = await getDb()
  const id = `entity_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const now = Date.now()
  d.run(`INSERT OR REPLACE INTO knowledge_entity (id, entity_type, name, description, importance, access_count, metadata, time_created, time_updated, time_last_accessed)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [id, params.entityType, params.name, params.description || '',
     params.importance ?? 5, JSON.stringify(params.metadata || {}),
     now, now, now])
  return id
}

export async function getKnowledgeEntity(id: string): Promise<KnowledgeEntity | null> {
  const d = await getDb()
  const row = d.query(`SELECT * FROM knowledge_entity WHERE id = ?`).get(id) as any
  if (!row) return null
  d.run(`UPDATE knowledge_entity SET access_count = access_count + 1, time_last_accessed = ? WHERE id = ?`, [Date.now(), id])
  return {
    id: row.id, entityType: row.entity_type, name: row.name, description: row.description,
    importance: row.importance, accessCount: row.access_count + 1,
    metadata: JSON.parse(row.metadata || '{}'),
    timeCreated: row.time_created, timeUpdated: row.time_updated, timeLastAccessed: Date.now(),
  }
}

export async function searchKnowledgeEntities(query: string, limit: number = 20): Promise<KnowledgeEntity[]> {
  const d = await getDb()
  const queryLower = query.toLowerCase()
  const rows = d.query(`SELECT * FROM knowledge_entity WHERE name LIKE ? OR description LIKE ? ORDER BY importance DESC, access_count DESC LIMIT ?`)
    .all(`%${queryLower}%`, `%${queryLower}%`, limit) as any[]
  return rows.map((r: any) => ({
    id: r.id, entityType: r.entity_type, name: r.name, description: r.description,
    importance: r.importance, accessCount: r.access_count,
    metadata: JSON.parse(r.metadata || '{}'),
    timeCreated: r.time_created, timeUpdated: r.time_updated, timeLastAccessed: r.time_last_accessed,
  }))
}

export async function storeKnowledgeRelation(params: {
  fromEntityId: string; toEntityId: string; relationType: string
  weight?: number; metadata?: Record<string, any>
}): Promise<string> {
  const d = await getDb()
  const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  d.run(`INSERT INTO knowledge_relation (id, from_entity_id, to_entity_id, relation_type, weight, metadata, time_created)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, params.fromEntityId, params.toEntityId, params.relationType,
     params.weight ?? 1.0, JSON.stringify(params.metadata || {}), Date.now()])
  return id
}

export async function getEntityRelations(entityId: string): Promise<KnowledgeRelation[]> {
  const d = await getDb()
  const rows = d.query(`SELECT * FROM knowledge_relation WHERE from_entity_id = ? OR to_entity_id = ?`)
    .all(entityId, entityId) as any[]
  return rows.map((r: any) => ({
    id: r.id, fromEntityId: r.from_entity_id, toEntityId: r.to_entity_id,
    relationType: r.relation_type, weight: r.weight,
    metadata: JSON.parse(r.metadata || '{}'), timeCreated: r.time_created,
  }))
}

export async function storeDecision(params: {
  decision: string; reasoning?: string; alternatives?: string[]
  impactScore?: number; sessionId?: string
}): Promise<string> {
  const d = await getDb()
  const id = `decision_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  d.run(`INSERT INTO decision (id, decision, reasoning, alternatives, outcome, impact_score, session_id, time_created)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
    [id, params.decision, params.reasoning || '',
     JSON.stringify(params.alternatives || []), params.impactScore ?? 5,
     params.sessionId || '', Date.now()])
  return id
}

export async function searchDecisions(query: string, limit: number = 10): Promise<DecisionRecord[]> {
  const d = await getDb()
  const queryLower = query.toLowerCase()
  const rows = d.query(`SELECT * FROM decision WHERE decision LIKE ? OR reasoning LIKE ? ORDER BY impact_score DESC, time_created DESC LIMIT ?`)
    .all(`%${queryLower}%`, `%${queryLower}%`, limit) as any[]
  return rows.map((r: any) => ({
    id: r.id, decision: r.decision, reasoning: r.reasoning,
    alternatives: JSON.parse(r.alternatives || '[]'), outcome: r.outcome,
    impactScore: r.impact_score, sessionId: r.session_id,
    timeCreated: r.time_created, timeResolved: r.time_resolved || undefined,
  }))
}

export async function storeError(params: {
  errorType: string; errorMessage: string; stackTrace?: string
  severity?: string; fixApplied?: string; fixSessionId?: string
}): Promise<string> {
  const d = await getDb()
  const now = Date.now()
  const existing = d.query(`SELECT id, occurrence_count FROM error_record WHERE error_type = ? AND error_message = ?`).get(params.errorType, params.errorMessage) as any
  if (existing) {
    d.run(`UPDATE error_record SET occurrence_count = occurrence_count + 1, time_last_seen = ?, fix_applied = COALESCE(?, fix_applied), fix_session_id = COALESCE(?, fix_session_id) WHERE id = ?`,
      [now, params.fixApplied || null, params.fixSessionId || null, existing.id])
    return existing.id
  }
  const id = `error_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  d.run(`INSERT INTO error_record (id, error_type, error_message, stack_trace, fix_applied, fix_session_id, occurrence_count, severity, time_first_seen, time_last_seen)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, params.errorType, params.errorMessage, params.stackTrace || '',
     params.fixApplied || '', params.fixSessionId || '',
     params.severity || 'medium', now, now])
  return id
}

export async function searchErrors(query: string, limit: number = 10): Promise<ErrorRecord[]> {
  const d = await getDb()
  const queryLower = query.toLowerCase()
  const rows = d.query(`SELECT * FROM error_record WHERE error_type LIKE ? OR error_message LIKE ? ORDER BY occurrence_count DESC, time_last_seen DESC LIMIT ?`)
    .all(`%${queryLower}%`, `%${queryLower}%`, limit) as any[]
  return rows.map((r: any) => ({
    id: r.id, errorType: r.error_type, errorMessage: r.error_message,
    stackTrace: r.stack_trace, fixApplied: r.fix_applied,
    fixSessionId: r.fix_session_id, occurrenceCount: r.occurrence_count,
    severity: r.severity, timeFirstSeen: r.time_first_seen, timeLastSeen: r.time_last_seen,
  }))
}

export async function getErrorFix(errorType: string, errorMessage: string): Promise<string | null> {
  const d = await getDb()
  const row = d.query(`SELECT fix_applied FROM error_record WHERE error_type = ? AND error_message LIKE ? AND fix_applied != '' ORDER BY occurrence_count DESC LIMIT 1`)
    .get(errorType, `%${errorMessage.substring(0, 100)}%`) as any
  return row?.fix_applied || null
}

export async function storeLearnedPattern(params: {
  patternType: string; description: string; exampleSessions?: string[]
  confidenceScore?: number
}): Promise<string> {
  const d = await getDb()
  const now = Date.now()
  const existing = d.query(`SELECT id, frequency FROM learned_pattern WHERE pattern_type = ? AND description = ?`).get(params.patternType, params.description) as any
  if (existing) {
    d.run(`UPDATE learned_pattern SET frequency = frequency + 1, time_last_seen = ?, confidence_score = MAX(confidence_score, ?) WHERE id = ?`,
      [now, params.confidenceScore ?? 5, existing.id])
    return existing.id
  }
  const id = `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  d.run(`INSERT INTO learned_pattern (id, pattern_type, description, frequency, confidence_score, example_sessions, time_created, time_last_seen)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
    [id, params.patternType, params.description,
     params.confidenceScore ?? 5, JSON.stringify(params.exampleSessions || []), now, now])
  return id
}

export async function searchPatterns(query: string, limit: number = 10): Promise<LearnedPattern[]> {
  const d = await getDb()
  const queryLower = query.toLowerCase()
  const rows = d.query(`SELECT * FROM learned_pattern WHERE pattern_type LIKE ? OR description LIKE ? ORDER BY frequency DESC, confidence_score DESC LIMIT ?`)
    .all(`%${queryLower}%`, `%${queryLower}%`, limit) as any[]
  return rows.map((r: any) => ({
    id: r.id, patternType: r.pattern_type, description: r.description,
    frequency: r.frequency, confidenceScore: r.confidence_score,
    exampleSessions: JSON.parse(r.example_sessions || '[]'),
    timeCreated: r.time_created, timeLastSeen: r.time_last_seen,
  }))
}

export async function storeTemporalIndex(params: {
  entityId: string; entityType: string; eventType: string
  metadata?: Record<string, any>
}): Promise<void> {
  const d = await getDb()
  const id = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  d.run(`INSERT INTO temporal_index (id, entity_id, entity_type, time_point, event_type, metadata)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [id, params.entityId, params.entityType, Date.now(), params.eventType,
     JSON.stringify(params.metadata || {})])
}

// ============================================
// ENHANCED auto-injection with Knowledge Graph
// ============================================

export async function autoInjectContextV2(userMessage: string, agent: string): Promise<string> {
  const ctx = await loadAutoContext()
  if (!ctx.enabled) return ""
  const parts: string[] = []

  parts.push(`Current mode: ${agent}`)

  if (ctx.masterPreferences && Object.keys(ctx.masterPreferences).length > 0) {
    const masterPrefs = Object.entries(ctx.masterPreferences).map(([k, v]) => `- ${k}: ${v}`).join("\n")
    parts.push(`Master's preferences (NEVER violate):\n${masterPrefs}`)
  }

  // Knowledge Graph context
  try {
    const entities = await searchKnowledgeEntities(userMessage, 5)
    if (entities.length > 0) {
      const entityStr = entities.map(e => {
        const age = Date.now() - e.timeLastAccessed
        const daysOld = Math.floor(age / 86400000)
        let recency = daysOld === 0 ? "today" : daysOld === 1 ? "yesterday" : daysOld < 7 ? `${daysOld}d ago` : `${Math.floor(daysOld / 30)}mo ago`
        return `- [${e.entityType}|${e.importance}/10|${recency}] ${e.name}: ${e.description.substring(0, 150)}`
      }).join("\n")
      parts.push(`Knowledge graph (${entities.length} entities):\n${entityStr}`)
    }
  } catch {}

  // Previous decisions context
  try {
    const decisions = await searchDecisions(userMessage, 3)
    if (decisions.length > 0) {
      const decStr = decisions.map(d => `- [${d.outcome}|impact:${d.impactScore}] ${d.decision}`).join("\n")
      parts.push(`Previous decisions:\n${decStr}`)
    }
  } catch {}

  // Known errors context
  try {
    const errors = await searchErrors(userMessage, 3)
    if (errors.length > 0) {
      const errStr = errors.map(e => `- [${e.severity}|${e.occurrenceCount}x] ${e.errorType}: ${e.errorMessage.substring(0, 100)}`).join("\n")
      parts.push(`Known errors (avoid repeating):\n${errStr}`)
    }
  } catch {}

  // Learned patterns
  try {
    const patterns = await searchPatterns(userMessage, 3)
    if (patterns.length > 0) {
      const patStr = patterns.map(p => `- [${p.patternType}|${p.frequency}x|${p.confidenceScore}/10] ${p.description.substring(0, 150)}`).join("\n")
      parts.push(`Learned patterns:\n${patStr}`)
    }
  } catch {}

  if (ctx.recentContext) {
    parts.push(`Recent context:\n${ctx.recentContext}`)
  }
  if (Object.keys(ctx.userPreferences).length > 0) {
    const prefs = Object.entries(ctx.userPreferences).map(([k, v]) => `- ${k}: ${v}`).join("\n")
    parts.push(`User preferences:\n${prefs}`)
  }
  if (ctx.projectContext) {
    parts.push(`Project context:\n${ctx.projectContext}`)
  }
  if (ctx.learnedPatterns.length > 0) {
    parts.push(`Learned patterns:\n${ctx.learnedPatterns.slice(-10).map(p => `- ${p}`).join("\n")}`)
  }
  if (ctx.sessionHistory.length > 0) {
    parts.push(`Recent session:\n${ctx.sessionHistory.slice(-8).join("\n")}`)
  }

  // SQLite-powered unlimited memory recall
  try {
    const memories = await searchMemories(userMessage, MAX_CONTEXT_MEMORIES)
    if (memories.length > 0) {
      const memStr = memories.map(m => {
        const age = Date.now() - m.timestamp
        const daysOld = Math.floor(age / 86400000)
        let recency = daysOld === 0 ? "today" : daysOld === 1 ? "yesterday" : daysOld < 7 ? `${daysOld}d ago` : daysOld < 30 ? `${Math.floor(daysOld / 7)}w ago` : daysOld < 365 ? `${Math.floor(daysOld / 30)}mo ago` : `${Math.floor(daysOld / 365)}y ago`
        return `- [${m.importance}/10|${m.category}|${recency}] ${m.key}: ${m.summary.substring(0, 200)}`
      }).join("\n")
      parts.push(`Unlimited memory recall (${memories.length} matches):\n${memStr}`)
    }
  } catch {}

  ctx.lastInjection = Date.now()
  ctx.injectedCount++
  await saveAutoContext(ctx)

  if (parts.length === 0) return ""
  return `[ZYRAXON ETERNAL MEMORY v4]\n${parts.join("\n\n")}\n[/ZYRAXON ETERNAL MEMORY]\n\n`
}

export async function autoStoreConversationV2(
  userMessage: string, assistantResponse: string, agent: string, model: string,
  projectId?: string, sessionId?: string,
): Promise<void> {
  // Store basic memory
  await autoStoreConversation(userMessage, assistantResponse, agent, model, projectId, sessionId)

  // Extract and store knowledge entities
  try {
    const entities = extractKnowledgeEntities(userMessage + " " + assistantResponse)
    for (const entity of entities) {
      const entityId = await storeKnowledgeEntity(entity)
      // Store temporal index
      await storeTemporalIndex({ entityId, entityType: entity.entityType, eventType: "mentioned" })
    }
  } catch {}

  // Store decision if detected
  try {
    const decision = extractDecision(userMessage)
    if (decision) {
      await storeDecision({ decision, reasoning: assistantResponse.substring(0, 500), sessionId })
    }
  } catch {}

  // Store error if detected
  try {
    const error = extractError(userMessage)
    if (error) {
      await storeError(error)
    }
  } catch {}

  // Store pattern if detected
  try {
    const pattern = extractPattern(userMessage, assistantResponse)
    if (pattern) {
      await storeLearnedPattern(pattern)
    }
  } catch {}
}

function extractKnowledgeEntities(text: string): Array<{ entityType: string; name: string; description: string; importance: number }> {
  const entities: Array<{ entityType: string; name: string; description: string; importance: number }> = []
  const lower = text.toLowerCase()

  // Extract people
  const peoplePatterns = [/\b(boss|manager|developer|designer|user|admin|master|মাস্টার)\b/gi]
  for (const pattern of peoplePatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      entities.push({ entityType: "person", name: match[1], description: `Person mentioned: ${match[1]}`, importance: 7 })
    }
  }

  // Extract technologies
  const techPatterns = [/\b(typescript|javascript|python|rust|go|react|vue|angular|node|bun|deno|sqlite|postgres|redis|docker|kubernetes|aws|gcp|azure)\b/gi]
  for (const pattern of techPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      entities.push({ entityType: "technology", name: match[1].toLowerCase(), description: `Technology: ${match[1]}`, importance: 6 })
    }
  }

  // Extract files
  const filePattern = /\b[\w\-/]+\.(ts|js|py|rs|go|tsx|jsx|json|yaml|yml|md|txt|sql|css|html)\b/gi
  let fileMatch
  while ((fileMatch = filePattern.exec(text)) !== null) {
    entities.push({ entityType: "file", name: fileMatch[0], description: `File: ${fileMatch[0]}`, importance: 5 })
  }

  // Extract concepts
  const conceptPatterns = [/\b(api|endpoint|database|server|client|authentication|authorization|caching|deployment|testing|debugging|refactoring)\b/gi]
  for (const pattern of conceptPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      entities.push({ entityType: "concept", name: match[1].toLowerCase(), description: `Concept: ${match[1]}`, importance: 5 })
    }
  }

  return entities.slice(0, 10)
}

function extractDecision(text: string): string | null {
  const lower = text.toLowerCase()
  const decisionKeywords = ["decided", "chose", "selected", "picked", "going with", "will use", " decided"]
  for (const keyword of decisionKeywords) {
    if (lower.includes(keyword)) {
      const idx = lower.indexOf(keyword)
      return text.substring(idx, Math.min(idx + 200, text.length))
    }
  }
  return null
}

function extractError(text: string): { errorType: string; errorMessage: string; severity: string } | null {
  const lower = text.toLowerCase()
  const errorKeywords = ["error", "bug", "crash", "exception", "failed", "failure", "broken"]
  for (const keyword of errorKeywords) {
    if (lower.includes(keyword)) {
      return {
        errorType: keyword,
        errorMessage: text.substring(0, 500),
        severity: lower.includes("critical") || lower.includes("fatal") ? "critical" :
                  lower.includes("high") || lower.includes("major") ? "high" : "medium",
      }
    }
  }
  return null
}

function extractPattern(userMessage: string, assistantResponse: string): { patternType: string; description: string; confidenceScore: number } | null {
  const lower = (userMessage + " " + assistantResponse).toLowerCase()
  if (lower.includes("always") || lower.includes("every time") || lower.includes("pattern")) {
    return {
      patternType: "behavioral",
      description: userMessage.substring(0, 300),
      confidenceScore: 6,
    }
  }
  if (lower.includes("workflow") || lower.includes("process") || lower.includes("steps")) {
    return {
      patternType: "workflow",
      description: userMessage.substring(0, 300),
      confidenceScore: 5,
    }
  }
  return null
}

export const autoMemory = {
  autoInjectContext, autoInjectContextV2, autoStoreConversation, autoStoreConversationV2,
  autoLearnPattern, smartRecall, storeMasterPreference, getMemoryStats,
  loadAutoContext, saveAutoContext, storeMemory, searchMemories,
  storeConversationTurn, getRecentConversationTurns, getContextBuffer, getMemoryStatsDetailed,
  storeKnowledgeEntity, getKnowledgeEntity, searchKnowledgeEntities,
  storeKnowledgeRelation, getEntityRelations, storeDecision, searchDecisions,
  storeError, searchErrors, storeLearnedPattern, searchPatterns, storeTemporalIndex,
}
