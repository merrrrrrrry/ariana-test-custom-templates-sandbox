import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  GUEST_ID_KEY,
  HEARTBEAT_MS,
  ViewersHttpError,
  createViewersApi,
  getOrCreateGuestId,
  isCrowdedEnough,
  isValidPage,
  newGuestId,
  nextDelay,
  normalizeServerUrl,
  parseStats,
  type FetchLike,
  type StorageLike,
} from '../src/shared/viewers/viewersApi.ts'
import {
  MIN_WATCHING_LIMIT,
  VIEWERS_CONFIG_KEY,
  parseViewersConfig,
  unwrapStoredData,
} from '../src/shared/viewers/viewersConfig.ts'

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

// 썰렁한 곳 숨기기: minWatching이 0 이하면 항상 보이고, 아니면 보는 사람이 그 수 이상일 때만 보인다
assert.equal(isCrowdedEnough(0, 0), true, '0이면 규칙 없음: 아무도 없어도 보임')
assert.equal(isCrowdedEnough(1, 0), true)
assert.equal(isCrowdedEnough(1, 3), false, '나 혼자(1명)면 숨김')
assert.equal(isCrowdedEnough(2, 3), false, '2명도 3명 미만이면 숨김')
assert.equal(isCrowdedEnough(3, 3), true, '딱 3명이면 보임')
assert.equal(isCrowdedEnough(12, 3), true)
assert.equal(isCrowdedEnough(1, -1), true, '음수는 규칙 없음으로 본다')

// 어드민 설정 읽기: 정상 값은 그대로, 이상한 값은 "설정 없음(null)"이라 팬 화면은 기본 동작을 한다
assert.deepEqual(parseViewersConfig({ version: 1, minWatching: 3 }), { version: 1, minWatching: 3 })
assert.deepEqual(parseViewersConfig('{"minWatching":5}'), { version: 1, minWatching: 5 }, 'JSON 문자열도 읽는다')
assert.deepEqual(parseViewersConfig({ minWatching: 0 }), { version: 1, minWatching: 0 }, '0은 정상 값(항상 보임)')
assert.deepEqual(parseViewersConfig({ minWatching: '4' }), { version: 1, minWatching: 4 }, '숫자 문자열은 숫자로')
assert.deepEqual(parseViewersConfig({ minWatching: 2.9 }), { version: 1, minWatching: 2 }, '소수는 내림')
assert.deepEqual(parseViewersConfig({ minWatching: -5 }), { version: 1, minWatching: 0 }, '음수는 0')
assert.deepEqual(
  parseViewersConfig({ minWatching: 100000 }),
  { version: 1, minWatching: MIN_WATCHING_LIMIT },
  '너무 큰 값은 상한으로(캡슐이 영영 안 보이는 실수 방지)',
)
assert.deepEqual(parseViewersConfig({ minWatching: 3, other: 'x' }), { version: 1, minWatching: 3 }, '모르는 필드는 버린다')
assert.equal(parseViewersConfig({}), null)
assert.equal(parseViewersConfig({ minWatching: 'abc' }), null)
assert.equal(parseViewersConfig({ minWatching: '' }), null)
assert.equal(parseViewersConfig(null), null)
assert.equal(parseViewersConfig('not json'), null)
assert.deepEqual(unwrapStoredData({ displayKey: 'ariana-viewers', data: { minWatching: 3 } }), { minWatching: 3 }, '저장소 응답의 data를 꺼낸다')
assert.deepEqual(unwrapStoredData({ minWatching: 3 }), { minWatching: 3 }, 'data가 없으면 그대로')
assert.ok(!VIEWERS_CONFIG_KEY.includes('.') && !VIEWERS_CONFIG_KEY.includes(':'), '저장소 키에는 점·콜론이 없어야 한다')

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

// 회귀 방지: 배지는 로그인 확인 호출(/account/v1/users)을 하지 않는다. 로그인 안 한 방문자에게 401이 나면
// 사이트가 "로그인 정보를 확인할 수 없어요" 팝업을 띄운다.
const badgeSource = await readFile(new URL('../src/shared/viewers/ViewersBadge.tsx', import.meta.url), 'utf8')
assert.equal(/account\/v1\/users/.test(badgeSource), false, '배지에서 /account/v1/users를 부르면 안 된다')
assert.equal(/from ['"]\.\.\/client['"]/.test(badgeSource), false, '배지는 BstageClient(client)를 쓰지 않는다')

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
