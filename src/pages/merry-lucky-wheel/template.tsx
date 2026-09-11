import { useMemo, useRef, useState } from 'react'
import { createTemplate } from '@bstage-sdk/react'
import { color, shadow, textStyle } from '@bstage-sdk/design/user'

// 룰렛 조각 색은 장식용이라 디자인 토큰 대신 고정 팔레트를 쓴다(무지개 텍스트와 같은 예외).
const PRIZES = [
  { label: '행운 두 배 🍀', bg: '#FFD6E0' },
  { label: '달콤한 디저트 🍰', bg: '#FFE8B8' },
  { label: '오늘 칭찬 받기 💬', bg: '#FFF3B0' },
  { label: '포근한 낮잠 😴', bg: '#D6F5D6' },
  { label: '깜짝 선물 🎁', bg: '#C9F0FF' },
  { label: '완벽한 플레이리스트 🎧', bg: '#D6D9FF' },
  { label: '커피 한 잔 ☕', bg: '#E6D6FF' },
  { label: '무지개 뜨는 하루 🌈', bg: '#FFD6F3' },
]

const SEGMENT_ANGLE = 360 / PRIZES.length
const RADIUS = 130
const CONFETTI_COLORS = ['#ff5e7e', '#ffb703', '#8ecae6', '#a3ff8c', '#c084fc', '#ff7bd5']

interface ConfettiPiece {
  id: number
  left: number
  color: string
  delay: number
  duration: number
  rotate: number
}

function makeConfetti(): ConfettiPiece[] {
  return Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 0.3,
    duration: 1.6 + Math.random() * 0.9,
    rotate: Math.random() * 360,
  }))
}

const CONFETTI_STYLE = `
@keyframes confetti-fall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(320px) rotate(360deg); opacity: 0; }
}
`

export default function MerryLuckyWheelTemplate() {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([])
  const spinTimeout = useRef<number | null>(null)

  const gradient = useMemo(
    () =>
      PRIZES.map(
        (p, i) => `${p.bg} ${i * SEGMENT_ANGLE}deg ${(i + 1) * SEGMENT_ANGLE}deg`
      ).join(', '),
    []
  )

  const spin = () => {
    if (spinning) return
    const idx = Math.floor(Math.random() * PRIZES.length)
    const jitter = (Math.random() - 0.5) * SEGMENT_ANGLE * 0.6
    const desiredMod = (((360 - (idx * SEGMENT_ANGLE + SEGMENT_ANGLE / 2) - jitter) % 360) + 360) % 360
    const currentMod = ((rotation % 360) + 360) % 360
    const extraSpins = 5 + Math.floor(Math.random() * 3)
    const newRotation = rotation + ((desiredMod - currentMod + 360) % 360) + extraSpins * 360

    setSpinning(true)
    setResult(null)
    setRotation(newRotation)

    if (spinTimeout.current) window.clearTimeout(spinTimeout.current)
    spinTimeout.current = window.setTimeout(() => {
      setSpinning(false)
      setResult(PRIZES[idx].label)
      setConfetti(makeConfetti())
    }, 4200)
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        overflow: 'hidden',
        background: color.bg.base,
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <style>{CONFETTI_STYLE}</style>

      <h1 style={{ ...textStyle('20/title/semibold'), color: color.text.primary, margin: 0 }}>
        메리의 행운 룰렛 🎡
      </h1>

      <div style={{ position: 'relative', width: RADIUS * 2, height: RADIUS * 2 }}>
        {/* 포인터 */}
        <div
          style={{
            position: 'absolute',
            top: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '12px solid transparent',
            borderRight: '12px solid transparent',
            borderTop: `18px solid ${color.text.primary}`,
            zIndex: 10,
          }}
        />

        {/* 룰렛 휠 */}
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: `conic-gradient(${gradient})`,
            boxShadow: shadow['default-large'],
            border: `4px solid ${color.surface.card}`,
            position: 'relative',
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 4.2s cubic-bezier(.17,.67,.16,1)' : undefined,
          }}
        >
          {PRIZES.map((p, i) => {
            const angle = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2
            return (
              <div
                key={p.label}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 0,
                  height: 0,
                  transformOrigin: '0 0',
                  transform: `rotate(${angle}deg) translate(0, -${RADIUS - 34}px)`,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    transform: 'translate(-50%, -50%)',
                    ...textStyle('12/caption/semibold'),
                    color: color.text.primary,
                    width: 72,
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}
                >
                  {p.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* 중앙 버튼 */}
        <button
          onClick={spin}
          disabled={spinning}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: 'none',
            background: color.surface.card,
            boxShadow: shadow['default-medium'],
            ...textStyle('14/body/semibold'),
            color: color.text.primary,
            cursor: spinning ? 'default' : 'pointer',
            zIndex: 5,
          }}
        >
          {spinning ? '···' : 'GO'}
        </button>
      </div>

      <div style={{ minHeight: 32 }}>
        {result && (
          <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary, margin: 0 }}>
            🎉 <strong style={{ color: color.text.primary }}>{result}</strong>
          </p>
        )}
      </div>

      {/* 컨페티 */}
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

createTemplate(MerryLuckyWheelTemplate, {
  name: 'merry-lucky-wheel',
})
