import { type Component, createSignal, Show, For } from "solid-js"
import type { EcosystemItem, Category } from "../types"
import { publishItem } from "../services/github"
import { getAuthState } from "../services/auth"
import { IconX, IconCheck, IconLoader, IconSparkles, IconRocket, IconUpload, IconImage, IconFile } from "./Icons"

interface PublishModalProps {
  isOpen: boolean
  onClose: () => void
  onPublished?: (item: EcosystemItem) => void
  aiGenerated?: Partial<EcosystemItem>
}

const CATEGORIES: { id: Category; label: string; accepts: string }[] = [
  { id: "ai-bots", label: "AI Bots", accepts: ".json,.yaml,.yml,.txt" },
  { id: "plugins", label: "Plugins", accepts: ".js,.ts,.json,.zip" },
  { id: "website-templates", label: "Website Templates", accepts: ".zip,.html,.css,.js" },
  { id: "themes", label: "Themes", accepts: ".css,.json,.zip" },
  { id: "components", label: "Components", accepts: ".tsx,.jsx,.vue,.svelte,.zip" },
  { id: "startkits", label: "Starter Kits", accepts: ".zip,.tar.gz" },
  { id: "workflows", label: "Workflows", accepts: ".json,.yaml,.yml" },
  { id: "ai-models", label: "AI Models", accepts: ".bin,.gguf,.onnx,.pt,.zip" },
  { id: "tools", label: "Dev Tools", accepts: ".exe,.dmg,.AppImage,.zip" },
  { id: "sdks", label: "SDKs", accepts: ".zip,.tar.gz" },
  { id: "pdfs", label: "PDFs", accepts: ".pdf" },
  { id: "books", label: "Books", accepts: ".pdf,.epub,.mobi" },
  { id: "apis", label: "APIs", accepts: ".json,.yaml" },
  { id: "mobile-apps", label: "Mobile Apps", accepts: ".apk,.ipa,.aab" },
  { id: "browser-extensions", label: "Browser Extensions", accepts: ".crx,.xpi,.zip" },
  { id: "cli-tools", label: "CLI Tools", accepts: ".exe,.dmg,.AppImage,.zip" },
  { id: "prompts", label: "AI Prompts", accepts: ".txt,.json,.md" },
  { id: "datasets", label: "Datasets", accepts: ".csv,.json,.jsonl,.parquet,.zip" },
  { id: "icons", label: "Icon Packs", accepts: ".svg,.png,.zip" },
  { id: "ui-kits", label: "UI Kits", accepts: ".fig,.sketch,.zip" },
  { id: "landing-pages", label: "Landing Pages", accepts: ".html,.zip" },
  { id: "desktop-apps", label: "Desktop Apps", accepts: ".exe,.dmg,.AppImage,.deb,.zip" },
  { id: "iso-images", label: "ISO Images", accepts: ".iso" },
  { id: "fonts", label: "Fonts", accepts: ".ttf,.otf,.woff,.woff2,.zip" },
  { id: "code-snippets", label: "Code Snippets", accepts: ".js,.ts,.py,.java,.cpp,.zip" },
  { id: "devops", label: "DevOps", accepts: ".yml,.yaml,.tf,.dockerfile,.zip" },
]

const TYPE_MAP: Record<string, string> = {
  "ai-bots": "bot", plugins: "plugin", "website-templates": "template", themes: "theme",
  components: "component", startkits: "startkit", workflows: "workflow", "ai-models": "model",
  tools: "tool", sdks: "sdk", pdfs: "pdf", books: "book",
  apis: "api", "mobile-apps": "app", "browser-extensions": "extension", "cli-tools": "cli",
  prompts: "prompt", datasets: "dataset", icons: "icon", "ui-kits": "ui-kit", "landing-pages": "landing-page",
  "desktop-apps": "desktop-app", "iso-images": "iso", fonts: "font", "code-snippets": "snippet", devops: "devops",
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}

