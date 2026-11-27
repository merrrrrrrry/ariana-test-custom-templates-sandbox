// 가사 빨리 치기 랭킹 서버 호출 — 화면(React)과 분리해 두어 npm test로 검증한다.
// 서버: 뷰어 수와 같은 hosting 앱(ariana-test-viewers-server)의 `/api/typing/*`. 시간·타수는 서버가 재고,
// 문장도 서버가 정한다. 화면이 보내는 것은 "첫 글자를 쳤다"는 신호와 다 친 글자, 닉네임뿐이다.

// 테스트(node --experimental-strip-types)가 그대로 읽도록 가져오는 경로에 .ts를 붙인다.
import { VIEWERS_SERVER_URL, VIEWERS_SPACE_ID, normalizeServerUrl, resolveFetch } from './viewers/viewersApi.ts'
import type { FetchLike } from './viewers/viewersApi.ts'

export const TYPING_SERVER_URL = VIEWERS_SERVER_URL
export const TYPING_SPACE_ID = VIEWERS_SPACE_ID

/** 닉네임을 이 기기에 기억해 두는 키 */
export const NICKNAME_KEY = 'ariana-test-typing-nickname'

/** 서버가 내는 문장 하나. phraseId는 문장 글자의 해시라서, 순위는 phraseId마다 따로 매겨진다. */
export interface PhraseInfo {
  phraseId: string
  phrase: string
}

export interface TypingRound extends PhraseInfo {
  roundId: string
}

export interface TypingResult {
  phraseId: string
  cpm: number
  ms: number
  isBest: boolean
  bestCpm: number
  rank: number
}

export interface RankingRow {
  rank: number
  nickname: string
  cpm: number
}

export class TypingHttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(`typing server responded ${status} ${code}`)
    this.status = status
    this.code = code
  }
}

const NICKNAME_PATTERN = /^[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ _-]+$/

/**
 * 닉네임 검사(서버 src/typing.js의 parseNickname과 같은 규칙). 통과하면 다듬은 닉네임, 아니면 null.
 * 2~10자, 한글·영문·숫자·공백·`_`·`-`만, 앞뒤 공백은 지우고 연속 공백은 허용하지 않는다.
 * 서버만 아는 금지 낱말(TYPING_BLOCKED_WORDS)은 여기서 알 수 없어, 서버가 거부하면 그 결과를 따른다.
 */
export function parseNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const nickname = raw.normalize('NFC').trim()
  const length = Array.from(nickname).length
  if (length < 2 || length > 10) return null
  if (!NICKNAME_PATTERN.test(nickname) || /\s{2,}/.test(nickname)) return null
  return nickname.replace(/\s+/g, '').length >= 2 ? nickname : null
}

export function isNicknameMatch(a: string, b: string): boolean {
  const key = (s: string) => s.normalize('NFC').replace(/\s+/g, '').toLowerCase()
  return key(a) !== '' && key(a) === key(b)
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

const isPhraseId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}$/.test(v)
const isPhraseText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100

export function parsePhrase(value: unknown): PhraseInfo | null {
  if (!isObject(value)) return null
  const { phraseId, phrase } = value
  if (!isPhraseId(phraseId) || !isPhraseText(phrase)) return null
  return { phraseId, phrase }
}

export function parsePhrases(value: unknown): PhraseInfo[] | null {
  if (!isObject(value) || !Array.isArray(value.phrases)) return null
  const list: PhraseInfo[] = []
  for (const item of value.phrases) {
    const phrase = parsePhrase(item)
    if (!phrase) return null
    list.push(phrase)
  }
  return list
}

export function parseRound(value: unknown): TypingRound | null {
  if (!isObject(value)) return null
  const phrase = parsePhrase(value)
  const { roundId } = value
  if (!phrase || typeof roundId !== 'string' || !/^[0-9a-f-]{36}$/.test(roundId)) return null
  return { roundId, ...phrase }
}

export function parseResult(value: unknown): TypingResult | null {
  if (!isObject(value)) return null
  const { phraseId, cpm, ms, isBest, bestCpm, rank } = value
  if (!isPhraseId(phraseId)) return null
  if (!isCount(cpm) || !isCount(ms) || !isCount(bestCpm) || !isCount(rank) || typeof isBest !== 'boolean') return null
  return { phraseId, cpm, ms, isBest, bestCpm, rank }
}

export interface PhraseRanking {
  phraseId: string
  rows: RankingRow[]
}

export function parseRanking(value: unknown): PhraseRanking | null {
  if (!isObject(value) || !isPhraseId(value.phraseId) || !Array.isArray(value.ranking)) return null
  const rows: RankingRow[] = []
  for (const row of value.ranking) {
    if (!isObject(row)) return null
    const { rank, nickname, cpm } = row
    if (!isCount(rank) || typeof nickname !== 'string' || !isCount(cpm)) return null
    rows.push({ rank, nickname, cpm })
  }
  return { phraseId: value.phraseId, rows }
}

