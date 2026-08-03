import { type Component, createSignal, Show, For, onMount } from "solid-js"
import type { Comment } from "../types"
import { getAuthState } from "../services/auth"
import { getComments as fetchSharedComments, addComment as saveSharedComment, type SharedComment } from "../services/shared-data"
import { IconHeart, IconSend } from "./Icons"

interface CommentSectionProps {
  itemId: string
  comments: Comment[]
  onCommentAdded?: (comment: Comment) => void
}

export const CommentSection: Component<CommentSectionProps> = (props) => {
  const [comments, setComments] = createSignal<Comment[]>(props.comments)
  const [newComment, setNewComment] = createSignal("")
  const [isSubmitting, setIsSubmitting] = createSignal(false)
  const auth = getAuthState()

  onMount(async () => {
    try {
      const stored = await fetchSharedComments(props.itemId)
      if (stored.length > 0) {
        setComments(stored.map((c) => ({
          id: c.id,
          userId: c.userId,
          username: c.username,
          avatarUrl: c.avatarUrl,
          content: c.content,
          itemId: c.itemId,
          createdAt: c.createdAt,
          likeCount: c.likeCount,
        })))
      }
    } catch {}
  })

  const handleSubmit = async () => {
    if (!newComment().trim() || isSubmitting() || !auth.user) return

    setIsSubmitting(true)
    try {
      const comment: SharedComment = {
        id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        itemId: props.itemId,
        userId: auth.user.id,
        username: auth.user.username,
        avatarUrl: auth.user.avatarUrl,
        content: newComment().trim(),
        createdAt: new Date().toISOString(),
        likeCount: 0,
      }

      await saveSharedComment(comment)

      const appComment: Comment = {
        id: comment.id,
        userId: comment.userId,
        username: comment.username,
        avatarUrl: comment.avatarUrl,
        content: comment.content,
        itemId: comment.itemId,
        createdAt: comment.createdAt,
        likeCount: comment.likeCount,
      }
      setComments([appComment, ...comments()])
      props.onCommentAdded?.(appComment)
      setNewComment("")
    } catch (error) {
      console.error("Failed to add comment:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  return (
    <div class="space-y-4">
      <Show when={auth.isAuthenticated}>
        <div class="flex gap-3">
          <img src={auth.user?.avatarUrl} alt="" class="w-8 h-8 rounded-full bg-[#21262d]" />
          <div class="flex-1">
            <textarea
              value={newComment()}
              onInput={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a comment..."
              class="w-full p-3 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-none"
              rows={3}
            />
            <div class="flex justify-end mt-2">
              <button
                onClick={handleSubmit}
                disabled={!newComment().trim() || isSubmitting()}
                class={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  newComment().trim() && !isSubmitting()
                    ? "bg-[#238636] hover:bg-[#2ea043] text-white"
                    : "bg-[#21262d] text-[#484f58] cursor-not-allowed"
                }`}
              >
                <IconSend size={12} />
                {isSubmitting() ? "Posting..." : "Comment"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={!auth.isAuthenticated}>
        <div class="p-4 bg-[#0d1117] border border-[#21262d] rounded-lg text-center">
          <p class="text-sm text-[#8b949e]">
            <a href="/ecosystem" class="text-[#58a6ff] hover:underline">Login</a> to leave a comment
          </p>
        </div>
      </Show>

      <div class="space-y-4">
        <For each={comments()}>
          {(comment) => (
            <div class="flex gap-3">
              <img src={comment.avatarUrl} alt="" class="w-8 h-8 rounded-full bg-[#21262d]" />
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-[#c9d1d9]">{comment.username}</span>
                  <span class="text-xs text-[#484f58]">{formatTimeAgo(comment.createdAt)}</span>
                </div>
                <p class="text-sm text-[#c9d1d9] mt-1">{comment.content}</p>
                <div class="flex items-center gap-4 mt-2">
                  <button class="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors">
                    <IconHeart size={12} /> {comment.likeCount}
                  </button>
                  <button class="text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors">Reply</button>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={comments().length === 0}>
        <div class="text-center py-8">
          <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#161b22] border border-[#21262d] flex items-center justify-center">
            <IconSend size={18} class="text-[#484f58]" />
          </div>
          <p class="text-sm text-[#8b949e]">No comments yet. Be the first!</p>
        </div>
      </Show>
    </div>
  )
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diff = now.getTime() - then.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
