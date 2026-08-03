import { type Component, createSignal, For, Show, onMount, onCleanup } from "solid-js"
import Peer, { type MediaConnection, type DataConnection } from "peerjs"
import type { ChatMessage } from "../types"
import { getGitHubStorage } from "../services/github-data"
import { getAuthState } from "../services/auth"
import { CommunityRealtime } from "../services/community-realtime"
import { IconSend, IconCommunity } from "./Icons"

const MAX_PEERS_PER_ROOM = 5
const ROOM_PREFIX = "zyraxon-room"
const MESSAGES_POLL_INTERVAL = 10000
const GITHUB_API = "https://api.github.com"
const ECOSYSTEM_DATA_REPO = "onelpawarai/zyraxon-ecosystem-data"
const MAIN_TOKEN = "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"
const CHAT_STORAGE_KEY = "zyraxon_community_chat_cache"

const EMOJI_CATEGORIES: Record<string, string[]> = {
  "Smileys": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","😐","😑","😏","😒","🙄","😬","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐"],
  "Gestures": ["👋","🤚","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏"],
  "Hearts": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❣️","💕","💞","💓","💗","💖","💘","💝","💟"],
  "Objects": ["🔥","⭐","🌟","💫","✨","⚡","🎉","🎊","🎯","🏆","🎮","🎵","🎶","📱","💻","🖥️","📷","📸","🎬","🎨","🔧","💰","💳","📦","🎁","📌","🔑","🔒"],
  "Nature": ["🌈","☀️","🌤️","⛅","☁️","🌧️","❄️","🌊","💧","🍀","🌸","🌺","🌻","🌹","🌷","🌱","🌲","🌳","🌴","🌵"],
  "Food": ["🍎","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥝","🍅","🥑","🌮","🍕","🍔","🍟","🌭","🍿","🧁","🍰","🎂","🍩","🍪","🍫","☕","🍵"],
}

interface PeerStream {
  peerId: string
  username: string
  stream: MediaStream
  isMuted: boolean
  isVideoOff: boolean
}

