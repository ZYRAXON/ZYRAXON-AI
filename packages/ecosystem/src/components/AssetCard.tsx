import { type Component, createSignal, Show } from "solid-js"
import { IconStar, IconDownload, IconExternalLink, IconCopy, IconCheck } from "./Icons"

interface AssetCardProps {
  item: any
  onClick?: (item: any) => void
}

function getName(item: any): string {
  if (item.name) return item.name
  if (item.fullName) return item.fullName
  if (item.title) return item.title
  return "Unknown"
}

function getDescription(item: any): string {
  return item.description || ""
}

function getStars(item: any): number {
  return item.stars || item.likes || item.rating || 0
}

function getDownloads(item: any): string {
  const n = item.downloads || item.pulls || item.forks || 0
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return String(n)
}

function getUrl(item: any): string {
  return item.url || item.htmlUrl || item.imageUrl || "#"
}

export const AssetCard: Component<AssetCardProps> = (props) => {
  const [copied, setCopied] = createSignal(false)

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(getName(props.item))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpen = (e: MouseEvent) => {
    e.stopPropagation()
    window.open(getUrl(props.item), "_blank")
  }

  return (
    <div
      onClick={() => props.onClick?.(props.item)}
      class="group relative bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden hover:border-[#30363d] transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-black/20"
    >
      <div class="p-4">
        <div class="flex items-start gap-3 mb-3">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-lg font-bold border bg-[#1f6feb]/10 border-[#1f6feb]/20 text-[#58a6ff]">
            {getName(props.item).charAt(0).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-[#c9d1d9] group-hover:text-[#58a6ff] transition-colors line-clamp-1">
              {getName(props.item)}
            </h3>
          </div>
        </div>

        <p class="text-xs text-[#8b949e] line-clamp-2 mb-3 min-h-[32px]">{getDescription(props.item)}</p>

        <div class="flex items-center justify-between pt-3 border-t border-[#21262d]">
          <div class="flex items-center gap-3 text-xs text-[#8b949e]">
            <span class="flex items-center gap-1">
              <IconStar size={11} class="text-[#e3b341]" />
              {getStars(props.item).toLocaleString()}
            </span>
            <span class="flex items-center gap-1">
              <IconDownload size={11} />
              {getDownloads(props.item)}
            </span>
          </div>
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleOpen}
              class="p-1.5 text-[#8b949e] hover:text-[#58a6ff] rounded-lg hover:bg-[#58a6ff]/10 transition-colors" title="Open">
              <IconExternalLink size={12} />
            </button>
            <button onClick={handleCopy}
              class={`p-1.5 rounded-lg transition-colors ${copied() ? "text-[#3fb950] bg-[#238636]/10" : "text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#58a6ff]/10"}`}
              title="Copy">
              {copied() ? <IconCheck size={12} /> : <IconCopy size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
