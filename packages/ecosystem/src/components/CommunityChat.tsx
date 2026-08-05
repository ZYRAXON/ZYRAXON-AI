import { type Component, createSignal, For, Show, onMount, onCleanup, createEffect, createMemo } from "solid-js"
import Peer, { type MediaConnection, type DataConnection } from "peerjs"
import type { ChatMessage } from "../types"
import { getGitHubStorage } from "../services/github-data"
import { getAuthState } from "../services/auth"
import { CommunityRealtime } from "../services/community-realtime"
import { getGithubToken, GITHUB_API } from "../config"

/* ═══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════════ */
const MAX_PEERS_PER_ROOM = 5
const ROOM_PREFIX = "zyraxon-room"
const MESSAGES_POLL_INTERVAL = 8000
const DATA_REPO = "sayidilxs-web/zyraxon-ecosystem-data"
const MAIN_TOKEN = getGithubToken()
interface ChannelDef { id: string; name: string; description: string }
const CHANNELS: ChannelDef[] = [
  { id: "general", name: "General Chat", description: "General discussion for all community members" },
  { id: "ai-devs", name: "AI Developers", description: "AI development discussions" },
  { id: "plugin-creators", name: "Plugin Creators", description: "Plugin creation and sharing" },
  { id: "marketplace-support", name: "Marketplace Support", description: "Get help with marketplace issues" },
  { id: "announcements", name: "Announcements", description: "Official announcements" },
]

/* ─── Online user type ─── */
interface OnlineUser { id: string; username: string; status: "online" | "away" | "offline"; avatarUrl?: string }
type CallMode = null | "video" | "audio" | "voice" | "screen"

/* ─── SVG Icons (Solid components) ─── */
const SvgHash: Component = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
const SvgRobot: Component = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/><path d="M12 11V7"/><path d="M9 7h6"/><line x1="12" y1="4" x2="12" y2="7"/></svg>
const SvgPuzzle: Component = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 01-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 10-3.214 3.214c.446.166.855.497.925.968a.979.979 0 01-.276.837l-1.61 1.611a2.404 2.404 0 01-1.705.707 2.402 2.402 0 01-1.704-.706l-1.568-1.568a1.026 1.026 0 00-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 11-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 00-.289-.877l-1.568-1.568A2.402 2.402 0 011.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 01.837-.276c.47.07.802.48.968.925a2.501 2.501 0 103.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 01.276-.837l1.61-1.611A2.404 2.404 0 0112 2c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 113.237 3.237c-.464.18-.894.527-.967 1.02z"/></svg>
const SvgCart: Component = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
const SvgMegaphone: Component = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/></svg>
const SvgGlobe: Component = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
const SvgVideo: Component = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
const SvgHeadphones: Component = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg>
const SvgMic: Component = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="1" width="6" height="11" rx="3"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
const SvgScreen: Component = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
const SvgSend: Component = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
const SvgSmile: Component = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
const SvgHeart: Component<{size?: number}> = (props) => <svg width={props.size || 12} height={props.size || 12} viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
const SvgVolume: Component = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
const SvgMute: Component = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .55-.06 1.08-.17 1.58"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>

const CHANNEL_ICON_MAP: Record<string, Component> = {
  "general": SvgHash, "ai-devs": SvgRobot, "plugin-creators": SvgPuzzle,
  "marketplace-support": SvgCart, "announcements": SvgMegaphone,
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "IMG"
  if (["mp4","webm","mov","avi","mkv"].includes(ext)) return "VID"
  if (["mp3","wav","ogg","flac","aac","m4a"].includes(ext)) return "AUD"
  if (["apk"].includes(ext)) return "APK"
  if (["zip","rar","7z","tar","gz"].includes(ext)) return "ZIP"
  if (["pdf"].includes(ext)) return "PDF"
  if (["js","ts","tsx","jsx","py","java","cpp","go","rs"].includes(ext)) return "SRC"
  return "FILE"
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function formatTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ts).toLocaleDateString()
}
function getAvatarUrl(username: string) { return `https://github.com/${username}.png` }

