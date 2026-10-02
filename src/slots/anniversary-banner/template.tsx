import { useEffect, useMemo, useRef, useState } from 'react'
import { createTemplate } from '@bstage-sdk/react'
import { color, shadow, textStyle } from '@bstage-sdk/design/user'

// ────────────────────────────────────────────────────────────────────────
// 자리: user.story-home.feed:before (스토리 홈 피드 영역 위)
// 이 자리는 카탈로그상 context를 전혀 주지 않으므로(표의 context 칸 "—"),
// 스페이스 이름은 API/슬롯 context가 아니라 아래 상수에 고정해 둔다.
// 다른 스페이스에 쓸 때는 SPACE_DISPLAY_NAME만 바꾸면 된다.
//
// 1) 접속하면 화려한 축하 폭죽이 터진다
// 2) 배너 안에 생일 케익 스티커가 숨어있고, 클릭해서 모은다
// 3) (제 아이디어) 스티커를 전부 모으면 숨겨진 축하 화면이 열린다
//
// 노출 기간: 기념일 기준 앞뒤 14일만 (그 외 기간은 null 반환 — 호스트 화면에 아무 것도 안 박힘)
// ────────────────────────────────────────────────────────────────────────

const SPACE_DISPLAY_NAME = 'ariana-test'
const ANNIVERSARY_DATE = '2026-10-02' // 1주년 기준일
const WINDOW_DAYS = 14

const STORAGE_KEY = 'bstage-1st-anniv-collected'

const CONFETTI_COLORS = ['#ff5e7e', '#ffb703', '#8ecae6', '#a3ff8c', '#c084fc', '#ffd166', '#ff8fa3', '#70d6ff']
const FIREWORK_COLORS = ['#ff5e7e', '#ffd166', '#8ecae6', '#c084fc', '#70d6ff']

const STICKER_SPOTS = [
  { id: 's1', top: 14, left: 6 },
  { id: 's2', top: 70, left: 14 },
  { id: 's3', top: 20, left: 90 },
  { id: 's4', top: 75, left: 82 },
  { id: 's5', top: 46, left: 50 },
]

const CELEBRATION_STYLE = `
@keyframes confetti-fall {
  0% { transform: translate(0, -16px) rotate(0deg); opacity: 1; }
  100% { transform: translate(var(--drift, 0px), 220px) rotate(560deg); opacity: 0; }
}
@keyframes firework-ring {
  0% { transform: scale(0.2); opacity: 0.95; }
  100% { transform: scale(1); opacity: 0; }
}
@keyframes sticker-bob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-5px) scale(1.05); }
}
@keyframes sticker-pop {
  0% { transform: scale(1); opacity: 1; }
  60% { transform: scale(1.6); opacity: 0.8; }
  100% { transform: scale(0.2); opacity: 0; }
}
@keyframes badge-pop {
  0% { transform: scale(0.3); opacity: 0; }
  70% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes rainbow-hue {
  0% { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
.anniv-rainbow-text {
  background-image: linear-gradient(90deg, #ff0000, #ff9900, #ffee00, #33ff00, #00ffee, #0066ff, #9900ff);
  background-size: 100% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: rainbow-hue 4s linear infinite;
}
`

interface ConfettiPiece {
  id: number
  left: number
  color: string
  delay: number
  duration: number
  drift: number
}

interface FireworkRing {
  id: number
  top: number
  left: number
  color: string
  delay: number
}

function isWithinAnniversaryWindow(): boolean {
  const anniv = new Date(`${ANNIVERSARY_DATE}T00:00:00`)
  const now = new Date()
  const diffDays = Math.abs(now.getTime() - anniv.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays <= WINDOW_DAYS
}

function makeConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: Math.random() + i,
    left: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 1,
    duration: 1.6 + Math.random() * 1,
    drift: (Math.random() - 0.5) * 100,
  }))
}

function makeFireworks(count: number): FireworkRing[] {
  return Array.from({ length: count }, (_, i) => ({
    id: Math.random() + i,
    top: 10 + Math.random() * 50,
    left: 10 + Math.random() * 80,
    color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
    delay: Math.random() * 0.6,
  }))
}

function loadCollected(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed) : new Set()
  } catch {
    return new Set()
  }
}

function saveCollected(ids: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)))
  } catch {
    // 로컬스토리지를 못 쓰는 환경이면 이번 방문 동안만 기억한다.
  }
}

