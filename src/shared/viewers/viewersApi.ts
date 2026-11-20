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

/** 연속 실패 횟수에 따른 다음 호출까지의 간격: 15초 → 30초 → 60초(상한). 서버가 안 뜰 때 계속 두드리지 않는다. */
export function nextDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return HEARTBEAT_MS
  return Math.min(HEARTBEAT_MS * 2 ** consecutiveFailures, 60_000)
}
