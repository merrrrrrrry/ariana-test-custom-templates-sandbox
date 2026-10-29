import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, PLACEMENTS, isVisible, parseConfig } from '../src/shared/starCommentsConfig.ts'
assert.equal(PLACEMENTS.length, 9)
const keys = PLACEMENTS.map((p) => p.key)
assert.equal(new Set(keys).size, 9)
assert.ok(keys.every((k) => !/[.:$]/.test(k)), 'dot-free keys')
// 예전에 저장된 값(4자리만 있음, 일부는 켜짐/꺼짐): 새 자리는 모두 꺼짐, 기존 값은 유지
const old = { placements: { page: true, 'contents-after': false, 'curation-list': false, 'section-list': true } }
const p = parseConfig(old)
assert.equal(p.placements.page, true); assert.equal(p.placements['contents-after'], false); assert.equal(p.placements['section-list'], true)
for (const k of ['contents-detail-after','contents-detail-comments','lounge-story','lounge-contents','lounge-community']) {
  assert.equal(p.placements[k as keyof typeof p.placements], false, k)
  assert.equal(isVisible(p, k as never), false, 'hidden by default: ' + k)
}
// 켜면 보임
const on = parseConfig({ placements: { 'lounge-story': true } })
assert.equal(isVisible(on, 'lounge-story'), true)
assert.equal(isVisible(on, 'lounge-contents'), false)
assert.deepEqual(Object.keys(DEFAULT_CONFIG.placements).sort(), [...keys].sort())
console.log('placements: ok (9 slots, defaults off, old values kept)')