/* ─── GitHub file storage ─── */
async function ghGetFile(path: string): Promise<any> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${DATA_REPO}/contents/${path}`, {
      headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` }
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.content) return JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))))
    return null
  } catch { return null }
}

async function ghPutFile(path: string, content: any, message: string): Promise<boolean> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${DATA_REPO}/contents/${path}`, {
      headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` }
    })
    if (!res.ok) return false
    const data = await res.json()
    await fetch(`${GITHUB_API}/repos/${DATA_REPO}/contents/${path}`, {
      method: "PUT",
      headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), sha: data.sha })
    })
    return true
  } catch { return false }
}

/* ═══════════════════════════════════════════════════════════════
   PEER VIDEO
   ═══════════════════════════════════════════════════════════════ */
const PeerVideo: Component<{ stream: MediaStream; label: string }> = (props) => {
  let ref: HTMLVideoElement | undefined
  createEffect(() => { if (ref) { ref.srcObject = props.stream; ref.play().catch(() => {}) } })
  return (
    <div class="relative min-w-[180px] h-[120px] rounded-xl overflow-hidden bg-black">
      <video ref={ref} autoplay playsinline class="w-full h-full object-cover" />
      <span class="absolute bottom-1.5 left-2 bg-black/70 backdrop-blur px-2 py-0.5 rounded-md text-[11px] text-[#c9d1d9] font-medium">{props.label}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export const CommunityChat: Component = () => {
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [newMessage, setNewMessage] = createSignal("")
  const [sending, setSending] = createSignal(false)
  const [activeChannel, setActiveChannel] = createSignal("general")
  const [showEmoji, setShowEmoji] = createSignal(false)
  const [callMode, setCallMode] = createSignal<CallMode>(null)
  const [isMuted, setIsMuted] = createSignal(false)
  const [isVideoOff, setIsVideoOff] = createSignal(false)
  const [peers, setPeers] = createSignal<{ id: string; stream: MediaStream }[]>([])
  const [rtPeers, setRtPeers] = createSignal<{ id: string; username: string; stream: MediaStream }[]>([])
  const [onlineUsers, setOnlineUsers] = createSignal<OnlineUser[]>([])
  const [callError, setCallError] = createSignal("")
  const [showOnlinePanel, setShowOnlinePanel] = createSignal(true)

  const auth = getAuthState()
  let chatContainer: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined
  let localVideoRef: HTMLVideoElement | undefined
  let screenVideoRef: HTMLVideoElement | undefined

  let peer: Peer | null = null
  const connections = new Map<string, MediaConnection>()
  const dataConnections = new Map<string, DataConnection>()
  const localStream = { value: null as MediaStream | null }
  const screenStream = { value: null as MediaStream | null }
  const pendingLocalMsgs = new Map<string, ChatMessage>()
  let rt: CommunityRealtime | null = null
  let lastChannel = activeChannel()

  const currentChannel = createMemo(() => CHANNELS.find(c => c.id === activeChannel()) || CHANNELS[0])

  /* ─── Load messages ─── */
  const loadMessages = async () => {
    try {
      const ch = activeChannel()
      const decoded = await ghGetFile(`community_chat_${ch}.json`)
      let serverMsgs: ChatMessage[] = (Array.isArray(decoded) && decoded.length > 0)
        ? decoded.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-300)
        : []
      // Load file attachments from separate files
      serverMsgs = await Promise.all(serverMsgs.map(async (msg) => {
        if ((msg as any).attachment?.fileId && !(msg as any).attachment?.url) {
          try {
            const fd = await ghGetFile(`chat_files/${ch}/${(msg as any).attachment.fileId}.json`)
            if (fd?.data) return { ...msg, attachment: { ...(msg as any).attachment, url: `data:${fd.type};base64,${fd.data}` } } as ChatMessage
          } catch {}
        }
        return msg
      }))
      if (lastChannel !== ch) { lastChannel = ch; pendingLocalMsgs.clear(); setMessages(serverMsgs) }
      else {
        setMessages((prev) => {
          const ids = new Set(serverMsgs.map(m => m.id))
          const pending = prev.filter(m => !ids.has(m.id))
          const merged = new Map<string, ChatMessage>()
          for (const m of [...pending, ...serverMsgs]) merged.set(m.id, m)
          return Array.from(merged.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        })
        for (const m of serverMsgs) pendingLocalMsgs.delete(m.id)
      }
    } catch {}
  }

  const loadOnlineUsers = async () => {
    try {
      const users = await ghGetFile("online_users.json")
      setOnlineUsers(Array.isArray(users) ? users : [])
    } catch {}
  }

  onMount(() => {
    loadMessages(); loadOnlineUsers()
    const authState = getAuthState()
    rt = new CommunityRealtime(
      { userId: authState.user?.id || `guest-${Date.now()}`, username: authState.user?.username || "guest", avatarUrl: authState.user?.avatarUrl || "" },
      { onChat: (message: any) => { if (!message?.id) return; setMessages(p => p.some(m => m.id === message.id) ? p : [...p, message]) }, onPeers: (list) => setRtPeers(list) }
    )
    rt.connect().catch(() => {})
    if (auth.user) {
      ghGetFile("online_users.json").then(existing => {
        const list = Array.isArray(existing) ? existing : []
        ghPutFile("online_users.json", [...list.filter((u: OnlineUser) => u.id !== auth.user!.id), { id: auth.user!.id, username: auth.user!.username, status: "online", avatarUrl: auth.user!.avatarUrl }], "User online")
      })
    }
    const mi = setInterval(loadMessages, MESSAGES_POLL_INTERVAL)
    const oi = setInterval(loadOnlineUsers, 15000)
    onCleanup(() => { clearInterval(mi); clearInterval(oi); leaveCall(); rt?.disconnect() })
  })

  createEffect(() => { messages(); setTimeout(() => chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" }), 50) })

  const sendMessage = async () => {
    const content = newMessage().trim()
    if (!content || !auth.user) return
    setSending(true)
    const msg: ChatMessage = { id: `msg-${genId()}`, userId: auth.user.id, username: auth.user.username, avatarUrl: auth.user.avatarUrl || "", content, timestamp: new Date().toISOString(), likes: 0, likedBy: [] }
    setMessages(p => [...p, msg]); pendingLocalMsgs.set(msg.id, msg); setNewMessage(""); setShowEmoji(false)
    rt?.sendChat(msg)
    dataConnections.forEach(dc => { try { dc.send(JSON.stringify({ type: "chat", message: msg })) } catch {} })
    try { const ch = activeChannel(); const ex = await ghGetFile(`community_chat_${ch}.json`); await ghPutFile(`community_chat_${ch}.json`, [...(Array.isArray(ex) ? ex : []), msg].slice(-300), `Chat: ${msg.username}`) } catch {}
    setSending(false)
  }

  /* ─── Call system ─── */
  const loadRooms = async (): Promise<Record<string, number>> => { try { const r = await ghGetFile("active_rooms.json"); return (r && typeof r === "object" && !Array.isArray(r)) ? r : {} } catch { return {} } }
  const findRoom = async (): Promise<string> => { const rooms = await loadRooms(); for (let i = 0; i < 1000; i++) { const id = `${ROOM_PREFIX}-${i}`; if ((rooms[id] || 0) < MAX_PEERS_PER_ROOM) return id } return `${ROOM_PREFIX}-${Date.now()}` }

  const setupDC = (conn: DataConnection) => {
    conn.on("data", (data: any) => {
      try {
        const p = JSON.parse(data as string)
        if (p.type === "chat" && p.message) setMessages(prev => prev.find(m => m.id === p.message.id) ? prev : [...prev, p.message])
      } catch {}
    })
    conn.on("close", () => dataConnections.delete(conn.peer))
  }

  const leaveCall = async () => {
    connections.forEach(c => { try { c.close() } catch {} }); connections.clear()
    dataConnections.forEach(dc => { try { dc.close() } catch {} }); dataConnections.clear()
    if (peer) { try { peer.destroy() } catch {} peer = null }
    localStream.value?.getTracks().forEach(t => t.stop()); localStream.value = null
    screenStream.value?.getTracks().forEach(t => t.stop()); screenStream.value = null
    setPeers([]); setRtPeers([]); setCallMode(null); setIsMuted(false); setIsVideoOff(false); setCallError("")
    rt?.endCall()
  }

  const startCall = async (mode: CallMode) => {
    if (!auth.user) { setCallError("Sign in to join calls"); return }
    if (callMode()) await leaveCall()
    setCallError("")
    try {
      if (mode === "video" || mode === "audio") { const s = await navigator.mediaDevices.getUserMedia({ video: mode === "video", audio: true }); localStream.value = s; if (mode === "video" && localVideoRef) { localVideoRef.srcObject = s; localVideoRef.play().catch(() => {}) } }
      else if (mode === "voice") { localStream.value = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }) }
      else if (mode === "screen") { const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); screenStream.value = s; if (screenVideoRef) { screenVideoRef.srcObject = s; screenVideoRef.play().catch(() => {}) }; s.getVideoTracks()[0].onended = () => leaveCall(); try { localStream.value = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }) } catch {} }
      setCallMode(mode); rt?.startCall(localStream.value || screenStream.value!).catch(() => {})
      const roomId = await findRoom(); const rooms = await loadRooms(); const idx = rooms[roomId] || 0; const peerId = `${roomId}-peer-${idx}`
      peer = new Peer(peerId)
      peer.on("open", async () => { rooms[roomId] = (rooms[roomId] || 0) + 1; await ghPutFile("active_rooms.json", rooms, "Update rooms").catch(() => {}); const s = localStream.value; if (!s) return; for (let i = 0; i < MAX_PEERS_PER_ROOM; i++) { const pid = `${roomId}-peer-${i}`; if (pid === peerId || connections.has(pid)) continue; try { const c = peer!.connect(pid); c.on("open", () => { dataConnections.set(pid, c); setupDC(c); const call = peer!.call(pid, s); if (call) { connections.set(pid, call); call.on("stream", (rs) => { setPeers(p => { const ex = p.find(x => x.id === pid); return ex ? p.map(x => x.id === pid ? { ...x, stream: rs } : x) : [...p, { id: pid, stream: rs }] }) }); call.on("close", () => { setPeers(p => p.filter(x => x.id !== pid)); connections.delete(pid) }) } }) } catch {} } })
      peer.on("connection", (c) => { dataConnections.set(c.peer, c); setupDC(c) })
      peer.on("call", (c) => { if (localStream.value) { c.answer(localStream.value); connections.set(c.peer, c); c.on("stream", (rs) => { setPeers(p => { const ex = p.find(x => x.id === c.peer); return ex ? p.map(x => x.id === c.peer ? { ...x, stream: rs } : x) : [...p, { id: c.peer, stream: rs }] }) }); c.on("close", () => { setPeers(p => p.filter(x => x.id !== c.peer)); connections.delete(c.peer) }) } })
      peer.on("error", (err) => setCallError(`Error: ${err.type}`))
    } catch { setCallError("Camera/mic access denied") }
  }

  const toggleMute = () => { const t = localStream.value?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled) } }
  const toggleVideo = () => { const t = localStream.value?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setIsVideoOff(!t.enabled) } }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div class="flex h-full bg-[#0d1117] text-[#c9d1d9] overflow-hidden">

      {/* LEFT SIDEBAR */}
      <div class="w-[260px] min-w-[260px] bg-[#161b22] border-r border-[#21262d] flex flex-col overflow-hidden max-md:hidden">
        <div class="px-3.5 py-3.5 border-b border-[#21262d]" style={{ background: "linear-gradient(135deg, rgba(31,111,235,0.1), rgba(137,87,229,0.08))" }}>
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[#1f6feb] to-[#8957e5] flex items-center justify-center text-white"><SvgGlobe /></div>
            <div>
              <div class="font-bold text-sm text-[#e6edf3]">ZYRAXON Community</div>
              <div class="text-[11px] text-[#8b949e]">{onlineUsers().length || (auth.user ? 1 : 0)} online</div>
            </div>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto py-2">
          <div class="px-3.5 pb-1 text-[11px] font-bold text-[#8b949e] uppercase tracking-wider">Community</div>
          <For each={CHANNELS}>{(ch) => (
            <button onClick={() => setActiveChannel(ch.id)} class={`flex items-center gap-2 w-full px-3.5 py-[7px] border-none cursor-pointer text-left text-[13px] transition-all rounded-none ${activeChannel() === ch.id ? "bg-[rgba(88,166,255,0.12)] text-[#58a6ff]" : "bg-transparent text-[#8b949e] hover:bg-[rgba(88,166,255,0.06)]"}`}>
              <span class="flex-shrink-0">{(() => { const I = CHANNEL_ICON_MAP[ch.id]; return I ? <I /> : <SvgHash /> })()}</span>
              <span>{ch.name}</span>
            </button>
          )}</For>
          <div class="px-3.5 pt-4 pb-1 text-[11px] font-bold text-[#8b949e] uppercase tracking-wider">Voice Channels</div>
          <div class="px-3.5 py-2">
            <div class="rounded-lg border border-[#21262d] bg-[#0d1117] p-2.5">
              <div class="text-[12px] text-[#8b949e] mb-2 font-medium flex items-center gap-1.5"><SvgVolume /> General Voice</div>
              <Show when={callMode()}>
                <div class="flex items-center gap-2 py-1">
                  <div class="w-7 h-7 rounded-full bg-[#21262d] flex items-center justify-center text-[11px]">{auth.user?.username?.[0]?.toUpperCase() || "?"}</div>
                  <span class="text-[12px] text-[#c9d1d9]">{auth.user?.username || "You"}</span>
                  <Show when={isMuted()}><span class="ml-auto text-[#f85149]"><SvgMute /></span></Show>
                </div>
              </Show>
              <For each={peers()}>{(p) => (
                <div class="flex items-center gap-2 py-1">
                  <div class="w-7 h-7 rounded-full bg-[#21262d] flex items-center justify-center text-[11px] text-[#8b949e]">P</div>
                  <span class="text-[12px] text-[#c9d1d9]">peer-{p.id.split("-").slice(-1)[0]}</span>
                </div>
              )}</For>
            </div>
          </div>
          <div class="px-3.5 pt-3 pb-1 text-[11px] font-bold text-[#8b949e] uppercase tracking-wider">Direct Messages</div>
          <For each={onlineUsers().slice(0, 8)}>{(user) => (
            <div class="flex items-center gap-2 px-3.5 py-[5px] cursor-pointer text-[13px] hover:bg-[rgba(88,166,255,0.06)] transition-colors">
              <div class="relative">
                <img src={user.avatarUrl || getAvatarUrl(user.username)} alt="" class="w-7 h-7 rounded-full bg-[#21262d]" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${user.username}&background=1f6feb&color=fff&size=56` }} />
                <div class={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161b22] ${user.status === "online" ? "bg-[#3fb950]" : user.status === "away" ? "bg-[#d29922]" : "bg-[#484f58]"}`} />
              </div>
              <span class="text-[#c9d1d9]">{user.username}</span>
            </div>
          )}</For>
        </div>
        <div class="border-t border-[#21262d] p-3">
          <div class="text-[11px] font-bold text-[#8b949e] uppercase tracking-wider mb-2">Call Controls</div>
          <div class="grid grid-cols-4 gap-1.5">
            <button onClick={() => callMode() === "video" ? leaveCall() : startCall("video")} class={`flex flex-col items-center gap-0.5 py-2 rounded-lg border-none cursor-pointer transition-all ${callMode() === "video" ? "bg-[#3fb950] text-white" : "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]"}`}><SvgVideo /><span class="text-[9px] font-medium">Video</span></button>
            <button onClick={() => callMode() === "audio" ? leaveCall() : startCall("audio")} class={`flex flex-col items-center gap-0.5 py-2 rounded-lg border-none cursor-pointer transition-all ${callMode() === "audio" ? "bg-[#3fb950] text-white" : "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]"}`}><SvgHeadphones /><span class="text-[9px] font-medium">Audio</span></button>
            <button onClick={() => callMode() === "voice" ? leaveCall() : startCall("voice")} class={`flex flex-col items-center gap-0.5 py-2 rounded-lg border-none cursor-pointer transition-all ${callMode() === "voice" ? "bg-[#f85149] text-white" : "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]"}`}><SvgMic /><span class="text-[9px] font-medium">Voice</span></button>
            <button onClick={() => callMode() === "screen" ? leaveCall() : startCall("screen")} class={`flex flex-col items-center gap-0.5 py-2 rounded-lg border-none cursor-pointer transition-all ${callMode() === "screen" ? "bg-[#8957e5] text-white" : "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]"}`}><SvgScreen /><span class="text-[9px] font-medium">Screen</span></button>
          </div>
          <Show when={callMode()}>
            <div class="flex gap-1.5 mt-2">
              <button onClick={toggleMute} class={`flex-1 py-1.5 rounded-lg border-none cursor-pointer text-[12px] font-medium transition-all ${isMuted() ? "bg-[#f85149] text-white" : "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]"}`}>{isMuted() ? "Unmute" : "Mute"}</button>
              <Show when={callMode() === "video" || callMode() === "audio"}><button onClick={toggleVideo} class={`flex-1 py-1.5 rounded-lg border-none cursor-pointer text-[12px] font-medium transition-all ${isVideoOff() ? "bg-[#f85149] text-white" : "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]"}`}>{isVideoOff() ? "Cam On" : "Cam Off"}</button></Show>
              <button onClick={leaveCall} class="flex-1 py-1.5 rounded-lg border-none cursor-pointer text-[12px] font-medium bg-[#f85149] text-white hover:bg-[#da3633] transition-all">Leave</button>
            </div>
          </Show>
          <div class="mt-2 text-center text-[11px] text-[#484f58]">{callMode() ? `${callMode()!.toUpperCase()} · ${peers().length + 1}/${MAX_PEERS_PER_ROOM}` : "No active call"}</div>
        </div>
      </div>

      {/* MAIN CHAT */}
      <div class="flex-1 flex flex-col min-w-0">
        <div class="px-4 py-2.5 bg-[#161b22] border-b border-[#21262d] flex items-center gap-3">
          <span class="flex-shrink-0">{(() => { const I = CHANNEL_ICON_MAP[activeChannel()]; return I ? <I /> : <SvgHash /> })()}</span>
          <div class="flex-1 min-w-0"><div class="font-bold text-[14px] text-[#e6edf3]"># {currentChannel().name}</div><div class="text-[11px] text-[#8b949e]">{currentChannel().description}</div></div>
          <Show when={callMode()}><span class={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${callMode() === "screen" ? "bg-[#8957e5] text-white" : "bg-[#3fb950] text-white"}`}>{callMode()} · {peers().length + 1}</span></Show>
          <button onClick={() => setShowOnlinePanel(v => !v)} class="ml-2 p-1.5 rounded-lg bg-transparent border border-[#21262d] text-[#8b949e] cursor-pointer hover:bg-[#21262d] hover:text-[#c9d1d9] transition-colors"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg></button>
        </div>
        <Show when={callError()}><div class="px-4 py-2 bg-[#f8514915] border-b border-[#f8514933] text-[12px] text-[#f85149]">{callError()}</div></Show>
        <Show when={callMode() && (callMode() === "video" || callMode() === "screen")}>
          <div class="px-4 py-3 bg-[#0d1117] border-b border-[#21262d]">
            <div class="flex gap-2 overflow-x-auto pb-1">
              <Show when={callMode() === "video"}>
                <div class="relative min-w-[180px] h-[120px] rounded-xl overflow-hidden bg-black border-2 border-[#1f6feb]">
                  <video ref={localVideoRef} autoplay muted playsinline class="w-full h-full object-cover" />
                  <span class="absolute bottom-1.5 left-2 bg-black/70 backdrop-blur px-2 py-0.5 rounded-md text-[11px] text-[#c9d1d9]">You {isMuted() ? "(Muted)" : ""}</span>
                  <Show when={isVideoOff()}><div class="absolute inset-0 flex items-center justify-center bg-[#21262d]"><div class="w-12 h-12 rounded-full bg-[#30363d] flex items-center justify-center text-xl text-[#8b949e]">{(auth.user?.username || "?")[0].toUpperCase()}</div></div></Show>
                </div>
              </Show>
              <For each={peers()}>{(p) => <PeerVideo stream={p.stream} label={`peer-${p.id.split("-").slice(-1)[0]}`} />}</For>
              <For each={rtPeers()}>{(p) => <PeerVideo stream={p.stream} label={p.username || "peer"} />}</For>
            </div>
          </div>
        </Show>
        <Show when={!auth.user}>
          <div class="flex-1 flex items-center justify-center"><div class="text-center px-6"><div class="w-12 h-12 rounded-full bg-[#21262d] flex items-center justify-center mx-auto mb-4"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div><p class="text-[#8b949e] text-sm mb-2">Sign in to join the community chat</p><p class="text-[#484f58] text-xs">Connect your GitHub account to start chatting</p></div></div>
        </Show>
        <Show when={auth.user}>
          <div ref={chatContainer} class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-0.5">
            <Show when={messages().length === 0}>
              <div class="flex-1 flex flex-col items-center justify-center text-center"><div class="mb-3 text-[#1f6feb]">{(() => { const I = CHANNEL_ICON_MAP[activeChannel()]; return I ? <I /> : <SvgHash /> })()}</div><div class="text-lg font-bold text-[#e6edf3] mb-1">Welcome to #{currentChannel().name}!</div><div class="text-[13px] text-[#8b949e]">This is the start of the conversation.</div></div>
            </Show>
            <For each={messages()}>{(msg, i) => {
              const own = () => msg.userId === auth.user?.id
              const showAv = () => i() === 0 || messages()[i() - 1]?.userId !== msg.userId
              return (
                <div class={`flex gap-2.5 py-0.5 ${own() ? "flex-row-reverse" : ""} ${showAv() ? "mt-2" : ""}`}>
                  <Show when={showAv()} fallback={<div class="w-9 flex-shrink-0" />}><img src={msg.avatarUrl || getAvatarUrl(msg.username)} alt="" class="w-9 h-9 rounded-full bg-[#21262d] flex-shrink-0 mt-0.5 object-cover" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${msg.username}&background=1f6feb&color=fff&size=72` }} /></Show>
                  <div class={`max-w-[70%] min-w-0 ${own() ? "text-right" : ""}`}>
                    <Show when={showAv()}><div class={`flex items-baseline gap-2 mb-0.5 ${own() ? "justify-end" : ""}`}><span class={`text-[13px] font-semibold ${msg.username === "ZYRAXON" ? "text-[#58a6ff]" : own() ? "text-[#a371f7]" : "text-[#e6edf3]"}`}>{msg.username}</span><span class="text-[10px] text-[#484f58]">{formatTime(msg.timestamp)}</span></div></Show>
                    <div class={`px-3.5 py-2 rounded-2xl text-[13.5px] leading-relaxed break-words inline-block text-left ${own() ? "bg-gradient-to-br from-[#1f6feb] to-[#1a60d4] text-white rounded-br-md" : "bg-[#161b22] text-[#c9d1d9] border border-[#21262d] rounded-bl-md"}`}>
                      <Show when={!(msg as any).attachment} fallback={<div><Show when={(msg as any).attachment?.url}><div><div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#21262d]"><span class="text-sm font-bold text-[#58a6ff]">{getFileIcon((msg as any).attachment?.name || "")}</span><span class="text-sm text-[#58a6ff]">{(msg as any).attachment?.name}</span></div><Show when={(msg as any).attachment?.type?.startsWith("image/")}><img src={(msg as any).attachment?.url} alt="" class="max-w-[360px] max-h-[240px] rounded-lg mt-1 object-cover" /></Show><Show when={(msg as any).attachment?.type?.startsWith("video/")}><video src={(msg as any).attachment?.url} controls class="max-w-[360px] max-h-[240px] rounded-lg mt-1" /></Show></div></Show><span style={{ "white-space": "pre-wrap" }}>{msg.content}</span></div>}>
                        <span style={{ "white-space": "pre-wrap" }}>{msg.content}</span>
                      </Show>
                    </div>
                    <div class={`flex items-center gap-1 mt-0.5 ${own() ? "justify-end" : "justify-start"}`}>
                      <button onClick={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, likes: m.likes + 1 } : m))} class="bg-transparent border-none text-[#484f58] cursor-pointer flex items-center gap-0.5 hover:text-[#f85149] transition-colors text-[11px] py-0 px-1"><SvgHeart /> {msg.likes > 0 ? msg.likes : ""}</button>
                    </div>
                  </div>
                </div>
              )
            }}</For>
          </div>
        </Show>
        <Show when={auth.user}>
          <div class="px-4 py-3 bg-[#161b22] border-t border-[#21262d]">
            <div class="flex gap-2 items-center">
              <button onClick={() => setShowEmoji(!showEmoji())} class={`p-2 rounded-lg border bg-[#0d1117] cursor-pointer transition-all ${showEmoji() ? "border-[#58a6ff] text-[#58a6ff]" : "border-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#30363d]"}`}><SvgSmile /></button>
              <input ref={inputRef} type="text" value={newMessage()} onInput={(e) => setNewMessage(e.currentTarget.value)} onKeyPress={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }} placeholder={`Message #${currentChannel().name}`} class="flex-1 px-4 py-2.5 rounded-xl border border-[#21262d] bg-[#0d1117] text-[#c9d1d9] text-[13.5px] outline-none focus:border-[#58a6ff] transition-colors" disabled={sending()} />
              <button onClick={sendMessage} disabled={!newMessage().trim() || sending()} class={`px-5 py-2.5 rounded-xl border-none cursor-pointer text-[13px] font-semibold transition-all ${newMessage().trim() ? "bg-gradient-to-br from-[#238636] to-[#2ea043] text-white hover:from-[#2ea043] hover:to-[#3fb950]" : "bg-[#21262d] text-[#484f58] cursor-not-allowed"}`}>{sending() ? "..." : <SvgSend />}</button>
            </div>
          </div>
        </Show>
      </div>

      {/* RIGHT SIDEBAR */}
      <Show when={showOnlinePanel()}>
        <div class="w-[220px] bg-[#161b22] border-l border-[#21262d] flex-col overflow-hidden max-lg:hidden flex">
          <div class="px-3.5 py-3 border-b border-[#21262d] text-[12px] font-bold text-[#8b949e] uppercase flex items-center justify-between">
            <span>Online — {onlineUsers().filter(u => u.id !== auth.user?.id).length + (auth.user ? 1 : 0)}</span>
            <button onClick={() => setShowOnlinePanel(false)} class="bg-transparent border-none text-[#8b949e] cursor-pointer hover:text-[#c9d1d9] px-1 leading-none"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div class="flex-1 overflow-y-auto py-1.5">
            <Show when={auth.user}>
              <div class="flex items-center gap-2.5 px-3.5 py-1.5 hover:bg-[rgba(88,166,255,0.06)] transition-colors">
                <div class="relative"><img src={auth.user!.avatarUrl || getAvatarUrl(auth.user!.username)} alt="" class="w-8 h-8 rounded-full bg-[#21262d]" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${auth.user?.username}&background=8957e5&color=fff&size=64` }} /><div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#3fb950] border-2 border-[#161b22]" /></div>
                <div><div class="text-[13px] text-[#e6edf3] font-medium">{auth.user!.username}</div><div class="text-[10px] text-[#3fb950]">online - you</div></div>
              </div>
            </Show>
            <For each={onlineUsers().filter(u => u.id !== auth.user?.id)}>{(user) => (
              <div class="flex items-center gap-2.5 px-3.5 py-1.5 hover:bg-[rgba(88,166,255,0.06)] transition-colors cursor-pointer">
                <div class="relative"><img src={user.avatarUrl || getAvatarUrl(user.username)} alt="" class="w-8 h-8 rounded-full bg-[#21262d]" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${user.username}&background=1f6feb&color=fff&size=64` }} /><div class={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161b22] ${user.status === "online" ? "bg-[#3fb950]" : user.status === "away" ? "bg-[#d29922]" : "bg-[#484f58]"}`} /></div>
                <div><div class="text-[13px] text-[#c9d1d9]">{user.username}</div><div class="text-[10px] text-[#484f58]">{user.status}</div></div>
              </div>
            )}</For>
            <Show when={onlineUsers().length === 0 && !auth.user}><div class="px-3.5 py-4 text-center text-[12px] text-[#484f58]">Sign in to see who's online</div></Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
