import type { DesktopMenuAction } from "@zyraxon-ai/app/desktop-menu"
import type { WslServersPlatform } from "@zyraxon-ai/app/wsl/types"
import type { UpdaterState } from "@zyraxon-ai/app/updater"
export type {
  WslDistroProbe,
  WslInstalledDistro,
  WslJob,
  WslOnlineDistro,
  WslZyraxonCheck,
  WslRuntimeCheck,
  WslServerConfig,
  WslServerItem,
  WslServerRuntime,
  WslServersEvent,
  WslServersState,
} from "@zyraxon-ai/app/wsl/types"

export type ServerReadyData = {
  url: string
  username: string | null
  password: string | null
}

export type WslServersAPI = WslServersPlatform
export type UpdaterAPI = {
  subscribe: (cb: (state: UpdaterState) => void) => Promise<() => void>
  check: () => Promise<UpdaterState>
  install: () => Promise<void>
}

export type LinuxDisplayBackend = "wayland" | "auto"
export type TitlebarTheme = {
  mode: "light" | "dark"
  scheme?: "system" | "light" | "dark"
}
export type FatalRendererError = {
  error: string
  url: string
  version?: string
  platform: string
  os?: string
}

export type StreamStatus = "idle" | "starting" | "streaming" | "stopping" | "error"

export type StreamState = {
  status: StreamStatus
  error?: string
  viewerCount: number
  streamDuration: number
  rtmpUrl: string
  resolution: string
  captureMode: "fullscreen" | "app"
  audioMode: "none" | "microphone" | "system"
  systemAudioAvailable: boolean
}

export type StreamConfig = {
  streamKey: string
  streamUrl?: string
  youtubeApiKey?: string
  quality?: "4k" | "1440p" | "1080p" | "720p"
  captureMode?: "fullscreen" | "app"
  audioMode?: "none" | "microphone" | "system"
}

export type PreviewState = {
  url: string | null
  siteName: string | null
  siteId: string | null
  timestamp: string
}

