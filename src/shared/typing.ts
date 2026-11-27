// 가사 빨리 치기 — 규칙과 기록 처리. 화면(React)과 분리해 두어 tests/typing.test.ts에서 그대로 검사한다.

export type CharState = 'ok' | 'bad' | 'todo'

// 한글은 NFC(완성형) 글자를 자모로 풀어(NFD) 센다. 예: "한" → ㅎ·ㅏ·ㄴ 3타.
// 겹모음(ㅘ)·겹받침(ㄳ)은 자모 1개로 세어 실제 키 입력보다 조금 적게 나올 수 있다.
export function keystrokeCount(text: string): number {
  return text.normalize('NFD').length
}

// 분당 타수. 시간이 0 이하면 0.
export function strokesPerMinute(strokes: number, elapsedMs: number): number {
  if (!(elapsedMs > 0) || strokes <= 0) return 0
  return Math.round(strokes / (elapsedMs / 60000))
}

// 사람이 낼 수 있는 분당 타수의 상한(서버 src/typing.js의 MAX_CPM과 같은 값). 이보다 빠르면 기록으로 인정하지 않는다.
export const MAX_PLAUSIBLE_CPM = 1000

export function isPlausibleCpm(cpm: number): boolean {
  return Number.isFinite(cpm) && cpm > 0 && cpm <= MAX_PLAUSIBLE_CPM
}

// 입력이 목표 문장과 정확히 같으면 끝. 조합 방식이 달라도 같은 글자면 같게 본다(NFC).
export function isComplete(target: string, typed: string): boolean {
  return typed.normalize('NFC') === target.normalize('NFC')
}

// 목표 문장의 글자마다: 맞게 친 글자 / 틀린 글자 / 아직 안 친 글자
export function diffChars(target: string, typed: string): CharState[] {
  const t = Array.from(target.normalize('NFC'))
  const y = Array.from(typed.normalize('NFC'))
  return t.map((ch, i) => (i >= y.length ? 'todo' : y[i] === ch ? 'ok' : 'bad'))
}

// 직전 문장과 같은 문장을 다시 내지 않는다(문장이 2개 이상일 때). random은 0 이상 1 미만.
export function pickPhraseIndex(count: number, lastIndex: number | null, random: () => number = Math.random): number {
  if (count <= 0) return 0
  if (count === 1) return 0
  const pool = Array.from({ length: count }, (_, i) => i).filter((i) => i !== lastIndex)
  const i = Math.floor(random() * pool.length)
  return pool[Math.min(Math.max(i, 0), pool.length - 1)]
}

export const BEST_STORAGE_KEY = 'ariana-test-typing-best'

// 저장값이 손상됐거나 없으면 0. 음수·소수·문자열은 믿지 않는다.
export function parseBest(raw: unknown): number {
  if (typeof raw !== 'string') return 0
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 0
}
