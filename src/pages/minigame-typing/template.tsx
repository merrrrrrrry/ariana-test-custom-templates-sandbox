import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { createTemplate } from '@bstage-sdk/react'
import { color, shadow, textStyle } from '@bstage-sdk/design/user'
import {
  BEST_STORAGE_KEY,
  diffChars,
  isComplete,
  keystrokeCount,
  parseBest,
  pickPhraseIndex,
  strokesPerMinute,
} from '../../shared/typing'
import { PHRASES } from '../../shared/typingPhrases'

// 가사 빨리 치기 — 화면의 문장을 그대로 따라 친다. 첫 글자를 치는 순간 시간이 시작되고, 문장이 정확히 같아지면 끝난다.
// 점수를 서버로 보내지 않는다. 최고 기록은 이 기기(localStorage)에만 남고, 막히면 이번 방문 동안만 유지된다.

const LIVE_MIN_MS = 800 // 이보다 짧을 땐 타수가 튀어서 "-"로 둔다

function readBest(): number {
  try {
    return parseBest(window.localStorage.getItem(BEST_STORAGE_KEY))
  } catch {
    return 0
  }
}

function writeBest(best: number) {
  try {
    window.localStorage.setItem(BEST_STORAGE_KEY, String(best))
  } catch {
    // 저장이 막힌 환경(시크릿 모드 등)에서는 이번 방문 동안만 기록이 유지된다
  }
}

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`

interface Finished {
  ms: number
  cpm: number
  record: boolean
}

const STYLES = `
@keyframes typing-caret { 0%, 100% { border-bottom-color: var(--caret, currentColor) } 50% { border-bottom-color: transparent } }
@keyframes typing-pop { 0% { transform: scale(.96); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }
`

export default function MinigameTypingTemplate() {
  const [phraseIdx, setPhraseIdx] = useState(() => pickPhraseIndex(PHRASES.length, null))
  const [typed, setTyped] = useState('')
  const [composing, setComposing] = useState(false)
  const [focused, setFocused] = useState(false)
  const [running, setRunning] = useState(false)
  const [now, setNow] = useState(0)
  const [finished, setFinished] = useState<Finished | null>(null)
  const [best, setBest] = useState(readBest)
  const [startAt, setStartAt] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const target = PHRASES[phraseIdx] ?? ''
  const targetStrokes = useMemo(() => keystrokeCount(target), [target])

  // 시간이 흐르는 동안 화면 숫자를 0.05초마다 갱신한다
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(performance.now()), 50)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    inputRef.current?.focus()
  }, [phraseIdx])

  const elapsed = finished ? finished.ms : running && startAt !== null ? Math.max(0, now - startAt) : 0
  const liveCpm = finished
    ? finished.cpm
    : running && elapsed >= LIVE_MIN_MS
      ? strokesPerMinute(keystrokeCount(typed), elapsed)
      : 0

  const states = useMemo(() => {
    const base = diffChars(target, typed)
    // 한글을 조합하는 중인 마지막 글자(예: 'ㅎ'→'하'→'한')는 틀린 것으로 치지 않는다
    if (composing && !isComplete(target, typed)) {
      const last = Array.from(typed.normalize('NFC')).length - 1
      if (last >= 0 && base[last] === 'bad') base[last] = 'todo'
    }
    return base
  }, [target, typed, composing])

  const chars = useMemo(() => Array.from(target.normalize('NFC')), [target])
  const cursor = Array.from(typed.normalize('NFC')).length - (composing && typed ? 1 : 0)
  const doneCount = states.filter((s) => s === 'ok').length
  const progress = chars.length ? Math.round((doneCount / chars.length) * 100) : 0

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (finished) return
    const value = e.target.value
    let t0 = startAt
    if (t0 === null && value.length > 0) {
      t0 = performance.now()
      setStartAt(t0)
      setNow(t0)
      setRunning(true)
    }
    setTyped(value)
    if (t0 !== null && isComplete(target, value)) {
      const ms = performance.now() - t0
      const cpm = strokesPerMinute(targetStrokes, ms)
      const record = cpm > best
      if (record) {
        setBest(cpm)
        writeBest(cpm)
      }
      setRunning(false)
      setFinished({ ms, cpm, record })
    }
  }

  const reset = (idx: number) => {
    setStartAt(null)
    setRunning(false)
    setNow(0)
    setTyped('')
    setComposing(false)
    setFinished(null)
    setPhraseIdx(idx)
    inputRef.current?.focus()
  }

  const next = () => reset(pickPhraseIndex(PHRASES.length, phraseIdx))
  const retry = () => reset(phraseIdx)

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && finished) {
      e.preventDefault()
      next()
    } else if (e.key === 'Escape' && !finished) {
      e.preventDefault()
      retry()
    }
  }

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '32px 16px',
        background: color.bg.base,
      }}
    >
      <style>{STYLES}</style>
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header style={{ textAlign: 'center' }}>
          <h1 style={{ ...textStyle('24/title/semibold'), color: color.text.primary, margin: 0 }}>가사 빨리 치기 ⌨️</h1>
          <p style={{ ...textStyle('14/body/reg'), color: color.text.secondary, margin: '8px 0 0', wordBreak: 'keep-all' }}>
            아래 문장을 그대로 따라 쳐 보세요. 첫 글자를 치면 시간이 시작돼요.
          </p>
        </header>

        {/* 실시간 기록 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="타수 (분당)" value={liveCpm > 0 ? String(liveCpm) : '-'} highlight={Boolean(finished)} />
          <Stat label="입력 시간" value={startAt !== null || finished ? formatSeconds(elapsed) : '0.0초'} highlight={Boolean(finished)} />
          <Stat label="내 최고 타수" value={best > 0 ? String(best) : '-'} />
        </div>

        {/* 진행 막대 */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          style={{ height: 8, borderRadius: 4, background: color.surface['form-grey-weak-a'], overflow: 'hidden' }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              borderRadius: 4,
              background: color.surface['form-blue'],
              transition: 'width 120ms ease-out',
            }}
          />
        </div>

        {/* 따라 칠 문장: 맞게 친 글자는 진하게, 틀린 글자는 빨갛게, 칠 차례 글자에는 깜박이는 밑줄 */}
        <div
          onClick={() => inputRef.current?.focus()}
          style={{
            background: color.surface.card,
            boxShadow: shadow['default-large'],
            borderRadius: 20,
            padding: '28px 24px',
            cursor: 'text',
            animation: finished ? 'typing-pop 240ms ease-out' : undefined,
          }}
        >
          <p
            aria-label={target}
            style={{
              ...textStyle('24/title/semibold'),
              fontSize: 'clamp(20px, 5.4vw, 26px)',
              lineHeight: 1.75,
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
              textAlign: 'center',
            }}
          >
            {chars.map((ch, i) => {
              const s = states[i]
              const isCursor = !finished && i === cursor
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{
                    color: s === 'ok' ? color.text.primary : s === 'bad' ? color.text.red : color.text.quaternary,
                    background: s === 'bad' ? color.surface['form-red-weak-a'] : undefined,
                    borderRadius: 4,
                    borderBottom: isCursor ? `3px solid ${color.border.blue}` : '3px solid transparent',
                    // @ts-expect-error CSS 변수는 style 타입에 없다
                    '--caret': color.border.blue,
                    animation: isCursor && focused ? 'typing-caret 1s step-end infinite' : undefined,
                  }}
                >
                  {ch}
                </span>
              )
            })}
          </p>
        </div>

        {/* 입력창 */}
        <input
          ref={inputRef}
          value={typed}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          readOnly={Boolean(finished)}
          placeholder="여기에 입력하세요"
          aria-label="따라 칠 문장 입력"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{
            ...textStyle('16/title/semibold'),
            width: '100%',
            boxSizing: 'border-box',
            padding: '14px 16px',
            borderRadius: 14,
            border: `2px solid ${focused ? color.border.blue : color.border['default-a']}`,
            background: color.surface.card,
            color: color.text.primary,
            outline: 'none',
            transition: 'border-color 120ms',
          }}
        />

        {finished ? (
          <div
            role="status"
            style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              animation: 'typing-pop 240ms ease-out',
            }}
          >
            <p style={{ ...textStyle('20/title/semibold'), color: color.text.primary, margin: 0 }}>
              {finished.record ? '🎉 새 기록이에요!' : '완료! 👏'}
            </p>
            <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary, margin: 0 }}>
              {formatSeconds(finished.ms)} 동안 분당 <strong style={{ color: color.text.primary }}>{finished.cpm}타</strong>
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              <button type="button" onClick={next} style={primaryButton}>
                다음 문장 (Enter)
              </button>
              <button type="button" onClick={retry} style={secondaryButton}>
                다시 치기
              </button>
            </div>
          </div>
        ) : (
          <p style={{ ...textStyle('12/caption/semibold'), color: color.text.tertiary, margin: 0, textAlign: 'center', wordBreak: 'keep-all' }}>
            Esc로 이 문장을 처음부터 다시 칠 수 있어요 · 최고 기록은 이 기기에만 저장돼요
          </p>
        )}
      </div>
    </div>
  )
}

const buttonBase = {
  ...textStyle('14/body/semibold'),
  border: 'none',
  borderRadius: 12,
  padding: '12px 18px',
  cursor: 'pointer',
} as const

const primaryButton = {
  ...buttonBase,
  background: color.surface['form-blue'],
  color: color.text['invert-a'],
} as const

const secondaryButton = {
  ...buttonBase,
  background: color.surface['form-grey-weak-a'],
  color: color.text.primary,
} as const

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: color.surface.card,
        boxShadow: shadow['default-small'],
        borderRadius: 16,
        padding: '14px 8px',
        textAlign: 'center',
      }}
    >
      <div style={{ ...textStyle('12/caption/semibold'), color: color.text.secondary }}>{label}</div>
      <div
        style={{
          ...textStyle('24/title/semibold'),
          color: highlight ? color.text.blue : color.text.primary,
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  )
}

createTemplate(MinigameTypingTemplate, {
  name: 'ariana-test-minigame-typing',
})
