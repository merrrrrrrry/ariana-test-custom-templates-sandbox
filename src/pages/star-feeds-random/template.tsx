import { useCallback, useEffect, useState } from 'react'
import { createTemplate } from '@bstage-sdk/react'
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
}

interface StarFeedsResponse {
  size: number
  isLast: boolean
  items: StarFeedItem[]
}

interface Layout {
  left: number
  top: number
  rotate: number
  scale: number
  z: number
}

function pickImage(item: StarFeedItem): string | undefined {
  return item.mainImage || item.images?.[0] || item.video?.thumbnailPaths?.[0]
}

function randomLayout(): Layout {
  return {
    left: Math.random() * 78 + 2,
    top: Math.random() * 72 + 6,
    rotate: Math.random() * 30 - 15,
    scale: 0.8 + Math.random() * 0.5,
    z: Math.floor(Math.random() * 100),
  }
}

export default function StarFeedsRandomTemplate() {
  const [items, setItems] = useState<StarFeedItem[]>([])
  const [layouts, setLayouts] = useState<Record<string, Layout>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const shuffle = useCallback((list: StarFeedItem[]) => {
    setLayouts((prev) => {
      const next = { ...prev }
      for (const item of list) next[item.id] = randomLayout()
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    client
      .get<StarFeedsResponse>('/home/v1/star-home/feeds', { params: { pageSize: 30 } })
      .then((res) => {
        if (cancelled) return
        const withImage = res.data.items.filter((item) => pickImage(item))
        setItems(withImage)
        shuffle(withImage)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '피드를 불러오지 못했습니다')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // shuffle은 items에 의존하지 않는 안정적인 콜백이라 최초 1회만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 4초마다 위치를 다시 흩뿌려 "마구잡이" 느낌을 계속 준다.
  useEffect(() => {
    if (items.length === 0) return
    const id = setInterval(() => shuffle(items), 4000)
    return () => clearInterval(id)
  }, [items, shuffle])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: color.bg.base,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <h1 style={{ ...textStyle('20/title/semibold'), color: color.text.primary, margin: 0 }}>
          스타 피드 마구잡이 🎲
        </h1>
        <button
          onClick={() => shuffle(items)}
          style={{
            ...textStyle('14/body/semibold'),
            padding: '8px 14px',
            borderRadius: 999,
            border: 'none',
            background: color.surface.card,
            boxShadow: shadow['default-large'],
            color: color.text.primary,
            cursor: 'pointer',
          }}
        >
          다시 섞기
        </button>
      </div>

      {loading && (
        <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary, padding: 24 }}>불러오는 중…</p>
      )}
      {error && (
        <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary, padding: 24 }}>{error}</p>
      )}
      {!loading && !error && items.length === 0 && (
        <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary, padding: 24 }}>
          표시할 피드가 없습니다.
        </p>
      )}

      {items.map((item) => {
        const layout = layouts[item.id]
        if (!layout) return null
        const image = pickImage(item)
        return (
          <div
            key={item.id}
            style={{
              position: 'absolute',
              left: `${layout.left}%`,
              top: `${layout.top}%`,
              width: 140,
              transform: `rotate(${layout.rotate}deg) scale(${layout.scale})`,
              transition:
                'left 1.4s cubic-bezier(.22,1,.36,1), top 1.4s cubic-bezier(.22,1,.36,1), transform 1.4s cubic-bezier(.22,1,.36,1)',
              zIndex: layout.z,
              boxShadow: shadow['default-large'],
              borderRadius: 12,
              overflow: 'hidden',
              background: color.surface.card,
            }}
          >
            <img
              src={image}
              alt={item.title ?? item.author.nickname}
              style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block' }}
              onError={(e) => {
                const card = e.currentTarget.parentElement as HTMLElement | null
                if (card) card.style.display = 'none'
              }}
            />
            <div style={{ padding: '6px 8px', ...textStyle('12/caption/med'), color: color.text.secondary }}>
              {item.author.nickname}
            </div>
          </div>
        )
      })}
    </div>
  )
}

createTemplate(StarFeedsRandomTemplate, {
  name: 'star-feeds-random',
})
