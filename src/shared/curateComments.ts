import type { StarCommentsConfig } from './starCommentsConfig'

interface Curatable {
  commentId: string
  contentId: string
  body: string
  createdAt: number
  reactions: number
  star: { nickname: string }
}

type CurationRules = Pick<
  StarCommentsConfig,
  'hiddenStars' | 'hiddenCommentIds' | 'hiddenKeywords' | 'minReactions' | 'perPostLimit' | 'perPostOrder'
>

/**
 * 운영자가 정한 기준으로 댓글을 거른다: 숨긴 스타 · 숨긴 댓글(ID · 금칙어) · 최소 반응 수,
 * 그다음 글 하나당 최대 개수(perPostLimit)만 남긴다. 입력 순서는 그대로 유지한다.
 */
export function curateComments<T extends Curatable>(comments: T[], rules: CurationRules): T[] {
  const hiddenStars = new Set(rules.hiddenStars)
  const hiddenIds = new Set(rules.hiddenCommentIds)
  const hiddenWords = rules.hiddenKeywords.map((word) => word.toLowerCase())
  const passed = comments.filter(
    (c) =>
      !hiddenStars.has(c.star.nickname) &&
      !hiddenIds.has(c.commentId) &&
      c.reactions >= rules.minReactions &&
      !hiddenWords.some((word) => c.body.toLowerCase().includes(word))
  )
  if (rules.perPostLimit <= 0) return passed

  // 같은 글의 댓글을 고르는 기준(최신 · 반응 많은 순)으로 줄 세워 앞에서 N개만 남긴다.
  const byPost = new Map<string, T[]>()
  for (const c of passed) byPost.set(c.contentId, [...(byPost.get(c.contentId) ?? []), c])
  const keep = new Set<string>()
  for (const group of byPost.values()) {
    group
      .sort((a, b) =>
        rules.perPostOrder === 'reactions' ? b.reactions - a.reactions || b.createdAt - a.createdAt : b.createdAt - a.createdAt
      )
      .slice(0, rules.perPostLimit)
      .forEach((c) => keep.add(c.commentId))
  }
  return passed.filter((c) => keep.has(c.commentId))
}
