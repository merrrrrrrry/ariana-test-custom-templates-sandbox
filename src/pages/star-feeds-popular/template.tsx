import { useEffect, useState } from 'react'
import { createTemplate, useNavigation } from '@bstage-sdk/react'
import { color, shadow, textStyle } from '@bstage-sdk/design/user'
import { client } from '../../shared/client'

// GET /home/v1/star-home/feeds 응답 모양 (게이트웨이 API 레퍼런스 기준).
// 필요한 필드만 좁혀서 선언 — 전체 스펙은 문서 참고.
interface StarFeedAuthor {
  id: string
  nickname: string
  avatarImgPath?: string
}

interface StarFeedItem {
  id: string
  title?: string
  description?: string
  mainImage?: string
  images?: string[]
  video?: { thumbnailPaths?: string[] }
  author: StarFeedAuthor
  commentCount?: number
  reactionCounts?: Record<string, number>
}

interface StarFeedsResponse {
  size: number
  isLast: boolean
  items: StarFeedItem[]
}

interface RankedFeed extends StarFeedItem {
  reactionTotal: number
  score: number
}

// GET /content/v1/boards, /content/v1/boards/{boardId}/posts, /content/v1/contents/{contentIds}/extras
// 응답 모양 (게이트웨이 API 레퍼런스, "계약 파트너 전용" 태그 — 이 앱키에 권한이 없으면 에러가 날 수 있다).
// 문서 스키마의 id는 `{timestamp, date}` 객체로 표기되지만, 실제 ariana-test 사이트에서 글을 열어보면
// 평범한 hex 문자열 ID였다(예: /community/board/{boardId}/post/{postId}) — 문서 생성기의 표현 방식일 뿐이라
// 코드에서는 string으로 다룬다.
interface BoardSummary {
  id: string
  title: string
}

interface BoardPostAuthor {
  id: string
  nickname: string
}

interface BoardPostItem {
  id: string
  author: BoardPostAuthor
  title?: string
  commentCount?: number
  viewCount?: number
  reactionCounts?: Record<string, number>
}

interface BoardPostsResponse {
  board: BoardSummary
  boardContents: {
    items: BoardPostItem[]
  }
}

interface ContentExtras {
  commentCount?: number
  reactionCounts?: Record<string, number>
}

type ExtrasMap = Record<string, ContentExtras>

interface RankedPost {
  id: string
  boardId: string
  boardTitle: string
  title: string
  authorNickname: string
  reactionTotal: number
  commentCount: number
  viewCount: number
  score: number
}

interface ConfettiPiece {
  id: number
  left: number
  color: string
  delay: number
  duration: number
}

// 실측 라우트 — ariana-test 샌드박스에서 직접 클릭해보고 확인한 상세 화면 경로.
const FEED_DETAIL_PATH = (id: string) => `/story/feed/${id}`
const COMMUNITY_POST_PATH = (boardId: string, postId: string) => `/community/board/${boardId}/post/${postId}`

// 축하 연출용 고정 팔레트 — 무지개 텍스트·룰렛과 같은 장식 예외.
const CONFETTI_COLORS = ['#ff5e7e', '#ffb703', '#8ecae6', '#a3ff8c', '#c084fc', '#ffd166']
const RANK_BADGE_BG: Record<number, string> = {
  1: '#FFD700',
  2: '#C6C9CE',
  3: '#CD7F32',
}
const RANK_MEDAL: Record<number, string> = {
  1: '👑',
  2: '🥈',
  3: '🥉',
}

const CELEBRATION_STYLE = `
@keyframes confetti-fall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(480px) rotate(360deg); opacity: 0; }
}
@keyframes crown-glow {
  0%, 100% { box-shadow: 0 0 0 3px #FFD700, 0 0 18px 4px rgba(255,215,0,0.55); }
  50% { box-shadow: 0 0 0 3px #FFD700, 0 0 28px 8px rgba(255,215,0,0.85); }
}
`

function pickImage(item: StarFeedItem): string | undefined {
  return item.mainImage || item.images?.[0] || item.video?.thumbnailPaths?.[0]
}

function sumReactions(counts: Record<string, number> | undefined): number {
  if (!counts) return 0
  return Object.values(counts).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0)
}

function makeConfetti(): ConfettiPiece[] {
  return Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 0.6,
    duration: 2 + Math.random() * 1.2,
  }))
}

