import assert from 'node:assert/strict'
import {
  TypingHttpError,
  createTypingApi,
  describeError,
  isNicknameMatch,
  isRetryable,
  parseNickname,
  parsePhrases,
  parseRanking,
  parseResult,
  parseRound,
} from '../src/shared/typingApi.ts'

const ID = '123e4567-e89b-12d3-a456-426614174000'
const P0 = 'a1b2c3d4'
const P1 = '0f0e0d0c'

// 닉네임: 서버 규칙과 같아야 한다
assert.equal(parseNickname('  메리  '), '메리')
assert.equal(parseNickname('Ab Cd'), 'Ab Cd')
assert.equal(parseNickname('가나다라마바사아자차'), '가나다라마바사아자차')
for (const bad of ['', 'a', '가나다라마바사아자차카', 'a<b>', '😀😀', 'a  b', '  ', null, undefined, 12]) {
  assert.equal(parseNickname(bad), null, String(bad))
}
assert.equal(isNicknameMatch('Tester One', 'testerone'), true)
assert.equal(isNicknameMatch('메리', '메리2'), false)
assert.equal(isNicknameMatch('', ''), false)

// 응답 모양 검사 — 문장 id가 없거나 모양이 이상하면 쓰지 않는다
assert.deepEqual(parseRound({ roundId: ID, phraseId: P0, phrase: '안녕하세요' }), {
  roundId: ID,
  phraseId: P0,
  phrase: '안녕하세요',
})
assert.equal(parseRound({ roundId: ID, phrase: '안녕하세요' }), null)
assert.equal(parseRound({ roundId: ID, phraseId: 'XYZ', phrase: '안녕' }), null)
assert.equal(parseRound({ roundId: 'x', phraseId: P0, phrase: '안녕' }), null)
assert.equal(parseRound({ roundId: ID, phraseId: P0, phrase: '' }), null)
assert.equal(parseRound(null), null)
assert.deepEqual(parsePhrases({ phrases: [{ phraseId: P0, phrase: '가' }, { phraseId: P1, phrase: '나' }] }), [
  { phraseId: P0, phrase: '가' },
  { phraseId: P1, phrase: '나' },
])
assert.equal(parsePhrases({ phrases: [{ phraseId: P0 }] }), null)
assert.equal(parsePhrases({}), null)
const result = { phraseId: P0, cpm: 300, ms: 8000, isBest: true, bestCpm: 300, rank: 1 }
assert.deepEqual(parseResult(result), result)
assert.equal(parseResult({ ...result, isBest: 'yes' }), null)
assert.equal(parseResult({ ...result, cpm: -1 }), null)
assert.equal(parseResult({ ...result, rank: Number.NaN }), null)
assert.equal(parseResult({ ...result, phraseId: undefined }), null)
assert.deepEqual(parseRanking({ phraseId: P0, ranking: [{ rank: 1, nickname: '메리', cpm: 300 }] }), {
  phraseId: P0,
  rows: [{ rank: 1, nickname: '메리', cpm: 300 }],
})
assert.deepEqual(parseRanking({ phraseId: P0, ranking: [] }), { phraseId: P0, rows: [] })
assert.equal(parseRanking({ ranking: [] }), null)
assert.equal(parseRanking({ phraseId: P0, ranking: [{ rank: 1, nickname: 5, cpm: 300 }] }), null)
assert.equal(parseRanking({}), null)

// 오류 문구: 서버 코드 문자열을 그대로 내보내지 않고, 다시 시도해도 되는 오류만 재시도로 본다
assert.ok(!describeError(new TypingHttpError(400, 'invalid_nickname')).includes('invalid_nickname'))
assert.notEqual(describeError(new TypingHttpError(422, 'too_fast')), describeError(new TypingHttpError(410, 'round_expired')))
assert.ok(!describeError(new TypingHttpError(404, 'phrase_not_found')).includes('phrase_not_found'))
assert.ok(describeError(new Error('network')).length > 0)
assert.equal(isRetryable(new TypingHttpError(400, 'invalid_nickname')), true)
assert.equal(isRetryable(new TypingHttpError(429, 'too_many_requests')), true)
assert.equal(isRetryable(new TypingHttpError(503, 'busy')), true)
assert.equal(isRetryable(new Error('network')), true)
assert.equal(isRetryable(new TypingHttpError(422, 'text_mismatch')), false)
assert.equal(isRetryable(new TypingHttpError(422, 'too_fast')), false)
assert.equal(isRetryable(new TypingHttpError(409, 'round_finished')), false)

