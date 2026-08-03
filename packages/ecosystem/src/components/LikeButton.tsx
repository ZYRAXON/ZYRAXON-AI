import { type Component, createSignal, onMount } from "solid-js"
import { getAuthState } from "../services/auth"
import { getLikeCount, getUserLikes, toggleLike } from "../services/shared-data"
import { IconHeart, IconHeartOutline } from "./Icons"

interface LikeButtonProps {
  itemId: string
  initialLikeCount: number
  initialLiked?: boolean
  onLikeChange?: (liked: boolean, count: number) => void
}

export const LikeButton: Component<LikeButtonProps> = (props) => {
  const [isLiked, setIsLiked] = createSignal(props.initialLiked || false)
  const [likeCount, setLikeCount] = createSignal(props.initialLikeCount)
  const [isAnimating, setIsAnimating] = createSignal(false)
  const auth = getAuthState()

  onMount(async () => {
    if (!auth.isAuthenticated || !auth.user) return
    try {
      const count = await getLikeCount(props.itemId)
      setLikeCount(count)
      const userLikes = await getUserLikes(auth.user.id)
      setIsLiked(userLikes.includes(props.itemId))
    } catch {}
  })

  const handleLike = async () => {
    if (!auth.isAuthenticated || !auth.user) return

    setIsAnimating(true)
    setTimeout(() => setIsAnimating(false), 300)

    const prevLiked = isLiked()
    const prevCount = likeCount()
    const newLiked = !isLiked()
    setIsLiked(newLiked)
    setLikeCount(newLiked ? likeCount() + 1 : Math.max(0, likeCount() - 1))

    try {
      const result = await toggleLike(props.itemId, auth.user.id)
      setIsLiked(result.liked)
      setLikeCount(result.count)
      props.onLikeChange?.(result.liked, result.count)
    } catch {
      setIsLiked(prevLiked)
      setLikeCount(prevCount)
    }
  }

  return (
    <button
      onClick={handleLike}
      disabled={!auth.isAuthenticated}
      class={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        isLiked()
          ? "bg-[#f85149]/10 text-[#f85149] hover:bg-[#f85149]/20"
          : "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9]"
      } ${isAnimating() ? "scale-110" : "scale-100"}`}
    >
      <span class={`transition-transform ${isAnimating() ? "scale-125" : ""}`}>
        {isLiked() ? <IconHeart size={14} /> : <IconHeartOutline size={14} />}
      </span>
      <span>{likeCount()}</span>
    </button>
  )
}
