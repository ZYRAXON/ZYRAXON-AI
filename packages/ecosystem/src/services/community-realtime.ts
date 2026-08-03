/**
 * Community Realtime — Supabase Realtime signaling for cross-platform chat + calls.
 *
 * This mirrors the website's CommunityRealtime class so that the Electron app
 * can connect to the same Supabase channel and instantly exchange:
 *   - chat messages (broadcast)
 *   - WebRTC signaling (offer / answer / ICE)
 *   - presence (who is online, who is in a call)
 */

const SUPABASE_URL = "https://nmydqmvnnlsrkcutkemt.supabase.co"
const SUPABASE_KEY = "sb_publishable_kJ_ukirETrypTbI59q_nww_GKynmALE"
const COMMUNITY_CHANNEL = "zyraxon-community"

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
}

export type CommunityIdentity = {
  userId: string
  username: string
  avatarUrl?: string
}

type Handlers = {
  onChat?: (message: any) => void
  onPeers?: (peers: { id: string; username: string; stream: MediaStream }[]) => void
  onPresence?: (users: string[]) => void
  onCallers?: (users: string[]) => void
}

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Minimal Supabase Realtime channel wrapper (no SDK dependency)
class SupabaseChannel {
  private ws: WebSocket | null = null
  private topic: string
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private listeners = new Map<string, ((payload: any) => void)[]>()
  private presenceListeners: ((state: any) => void)[] = []
  private joined = false
  private presenceKey: string
  private identity: any

  constructor(topic: string, presenceKey: string, identity: any) {
    this.topic = topic
    this.presenceKey = presenceKey
    this.identity = identity
  }

  async connect(): Promise<void> {
    const wsUrl = SUPABASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    const url = `${wsUrl}/realtime/v1/websocket?vsn=1.0.0&apikey=${SUPABASE_KEY}&log_level=info`

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)
        this.ws.onopen = () => {
          this.send({
            topic: `realtime:${this.topic}`,
            event: "phx_join",
            payload: {
              config: {
                broadcast: { self: false },
                presence: { key: this.presenceKey },
              },
            },
            ref: this.ref(),
          })
          this.heartbeatInterval = setInterval(() => {
            this.send({
              topic: "phoenix",
              event: "heartbeat",
              payload: {},
              ref: this.ref(),
            })
          }, 30000)
          setTimeout(resolve, 500)
        }
        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            this.handleMessage(msg)
          } catch {}
        }
        this.ws.onerror = () => reject(new Error("WebSocket error"))
        this.ws.onclose = () => this.cleanup()
      } catch (e) {
        reject(e)
      }
    })
  }

  private ref() {
    return randomId()
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private handleMessage(msg: any) {
    if (msg.event === "phx_reply" && msg.payload?.status === "ok" && !this.joined) {
      this.joined = true
      this.trackPresence()
      return
    }
    if (msg.topic === `realtime:${this.topic}`) {
      if (msg.event === "broadcast") {
        const handlers = this.listeners.get(msg.payload?.event || "") || []
        handlers.forEach((h) => h(msg.payload?.payload))
      }
      if (msg.event === "presence_diff") {
        this.presenceListeners.forEach((h) => h(msg.payload))
      }
    }
  }

  private trackPresence() {
    this.send({
      topic: `realtime:${this.topic}`,
      event: "presence_track",
      payload: {
        type: "presence",
        payload: {
          ...this.identity,
          peerId: this.presenceKey,
          online_at: new Date().toISOString(),
        },
      },
      ref: this.ref(),
    })
  }

  onBroadcast(event: string, handler: (payload: any) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event)!.push(handler)
  }

  onPresence(handler: (state: any) => void) {
    this.presenceListeners.push(handler)
  }

  broadcast(event: string, payload: any) {
    this.send({
      topic: `realtime:${this.topic}`,
      event: "broadcast",
      payload: { type: "broadcast", event, payload },
      ref: this.ref(),
    })
  }

  track(data: any) {
    this.send({
      topic: `realtime:${this.topic}`,
      event: "presence_track",
      payload: { type: "presence", payload: { ...data, peerId: this.presenceKey } },
      ref: this.ref(),
    })
  }

  disconnect() {
    this.cleanup()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    this.joined = false
  }
}