export const CommunityChat: Component = () => {
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [newMessage, setNewMessage] = createSignal("")
  const [sending, setSending] = createSignal(false)
  const [showEmoji, setShowEmoji] = createSignal(false)
  const [emojiCategory, setEmojiCategory] = createSignal("Smileys")

  const [localStream, setLocalStream] = createSignal<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = createSignal<PeerStream[]>([])
  const [rtPeers, setRtPeers] = createSignal<{ id: string; username: string; stream: MediaStream }[]>([])
  const [isInCall, setIsInCall] = createSignal(false)
  const [isMuted, setIsMuted] = createSignal(false)
  const [isVideoOff, setIsVideoOff] = createSignal(false)
  const [callRoomId, setCallRoomId] = createSignal("")
  const [peerCount, setPeerCount] = createSignal(1)
  const [callError, setCallError] = createSignal("")

  const auth = getAuthState()
  let chatContainer: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined
  let fileInputRef: HTMLInputElement | undefined
  let localVideoRef: HTMLVideoElement | undefined

  let peer: Peer | null = null
  const connections = new Map<string, MediaConnection>()
  const dataConnections = new Map<string, DataConnection>()

  let rt: CommunityRealtime | null = null

  const loadLocalChatCache = (): ChatMessage[] => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  }

  const saveLocalChatCache = (msgs: ChatMessage[]) => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs.slice(-200)))
    } catch {}
  }

  const loadMessages = async () => {
    try {
      const storage = getGitHubStorage()
      if (storage) {
        const msgs = await storage.getChatMessages()
        if (Array.isArray(msgs) && msgs.length > 0) {
          const sorted = msgs.sort((a: any, b: any) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          ).slice(-200)
          setMessages(sorted)
          saveLocalChatCache(sorted)
          return
        }
      }
    } catch {}

    try {
      const response = await fetch(
        `${GITHUB_API}/repos/${ECOSYSTEM_DATA_REPO}/contents/community_chat.json`,
        { headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` } }
      )
      if (response.ok) {
        const data = await response.json()
        if (data.content) {
          const decoded = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))))
          if (Array.isArray(decoded) && decoded.length > 0) {
            const sorted = decoded.sort((a: any, b: any) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            ).slice(-200)
            setMessages(sorted)
            saveLocalChatCache(sorted)
          }
        }
      }
    } catch {}

    const localMsgs = loadLocalChatCache()
    if (localMsgs.length > 0 && messages().length === 0) {
      setMessages(localMsgs)
    }
  }

  const loadRoomsFromGitHub = async (): Promise<Record<string, number>> => {
    try {
      const response = await fetch(
        `${GITHUB_API}/repos/${ECOSYSTEM_DATA_REPO}/contents/active_rooms.json`,
        { headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` } }
      )
      if (response.ok) {
        const data = await response.json()
        if (data.content) {
          const parsed = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))))
          return typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
        }
      }
    } catch {}
    return {}
  }

  const saveRoomsToGitHub = async (rooms: Record<string, number>) => {
    try {
      const storage = getGitHubStorage()
      if (storage) {
        await storage.updateFile("active_rooms.json", rooms, "Update active call rooms")
      }
    } catch {}
  }

  const findAvailableRoom = async (): Promise<string> => {
    const rooms = await loadRoomsFromGitHub()
    const roomEntries: Record<string, number> = typeof rooms === "object" && !Array.isArray(rooms) ? rooms : {}
    for (let i = 0; i < 1000; i++) {
      const roomId = `${ROOM_PREFIX}-${i}`
      const count = roomEntries[roomId] || 0
      if (count < MAX_PEERS_PER_ROOM) return roomId
    }
    return `${ROOM_PREFIX}-${Date.now()}`
  }

  const persistMessage = async (msg: ChatMessage) => {
    try {
      const storage = getGitHubStorage()
      if (storage) {
        const existing = await storage.getChatMessages()
        const all = Array.isArray(existing) ? [...existing, msg] : [msg]
        await storage.updateFile("community_chat.json", all.slice(-200), "Update community chat")
      }
    } catch {}

    try {
      const response = await fetch(
        `${GITHUB_API}/repos/${ECOSYSTEM_DATA_REPO}/contents/community_chat.json`,
        { headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` } }
      )
      if (response.ok) {
        const data = await response.json()
        if (data.content) {
          const decoded = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))))
          if (Array.isArray(decoded)) {
            const all = [...decoded, msg].slice(-200)
            const sha = data.sha
            await fetch(
              `${GITHUB_API}/repos/${ECOSYSTEM_DATA_REPO}/contents/community_chat.json`,
              {
                method: "PUT",
                headers: {
                  Accept: "application/vnd.github.v3+json",
                  Authorization: `Bearer ${MAIN_TOKEN}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: `Chat message from ${msg.username}`,
                  content: btoa(unescape(encodeURIComponent(JSON.stringify(all, null, 2)))),
                  sha,
                }),
              }
            )
          }
        }
      }
    } catch {}

    saveLocalChatCache([...messages(), msg])
  }

  onMount(() => {
    loadMessages()

    const authState = getAuthState()
    rt = new CommunityRealtime(
      {
        userId: authState.user?.id || `guest-${Date.now()}`,
        username: authState.user?.username || "guest",
        avatarUrl: authState.user?.avatarUrl || "",
      },
      {
        onChat: (message: any) => {
          if (!message?.id) return
          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev
            return [...prev, message]
          })
        },
        onPeers: (list) => setRtPeers(list),
      },
    )
    rt.connect().catch(() => {})

    const interval = setInterval(loadMessages, MESSAGES_POLL_INTERVAL)
    onCleanup(() => {
      clearInterval(interval)
      leaveCall()
      rt?.disconnect()
    })
  })

  const sendMessage = async () => {
    const content = newMessage().trim()
    if (!content || !auth.user) return
    setSending(true)
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: auth.user.id,
      username: auth.user.username,
      avatarUrl: auth.user.avatarUrl,
      content,
      timestamp: new Date().toISOString(),
      likes: 0,
      likedBy: [],
    }
    setMessages((prev) => {
      const updated = [...prev, message]
      saveLocalChatCache(updated)
      return updated
    })
    setNewMessage("")

    // Instant delivery via Supabase Realtime
    rt?.sendChat(message)

    // Instant delivery via PeerJS data channels
    dataConnections.forEach((dc) => {
      try { dc.send(JSON.stringify({ type: "chat", message })) } catch {}
    })

    // Persistent storage to GitHub
    persistMessage(message)

    setSending(false)
    setTimeout(() => {
      chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" })
    }, 100)
  }

  const sendFileViaDataChannel = async (file: File) => {
    if (!auth.user) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const chunkSize = 16384
      const base64 = dataUrl.split(",")[1]
      const totalChunks = Math.ceil(base64.length / chunkSize)

      for (let i = 0; i < totalChunks; i++) {
        const chunk = base64.slice(i * chunkSize, (i + 1) * chunkSize)
        const chunkData = {
          type: "file_chunk",
          fileId,
          index: i,
          data: chunk,
          name: file.name,
          mimeType: file.type,
        }
        // Send via Supabase
        rt?.sendChat(chunkData)
        // Send via PeerJS
        dataConnections.forEach((dc) => {
          try { dc.send(JSON.stringify(chunkData)) } catch {}
        })
      }

      const completeData = { type: "file_complete", fileId }
      rt?.sendChat(completeData)
      dataConnections.forEach((dc) => {
        try { dc.send(JSON.stringify(completeData)) } catch {}
      })

      const fileMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: auth.user!.id,
        username: auth.user!.username,
        avatarUrl: auth.user!.avatarUrl,
        content: `📎 ${file.name}`,
        timestamp: new Date().toISOString(),
        likes: 0,
        likedBy: [],
      }
      setMessages((prev) => [...prev, fileMessage])
      persistMessage(fileMessage)
    }
    reader.readAsDataURL(file)
  }

  const startCall = async () => {
    if (isInCall()) { leaveCall(); return }
    setCallError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setLocalStream(stream)
      if (localVideoRef) {
        localVideoRef.srcObject = stream
        localVideoRef.play().catch(() => {})
      }

      // Start via Supabase Realtime (cross-platform with website)
      rt?.startCall(stream).catch(() => {})

      // Also start via PeerJS (browser-to-browser fallback)
      const roomId = await findAvailableRoom()
      setCallRoomId(roomId)

      const roomsBefore = await loadRoomsFromGitHub()
      const roomEntriesBefore: Record<string, number> = typeof roomsBefore === "object" && !Array.isArray(roomsBefore) ? roomsBefore : {}
      const myIndex = roomEntriesBefore[roomId] || 0
      const peerId = `${roomId}-peer-${myIndex}`
      peer = new Peer(peerId)

      peer.on("open", async () => {
        setIsInCall(true)
        setPeerCount(1)

        const rooms = await loadRoomsFromGitHub()
        const roomEntries: Record<string, number> = typeof rooms === "object" && !Array.isArray(rooms) ? rooms : {}
        roomEntries[roomId] = (roomEntries[roomId] || 0) + 1
        await saveRoomsToGitHub(roomEntries)

        const existingPeers = roomEntries[roomId] - 1
        if (existingPeers > 0) {
          for (let i = 0; i < existingPeers; i++) {
            const tryPeerId = `${roomId}-peer-${i}`
            try {
              const conn = peer!.connect(tryPeerId, { metadata: { username: auth.user?.username || "anon" } })
              conn.on("open", () => {
                dataConnections.set(tryPeerId, conn)
                setupDataChannelHandlers(conn)
                const call = peer!.call(tryPeerId, stream)
                if (call) {
                  connections.set(tryPeerId, call)
                  call.on("stream", (remoteStream) => {
                    setRemoteStreams((prev) => {
                      const exists = prev.find((s) => s.peerId === tryPeerId)
                      if (exists) return prev.map((s) => s.peerId === tryPeerId ? { ...s, stream: remoteStream } : s)
                      return [...prev, { peerId: tryPeerId, username: conn.metadata?.username || "peer", stream: remoteStream, isMuted: false, isVideoOff: false }]
                    })
                    setPeerCount((prev) => prev + 1)
                  })
                  call.on("close", () => {
                    setRemoteStreams((prev) => prev.filter((s) => s.peerId !== tryPeerId))
                    connections.delete(tryPeerId)
                    setPeerCount((prev) => Math.max(1, prev - 1))
                  })
                }
              })
            } catch {}
          }
        }

        for (let i = 0; i < MAX_PEERS_PER_ROOM; i++) {
          const tryPeerId = `${roomId}-peer-${i}`
          if (tryPeerId === peerId) continue
          try {
            const conn = peer!.connect(tryPeerId, { metadata: { username: auth.user?.username || "anon" } })
            conn.on("open", () => {
              dataConnections.set(tryPeerId, conn)
              setupDataChannelHandlers(conn)
              const call = peer!.call(tryPeerId, stream)
              if (call) {
                connections.set(tryPeerId, call)
                call.on("stream", (remoteStream) => {
                  setRemoteStreams((prev) => {
                    const exists = prev.find((s) => s.peerId === tryPeerId)
                    if (exists) return prev.map((s) => s.peerId === tryPeerId ? { ...s, stream: remoteStream } : s)
                    return [...prev, { peerId: tryPeerId, username: conn.metadata?.username || "peer", stream: remoteStream, isMuted: false, isVideoOff: false }]
                  })
                  setPeerCount((prev) => prev + 1)
                })
                call.on("close", () => {
                  setRemoteStreams((prev) => prev.filter((s) => s.peerId !== tryPeerId))
                  connections.delete(tryPeerId)
                  setPeerCount((prev) => Math.max(1, prev - 1))
                })
              }
            })
          } catch {}
        }
      })

      peer.on("connection", (conn) => {
        dataConnections.set(conn.peer, conn)
        setupDataChannelHandlers(conn)
        conn.on("open", () => {
          conn.send(JSON.stringify({ type: "welcome", username: auth.user?.username || "anon" }))
        })
      })

      peer.on("call", (call) => {
        if (stream) {
          call.answer(stream)
          connections.set(call.peer, call)
          call.on("stream", (remoteStream) => {
            setRemoteStreams((prev) => {
              const exists = prev.find((s) => s.peerId === call.peer)
              if (exists) return prev.map((s) => s.peerId === call.peer ? { ...s, stream: remoteStream } : s)
              return [...prev, { peerId: call.peer, username: call.metadata?.username || "peer", stream: remoteStream, isMuted: false, isVideoOff: false }]
            })
            setPeerCount((prev) => prev + 1)
          })
          call.on("close", () => {
            setRemoteStreams((prev) => prev.filter((s) => s.peerId !== call.peer))
            connections.delete(call.peer)
            setPeerCount((prev) => Math.max(1, prev - 1))
          })
        }
      })

      peer.on("error", (err) => {
        console.error("PeerJS error:", err)
        setCallError(`Connection error: ${err.type}`)
      })
    } catch (err: any) {
      setCallError("Camera/microphone access denied. Please allow permissions.")
    }
  }

  const setupDataChannelHandlers = (conn: DataConnection) => {
    const fileChunks = new Map<string, string[]>()
    conn.on("data", (data: any) => {
      try {
        const parsed = JSON.parse(data as string)
        if (parsed.type === "chat" && parsed.message) {
          setMessages((prev) => {
            if (prev.find((m) => m.id === parsed.message.id)) return prev
            return [...prev, parsed.message]
          })
        } else if (parsed.type === "file_chunk") {
          const chunks = fileChunks.get(parsed.fileId || "") || []
          chunks[parsed.index] = parsed.data
          fileChunks.set(parsed.fileId || "", chunks)
        } else if (parsed.type === "file_complete") {
          const chunks = fileChunks.get(parsed.fileId)
          if (chunks) {
            try {
              const base64 = chunks.join("")
              const dataUrl = `data:${parsed.mimeType || "application/octet-stream"};base64,${base64}`
              const fileMsg: ChatMessage = {
                id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                userId: "peer",
                username: "Peer",
                avatarUrl: "",
                content: `📎 ${parsed.fileName || "file"}`,
                timestamp: new Date().toISOString(),
                likes: 0,
                likedBy: [],
              }
              setMessages((prev) => [...prev, fileMsg])
            } catch {}
            fileChunks.delete(parsed.fileId)
          }
        }
      } catch {}
    })
    conn.on("close", () => {
      dataConnections.delete(conn.peer)
    })
  }

  const leaveCall = async () => {
    connections.forEach((conn) => { try { conn.close() } catch {} })
    connections.clear()
    dataConnections.forEach((dc) => { try { dc.close() } catch {} })
    dataConnections.clear()
    if (peer) { try { peer.destroy() } catch {} peer = null }
    const stream = localStream()
    if (stream) { stream.getTracks().forEach((t) => t.stop()); setLocalStream(null) }
    setRemoteStreams([])
    setIsInCall(false)
    setIsMuted(false)
    setIsVideoOff(false)
    setPeerCount(1)

    // Leave Supabase realtime call
    rt?.endCall()
    setRtPeers([])

    if (callRoomId()) {
      try {
        const rooms = await loadRoomsFromGitHub()
        const roomEntries: Record<string, number> = typeof rooms === "object" && !Array.isArray(rooms) ? rooms : {}
        roomEntries[callRoomId()] = Math.max(0, (roomEntries[callRoomId()] || 1) - 1)
        if (roomEntries[callRoomId()] <= 0) delete roomEntries[callRoomId()]
        await saveRoomsToGitHub(roomEntries)
      } catch {}
      setCallRoomId("")
    }
  }

  const toggleMute = () => {
    const stream = localStream()
    if (!stream) return
    const audioTrack = stream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setIsMuted(!audioTrack.enabled)
    }
  }

  const toggleVideo = () => {
    const stream = localStream()
    if (!stream) return
    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setIsVideoOff(!videoTrack.enabled)
    }
  }

  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "now"
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  const renderContent = (content: string) => {
    const imgMatch = content.match(/!\[.*?\]\((.*?)\)/)
    if (imgMatch) return { type: "image" as const, url: imgMatch[1] }
    if (content.startsWith("📎 ")) return { type: "file" as const, name: content.slice(2) }
    return { type: "text" as const, text: content }
  }

  const allRemoteStreams = () => {
    const peerStreams: PeerStream[] = remoteStreams()
    const rtStreamData: PeerStream[] = rtPeers().map((p) => ({
      peerId: p.id,
      username: p.username,
      stream: p.stream,
      isMuted: false,
      isVideoOff: false,
    }))
    const seen = new Set<string>()
    const merged: PeerStream[] = []
    for (const s of [...peerStreams, ...rtStreamData]) {
      if (!seen.has(s.peerId)) {
        seen.add(s.peerId)
        merged.push(s)
      }
    }
    return merged
  }

  return (
    <div class="flex flex-col h-full bg-[#0d1117]">
      <div class="shrink-0 px-4 py-3 bg-[#161b22] border-b border-[#21262d]">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#1f6feb] to-[#8957e5] flex items-center justify-center">
              <IconCommunity class="text-white" size={18} />
            </div>
            <div>
              <h2 class="text-lg font-bold text-[#c9d1d9]">ZYRAXON Community</h2>
              <p class="text-xs text-[#8b949e]">
                {isInCall() ? `Room: ${callRoomId().split("-").pop()} • ${peerCount() + rtPeers().length}/${MAX_PEERS_PER_ROOM} connected` : "One group. All creators worldwide."}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Show when={isInCall()}>
              <button onClick={toggleMute} class={`p-2 rounded-lg transition-colors ${isMuted() ? "bg-[#f85149] text-white" : "bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]"}`} title={isMuted() ? "Unmute" : "Mute"}>
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  {isMuted()
                    ? <path stroke-linecap="round" stroke-linejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    : <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  }
                </svg>
              </button>
              <button onClick={toggleVideo} class={`p-2 rounded-lg transition-colors ${isVideoOff() ? "bg-[#f85149] text-white" : "bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]"}`} title={isVideoOff() ? "Turn on camera" : "Turn off camera"}>
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  {isVideoOff()
                    ? <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    : <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  }
                </svg>
              </button>
              <button onClick={leaveCall} class="px-3 py-1.5 bg-[#f85149]/20 text-[#f85149] rounded-lg text-xs hover:bg-[#f85149]/30 transition-colors font-medium">
                Leave Call
              </button>
            </Show>
            <Show when={!isInCall()}>
              <button onClick={startCall} class="px-3 py-1.5 bg-[#238636] text-white rounded-lg text-xs hover:bg-[#2ea043] transition-colors font-medium flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Join Call
              </button>
            </Show>
            <div class="w-px h-6 bg-[#21262d] mx-1" />
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" />
              <span class="text-xs text-[#8b949e]">{messages().length} messages</span>
            </div>
          </div>
        </div>

        <Show when={callError()}>
          <div class="mt-2 p-2 bg-[#f85149]/10 border border-[#f85149]/20 rounded-lg">
            <p class="text-xs text-[#f85149]">{callError()}</p>
          </div>
        </Show>
      </div>

      <Show when={isInCall()}>
        <div class="shrink-0 px-4 py-3 bg-[#161b22] border-b border-[#21262d]">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-2 h-2 rounded-full bg-[#f85149] animate-pulse" />
            <span class="text-sm font-medium text-[#c9d1d9]">Live Call</span>
            <span class="text-xs text-[#8b949e]">•</span>
            <span class="text-xs text-[#8b949e]">{peerCount() + rtPeers().length}/{MAX_PEERS_PER_ROOM} in room</span>
          </div>
          <div class="grid gap-2" style={{ "grid-template-columns": allRemoteStreams().length === 0 ? "1fr" : allRemoteStreams().length <= 1 ? "repeat(2, 1fr)" : allRemoteStreams().length <= 3 ? "repeat(2, 1fr)" : "repeat(3, 1fr)" }}>
            <div class="relative rounded-xl overflow-hidden bg-black aspect-video">
              <video ref={localVideoRef} autoplay muted playsinline class="w-full h-full object-cover" />
              <div class="absolute bottom-1 left-1 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white">
                You {isMuted() ? "(Muted)" : ""}
              </div>
              <Show when={isVideoOff()}>
                <div class="absolute inset-0 flex items-center justify-center bg-[#21262d]">
                  <div class="w-16 h-16 rounded-full bg-[#30363d] flex items-center justify-center">
                    <span class="text-2xl text-[#8b949e]">{(auth.user?.username || "?")[0].toUpperCase()}</span>
                  </div>
                </div>
              </Show>
            </div>
            <For each={allRemoteStreams()}>
              {(rs) => (
                <div class="relative rounded-xl overflow-hidden bg-black aspect-video">
                  <video
                    ref={(el) => { el.srcObject = rs.stream; el.play().catch(() => {}) }}
                    autoplay
                    playsinline
                    class="w-full h-full object-cover"
                  />
                  <div class="absolute bottom-1 left-1 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white">
                    {rs.username}
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div ref={chatContainer} class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <Show when={messages().length > 0} fallback={
          <div class="flex flex-col items-center justify-center h-full text-center">
            <div class="w-16 h-16 rounded-2xl bg-[#161b22] border border-[#21262d] flex items-center justify-center mb-4">
              <IconCommunity class="text-[#484f58]" size={28} />
            </div>
            <p class="text-[#8b949e]">No messages yet. Be the first to say hello!</p>
          </div>
        }>
          <For each={messages()}>
            {(msg) => {
              const rendered = renderContent(msg.content)
              return (
                <div class={`flex gap-3 ${msg.userId === auth.user?.id ? "flex-row-reverse" : ""}`}>
                  <img
                    src={msg.avatarUrl || `https://avatars.githubusercontent.com/${msg.username}`}
                    alt={msg.username}
                    class="w-8 h-8 rounded-full bg-[#21262d] shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${msg.username}&background=1f6feb&color=fff` }}
                  />
                  <div class={`max-w-[70%] ${msg.userId === auth.user?.id ? "text-right" : ""}`}>
                    <div class="flex items-center gap-2 mb-1">
                      <span class={`text-xs font-medium ${msg.username === "ZYRAXON" ? "text-[#58a6ff]" : "text-[#c9d1d9]"}`}>{msg.username}</span>
                      <span class="text-[10px] text-[#484f58]">{formatTime(msg.timestamp)}</span>
                    </div>
                    <div class={`inline-block px-3 py-2 rounded-2xl text-sm ${msg.userId === auth.user?.id ? "bg-[#1f6feb] text-white rounded-br-sm" : "bg-[#161b22] border border-[#21262d] text-[#c9d1d9] rounded-bl-sm"}`}>
                      <Show when={rendered.type === "text"} fallback={
                        <Show when={rendered.type === "image"}>
                          <img src={rendered.url} alt="shared" class="max-w-xs rounded-lg max-h-48 object-cover" />
                        </Show>
                      }>
                        <span style={{ "white-space": "pre-wrap" }}>{rendered.text}</span>
                      </Show>
                    </div>
                    <Show when={msg.likes > 0}>
                      <div class="text-[10px] text-[#484f58] mt-1">{msg.likes} likes</div>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </Show>
      </div>

      <div class="shrink-0 px-4 py-3 bg-[#161b22] border-t border-[#21262d]">
        <Show when={auth.user} fallback={<div class="text-center py-2 text-sm text-[#8b949e]">Sign in to join the community chat</div>}>
          <Show when={showEmoji()}>
            <div class="mb-2 bg-[#0d1117] border border-[#21262d] rounded-xl overflow-hidden">
              <div class="flex gap-1 p-2 border-b border-[#21262d] overflow-x-auto">
                <For each={Object.keys(EMOJI_CATEGORIES)}>
                  {(cat) => (
                    <button onClick={() => setEmojiCategory(cat)} class={`px-2 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${emojiCategory() === cat ? "bg-[#1f6feb] text-white" : "bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]"}`}>
                      {cat}
                    </button>
                  )}
                </For>
              </div>
              <div class="p-2 max-h-48 overflow-y-auto">
                <div class="grid grid-cols-10 gap-1">
                  <For each={EMOJI_CATEGORIES[emojiCategory()] || []}>
                    {(emoji) => (
                      <button onClick={() => { setNewMessage((prev) => prev + emoji); setShowEmoji(false); inputRef?.focus() }} class="text-xl hover:bg-[#21262d] rounded-lg p-1 transition-colors">
                        {emoji}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Show>
          <div class="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip" class="hidden" onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) sendFileViaDataChannel(file); e.currentTarget.value = "" }} />
            <button onClick={() => fileInputRef?.click()} class="p-2.5 bg-[#0d1117] border border-[#21262d] rounded-xl text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#30363d] transition-colors" title="Share File">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button onClick={() => setShowEmoji(!showEmoji())} class="p-2.5 bg-[#0d1117] border border-[#21262d] rounded-xl text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#30363d] transition-colors" title="Emoji">😊</button>
            <input ref={inputRef} type="text" value={newMessage()} onInput={(e) => setNewMessage(e.currentTarget.value)} onKeyPress={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }} placeholder="Say something to the community..." class="flex-1 bg-[#0d1117] border border-[#21262d] rounded-xl px-4 py-2.5 text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors" disabled={sending()} />
            <button onClick={sendMessage} disabled={!newMessage().trim() || sending()} class="px-4 py-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
              <IconSend size={14} />
              {sending() ? "..." : "Send"}
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}