function FileUploadZone(props: {
  label: string
  accept: string
  file: File | null
  onFile: (file: File) => void
  onRemove: () => void
  preview?: string
  multiple?: boolean
  maxFiles?: number
}) {
  const [isDragOver, setIsDragOver] = createSignal(false)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      if (props.multiple) {
        Array.from(files).slice(0, props.maxFiles || 5).forEach((f) => props.onFile(f))
      } else {
        props.onFile(files[0])
      }
    }
  }

  const handleInput = (e: Event) => {
    const input = e.target as HTMLInputElement
    if (input.files && input.files.length > 0) {
      if (props.multiple) {
        Array.from(input.files).slice(0, props.maxFiles || 5).forEach((f) => props.onFile(f))
      } else {
        props.onFile(input.files[0])
      }
    }
  }

  return (
    <div>
      <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">{props.label}</label>
      <Show when={!props.file}>
        <div
          class={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragOver()
              ? "border-[#58a6ff] bg-[#1f6feb]/10"
              : "border-[#21262d] hover:border-[#30363d] hover:bg-[#161b22]"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => {
            const input = document.createElement("input")
            input.type = "file"
            input.accept = props.accept
            input.multiple = props.multiple || false
            input.onchange = handleInput
            input.click()
          }}
        >
          <IconUpload class="mx-auto mb-2 text-[#484f58]" size={24} />
          <p class="text-sm text-[#8b949e]">Drop file here or click to browse</p>
          <p class="text-xs text-[#484f58] mt-1">Accepts: {props.accept}</p>
        </div>
      </Show>
      <Show when={props.file}>
        <div class="flex items-center gap-3 p-3 bg-[#161b22] border border-[#21262d] rounded-xl">
          <Show when={props.preview} fallback={<IconFile class="text-[#58a6ff]" size={20} />}>
            <img src={props.preview} class="w-10 h-10 rounded-lg object-cover" alt="" />
          </Show>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-[#c9d1d9] truncate">{props.file!.name}</p>
            <p class="text-xs text-[#484f58]">{formatFileSize(props.file!.size)}</p>
          </div>
          <button onClick={props.onRemove} class="p-1 hover:bg-[#21262d] rounded-lg text-[#8b949e]">
            <IconX size={14} />
          </button>
        </div>
      </Show>
    </div>
  )
}

