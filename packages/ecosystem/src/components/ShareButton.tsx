import { type Component, createSignal, Show } from "solid-js"
import {
  IconShare, IconCopy, IconCheck, IconExternalLink,
  IconFacebook, IconTelegram, IconTiktok, IconDiscord,
  IconTwitter, IconLinkedIn, IconReddit, IconEmail
} from "./Icons"

interface ShareButtonProps {
  itemId: string
  itemName: string
  itemUrl?: string
}

export const ShareButton: Component<ShareButtonProps> = (props) => {
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  const itemUrl = () => props.itemUrl || `https://zyraxonai.lovable.app/ecosystem/item/${props.itemId}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(itemUrl())
    } catch {
      const ta = document.createElement("textarea")
      ta.value = itemUrl()
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareOnFacebook = () => {
    const url = encodeURIComponent(itemUrl())
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank")
  }

  const shareOnTelegram = () => {
    const text = encodeURIComponent(`Check out ${props.itemName} on ZYRAXON Ecosystem!`)
    const url = encodeURIComponent(itemUrl())
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank")
  }

  const shareOnTikTok = () => {
    const text = encodeURIComponent(`Check out ${props.itemName} on ZYRAXON Ecosystem! ${itemUrl()}`)
    navigator.clipboard.writeText(`Check out ${props.itemName} on ZYRAXON Ecosystem! ${itemUrl()}`)
    alert("Link copied! Paste it on TikTok.")
  }

  const shareOnDiscord = () => {
    navigator.clipboard.writeText(`Check out ${props.itemName} on ZYRAXON Ecosystem! ${itemUrl()}`)
    alert("Link copied! Paste it in Discord.")
  }

  const shareOnTwitter = () => {
    const text = encodeURIComponent(`Check out ${props.itemName} on ZYRAXON Ecosystem!`)
    const url = encodeURIComponent(itemUrl())
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank")
  }

  const shareOnLinkedIn = () => {
    const url = encodeURIComponent(itemUrl())
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank")
  }

  const shareOnReddit = () => {
    const title = encodeURIComponent(`Check out ${props.itemName} on ZYRAXON Ecosystem`)
    const url = encodeURIComponent(itemUrl())
    window.open(`https://reddit.com/submit?url=${url}&title=${title}`, "_blank")
  }

  const shareViaEmail = () => {
    const subject = encodeURIComponent(`Check out ${props.itemName} on ZYRAXON Ecosystem`)
    const body = encodeURIComponent(`I found this amazing item on ZYRAXON Ecosystem:\n\n${props.itemName}\n\n${itemUrl()}\n\nCheck it out!`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({
        title: props.itemName,
        text: `Check out ${props.itemName} on ZYRAXON Ecosystem!`,
        url: itemUrl(),
      })
    }
  }

  return (
    <div class="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowDropdown(!showDropdown())
        }}
        class="flex items-center gap-1 px-2 py-1.5 bg-[#21262d] text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9] rounded-lg text-xs font-medium transition-colors"
      >
        <IconShare size={14} />
      </button>

      <Show when={showDropdown()}>
        <div class="absolute right-0 top-full mt-2 w-56 bg-[#161b22] border border-[#21262d] rounded-xl shadow-2xl overflow-hidden z-50" onClick={(e) => e.stopPropagation()}>
          <div class="p-1">
            <button
              onClick={copyLink}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <Show when={copied()} fallback={<IconCopy size={16} class="text-[#8b949e]" />}>
                <IconCheck size={16} class="text-[#3fb950]" />
              </Show>
              {copied() ? "Copied!" : "Copy Link"}
            </button>
            <div class="h-px bg-[#21262d] my-1" />
            <button
              onClick={shareOnFacebook}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <IconFacebook size={16} class="text-[#1877f2]" />
              Facebook
            </button>
            <button
              onClick={shareOnTelegram}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <IconTelegram size={16} class="text-[#26a5e4]" />
              Telegram
            </button>
            <button
              onClick={shareOnTikTok}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <IconTiktok size={16} class="text-[#ff0050]" />
              TikTok
            </button>
            <button
              onClick={shareOnTwitter}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <IconTwitter size={16} class="text-[#c9d1d9]" />
              Twitter / X
            </button>
            <button
              onClick={shareOnLinkedIn}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <IconLinkedIn size={16} class="text-[#0a66c2]" />
              LinkedIn
            </button>
            <button
              onClick={shareOnReddit}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <IconReddit size={16} class="text-[#ff4500]" />
              Reddit
            </button>
            <button
              onClick={shareOnDiscord}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <IconDiscord size={16} class="text-[#5865f2]" />
              Discord
            </button>
            <button
              onClick={shareViaEmail}
              class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
            >
              <IconEmail size={16} class="text-[#8b949e]" />
              Email
            </button>
            <Show when={typeof navigator !== "undefined" && "share" in navigator}>
              <div class="h-px bg-[#21262d] my-1" />
              <button
                onClick={handleNativeShare}
                class="flex items-center gap-3 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
              >
                <IconExternalLink size={16} class="text-[#8b949e]" />
                Share via...
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
