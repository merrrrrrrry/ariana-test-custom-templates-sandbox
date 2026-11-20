// 실시간 뷰어 수 서버(ariana-test-viewers-server) 호출 로직 — 화면(React)과 분리해 두어 npm test로 검증한다.
// 서버: hosting 앱. 팬 화면이 15초마다 하트비트를 보내고, 서버는 마지막 신호가 45초 이내인 사람을 "보는 중"으로 센다.

/** hosting 앱 주소. 앱을 만든 뒤 여기에 넣는다(끝에 `/` 없이, https만). 비어 있으면 화면이 "서버 주소 미설정"만 보여 준다. */
export const VIEWERS_SERVER_URL = 'https://ariana-test-viewers-merry-ek938cot.sandbox.bstage.app'

/** 이 레포가 올라가는 스테이지 ID — 서버가 `X-Bmf-Space-Id`로 데이터를 나눈다. 서버의 ALLOWED_TENANTS에 같은 값이 있어야 한다. */
export const VIEWERS_SPACE_ID = 'ariana-test'

/** 서버 신호 간격. 서버 TTL(기본 45초)보다 충분히 짧게 둔다. */
export const HEARTBEAT_MS = 15_000

export interface ViewerStats {
  page: string
  /** 지금 보는 중인 사람 수 */
  watching: number
  /** 지금까지 이 페이지를 연 서로 다른 사람 수(누적) */
  totalViewers: number
}

/** 로그인 안 한 방문자의 id를 브라우저에 저장해 두는 키 */
export const GUEST_ID_KEY = 'bmf-viewers-guest-id'

/** `localStorage`에서 쓰는 두 함수만 뽑은 모양(테스트에서 가짜로 갈아 끼우려고) */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const GUEST_ID_PATTERN = /^guest-[0-9a-f]{32}$/

/** 임의의 방문자 id: `guest-` + 16바이트 난수(hex). 회원 id와 섞이지 않도록 접두사를 붙인다. */
export function newGuestId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return `guest-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * 비로그인 방문자 id를 꺼낸다. 없거나 모양이 이상하면 새로 만들어 저장한다.
 * 저장소를 못 쓰면(차단·시크릿 모드 등) null — 새로고침마다 다른 사람으로 세어 "다녀간 사람" 수가 부풀지 않도록 집계하지 않는다.
 */
export function getOrCreateGuestId(storage: StorageLike | null, make: () => string = newGuestId): string | null {
  if (!storage) return null
  try {
    const saved = storage.getItem(GUEST_ID_KEY)
    if (saved && GUEST_ID_PATTERN.test(saved)) return saved
    const created = make()
    storage.setItem(GUEST_ID_KEY, created)
    // 저장이 실제로 됐는지 다시 읽어 확인한다(조용히 버리는 저장소 대비).
    return storage.getItem(GUEST_ID_KEY) === created ? created : null
  } catch {
    return null
  }
}

/** 브라우저의 localStorage. 접근 자체가 막혀 있으면 null. */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** `__bstage_fetch__`(격리 상자의 브리지 fetch)와 같은 모양 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class ViewersHttpError extends Error {
  status: number
  constructor(status: number) {
    super(`viewers server responded ${status}`)
    this.status = status
  }
}

/** 서버 주소를 정리한다. https가 아니거나 모양이 이상하면 빈 문자열(= 미설정). 평문 http는 격리 상자 CSP가 막는다. */
export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  return /^https:\/\/[^/\s?#]+$/i.test(trimmed) ? trimmed : ''
}

/** 서버가 받는 page 값 모양(영문·숫자·`/ _ . -`, 200자까지). 서버 PAGE_PATTERN과 같다. */
export function isValidPage(page: string): boolean {
  return /^[A-Za-z0-9/_.-]{1,200}$/.test(page)
}

export function parseStats(value: unknown): ViewerStats | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const { page, watching, totalViewers } = v
  if (typeof page !== 'string') return null
  if (typeof watching !== 'number' || !Number.isFinite(watching) || watching < 0) return null
  if (typeof totalViewers !== 'number' || !Number.isFinite(totalViewers) || totalViewers < 0) return null
  return { page, watching, totalViewers }
}

/** 격리 상자에서는 플랫폼이 넣어 주는 `__bstage_fetch__`로 부른다(직접 fetch 불가). 로컬 개발에는 없으니 기본 fetch로 대신한다. */
export function resolveFetch(): FetchLike {
  const injected = (globalThis as { __bstage_fetch__?: FetchLike }).__bstage_fetch__
  if (typeof injected === 'function') return injected
  return (input, init) => globalThis.fetch(input, init)
}

export interface ViewersApi {
  /** `memberId`: 브라우저 방문자 id(`guest-…`)(서버는 아무 문자열이나 받는다). 서버가 해시해서 저장한다. */
  heartbeat(page: string, memberId: string): Promise<ViewerStats>
  leave(page: string, memberId: string): Promise<ViewerStats>
  read(page: string): Promise<ViewerStats>
}

export function createViewersApi(opts: { serverUrl: string; spaceId: string; fetchFn: FetchLike }): ViewersApi {
  const base = normalizeServerUrl(opts.serverUrl)

  async function call(path: string, init: RequestInit): Promise<ViewerStats> {
    if (!base) throw new Error('viewers server url is not configured')
    const res = await opts.fetchFn(`${base}${path}`, init)
    if (!res.ok) throw new ViewersHttpError(res.status)
    const stats = parseStats(await res.json())
    if (!stats) throw new Error('unexpected viewers response')
    return stats
  }

  const post = (path: string, page: string, memberId: string) => {
    if (!isValidPage(page)) throw new Error('invalid page')
    return call(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bmf-Space-Id': opts.spaceId },
      body: JSON.stringify({ page, memberId }),
    })
  }

  return {
    heartbeat: (page, memberId) => post('/api/views/heartbeat', page, memberId),
    leave: (page, memberId) => post('/api/views/leave', page, memberId),
    read: (page) => {
      if (!isValidPage(page)) throw new Error('invalid page')
      return call(`/api/views?page=${encodeURIComponent(page)}`, {
        method: 'GET',
        headers: { 'X-Bmf-Space-Id': opts.spaceId },
      })
    },
  }
}

/**
 * 사람이 적어 썰렁해 보일 때는 숫자를 보여 주지 않기 위한 규칙.
 * `minWatching`이 0 이하면 항상 보여 주고, 아니면 지금 보는 사람이 `minWatching`명 이상일 때만 보여 준다.
 * (보는 사람에는 나 자신도 들어가므로 3이면 나 말고 2명 이상일 때다.)
 */
export function isCrowdedEnough(watching: number, minWatching: number): boolean {
  return minWatching <= 0 || watching >= minWatching
}

/** 연속 실패 횟수에 따른 다음 호출까지의 간격: 15초 → 30초 → 60초(상한). 서버가 안 뜰 때 계속 두드리지 않는다. */
export function nextDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return HEARTBEAT_MS
  return Math.min(HEARTBEAT_MS * 2 ** consecutiveFailures, 60_000)
}