/** 서버 오류를 팬에게 보여 줄 말로 바꾼다. 서버 코드 문자열은 화면에 그대로 내보내지 않는다. */
export function describeError(error: unknown): string {
  if (!(error instanceof TypingHttpError)) return '랭킹 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
  switch (error.code) {
    case 'invalid_nickname':
      return '사용할 수 없는 닉네임이에요. 다른 닉네임으로 바꿔 주세요.'
    case 'too_many_requests':
      return '너무 빨리 다시 올렸어요. 잠깐 뒤에 다시 눌러 주세요.'
    case 'too_fast':
      return '사람이 칠 수 없는 속도라 기록에 올리지 않았어요.'
    case 'round_expired':
      return '시간이 너무 오래 걸려 이번 판은 기록에 올리지 못했어요.'
    case 'text_mismatch':
      return '입력한 글자가 문장과 달라 기록에 올리지 못했어요.'
    case 'phrase_not_found':
      return '없어진 문장이에요. 다른 문장을 골라 주세요.'
    case 'round_finished':
    case 'round_not_found':
      return '이미 끝난 판이에요. 다음 문장으로 다시 도전해 주세요.'
    default:
      return '기록을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.'
  }
}

/** 닉네임·서버 문제로 "고쳐서 같은 판을 다시 올릴 수 있는" 오류인지(서버가 라운드를 소모하지 않는 경우) */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof TypingHttpError)) return true // 연결 실패 등
  return error.code === 'invalid_nickname' || error.code === 'too_many_requests' || error.status >= 500
}

export interface TypingApi {
  phrases(): Promise<PhraseInfo[]>
  /** phraseId를 주면 그 문장으로, 없으면 서버가 무작위 문장으로 한 판을 시작한다 */
  createRound(phraseId?: string): Promise<TypingRound>
  begin(roundId: string): Promise<void>
  finish(roundId: string, text: string, nickname: string): Promise<TypingResult>
  /** 그 문장의 상위 순위(같은 문장끼리만 비교한다) */
  ranking(phraseId: string, limit?: number): Promise<RankingRow[]>
}

export function createTypingApi(opts: { serverUrl: string; spaceId: string; fetchFn: FetchLike }): TypingApi {
  const base = normalizeServerUrl(opts.serverUrl)

  async function call(path: string, init: RequestInit): Promise<unknown> {
    if (!base) throw new Error('typing server url is not configured')
    const res = await opts.fetchFn(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Bmf-Space-Id': opts.spaceId },
    })
    if (!res.ok) {
      let code = 'error'
      try {
        const body: unknown = await res.json()
        if (isObject(body) && typeof body.error === 'string') code = body.error
      } catch {
        // 본문이 없거나 JSON이 아니면 코드는 'error'
      }
      throw new TypingHttpError(res.status, code)
    }
    return res.json()
  }

  const post = (path: string, body?: unknown) =>
    call(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

  return {
    async phrases() {
      const list = parsePhrases(await call('/api/typing/phrases', { method: 'GET' }))
      if (!list) throw new Error('unexpected typing response')
      return list
    },
    async createRound(phraseId) {
      if (phraseId !== undefined && !isPhraseId(phraseId)) throw new Error('invalid phrase id')
      const round = parseRound(await post('/api/typing/rounds', phraseId === undefined ? undefined : { phraseId }))
      if (!round) throw new Error('unexpected typing response')
      return round
    },
    async begin(roundId) {
      await post(`/api/typing/rounds/${encodeURIComponent(roundId)}/begin`)
    },
    async finish(roundId, text, nickname) {
      const result = parseResult(await post(`/api/typing/rounds/${encodeURIComponent(roundId)}/finish`, { text, nickname }))
      if (!result) throw new Error('unexpected typing response')
      return result
    },
    async ranking(phraseId, limit = 10) {
      if (!isPhraseId(phraseId)) throw new Error('invalid phrase id')
      const n = Math.min(Math.max(Math.trunc(limit), 1), 50)
      const parsed = parseRanking(await call(`/api/typing/ranking?phraseId=${phraseId}&limit=${n}`, { method: 'GET' }))
      // 다른 문장의 순위가 섞여 들어오면 쓰지 않는다
      if (!parsed || parsed.phraseId !== phraseId) throw new Error('unexpected typing response')
      return parsed.rows
    },
  }
}

/** 화면에서 쓰는 기본 API: 격리 상자에서는 플랫폼이 넣는 `__bstage_fetch__`를 요청 시점에 찾아 쓴다. */
export function defaultTypingApi(): TypingApi {
  return createTypingApi({
    serverUrl: TYPING_SERVER_URL,
    spaceId: TYPING_SPACE_ID,
    fetchFn: (input, init) => resolveFetch()(input, init),
  })
}