function AnniversaryBanner() {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>(() => makeConfetti(50))
  const [fireworks, setFireworks] = useState<FireworkRing[]>(() => makeFireworks(4))
  const [collected, setCollected] = useState<Set<string>>(() => loadCollected())
  const [poppingId, setPoppingId] = useState<string | null>(null)
  const [showHiddenScreen, setShowHiddenScreen] = useState(false)
  const hasCelebratedUnlock = useRef(false)

  const allCollected = collected.size >= STICKER_SPOTS.length

  useEffect(() => {
    if (allCollected && !hasCelebratedUnlock.current) {
      hasCelebratedUnlock.current = true
      setShowHiddenScreen(true)
      setConfetti(makeConfetti(90))
      setFireworks(makeFireworks(7))
    }
  }, [allCollected])

  const collectSticker = (id: string) => {
    if (collected.has(id) || poppingId) return
    setPoppingId(id)
    window.setTimeout(() => {
      setCollected((prev) => {
        const next = new Set(prev)
        next.add(id)
        saveCollected(next)
        return next
      })
      setPoppingId(null)
    }, 240)
  }

  const remainingHint = useMemo(() => STICKER_SPOTS.length - collected.size, [collected])

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        padding: '20px 16px',
        marginBottom: 16,
        background: color.bg['grouped-weak'],
        boxShadow: shadow['default-medium'],
        boxSizing: 'border-box',
        minHeight: 160,
        textAlign: 'center',
      }}
    >
      <style>{CELEBRATION_STYLE}</style>

      <div style={{ position: 'relative', zIndex: 5 }}>
        <h2 style={{ ...textStyle('18/title/semibold'), color: color.text.primary, margin: '0 0 4px' }}>
          🎂 {SPACE_DISPLAY_NAME} 1주년을 축하합니다! 🎉
        </h2>
        <p style={{ ...textStyle('12/caption/reg'), color: color.text.secondary, margin: '0 0 2px' }}>
          숨어있는 케익 스티커 🎂 {collected.size}/{STICKER_SPOTS.length}를 찾아보세요
        </p>
        {!allCollected && (
          <p style={{ ...textStyle('11/caption/reg'), color: color.text.secondary, margin: 0 }}>
            {remainingHint}개 남았어요 — 배너 구석구석을 눌러보세요 👀
          </p>
        )}
      </div>

      {/* 2) 숨은 케익 스티커 */}
      {STICKER_SPOTS.map((spot) => {
        const isCollected = collected.has(spot.id)
        const isPopping = poppingId === spot.id
        if (isCollected && !isPopping) return null
        return (
          <button
            key={spot.id}
            onClick={() => collectSticker(spot.id)}
            aria-label="케익 스티커"
            style={{
              position: 'absolute',
              top: `${spot.top}%`,
              left: `${spot.left}%`,
              width: 36,
              height: 36,
              border: 'none',
              background: 'transparent',
              fontSize: 24,
              lineHeight: '36px',
              textAlign: 'center',
              cursor: 'pointer',
              zIndex: 6,
              opacity: isPopping ? undefined : 0.75,
              animation: isPopping
                ? 'sticker-pop 0.24s ease-out forwards'
                : 'sticker-bob 2.4s ease-in-out infinite',
            }}
          >
            🎂
          </button>
        )
      })}

      {/* 1) 축하 폭죽: 컨페티 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 2 }}>
        {confetti.map((c) => (
          <span
            key={c.id}
            style={{
              position: 'absolute',
              top: 0,
              left: `${c.left}%`,
              width: 6,
              height: 6,
              background: c.color,
              borderRadius: 2,
              // @ts-expect-error -- CSS 커스텀 프로퍼티는 타입에 없지만 keyframe에서 var(--drift)로 읽는다.
              '--drift': `${c.drift}px`,
              animation: `confetti-fall ${c.duration}s ease-in ${c.delay}s forwards`,
            }}
          />
        ))}
      </div>

      {/* 1) 축하 폭죽: 파이어워크 링 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
        {fireworks.map((f) => (
          <span
            key={f.id}
            style={{
              position: 'absolute',
              top: `${f.top}%`,
              left: `${f.left}%`,
              width: 60,
              height: 60,
              marginLeft: -30,
              marginTop: -30,
              borderRadius: '50%',
              border: `2px solid ${f.color}`,
              boxShadow: `0 0 20px 6px ${f.color}`,
              animation: `firework-ring 0.8s ease-out ${f.delay}s forwards`,
            }}
          />
        ))}
      </div>

      {/* 3) 숨은 축하 화면 (전부 모으면 열림) */}
      {showHiddenScreen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(0,0,0,0.55)',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              padding: '32px 28px',
              borderRadius: 20,
              background: color.surface.card,
              boxShadow: shadow['default-xlarge'],
              maxWidth: 320,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 40, margin: '0 0 6px', animation: 'badge-pop 0.5s ease-out' }}>🏅</p>
            <h3 className="anniv-rainbow-text" style={{ ...textStyle('20/title/semibold'), margin: '0 0 8px' }}>
              1주년 스티커 마스터!
            </h3>
            <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 16px' }}>
              {SPACE_DISPLAY_NAME}와 함께한 1년, 축하해요 🎂
            </p>
            <button
              onClick={() => setShowHiddenScreen(false)}
              style={{
                ...textStyle('14/body/semibold'),
                border: 'none',
                borderRadius: 999,
                padding: '8px 20px',
                background: color.bg['grouped-weak'],
                color: color.text.primary,
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {allCollected && !showHiddenScreen && (
        <button
          onClick={() => setShowHiddenScreen(true)}
          style={{
            position: 'relative',
            zIndex: 6,
            marginTop: 8,
            border: 'none',
            borderRadius: 999,
            padding: '6px 14px',
            background: color.surface.card,
            boxShadow: shadow['default-small'],
            ...textStyle('12/caption/semibold'),
            color: color.text.primary,
            cursor: 'pointer',
          }}
        >
          🏅 1주년 기념 화면 다시 보기
        </button>
      )}
    </div>
  )
}

export default function AnniversaryBannerTemplate() {
  if (!isWithinAnniversaryWindow()) return null
  return <AnniversaryBanner />
}

createTemplate(AnniversaryBannerTemplate, {
  name: 'anniversary-banner',
  slot: 'user.story-home.feed:before',
})
