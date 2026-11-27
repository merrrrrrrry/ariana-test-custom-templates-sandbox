import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, MutableRefObject } from 'react'
import { createTemplate } from '@bstage-sdk/react'
import { color, shadow, textStyle } from '@bstage-sdk/design/user'
import {
  BEST_STORAGE_KEY,
  diffChars,
  isComplete,
  isPlausibleCpm,
  keystrokeCount,
  parseBest,
  pickPhraseIndex,
  strokesPerMinute,
} from '../../shared/typing'
import { PHRASES } from '../../shared/typingPhrases'
import {
  NICKNAME_KEY,
  defaultTypingApi,
  describeError,
  isNicknameMatch,
  isRetryable,
  parseNickname,
} from '../../shared/typingApi'
import type { PhraseInfo, RankingRow, TypingApi, TypingResult } from '../../shared/typingApi'

// 가사 빨리 치기 — 화면의 문장을 그대로 따라 친다. 첫 글자를 치는 순간 시간이 시작되고, 문장이 정확히 같아지면 끝난다.
// 랭킹 서버가 연결되면 문장은 서버가 내고 서버가 시간을 재서 기록한다(닉네임만 사용, 로그인 없음).
// 순위는 문장마다 따로 매긴다 — 같은 문장끼리만 비교하고, 문장을 골라 그 문장의 랭킹을 볼 수 있다.
// 서버에 연결하지 못하면 이 기기의 연습 문장으로 이어 가고, 최고 기록은 이 기기에만 남는다.