export type ElectronAPI = {
  killSidecar: () => Promise<void>
  installCli: () => Promise<string>
  awaitInitialization: () => Promise<ServerReadyData>
  wslServers: WslServersAPI
  updater: UpdaterAPI
  consumeInitialDeepLinks: () => Promise<string[]>
  getDefaultServerUrl: () => Promise<string | null>
  setDefaultServerUrl: (url: string | null) => Promise<void>
  isFirstLaunchOnboardingPending: () => Promise<boolean>
  finishFirstLaunchOnboarding: (createDefaultProject: boolean) => Promise<string | null>
  isOldLayoutEligible: () => Promise<boolean>
  getDisplayBackend: () => Promise<LinuxDisplayBackend | null>
  setDisplayBackend: (backend: LinuxDisplayBackend | null) => Promise<void>
  parseMarkdownCommand: (markdown: string) => Promise<string>
  checkAppExists: (appName: string) => Promise<boolean>
  resolveAppPath: (appName: string) => Promise<string | null>
  storeGet: (name: string, key: string) => Promise<string | null>
  storeSet: (name: string, key: string, value: string) => Promise<void>
  storeDelete: (name: string, key: string) => Promise<void>
  storeClear: (name: string) => Promise<void>
  storeKeys: (name: string) => Promise<string[]>
  storeLength: (name: string) => Promise<number>
  saveEcosystemAuth: (data: { token: string; user: any }) => Promise<boolean>
  getGithubToken: () => Promise<string | null>

  setEditorMode: (active: boolean, directory?: string) => Promise<void>
  setEditorBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
  installEditorExtension: (sourceDir: string) => Promise<{ ok: boolean; error?: string }>
  installVsix: (vsixUrl: string, extensionId: string, meta?: { displayName?: string; version?: string; publisher?: string; description?: string; icon?: string }) => Promise<{ ok: boolean; error?: string }>
  getEditorState: () => Promise<{ active: boolean }>
  onEditorModeChanged: (cb: (active: boolean) => void) => () => void

  getWindowCount: () => Promise<number>
  getWindowID: () => Promise<string>
  onMenuCommand: (cb: (id: string) => void) => () => void
  onDeepLink: (cb: (urls: string[]) => void) => () => void

  openDirectoryPicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
  }) => Promise<string | string[] | null>
  openFilePicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
    extensions?: string[]
  }) => Promise<{ token: string; files: { path: string; name: string; size: number }[] } | null>
  readPickedFile: (token: string, path: string) => Promise<ArrayBuffer>
  releasePickedFiles: (token: string) => Promise<void>
  writeFile: (path: string, content: string) => Promise<boolean>
  getPathForFile: (file: File) => string
  saveFilePicker: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
  openLink: (url: string) => void
  openPath: (path: string, app?: string) => Promise<void>
  revealPath: (path: string) => Promise<boolean>
  readClipboardImage: () => Promise<{ buffer: ArrayBuffer; width: number; height: number } | null>
  showNotification: (title: string, body?: string) => void
  getWindowFocused: () => Promise<boolean>
  setWindowFocus: () => Promise<void>
  showWindow: () => Promise<void>
  relaunch: () => void
  getZoomFactor: () => Promise<number>
  setZoomFactor: (factor: number) => Promise<void>
  getPinchZoomEnabled: () => Promise<boolean>
  setPinchZoomEnabled: (enabled: boolean) => Promise<void>
  onPinchZoomEnabledChanged: (cb: (enabled: boolean) => void) => () => void
  onZoomFactorChanged: (cb: (factor: number) => void) => () => void
  setTitlebar: (theme: TitlebarTheme) => Promise<void>
  runDesktopMenuAction: (action: DesktopMenuAction) => Promise<void>
  setBackgroundColor: (color: string) => Promise<void>
  exportDebugLogs: () => Promise<string>
  setForceFocus: (enabled: boolean) => Promise<void>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void>
  transcribeAudio: (audioBase64: string, mimeType: string) => Promise<string>

  youtubeStreamStart: (config: StreamConfig) => Promise<StreamState>
  youtubeStreamStop: () => Promise<StreamState>
  youtubeStreamStatus: () => Promise<StreamState>
  youtubeStreamProbeDevices: () => Promise<{ systemAudioAvailable: boolean; devices: string[] }>
  onYouTubeStreamStatus: (cb: (state: StreamState) => void) => () => void
  onYouTubeStreamViewers: (cb: (count: number) => void) => () => void
  onYouTubeStreamDuration: (cb: (seconds: number) => void) => () => void

  getPreviewState: () => Promise<PreviewState>
  setPreviewState: (state: PreviewState) => Promise<void>
  onSitePreviewUpdate: (cb: (state: PreviewState) => void) => () => void

  // Jarvis Browser - Real Chrome automation
  jarvisBrowser: {
    init: (config?: any) => Promise<{ success: boolean; error?: string }>
    navigate: (url: string) => Promise<{ success: boolean; error?: string }>
    screenshot: (fullPage?: boolean) => Promise<{ success: boolean; data?: string; error?: string }>
    click: (x: number, y: number) => Promise<{ success: boolean; error?: string }>
    type: (text: string) => Promise<{ success: boolean; error?: string }>
    evaluate: (expression: string) => Promise<{ success: boolean; result?: any; error?: string }>
    detectCaptcha: () => Promise<{ success: boolean; captcha?: any; error?: string }>
    solveCaptcha: () => Promise<{ success: boolean; solved?: boolean; error?: string }>
    listTabs: () => Promise<{ success: boolean; tabs?: any[]; error?: string }>
    createTab: (url?: string) => Promise<{ success: boolean; tabId?: string; error?: string }>
    closeTab: (tabId: string) => Promise<{ success: boolean; error?: string }>
    fillForm: (selector: string, value: string) => Promise<{ success: boolean; error?: string }>
    getElement: (x: number, y: number) => Promise<{ success: boolean; element?: any; error?: string }>
    destroy: () => Promise<{ success: boolean; error?: string }>
  }
}
