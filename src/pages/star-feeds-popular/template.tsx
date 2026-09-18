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

interface ConfettiPiece {
  id: number
  left: number
  color: string
  delay: number
  duration: number
}

// 실측 라우트 — /story/feed/{feedId}로 이동하면 상세 화면이 뜬다 (ariana-test 샌드박스에서 직접 확인).
const FEED_DETAIL_PATH = (id: string) => `/story/feed/${id}`

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

function reactionTotal(item: StarFeedItem): number {
  const counts = item.reactionCounts
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

export default function StarFeedsPopularTemplate() {
  const { navigate } = useNavigation()
  const [items, setItems] = useState<RankedFeed[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([])

  useEffect(() => {
    let cancelled = false
    client
      .get<StarFeedsResponse>('/home/v1/star-home/feeds', { params: { pageSize: 50 } })
      .then((res) => {
        if (cancelled) return
        const ranked = res.data.items
          .filter((item) => pickImage(item))
          .map((item) => {
            const total = reactionTotal(item)
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
    </div>
  )
}

createTemplate(StarFeedsPopularTemplate, {
  name: 'star-feeds-popular',
})