const LIVE_MIN_MS = 800 // 이보다 짧을 땐 타수가 튀어서 "-"로 둔다
const RANDOM = 'random' // 문장 선택: 무작위

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 저장이 막힌 환경(시크릿 모드 등)에서는 이번 방문 동안만 유지된다
  }
}

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`
const shorten = (text: string, n: number) => (Array.from(text).length > n ? `${Array.from(text).slice(0, n).join('')}…` : text)

interface Round {
  phrase: string
  phraseId: string | null // null이면 서버 없이 이 기기에서만 도는 연습 판
  roundId: string | null
}

// 새 판: 서버에서 받고, 안 되면 이 기기의 연습 문장으로 대신한다. 실패하지 않는다.
async function fetchRound(api: TypingApi, choice: string, lastLocal: MutableRefObject<number | null>): Promise<Round> {
  try {
    const r = await api.createRound(choice === RANDOM ? undefined : choice)
    return { phrase: r.phrase, phraseId: r.phraseId, roundId: r.roundId }
  } catch {
    const idx = pickPhraseIndex(PHRASES.length, lastLocal.current)
    lastLocal.current = idx
    return { phrase: PHRASES[idx] ?? '', phraseId: null, roundId: null }
  }
}

interface Finished {
  ms: number
  cpm: number
  record: boolean // 이 기기 최고 기록 갱신 여부
  plausible: boolean // 사람이 낼 수 있는 속도인지(아니면 기록으로 인정하지 않는다)
  text: string
}

type Submit =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'done'; result: TypingResult }
  | { status: 'error'; message: string; retry: boolean }

const STYLES = `
@keyframes typing-caret { 0%, 100% { border-bottom-color: var(--caret, currentColor) } 50% { border-bottom-color: transparent } }
@keyframes typing-pop { 0% { transform: scale(.96); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }
`

export default function MinigameTypingTemplate() {
  const api = useMemo(() => defaultTypingApi(), [])
  const [phrases, setPhrases] = useState<PhraseInfo[] | null>(null) // null = 불러오는 중, [] = 못 불러옴
  const [choice, setChoice] = useState(RANDOM) // 도전할 문장: 무작위 또는 phraseId
  const [round, setRound] = useState<Round | null>(null) // null = 문장을 가져오는 중
  const [viewId, setViewId] = useState<string | null>(null) // 랭킹에서 보는 문장 (null = 지금 도전 중인 문장)
  const [typed, setTyped] = useState('')
  const [composing, setComposing] = useState(false)
  const [focused, setFocused] = useState(false)
  const [running, setRunning] = useState(false)
  const [now, setNow] = useState(0)
  const [startAt, setStartAt] = useState<number | null>(null)
  const [finished, setFinished] = useState<Finished | null>(null)
  const [best, setBest] = useState(() => parseBest(readStored(BEST_STORAGE_KEY)))
  const [nickname, setNickname] = useState(() => readStored(NICKNAME_KEY) ?? '')
  const [submit, setSubmit] = useState<Submit>({ status: 'idle' })
  const [rankingData, setRankingData] = useState<{ id: string; rows: RankingRow[] } | null>(null)
  const [rankingFailed, setRankingFailed] = useState<string | null>(null)
  const [rankingTick, setRankingTick] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const beginRef = useRef<Promise<unknown> | null>(null)
  const lastLocalIdx = useRef<number | null>(null)
  const requestRef = useRef(0)

  const target = round?.phrase ?? ''
  const online = round?.roundId != null
  const validNickname = parseNickname(nickname)
  const targetStrokes = useMemo(() => keystrokeCount(target), [target])
  const rankingId = viewId ?? round?.phraseId ?? null

  // 처음 한 번: 첫 문장과 문장 목록
  useEffect(() => {
    let alive = true
    void fetchRound(api, RANDOM, lastLocalIdx).then((r) => {
      if (alive) setRound(r)
    })
    api
      .phrases()
      .then((list) => {
        if (alive) setPhrases(list)
      })
      .catch(() => {
        if (alive) setPhrases([])
      })
    return () => {
      alive = false
    }
  }, [api])

  // 보고 있는 문장의 랭킹: 문장이 바뀌거나 기록을 올린 뒤에 다시 불러온다
  useEffect(() => {
    if (!rankingId) return
    let alive = true
    api
      .ranking(rankingId, 10)
      .then((rows) => {
        if (!alive) return
        setRankingData({ id: rankingId, rows })
        setRankingFailed(null)
      })
      .catch(() => {
        if (alive) setRankingFailed(rankingId)
      })
    return () => {
      alive = false
    }
  }, [api, rankingId, rankingTick])

  // 시간이 흐르는 동안 화면 숫자를 0.05초마다 갱신한다
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(performance.now()), 50)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (round) inputRef.current?.focus()
  }, [round])

  const submitScore = async (r: Round, text: string, nick: string) => {
    if (r.roundId === null) return
    setSubmit({ status: 'sending' })
    try {
      await beginRef.current // 첫 글자 신호가 서버에 닿은 뒤에 끝 신호를 보낸다
      const result = await api.finish(r.roundId, text, nick)
      setSubmit({ status: 'done', result })
      setRankingTick((t) => t + 1)
    } catch (error) {
      setSubmit({ status: 'error', message: describeError(error), retry: isRetryable(error) })
    }
  }

  // 새 판 시작: 입력 상태를 비우고, 고른 문장(또는 무작위)으로 서버에서 새 판을 받는다.
  const startRound = (nextChoice: string) => {
    setStartAt(null)
    setRunning(false)
    setNow(0)
    setTyped('')
    setComposing(false)
    setFinished(null)
    setSubmit({ status: 'idle' })
    setViewId(null)
    setRound(null)
    beginRef.current = null
    const mine = ++requestRef.current
    void fetchRound(api, nextChoice, lastLocalIdx).then((r) => {
      if (requestRef.current === mine) setRound(r)
    })
  }

  const choose = (next: string) => {
    setChoice(next)
    startRound(next)
  }

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
    if (finished || !round) return
    const value = e.target.value
    let t0 = startAt
    if (t0 === null && value.length > 0) {
      t0 = performance.now()
      setStartAt(t0)
      setNow(t0)
      setRunning(true)
      if (round.roundId) beginRef.current = api.begin(round.roundId).catch(() => null)
    }
    setTyped(value)
    if (t0 !== null && isComplete(target, value)) {
      const ms = performance.now() - t0
      const cpm = strokesPerMinute(targetStrokes, ms)
      // 사람이 낼 수 없는 속도(붙여넣기·자동 입력 등)는 기록으로 인정하지 않고 서버에도 보내지 않는다.
      const plausible = isPlausibleCpm(cpm)
      const record = plausible && cpm > best
      if (record) {
        setBest(cpm)
        writeStored(BEST_STORAGE_KEY, String(cpm))
      }
      setRunning(false)
      setFinished({ ms, cpm, record, plausible, text: value })
      if (plausible && round.roundId && validNickname) void submitScore(round, value, validNickname)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && finished) {
      e.preventDefault()
      startRound(choice)
    } else if (e.key === 'Escape' && !finished) {
      e.preventDefault()
      // 같은 문장으로 다시: 서버에서는 새 판이 필요하다(한 판은 한 번만 낼 수 있다)
      startRound(round?.phraseId ?? choice)
    }
  }

  const onNicknameChange = (value: string) => {
    setNickname(value)
    const ok = parseNickname(value)
    if (ok) writeStored(NICKNAME_KEY, ok)
  }

  const shown = submit.status === 'done' ? submit.result : null
  const showCpm = shown ? shown.cpm : finished ? (finished.plausible ? finished.cpm : 0) : isPlausibleCpm(liveCpm) ? liveCpm : 0
  const showMs = shown ? shown.ms : elapsed
  const canSubmitNow =
    finished &&
    finished.plausible &&
    round &&
    online &&
    validNickname &&
    (submit.status === 'idle' || (submit.status === 'error' && submit.retry))

  const list = phrases ?? []
  const rankingRows = rankingData && rankingData.id === rankingId ? rankingData.rows : null
  const rankingText = rankingId
    ? (list.find((p) => p.phraseId === rankingId)?.phrase ?? (round?.phraseId === rankingId ? round.phrase : ''))
    : ''

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center',
        padding: '32px 16px',
        background: color.bg.base,
      }}
    >
      <style>{STYLES}</style>
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20, margin: 'auto 0' }}>
        <header style={{ textAlign: 'center' }}>
          <h1 style={{ ...textStyle('24/title/semibold'), color: color.text.primary, margin: 0 }}>가사 빨리 치기 ⌨️</h1>
          <p style={{ ...textStyle('14/body/reg'), color: color.text.secondary, margin: '8px 0 0', wordBreak: 'keep-all' }}>
            아래 문장을 그대로 따라 쳐 보세요. 첫 글자를 치면 시간이 시작돼요.
          </p>
        </header>

        {/* 닉네임: 랭킹에 올릴 때만 필요하다 */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...textStyle('12/caption/semibold'), color: color.text.secondary }}>닉네임 (랭킹에 표시돼요)</span>
          <input
            value={nickname}
            onChange={(e) => onNicknameChange(e.target.value)}
            placeholder="2~10자, 한글·영문·숫자"
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={nickname !== '' && !validNickname}
            style={{
              ...textStyle('15/body/reg'),
              boxSizing: 'border-box',
              width: '100%',
              padding: '10px 14px',
              borderRadius: 12,
              border: `1.5px solid ${nickname !== '' && !validNickname ? color.border.red : color.border['default-a']}`,
              background: color.surface.card,
              color: color.text.primary,
              outline: 'none',
            }}
          />
          {nickname !== '' && !validNickname && (
            <span style={{ ...textStyle('12/caption/semibold'), color: color.text.red }}>
              2~10자의 한글·영문·숫자·공백만 쓸 수 있어요.
            </span>
          )}
        </label>

        {/* 도전할 문장 고르기 */}
        {list.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...textStyle('12/caption/semibold'), color: color.text.secondary }}>
              도전할 문장 (순위는 같은 문장끼리만 비교해요)
            </span>
            <select value={choice} onChange={(e) => choose(e.target.value)} style={selectStyle} aria-label="도전할 문장">
              <option value={RANDOM}>🎲 무작위</option>
              {list.map((p, i) => (
                <option key={p.phraseId} value={p.phraseId}>
                  {i + 1}. {shorten(p.phrase, 18)}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* 실시간 기록 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="타수 (분당)" value={showCpm > 0 ? String(showCpm) : '-'} highlight={Boolean(finished)} />
          <Stat
            label="입력 시간"
            value={startAt !== null || finished ? formatSeconds(showMs) : '0.0초'}
            highlight={Boolean(finished)}
          />
          <Stat label="내 최고 타수" value={String(Math.max(best, shown?.bestCpm ?? 0) || '-')} />
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
            minHeight: 96,
            cursor: 'text',
            animation: finished ? 'typing-pop 240ms ease-out' : undefined,
          }}
        >
          {round ? (
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
          ) : (
            <p style={{ ...textStyle('15/body/reg'), color: color.text.tertiary, margin: 0, textAlign: 'center' }}>
              문장을 가져오는 중이에요…
            </p>
          )}
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
          readOnly={Boolean(finished) || !round}
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
              gap: 10,
              animation: 'typing-pop 240ms ease-out',
            }}
          >
            {finished.plausible ? (
              <>
                <p style={{ ...textStyle('20/title/semibold'), color: color.text.primary, margin: 0 }}>
                  {shown ? (shown.isBest ? '🎉 이 문장 내 최고 기록이에요!' : '완료! 👏') : finished.record ? '🎉 새 기록이에요!' : '완료! 👏'}
                </p>
                <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary, margin: 0 }}>
                  {formatSeconds(showMs)} 동안 분당 <strong style={{ color: color.text.primary }}>{showCpm}타</strong>
                  {shown && (
                    <>
                      {' '}
                      · 이 문장 <strong style={{ color: color.text.primary }}>{shown.rank}위</strong>
                    </>
                  )}
                </p>
              </>
            ) : (
              <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary, margin: 0, wordBreak: 'keep-all' }}>
                사람이 칠 수 있는 속도를 넘어서 이번 판은 기록으로 인정되지 않아요. 직접 쳐서 다시 도전해 주세요.
              </p>
            )}
            {submit.status === 'sending' && (
              <p style={{ ...textStyle('13/body/reg'), color: color.text.tertiary, margin: 0 }}>랭킹에 올리는 중…</p>
            )}
            {submit.status === 'error' && (
              <p style={{ ...textStyle('13/body/reg'), color: color.text.red, margin: 0, wordBreak: 'keep-all' }}>
                {submit.message}
              </p>
            )}
            {online && !validNickname && submit.status === 'idle' && (
              <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: 0, wordBreak: 'keep-all' }}>
                위에 닉네임을 정하면 이 기록을 랭킹에 올릴 수 있어요.
              </p>
            )}
            {!online && (
              <p style={{ ...textStyle('13/body/reg'), color: color.text.tertiary, margin: 0, wordBreak: 'keep-all' }}>
                랭킹 서버에 연결하지 못해 연습 판으로 진행했어요. 이 기록은 이 기기에만 남아요.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              {canSubmitNow && (
                <button
                  type="button"
                  onClick={() => round && validNickname && void submitScore(round, finished.text, validNickname)}
                  style={primaryButton}
                >
                  랭킹에 올리기
                </button>
              )}
              <button type="button" onClick={() => startRound(choice)} style={canSubmitNow ? secondaryButton : primaryButton}>
                다음 문장 (Enter)
              </button>
            </div>
          </div>
        ) : (
          <p
            style={{
              ...textStyle('12/caption/semibold'),
              color: color.text.tertiary,
              margin: 0,
              textAlign: 'center',
              wordBreak: 'keep-all',
            }}
          >
            {round && !online
              ? '랭킹 서버에 연결하지 못해 연습 판이에요 · 최고 기록은 이 기기에만 저장돼요'
              : 'Esc로 이 문장을 처음부터 다시 칠 수 있어요'}
          </p>
        )}

        {/* 문장별 랭킹 */}
        <section
          style={{
            background: color.surface.card,
            boxShadow: shadow['default-medium'],
            borderRadius: 20,
            padding: '20px 20px 12px',
          }}
        >
          <h2 style={{ ...textStyle('16/title/semibold'), color: color.text.primary, margin: '0 0 12px' }}>🏆 문장별 랭킹</h2>
          {list.length > 0 && (
            <select
              value={rankingId ?? ''}
              onChange={(e) => setViewId(e.target.value || null)}
              style={selectStyle}
              aria-label="랭킹을 볼 문장"
            >
              {rankingId === null && <option value="">문장을 골라 주세요</option>}
              {list.map((p, i) => (
                <option key={p.phraseId} value={p.phraseId}>
                  {i + 1}. {shorten(p.phrase, 18)}
                  {p.phraseId === round?.phraseId ? ' (지금 도전 중)' : ''}
                </option>
              ))}
            </select>
          )}
          {rankingText && (
            <p
              style={{
                ...textStyle('13/body/reg'),
                color: color.text.secondary,
                margin: '10px 0 4px',
                wordBreak: 'keep-all',
              }}
            >
              “{rankingText}”
            </p>
          )}
          {rankingId && round?.phraseId !== rankingId && (
            <button
              type="button"
              onClick={() => choose(rankingId)}
              style={{ ...secondaryButton, padding: '8px 14px', margin: '6px 0 4px' }}
            >
              이 문장에 도전하기
            </button>
          )}
          {!rankingId && (
            <p style={{ ...textStyle('13/body/reg'), color: color.text.tertiary, margin: '10px 0 14px' }}>
              {round ? '랭킹 서버에 연결하지 못했어요.' : '불러오는 중…'}
            </p>
          )}
          {rankingId && rankingRows === null && rankingFailed !== rankingId && (
            <p style={{ ...textStyle('13/body/reg'), color: color.text.tertiary, margin: '10px 0 14px' }}>불러오는 중…</p>
          )}
          {rankingId && rankingRows === null && rankingFailed === rankingId && (
            <p style={{ ...textStyle('13/body/reg'), color: color.text.tertiary, margin: '10px 0 14px' }}>
              랭킹을 불러오지 못했어요.
            </p>
          )}
          {rankingRows !== null && rankingRows.length === 0 && (
            <p style={{ ...textStyle('13/body/reg'), color: color.text.tertiary, margin: '10px 0 14px' }}>
              이 문장은 아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!
            </p>
          )}
          {rankingRows !== null && rankingRows.length > 0 && (
            <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
              {rankingRows.map((row) => {
                const mine = validNickname !== null && isNicknameMatch(row.nickname, validNickname)
                return (
                  <li
                    key={`${row.rank}-${row.nickname}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 8px',
                      borderRadius: 10,
                      background: mine ? color.surface['form-blue-weak-a'] : undefined,
                    }}
                  >
                    <span
                      style={{
                        ...textStyle('15/title/semibold'),
                        width: 28,
                        textAlign: 'center',
                        color: row.rank <= 3 ? color.text.blue : color.text.secondary,
                      }}
                    >
                      {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}
                    </span>
                    <span
                      style={{
                        ...textStyle('15/body/reg'),
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: color.text.primary,
                      }}
                    >
                      {row.nickname}
                      {mine ? ' (나)' : ''}
                    </span>
                    <span style={{ ...textStyle('15/title/semibold'), color: color.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                      {row.cpm}타
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
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

const selectStyle = {
  ...textStyle('15/body/reg'),
  boxSizing: 'border-box',
  width: '100%',
  padding: '10px 14px',
  borderRadius: 12,
  border: `1.5px solid ${color.border['default-a']}`,
  background: color.surface.card,
  color: color.text.primary,
  outline: 'none',
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
