import assert from 'node:assert/strict'
import {
  diffChars,
  isComplete,
  isPlausibleCpm,
  keystrokeCount,
  parseBest,
  pickPhraseIndex,
  strokesPerMinute,
} from '../src/shared/typing.ts'
import { PHRASES } from '../src/shared/typingPhrases.ts'

// 타수: 한글은 자모로 풀어 센다
assert.equal(keystrokeCount('한'), 3)
assert.equal(keystrokeCount('가'), 2)
assert.equal(keystrokeCount('a b'), 3)
assert.equal(keystrokeCount(''), 0)

// 분당 타수
assert.equal(strokesPerMinute(100, 60000), 100)
assert.equal(strokesPerMinute(50, 30000), 100)
assert.equal(strokesPerMinute(10, 0), 0)
assert.equal(strokesPerMinute(10, -5), 0)
assert.equal(strokesPerMinute(0, 1000), 0)
assert.equal(strokesPerMinute(10, Number.NaN), 0)

// 완료 판정: 정확히 같아야 하고, 풀어쓴(NFD) 입력도 같은 글자로 본다
assert.equal(isComplete('안녕', '안녕'), true)
assert.equal(isComplete('안녕', '안녕 '), false)
assert.equal(isComplete('안녕', '안'), false)
assert.equal(isComplete('안녕', '안녕'.normalize('NFD')), true)

// 글자별 상태
assert.deepEqual(diffChars('가나다', ''), ['todo', 'todo', 'todo'])
assert.deepEqual(diffChars('가나다', '가마'), ['ok', 'bad', 'todo'])
assert.deepEqual(diffChars('가나다', '가나다라'), ['ok', 'ok', 'ok'])

// 문장 고르기: 직전 문장은 피하고, 범위를 벗어난 난수에도 터지지 않는다
for (let i = 0; i < 50; i += 1) assert.notEqual(pickPhraseIndex(3, 1), 1)
assert.equal(pickPhraseIndex(1, 0), 0)
assert.equal(pickPhraseIndex(0, null), 0)
assert.equal(pickPhraseIndex(3, null, () => 0), 0)
assert.equal(pickPhraseIndex(3, 0, () => 0.99), 2)
assert.equal(pickPhraseIndex(3, null, () => 1), 2)
assert.equal(pickPhraseIndex(3, null, () => -1), 0)

// 저장값: 손상된 값은 0
assert.equal(parseBest('250'), 250)
assert.equal(parseBest(null), 0)
assert.equal(parseBest('abc'), 0)
assert.equal(parseBest('-3'), 0)
assert.equal(parseBest('2.5'), 0)
assert.equal(parseBest('99999999'), 0)

// 사람이 낼 수 있는 속도: 상한 이하만 기록으로 인정한다
assert.equal(isPlausibleCpm(300), true)
assert.equal(isPlausibleCpm(1000), true)
assert.equal(isPlausibleCpm(1001), false)
assert.equal(isPlausibleCpm(4_200_000), false)
assert.equal(isPlausibleCpm(0), false)
assert.equal(isPlausibleCpm(Number.NaN), false)
assert.equal(isPlausibleCpm(Number.POSITIVE_INFINITY), false)

// 문장 목록: 비어 있지 않고, 서로 겹치지 않고, 앞뒤 공백이 없고, 한 판에 알맞은 길이
assert.ok(PHRASES.length >= 2)
assert.equal(new Set(PHRASES).size, PHRASES.length)
for (const p of PHRASES) {
  assert.equal(p, p.trim())
  assert.ok(p.length >= 8 && p.length <= 40, `길이 확인: ${p}`)
}

console.log('typing: ok')
