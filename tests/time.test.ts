import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, parseConfig, isVisible, startAt, endAt } from '../src/shared/starCommentsConfig.ts'
const kst = (s: string) => Date.parse(s + '+09:00')
// 파싱
assert.equal(DEFAULT_CONFIG.startTime, null); assert.equal(DEFAULT_CONFIG.endTime, null)
assert.equal(parseConfig({ startDate: '2026-11-01', startTime: '09:30' }).startTime, '09:30')
assert.equal(parseConfig({ startDate: '2026-11-01', startTime: '24:00' }).startTime, null)
assert.equal(parseConfig({ startDate: '2026-11-01', startTime: '9:30' }).startTime, null)
assert.equal(parseConfig({ startDate: '2026-11-01', startTime: '12:60' }).startTime, null)
assert.equal(parseConfig({ startTime: '09:30' }).startTime, null, '날짜 없으면 시각 버림')
assert.equal(parseConfig({ endDate: '2026-11-01', endTime: '18:00' }).endTime, '18:00')
assert.equal(parseConfig({ endTime: '18:00' }).endTime, null)
// 이전 저장값(시각 없음)은 예전과 똑같이 동작
const old = parseConfig({ startDate: '2026-11-01', endDate: '2026-11-02' })
assert.equal(startAt(old), kst('2026-11-01T00:00:00')); assert.equal(endAt(old), kst('2026-11-02T23:59:59'))
// 판정
const c = parseConfig({ startDate: '2026-11-01', startTime: '09:30', endDate: '2026-11-01', endTime: '18:00', placements: { page: true } })
assert.equal(isVisible(c, 'page', kst('2026-11-01T09:29:59')), false)
assert.equal(isVisible(c, 'page', kst('2026-11-01T09:30:00')), true)
assert.equal(isVisible(c, 'page', kst('2026-11-01T18:00:59')), true)
assert.equal(isVisible(c, 'page', kst('2026-11-01T18:01:00')), false)
assert.equal(isVisible(parseConfig({ startDate: '2026-11-01', placements: { page: true } }), 'page', kst('2026-10-31T23:59:59')), false)
assert.equal(isVisible(parseConfig({ endDate: '2026-11-01', placements: { page: true } }), 'page', kst('2026-11-01T23:59:59')), true)
assert.equal(isVisible(parseConfig({ endDate: '2026-11-01', placements: { page: true } }), 'page', kst('2026-11-02T00:00:00')), false)
// 저장 → 읽기 왕복
assert.deepEqual(parseConfig(JSON.parse(JSON.stringify(c))), c)
console.log('exposure time: 17 asserts ok')