export class CommunityRealtime {
  readonly peerId = randomId()
  private channel: SupabaseChannel | null = null
  private identity: CommunityIdentity
  private handlers: Handlers
  private connections = new Map<string, RTCPeerConnection>()
  private remote = new Map<string, { username: string; stream: MediaStream }>()
  private pendingIce = new Map<string, RTCIceCandidateInit[]>()
  private localStream: MediaStream | null = null
  private inCall = false

  constructor(identity: CommunityIdentity, handlers: Handlers) {
    this.identity = identity
    this.handlers = handlers
  }

  async connect() {
    if (this.channel) return

    this.channel = new SupabaseChannel(COMMUNITY_CHANNEL, this.peerId, this.identity)

    this.channel.onBroadcast("chat", (payload: any) => {
      this.handlers.onChat?.(payload?.message ?? payload)
    })

    this.channel.onBroadcast("signal", (payload: any) => {
      void this.onSignal(payload)
    })

    this.channel.onPresence(() => {
      // Presence state will come via broadcast events
    })

    await this.channel.connect()
  }

  private send(event: string, payload: any) {
    this.channel?.broadcast(event, { ...payload, from: this.peerId })
  }

  sendChat(message: any) {
    this.send("chat", { message, from: this.peerId })
  }

  // ---- WebRTC mesh ----------------------------------------------------

  private emitPeers() {
    this.handlers.onPeers?.(
      Array.from(this.remote.entries()).map(([id, v]) => ({ id, username: v.username, stream: v.stream })),
    )
  }

  private createConnection(peerId: string, username: string) {
    const existing = this.connections.get(peerId)
    if (existing) return existing

    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.connections.set(peerId, pc)

    this.localStream?.getTracks().forEach((track) => pc.addTrack(track, this.localStream!))

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send("signal", { kind: "ice", to: peerId, from: this.peerId, candidate: event.candidate.toJSON() })
      }
    }
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (!stream) return
      this.remote.set(peerId, { username, stream })
      this.emitPeers()
    }
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) this.dropPeer(peerId)
    }
    return pc
  }

  private dropPeer(peerId: string) {
    this.connections.get(peerId)?.close()
    this.connections.delete(peerId)
    this.remote.delete(peerId)
    this.pendingIce.delete(peerId)
    this.emitPeers()
  }

  private async onSignal(payload: any) {
    if (!payload || payload.from === this.peerId) return
    const from = payload.from as string

    if (payload.kind === "join") {
      if (!this.inCall) return
      const pc = this.createConnection(from, payload.username || "peer")
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.send("signal", { kind: "offer", to: from, from: this.peerId, username: this.identity.username, sdp: offer })
      return
    }

    if (payload.to !== this.peerId) return

    if (payload.kind === "offer") {
      if (!this.inCall) return
      const pc = this.createConnection(from, payload.username || "peer")
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await this.flushIce(from, pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.send("signal", { kind: "answer", to: from, from: this.peerId, username: this.identity.username, sdp: answer })
    } else if (payload.kind === "answer") {
      const pc = this.connections.get(from)
      if (!pc) return
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await this.flushIce(from, pc)
    } else if (payload.kind === "ice") {
      const pc = this.connections.get(from)
      if (!pc || !pc.remoteDescription) {
        const list = this.pendingIce.get(from) ?? []
        list.push(payload.candidate)
        this.pendingIce.set(from, list)
        return
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
      } catch {}
    } else if (payload.kind === "leave") {
      this.dropPeer(from)
    }
  }

  private async flushIce(peerId: string, pc: RTCPeerConnection) {
    const list = this.pendingIce.get(peerId)
    if (!list) return
    for (const candidate of list) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {}
    }
    this.pendingIce.delete(peerId)
  }

  async startCall(stream: MediaStream) {
    await this.connect()
    this.localStream = stream
    this.inCall = true
    this.channel?.track({ ...this.identity, peerId: this.peerId, inCall: true })
    this.send("signal", { kind: "join", from: this.peerId, username: this.identity.username })
  }

  endCall() {
    this.send("signal", { kind: "leave", from: this.peerId })
    this.connections.forEach((pc) => pc.close())
    this.connections.clear()
    this.remote.clear()
    this.pendingIce.clear()
    this.localStream = null
    this.inCall = false
    this.channel?.track({ ...this.identity, peerId: this.peerId, inCall: false })
    this.emitPeers()
  }

  disconnect() {
    if (this.inCall) this.endCall()
    this.channel?.disconnect()
    this.channel = null
  }
}
