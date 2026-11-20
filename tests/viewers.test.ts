import assert from 'node:assert/strict'
import {
  GUEST_ID_KEY,
  HEARTBEAT_MS,
  ViewersHttpError,
  createViewersApi,
  getOrCreateGuestId,
  isValidPage,
  newGuestId,
  nextDelay,
  normalizeServerUrl,
  parseStats,
  type FetchLike,
  type StorageLike,
} from '../src/shared/viewers/viewersApi.ts'

// 서버 주소 정리: https만, 끝 슬래시 제거, 나머지는 미설정('')
assert.equal(normalizeServerUrl('https://viewers.example.in'), 'https://viewers.example.in')
assert.equal(normalizeServerUrl('  https://viewers.example.in/ '), 'https://viewers.example.in')
assert.equal(normalizeServerUrl('http://viewers.example.in'), '', '평문 http는 격리 상자가 막는다')
assert.equal(normalizeServerUrl('https://viewers.example.in/api'), '', '경로가 붙은 주소는 받지 않는다')
assert.equal(normalizeServerUrl(''), '')

// page 값은 서버 규칙과 같다
assert.equal(isValidPage('/live-viewers'), true)
assert.equal(isValidPage('/a b'), false)
assert.equal(isValidPage('?x=1'), false)
assert.equal(isValidPage(''), false)
assert.equal(isValidPage('a'.repeat(201)), false)

// 응답 검증
assert.deepEqual(parseStats({ page: '/p', watching: 2, totalViewers: 5 }), { page: '/p', watching: 2, totalViewers: 5 })
assert.equal(parseStats({ page: '/p', watching: '2', totalViewers: 5 }), null)
assert.equal(parseStats({ page: '/p', watching: -1, totalViewers: 5 }), null)
assert.equal(parseStats(null), null)

// 재시도 간격: 정상 15초, 실패하면 늘어나다 60초에서 멈춘다
assert.equal(nextDelay(0), HEARTBEAT_MS)
assert.equal(nextDelay(1), 30_000)
assert.equal(nextDelay(2), 60_000)
assert.equal(nextDelay(9), 60_000)

// 비로그인 방문자 id: 처음엔 만들어 저장하고, 다음부터는 같은 값을 쓴다
const memory = new Map<string, string>()
const store: StorageLike = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
}
const first = getOrCreateGuestId(store)
assert.match(first ?? '', /^guest-[0-9a-f]{32}$/)
assert.equal(memory.get(GUEST_ID_KEY), first, '만든 id가 저장된다')
assert.equal(getOrCreateGuestId(store), first, '다시 열어도 같은 사람')
assert.notEqual(newGuestId(), newGuestId(), '난수라서 매번 다르다')
// 저장된 값이 이상하면(손으로 바꾼 값 등) 새로 만든다
memory.set(GUEST_ID_KEY, 'not-a-guest-id')
const replaced = getOrCreateGuestId(store)
assert.match(replaced ?? '', /^guest-[0-9a-f]{32}$/)
assert.notEqual(replaced, 'not-a-guest-id')
// 저장소를 못 쓰면 집계하지 않는다(null): 접근 불가 / setItem이 던짐 / 조용히 버림
assert.equal(getOrCreateGuestId(null), null)
const throwing: StorageLike = {
  getItem: () => null,
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}
assert.equal(getOrCreateGuestId(throwing), null)
const forgetful: StorageLike = { getItem: () => null, setItem: () => undefined }
assert.equal(getOrCreateGuestId(forgetful), null)
// 방문자 id도 서버가 받는 길이(200자) 안이다
assert.ok(newGuestId().length <= 200)

// 요청 모양: 주소·헤더·본문
const calls: { url: string; init?: RequestInit }[] = []
const ok: FetchLike = async (url, init) => {
  calls.push({ url, init })
  return new Response(JSON.stringify({ page: '/live-viewers', watching: 1, totalViewers: 3 }), { status: 200 })
}
const api = createViewersApi({ serverUrl: 'https://viewers.example.in/', spaceId: 'ariana-test', fetchFn: ok })
assert.deepEqual(await api.heartbeat('/live-viewers', 'member-1'), { page: '/live-viewers', watching: 1, totalViewers: 3 })
assert.equal(calls[0].url, 'https://viewers.example.in/api/views/heartbeat')
assert.equal(calls[0].init?.method, 'POST')
const headers = calls[0].init?.headers as Record<string, string>
assert.equal(headers['X-Bmf-Space-Id'], 'ariana-test')
assert.equal(headers['Content-Type'], 'application/json')
assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { page: '/live-viewers', memberId: 'member-1' })

await api.leave('/live-viewers', 'member-1')
assert.equal(calls[1].url, 'https://viewers.example.in/api/views/leave')

await api.read('/live-viewers')
assert.equal(calls[2].url, 'https://viewers.example.in/api/views?page=%2Flive-viewers')
assert.equal(calls[2].init?.method, 'GET')
assert.equal((calls[2].init?.headers as Record<string, string>)['X-Bmf-Space-Id'], 'ariana-test')
assert.equal(calls[2].init?.body, undefined, 'GET에는 본문이 없다')

// 실패: 403은 상태가 담긴 오류, 잘못된 page는 요청 자체를 보내지 않는다, 주소 미설정이면 보내지 않는다
const forbidden: FetchLike = async () => new Response('{"error":"tenant_not_allowed"}', { status: 403 })
await assert.rejects(
  createViewersApi({ serverUrl: 'https://viewers.example.in', spaceId: 'x', fetchFn: forbidden }).read('/p'),
  (err: unknown) => err instanceof ViewersHttpError && err.status === 403,
)
const before = calls.length
await assert.rejects(async () => api.heartbeat('/잘못 된', 'm'))
assert.equal(calls.length, before)
const unconfigured = createViewersApi({ serverUrl: '', spaceId: 'x', fetchFn: ok })
await assert.rejects(unconfigured.read('/p'))
assert.equal(calls.length, before)

console.log('viewers ok')