export const PublishModal: Component<PublishModalProps> = (props) => {
  const [step, setStep] = createSignal<"form" | "preview" | "publishing" | "done">("form")
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [category, setCategory] = createSignal<Category>("plugins")
  const [version, setVersion] = createSignal("1.0.0")
  const [tags, setTags] = createSignal("")
  const [liveDemo, setLiveDemo] = createSignal("")
  const [downloadUrl, setDownloadUrl] = createSignal("")
  const [githubRepo, setGithubRepo] = createSignal("")
  const [installCommand, setInstallCommand] = createSignal("")
  const [license, setLicense] = createSignal("MIT")
  const [platforms, setPlatforms] = createSignal<string[]>([])

  const [coverImageFile, setCoverImageFile] = createSignal<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = createSignal("")
  const [logoFile, setLogoFile] = createSignal<File | null>(null)
  const [logoPreview, setLogoPreview] = createSignal("")
  const [downloadFile, setDownloadFile] = createSignal<File | null>(null)
  const [screenshotFiles, setScreenshotFiles] = createSignal<File[]>([])
  const [screenshotPreviews, setScreenshotPreviews] = createSignal<string[]>([])

  const [error, setError] = createSignal("")
  const [uploadProgress, setUploadProgress] = createSignal("")

  const auth = getAuthState()

  const fillFromAI = () => {
    if (props.aiGenerated) {
      if (props.aiGenerated.name) setName(props.aiGenerated.name)
      if (props.aiGenerated.description) setDescription(props.aiGenerated.description)
      if (props.aiGenerated.category) setCategory(props.aiGenerated.category)
      if (props.aiGenerated.version) setVersion(props.aiGenerated.version)
      if (props.aiGenerated.tags) setTags(props.aiGenerated.tags.join(", "))
      if (props.aiGenerated.liveDemo) setLiveDemo(props.aiGenerated.liveDemo)
      if (props.aiGenerated.downloadUrl) setDownloadUrl(props.aiGenerated.downloadUrl)
      if (props.aiGenerated.githubRepo) setGithubRepo(props.aiGenerated.githubRepo)
      if (props.aiGenerated.installCommand) setInstallCommand(props.aiGenerated.installCommand)
      if (props.aiGenerated.license) setLicense(props.aiGenerated.license)
      if (props.aiGenerated.platforms) setPlatforms(props.aiGenerated.platforms)
    }
  }

  const handlePublish = async () => {
    if (!name().trim() || !description().trim()) {
      setError("Name and description are required")
      return
    }

    setStep("publishing")
    setError("")
    setUploadProgress("Preparing...")

    try {
      const tagsList = tags().split(",").map((t) => t.trim()).filter(Boolean)
      const result = await publishItem(
        {
          name: name().trim(),
          description: description().trim(),
          version: version(),
          author: auth.user?.displayName || auth.user?.username || "Anonymous",
          authorAvatar: auth.user?.avatarUrl,
          authorId: auth.user?.id || "anonymous",
          category: category(),
          type: TYPE_MAP[category()] as any || "plugin",
          tags: tagsList,
          downloads: 0,
          rating: 0,
          reviews: 0,
          likeCount: 0,
          commentCount: 0,
          verified: false,
          featured: false,
          repository: "",
          liveDemo: liveDemo() || undefined,
          downloadUrl: downloadUrl() || undefined,
          githubRepo: githubRepo() || undefined,
          installCommand: installCommand() || undefined,
          license: license() || undefined,
          platforms: platforms().length > 0 ? platforms() as any : undefined,
          fileSize: downloadFile() ? formatFileSize(downloadFile()!.size) : undefined,
          socialLinks: {},
        },
        {
          coverImage: coverImageFile() || undefined,
          logo: logoFile() || undefined,
          downloadFile: downloadFile() || undefined,
          screenshots: screenshotFiles().length > 0 ? screenshotFiles() : undefined,
        }
      )

      setStep("done")
      setTimeout(() => {
        props.onPublished?.(result)
        props.onClose()
      }, 2000)
    } catch (err: any) {
      setError(err.message || "Failed to publish")
      setStep("form")
    }
  }

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  const handleBackdrop = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
      props.onClose()
    }
  }

  return (
    <Show when={props.isOpen}>
      <div class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleBackdrop}>
        <div class="bg-[#161b22] border border-[#21262d] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl">
          <Show when={step() === "form"}>
            <div class="flex items-center justify-between p-6 border-b border-[#21262d]">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#238636] to-[#1f6feb] flex items-center justify-center">
                  <IconRocket class="text-white" size={20} />
                </div>
                <div>
                  <h2 class="text-lg font-semibold text-[#c9d1d9]">Publish to Ecosystem</h2>
                  <p class="text-xs text-[#8b949e]">Share your creation with the world</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Show when={props.aiGenerated}>
                  <button onClick={fillFromAI} class="flex items-center gap-1.5 px-3 py-1.5 bg-[#8957e5]/20 hover:bg-[#8957e5]/30 text-[#bc8cff] rounded-lg text-xs font-medium transition-colors">
                    <IconSparkles size={12} />
                    Fill from AI
                  </button>
                </Show>
                <button onClick={props.onClose} class="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-[#c9d1d9] transition-colors">
                  <IconX size={18} />
                </button>
              </div>
            </div>

            <div class="p-6 overflow-y-auto max-h-[65vh] space-y-5">
              <Show when={error()}>
                <div class="p-3 bg-[#f85149]/10 border border-[#f85149]/20 rounded-lg text-sm text-[#f85149]">{error()}</div>
              </Show>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">Name *</label>
                  <input type="text" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="My Awesome Plugin" class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">Category *</label>
                  <select value={category()} onChange={(e) => setCategory(e.currentTarget.value as Category)} class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]">
                    <For each={CATEGORIES}>{(cat) => <option value={cat.id}>{cat.label}</option>}</For>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">Description *</label>
                <textarea value={description()} onInput={(e) => setDescription(e.currentTarget.value)} placeholder="What does it do? Why should someone use it?" rows={3} class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-none" />
              </div>

              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">Version</label>
                  <input type="text" value={version()} onInput={(e) => setVersion(e.currentTarget.value)} placeholder="1.0.0" class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">License</label>
                  <select value={license()} onChange={(e) => setLicense(e.currentTarget.value)} class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]">
                    <option value="MIT">MIT</option>
                    <option value="BSL-1.1">BSL-1.1</option>
                    <option value="Apache-2.0">Apache-2.0</option>
                    <option value="GPL-3.0">GPL-3.0</option>
                    <option value="BSD-3-Clause">BSD-3-Clause</option>
                    <option value="Unlicense">Unlicense</option>
                    <option value="None">None</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">Tags (comma sep)</label>
                  <input type="text" value={tags()} onInput={(e) => setTags(e.currentTarget.value)} placeholder="ai, code, tool" class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-[#c9d1d9] mb-2">Platforms</label>
                <div class="flex flex-wrap gap-2">
                  <For each={["windows", "macos", "linux", "android", "ios", "web"]}>
                    {(p) => (
                      <button
                        type="button"
                        onClick={() => togglePlatform(p)}
                        class={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          platforms().includes(p)
                            ? "bg-[#1f6feb]/20 border-[#1f6feb] text-[#58a6ff]"
                            : "bg-[#0d1117] border-[#21262d] text-[#8b949e] hover:border-[#30363d]"
                        }`}
                      >
                        {p === "macos" ? "macOS" : p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="border-t border-[#21262d] pt-5">
                <h3 class="text-sm font-semibold text-[#c9d1d9] mb-3">Files & Media</h3>
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-4">
                    <FileUploadZone
                      label="Cover Image"
                      accept="image/*"
                      file={coverImageFile()}
                      preview={coverImagePreview()}
                      onFile={(f) => {
                        setCoverImageFile(f)
                        const reader = new FileReader()
                        reader.onload = (e) => setCoverImagePreview(e.target?.result as string)
                        reader.readAsDataURL(f)
                      }}
                      onRemove={() => { setCoverImageFile(null); setCoverImagePreview("") }}
                    />
                    <FileUploadZone
                      label="Logo"
                      accept="image/*"
                      file={logoFile()}
                      preview={logoPreview()}
                      onFile={(f) => {
                        setLogoFile(f)
                        const reader = new FileReader()
                        reader.onload = (e) => setLogoPreview(e.target?.result as string)
                        reader.readAsDataURL(f)
                      }}
                      onRemove={() => { setLogoFile(null); setLogoPreview("") }}
                    />
                  </div>

                  <FileUploadZone
                    label="Download File (APK, EXE, PDF, ZIP, etc.)"
                    accept={CATEGORIES.find((c) => c.id === category())?.accepts || "*"}
                    file={downloadFile()}
                    onFile={(f) => setDownloadFile(f)}
                    onRemove={() => setDownloadFile(null)}
                  />

                  <div>
                    <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">Screenshots (max 5)</label>
                    <Show when={screenshotFiles().length < 5}>
                      <FileUploadZone
                        label=""
                        accept="image/*"
                        file={null}
                        multiple={true}
                        maxFiles={5 - screenshotFiles().length}
                        onFile={(f) => {
                          setScreenshotFiles((prev) => [...prev, f])
                          const reader = new FileReader()
                          reader.onload = (e) => setScreenshotPreviews((prev) => [...prev, e.target?.result as string])
                          reader.readAsDataURL(f)
                        }}
                        onRemove={() => {}}
                      />
                    </Show>
                    <Show when={screenshotFiles().length > 0}>
                      <div class="flex gap-2 mt-2 flex-wrap">
                        <For each={screenshotFiles()}>
                          {(f, i) => (
                            <div class="relative group">
                              <img src={screenshotPreviews()[i()]} class="w-20 h-14 rounded-lg object-cover border border-[#21262d]" alt="" />
                              <button
                                onClick={() => {
                                  setScreenshotFiles((prev) => prev.filter((_, idx) => idx !== i()))
                                  setScreenshotPreviews((prev) => prev.filter((_, idx) => idx !== i()))
                                }}
                                class="absolute -top-1 -right-1 w-4 h-4 bg-[#f85149] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <IconX size={8} class="text-white" />
                              </button>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>

              <div class="border-t border-[#21262d] pt-5">
                <h3 class="text-sm font-semibold text-[#c9d1d9] mb-3">Links (optional)</h3>
                <div class="space-y-3">
                  <div>
                    <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">Live Demo URL</label>
                    <input type="text" value={liveDemo()} onInput={(e) => setLiveDemo(e.currentTarget.value)} placeholder="https://example.com" class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">GitHub Repo</label>
                    <input type="text" value={githubRepo()} onInput={(e) => setGithubRepo(e.currentTarget.value)} placeholder="https://github.com/user/repo" class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-[#c9d1d9] mb-1.5">Install Command</label>
                    <input type="text" value={installCommand()} onInput={(e) => setInstallCommand(e.currentTarget.value)} placeholder="npm install my-plugin" class="w-full px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-[#21262d] bg-[#0d1117]">
              <button onClick={props.onClose} class="px-4 py-2 text-sm text-[#8b949e] hover:text-[#c9d1d9] transition-colors">Cancel</button>
              <button
                onClick={() => {
                  if (name().trim() && description().trim()) setStep("preview")
                  else setError("Name and description are required")
                }}
                class="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-lg text-sm font-medium transition-colors"
              >
                Preview
              </button>
            </div>
          </Show>

          <Show when={step() === "preview"}>
            <div class="flex items-center justify-between p-6 border-b border-[#21262d]">
              <h2 class="text-lg font-semibold text-[#c9d1d9]">Preview Your Item</h2>
              <button onClick={() => setStep("form")} class="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-[#c9d1d9] transition-colors">
                <IconX size={18} />
              </button>
            </div>

            <div class="p-6 overflow-y-auto max-h-[60vh]">
              <div class="bg-[#0d1117] border border-[#21262d] rounded-xl overflow-hidden">
                <Show when={coverImagePreview()}>
                  <div class="h-48 relative overflow-hidden">
                    <img src={coverImagePreview()} alt="" class="w-full h-full object-cover" />
                    <div class="absolute inset-0 bg-gradient-to-t from-[#161b22] to-transparent" />
                  </div>
                </Show>
                <Show when={!coverImagePreview()}>
                  <div class="h-32 bg-gradient-to-br from-[#1f6feb] to-[#8957e5] flex items-center justify-center">
                    <Show when={logoPreview()} fallback={<span class="text-4xl font-bold text-white/30">{name().charAt(0)}</span>}>
                      <img src={logoPreview()} class="w-16 h-16 rounded-xl" alt="" />
                    </Show>
                  </div>
                </Show>
                <div class="p-5">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="px-2 py-0.5 bg-[#1f6feb]/20 text-[#58a6ff] rounded text-xs font-medium">{category()}</span>
                    <span class="text-xs text-[#484f58]">v{version()}</span>
                    <Show when={platforms().length > 0}>
                      <For each={platforms()}>
                        {(p) => <span class="px-1.5 py-0.5 bg-[#21262d] rounded text-[10px] text-[#8b949e]">{p}</span>}
                      </For>
                    </Show>
                  </div>
                  <h3 class="text-lg font-semibold text-[#c9d1d9] mb-1">{name()}</h3>
                  <p class="text-sm text-[#8b949e] mb-3">{description()}</p>
                  <Show when={tags()}>
                    <div class="flex flex-wrap gap-1.5 mb-3">
                      <For each={tags().split(",").map((t) => t.trim()).filter(Boolean)}>
                        {(tag) => <span class="px-2 py-0.5 bg-[#21262d] rounded text-xs text-[#8b949e]">{tag}</span>}
                      </For>
                    </div>
                  </Show>
                  <div class="flex items-center gap-2 text-xs text-[#8b949e]">
                    <span>by {auth.user?.displayName || auth.user?.username}</span>
                    <Show when={license()}><span>• {license()}</span></Show>
                  </div>
                  <Show when={downloadFile()}>
                    <div class="mt-3 p-2 bg-[#238636]/10 border border-[#238636]/20 rounded-lg">
                      <p class="text-xs text-[#3fb950]">📦 {downloadFile()!.name} ({formatFileSize(downloadFile()!.size)})</p>
                    </div>
                  </Show>
                  <Show when={screenshotFiles().length > 0}>
                    <div class="mt-3 flex gap-2 overflow-x-auto">
                      <For each={screenshotPreviews()}>
                        {(p) => <img src={p} class="h-20 rounded-lg object-cover" alt="" />}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-[#21262d] bg-[#0d1117]">
              <button onClick={() => setStep("form")} class="px-4 py-2 text-sm text-[#8b949e] hover:text-[#c9d1d9] transition-colors">Edit</button>
              <button onClick={handlePublish} class="flex items-center gap-2 px-6 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm font-medium transition-colors">
                <IconRocket size={14} />
                Publish Now
              </button>
            </div>
          </Show>

          <Show when={step() === "publishing"}>
            <div class="flex flex-col items-center justify-center py-16">
              <IconLoader class="text-[#58a6ff] mb-4 animate-spin" size={32} />
              <h2 class="text-lg font-semibold text-[#c9d1d9] mb-2">Publishing...</h2>
              <p class="text-sm text-[#8b949e]">{uploadProgress() || "Uploading files to GitHub..."}</p>
            </div>
          </Show>

          <Show when={step() === "done"}>
            <div class="flex flex-col items-center justify-center py-16">
              <div class="w-16 h-16 rounded-full bg-[#238636] flex items-center justify-center mb-4">
                <IconCheck class="text-white" size={32} />
              </div>
              <h2 class="text-lg font-semibold text-[#c9d1d9] mb-2">Published!</h2>
              <p class="text-sm text-[#8b949e]">Your item is now live in the Ecosystem forever</p>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}
