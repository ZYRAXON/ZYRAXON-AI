import { type Component, createSignal, Show, onCleanup, For } from "solid-js"
import { IconStar, IconDownload, IconExternalLink, IconX, IconHeart } from "./Icons"
import { getRating, setRating, getLikeCount, toggleLike, getComments, addComment, type SharedComment } from "../services/shared-data"
import { getAuthState } from "../services/auth"

interface AssetDetailModalProps {
  item: any
  onClose: () => void
}

function getItemId(item: any): string {
  if (item.id) return String(item.id)
  if (item.name) return `item-${item.name}`
  return "unknown"
}

function getName(item: any): string {
  return item.name || item.fullName || item.title || "Unknown"
}

function getUrl(item: any): string {
  return item.url || item.htmlUrl || "#"
}

function getAuthor(item: any): string {
  return item.author || item.owner || ""
}

function getDescription(item: any): string {
  return item.description || item.summary || item.about || ""
}

export const AssetDetailModal: Component<AssetDetailModalProps> = (props) => {
  const [rating, setRatingState] = createSignal({ average: 0, count: 0, userRating: 0 })
  const [likeCount, setLikeCountState] = createSignal(0)
  const [userLiked, setUserLiked] = createSignal(false)
  const [comments, setComments] = createSignal<SharedComment[]>([])
  const [newComment, setNewComment] = createSignal("")

  const itemId = () => getItemId(props.item)

  const loadRatings = async () => {
    const r = await getRating(itemId())
    setRatingState(r)
  }

  const loadLikes = async () => {
    const count = await getLikeCount(itemId())
    setLikeCountState(count)
  }

  const loadComments = async () => {
    const c = await getComments(itemId())
    setComments(c.slice(-50))
  }

  const init = async () => {
    await Promise.all([loadRatings(), loadLikes(), loadComments()])
  }

  init()

  const handleRate = async (star: number) => {
    const auth = getAuthState()
    if (!auth.user) return
    const result = await setRating(itemId(), auth.user.id, star)
    setRatingState({ average: result.average, count: result.count, userRating: star })
  }

  const handleLike = async () => {
    const auth = getAuthState()
    if (!auth.user) return
    const result = await toggleLike(itemId(), auth.user.id)
    setUserLiked(result.liked)
    setLikeCountState(result.count)
  }

  const handleComment = async () => {
    const auth = getAuthState()
    if (!auth.user || !newComment().trim()) return
    const comment: SharedComment = {
      id: `comment-${Date.now()}`,
      itemId: itemId(),
      userId: auth.user.id,
      username: auth.user.username,
      avatarUrl: auth.user.avatarUrl,
      content: newComment().trim(),
      createdAt: new Date().toISOString(),
      likeCount: 0,
    }
    await addComment(comment)
    setNewComment("")
    loadComments()
  }

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose()
  }

  document.addEventListener("keydown", handleKeyDown)
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown))

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={handleBackdropClick}>
      <div class="bg-[#161b22] border border-[#21262d] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl shadow-black/40">
        <div class="flex items-center justify-between p-5 border-b border-[#21262d]">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border bg-[#1f6feb]/10 border-[#1f6feb]/20 text-[#58a6ff] flex-shrink-0">
              {getName(props.item).charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="text-lg font-semibold text-[#c9d1d9] truncate">{getName(props.item)}</h2>
              <Show when={getAuthor(props.item)}>
                <p class="text-xs text-[#8b949e]">{getAuthor(props.item)}</p>
              </Show>
            </div>
          </div>
          <button onClick={props.onClose} class="p-2 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors flex-shrink-0">
            <IconX size={20} />
          </button>
        </div>

        <div class="p-5 overflow-y-auto max-h-[70vh] space-y-4">
          <p class="text-sm text-[#c9d1d9] leading-relaxed">{getDescription(props.item)}</p>

          <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
            <p class="text-xs text-[#8b949e] mb-3">Rate this asset</p>
            <div class="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button onClick={() => handleRate(star)} class="transition-transform hover:scale-110">
                  <IconStar size={24}
                    class={star <= rating().userRating ? "text-[#e3b341]" : star <= Math.round(rating().average) ? "text-[#e3b341]/40" : "text-[#21262d]"}
                  />
                </button>
              ))}
              <span class="text-sm text-[#8b949e] ml-2">
                {rating().average > 0 ? `${rating().average.toFixed(1)} (${rating().count} ratings)` : "No ratings yet"}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button onClick={handleLike}
              class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                userLiked() ? "bg-[#da3633]/20 text-[#f85149]" : "bg-[#21262d] text-[#8b949e] hover:text-[#f85149]"
              }`}>
              <IconHeart size={14} class={userLiked() ? "filled" : ""} />
              {likeCount()}
            </button>
            <span class="text-xs text-[#8b949e]">{comments().length} comments</span>
          </div>

          <div class="space-y-3">
            <p class="text-xs text-[#8b949e] font-medium">Comments</p>
            <For each={comments()}>
              {(comment) => (
                <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-3">
                  <div class="flex items-center gap-2 mb-1.5">
                    <img src={comment.avatarUrl} alt="" class="w-5 h-5 rounded-full" />
                    <span class="text-xs font-medium text-[#c9d1d9]">{comment.username}</span>
                    <span class="text-[10px] text-[#484f58]">{new Date(comment.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p class="text-sm text-[#c9d1d9]">{comment.content}</p>
                </div>
              )}
            </For>
            <div class="flex gap-2">
              <input type="text" value={newComment()} onInput={(e) => setNewComment(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleComment() }}
                placeholder="Add a comment..."
                class="flex-1 px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
              <button onClick={handleComment}
                class="px-3 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm font-medium transition-colors">
                Post
              </button>
            </div>
          </div>

          <Show when={getUrl(props.item) !== "#"}>
            <a href={getUrl(props.item)} target="_blank"
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-lg text-sm font-medium transition-colors">
              <IconExternalLink size={14} />
              View Source
            </a>
          </Show>
        </div>
      </div>
    </div>
  )
}