// 호출: 경로·헤더·본문, 오류 코드 전달
const calls: { url: string; init: RequestInit }[] = []
const fakeFetch = (reply: (url: string) => Response) => async (url: string, init?: RequestInit) => {
  calls.push({ url, init: init ?? {} })
  return reply(url)
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

const api = createTypingApi({
  serverUrl: 'https://example.test/',
  spaceId: 'ariana-test',
  fetchFn: fakeFetch((url) => {
    if (url.endsWith('/api/typing/phrases')) return json(200, { phrases: [{ phraseId: P0, phrase: '안녕하세요' }] })
    if (url.endsWith('/api/typing/rounds')) return json(200, { roundId: ID, phraseId: P0, phrase: '안녕하세요' })
    if (url.endsWith('/begin')) return json(200, { ok: true })
    if (url.endsWith('/finish')) return json(200, result)
    return json(200, { phraseId: P0, ranking: [] })
  }),
})
assert.deepEqual(await api.phrases(), [{ phraseId: P0, phrase: '안녕하세요' }])
assert.deepEqual(await api.createRound(), { roundId: ID, phraseId: P0, phrase: '안녕하세요' })
await api.createRound(P1)
await api.begin(ID)
assert.deepEqual(await api.finish(ID, '안녕하세요', '메리'), result)
assert.deepEqual(await api.ranking(P0, 999), [])
assert.equal(calls[0].url, 'https://example.test/api/typing/phrases')
assert.equal(calls[1].url, 'https://example.test/api/typing/rounds')
assert.equal(calls[1].init.body, undefined) // 문장을 고르지 않으면 본문 없음(서버가 무작위로 낸다)
assert.deepEqual(JSON.parse(String(calls[2].init.body)), { phraseId: P1 })
assert.equal(calls[3].url, `https://example.test/api/typing/rounds/${ID}/begin`)
assert.equal(calls[4].url, `https://example.test/api/typing/rounds/${ID}/finish`)
assert.deepEqual(JSON.parse(String(calls[4].init.body)), { text: '안녕하세요', nickname: '메리' })
assert.equal(calls[5].url, `https://example.test/api/typing/ranking?phraseId=${P0}&limit=50`)
for (const c of calls) {
  const headers = c.init.headers as Record<string, string>
  assert.equal(headers['X-Bmf-Space-Id'], 'ariana-test')
  assert.equal(headers['Content-Type'], 'application/json')
}
// 화면이 시간·타수를 보내지 않는다: finish 본문에는 text와 nickname뿐
assert.deepEqual(Object.keys(JSON.parse(String(calls[4].init.body))).sort(), ['nickname', 'text'])

// 모양이 이상한 문장 id는 서버로 보내지 않는다
await assert.rejects(() => api.createRound("x'; DROP TABLE t;--"))
await assert.rejects(() => api.ranking('not-an-id'))

// 다른 문장의 순위가 돌아오면 쓰지 않는다
const mixed = createTypingApi({
  serverUrl: 'https://example.test',
  spaceId: 'ariana-test',
  fetchFn: fakeFetch(() => json(200, { phraseId: P1, ranking: [{ rank: 1, nickname: '다른문장', cpm: 500 }] })),
})
await assert.rejects(() => mixed.ranking(P0))

const failing = createTypingApi({
  serverUrl: 'https://example.test',
  spaceId: 'ariana-test',
  fetchFn: fakeFetch(() => json(422, { error: 'too_fast' })),
})
await assert.rejects(
  () => failing.finish(ID, 'x', '메리'),
  (e: unknown) => e instanceof TypingHttpError && e.status === 422 && e.code === 'too_fast',
)
const brokenBody = createTypingApi({
  serverUrl: 'https://example.test',
  spaceId: 'ariana-test',
  fetchFn: fakeFetch(() => new Response('<html>', { status: 502 })),
})
await assert.rejects(
  () => brokenBody.createRound(),
  (e: unknown) => e instanceof TypingHttpError && e.status === 502 && e.code === 'error',
)
const weird = createTypingApi({
  serverUrl: 'https://example.test',
  spaceId: 'ariana-test',
  fetchFn: fakeFetch(() => json(200, { nope: true })),
})
await assert.rejects(() => weird.createRound())
await assert.rejects(() => weird.ranking(P0))
await assert.rejects(() => weird.phrases())

// http 주소나 빈 주소는 호출하지 않는다
const unconfigured = createTypingApi({ serverUrl: 'http://insecure.test', spaceId: 'a', fetchFn: fakeFetch(() => json(200, {})) })
await assert.rejects(() => unconfigured.createRound())

console.log('typingApi: ok')