function rankPosts(posts: RankedPost[]): RankedPost[] {
  // 반응 합계 + 댓글 수 내림차순, 동점이면 조회수 내림차순.
  return [...posts].sort((a, b) => b.score - a.score || b.viewCount - a.viewCount)
}

export default function StarFeedsPopularTemplate() {
  const { navigate } = useNavigation()

  const [items, setItems] = useState<RankedFeed[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([])

  const [communityTop, setCommunityTop] = useState<RankedPost[] | null>(null)
  const [communityError, setCommunityError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    client
      .get<StarFeedsResponse>('/home/v1/star-home/feeds', { params: { pageSize: 50 } })
      .then((res) => {
        if (cancelled) return
        const ranked = res.data.items
          .filter((item) => pickImage(item))
          .map((item) => {
            const total = sumReactions(item.reactionCounts)
            return { ...item, reactionTotal: total, score: total + (item.commentCount ?? 0) }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 9)
        setItems(ranked)
        if (ranked.length > 0) setConfetti(makeConfetti())
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '인기글을 불러오지 못했습니다')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCommunityTop() {
      // 1) 보드 목록 조회
      const boards = (await client.get<BoardSummary[]>('/content/v1/boards')).data

      // 2) 보드마다 포스트 목록 조회 — 한 보드가 실패해도 나머지는 계속 집계한다.
      const postsByBoard = await Promise.all(
        boards.map((board) =>
          client
            .get<BoardPostsResponse>('/content/v1/boards/{boardId}/posts', {
              path: { boardId: board.id },
              params: { request: '' },
            })
            .then((res) =>
              res.data.boardContents.items.map((post) => ({
                id: post.id,
                boardId: board.id,
                boardTitle: board.title,
                title: post.title || '(제목 없음)',
                authorNickname: post.author?.nickname ?? '익명',
                reactionTotal: sumReactions(post.reactionCounts),
                commentCount: post.commentCount ?? 0,
                viewCount: post.viewCount ?? 0,
                score: sumReactions(post.reactionCounts) + (post.commentCount ?? 0),
              }))
            )
            .catch(() => [] as RankedPost[])
        )
      )

      let top10 = rankPosts(postsByBoard.flat()).slice(0, 10)

      // 3) 상위 10개만 extras로 카운트 갱신 후 최종 순위 확정.
      if (top10.length > 0) {
        try {
          const idsParam = top10.map((p) => p.id).join(',')
          const extras = (
            await client.get<ExtrasMap>('/content/v1/contents/{contentIds}/extras', {
              path: { contentIds: idsParam },
            })
          ).data
          top10 = top10.map((post) => {
            const extra = extras[post.id]
            if (!extra) return post
            const reactionTotal = sumReactions(extra.reactionCounts)
            const commentCount = extra.commentCount ?? post.commentCount
            return { ...post, reactionTotal, commentCount, score: reactionTotal + commentCount }
          })
          top10 = rankPosts(top10)
        } catch {
          // extras 갱신 실패해도 1차 랭킹은 그대로 보여준다.
        }
      }

      if (!cancelled) setCommunityTop(top10)
    }

    loadCommunityTop().catch((err) => {
      if (cancelled) return
      setCommunityError(
        err instanceof Error ? err.message : '커뮤니티 인기글을 불러오지 못했습니다 (권한이 없는 API일 수 있어요)'
      )
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: color.bg.base, padding: 20, boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{CELEBRATION_STYLE}</style>

      <h1 style={{ ...textStyle('20/title/semibold'), color: color.text.primary, margin: '0 0 4px' }}>
        🎉 이번 주 인기글, 축하해요! 🎉
      </h1>
      <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 16px' }}>
        반응과 댓글이 가장 뜨거웠던 TOP 9
      </p>

      {error && <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>{error}</p>}
      {!error && items === null && (
        <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>불러오는 중…</p>
      )}
      {!error && items !== null && items.length === 0 && (
        <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>표시할 인기글이 없습니다.</p>
      )}

      {items && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {items.map((item, index) => {
            const rank = index + 1
            const isTop1 = rank === 1
            const image = pickImage(item)
            return (
              <button
                key={item.id}
                onClick={() => navigate(FEED_DETAIL_PATH(item.id))}
                style={{
                  position: 'relative',
                  aspectRatio: '3 / 4',
                  border: 'none',
                  padding: 0,
                  borderRadius: 12,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  boxShadow: shadow['default-medium'],
                  background: color.surface.card,
                  textAlign: 'left',
                  animation: isTop1 ? 'crown-glow 1.8s ease-in-out infinite' : undefined,
                }}
              >
                <img
                  src={image}
                  alt={item.title ?? item.author.nickname}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />

                {/* 순위 배지 — 1~3위는 메달 이모지, 나머지는 숫자 */}
                <span
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    minWidth: 26,
                    height: 26,
                    borderRadius: 13,
                    padding: '0 7px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    background: RANK_BADGE_BG[rank] ?? 'rgba(0,0,0,0.55)',
                    color: rank <= 3 ? '#1a1a1a' : '#ffffff',
                    boxShadow: rank <= 3 ? shadow['default-small'] : undefined,
                    ...textStyle('12/caption/semibold'),
                  }}
                >
                  {RANK_MEDAL[rank] ? `${RANK_MEDAL[rank]} ${rank}` : rank}
                </span>

                {/* 하단 그라디언트 + 반응/댓글 수 */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: '20px 8px 8px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))',
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <span style={{ ...textStyle('11/caption/semibold'), color: '#ffffff' }}>
                    ❤️ {item.reactionTotal}
                  </span>
                  <span style={{ ...textStyle('11/caption/semibold'), color: '#ffffff' }}>
                    💬 {item.commentCount ?? 0}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* 로딩 완료 시 한 번 터지는 축하 컨페티 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {confetti.map((c) => (
          <span
            key={c.id}
            style={{
              position: 'absolute',
              top: 0,
              left: `${c.left}%`,
              width: 8,
              height: 8,
              background: c.color,
              borderRadius: 2,
              animation: `confetti-fall ${c.duration}s ease-in ${c.delay}s forwards`,
            }}
          />
        ))}
      </div>

      {/* ── 커뮤니티 인기글 TOP 10 (보드 전체 취합) ── */}
      <div style={{ marginTop: 40, position: 'relative' }}>
        <h2 style={{ ...textStyle('18/title/semibold'), color: color.text.primary, margin: '0 0 4px' }}>
          🏆 커뮤니티 인기글 TOP 10
        </h2>
        <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 12px' }}>
          모든 보드를 통틀어 반응+댓글이 가장 많았던 글 (동점이면 조회수 순)
        </p>

        {communityError && (
          <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>{communityError}</p>
        )}
        {!communityError && communityTop === null && (
          <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>불러오는 중…</p>
        )}
        {!communityError && communityTop !== null && communityTop.length === 0 && (
          <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>표시할 글이 없습니다.</p>
        )}

        {communityTop && communityTop.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {communityTop.map((post, index) => {
              const rank = index + 1
              const isTop1 = rank === 1
              return (
                <button
                  key={post.id}
                  onClick={() => navigate(COMMUNITY_POST_PATH(post.boardId, post.id))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '12px 14px',
                    border: 'none',
                    borderRadius: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: color.surface.card,
                    boxShadow: shadow['default-small'],
                    animation: isTop1 ? 'crown-glow 1.8s ease-in-out infinite' : undefined,
                  }}
                >
                  <span
                    style={{
                      minWidth: 28,
                      height: 28,
                      borderRadius: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: RANK_BADGE_BG[rank] ?? color.bg['grouped-weak'],
                      color: rank <= 3 ? '#1a1a1a' : color.text.secondary,
                      flexShrink: 0,
                      ...textStyle('12/caption/semibold'),
                    }}
                  >
                    {RANK_MEDAL[rank] ?? rank}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        ...textStyle('14/body/semibold'),
                        color: color.text.primary,
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {post.title}
                    </p>
                    <p style={{ ...textStyle('11/caption/reg'), color: color.text.secondary, margin: '2px 0 0' }}>
                      {post.boardTitle} · {post.authorNickname}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                    <span style={{ ...textStyle('12/caption/semibold'), color: color.text.secondary }}>
                      ❤️ {post.reactionTotal}
                    </span>
                    <span style={{ ...textStyle('12/caption/semibold'), color: color.text.secondary }}>
                      💬 {post.commentCount}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

createTemplate(StarFeedsPopularTemplate, {
  name: 'star-feeds-popular',
})
