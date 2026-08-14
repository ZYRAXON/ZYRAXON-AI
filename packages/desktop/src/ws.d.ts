declare module "ws" {
  class WebSocket {
    constructor(url: string, options?: { [key: string]: unknown })
    on(event: string, listener: (...args: unknown[]) => void): this
    send(data: string | Buffer, cb?: (err?: unknown) => void): void
    close(code?: number, reason?: string): void
  }
  export default WebSocket
}
