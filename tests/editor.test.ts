import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, parseConfig } from '../src/shared/starCommentsConfig.ts'
assert.equal(DEFAULT_CONFIG.updatedBy, null); assert.equal(DEFAULT_CONFIG.updatedAt, null)
assert.equal(parseConfig({}).updatedBy, null)
const p = parseConfig({ updatedBy: '  김예림 ', updatedAt: '2026-10-23T06:30:00+00:00' })
assert.equal(p.updatedBy, '김예림'); assert.equal(p.updatedAt, '2026-10-23T06:30:00.000Z')
assert.equal(parseConfig({ updatedBy: '   ' }).updatedBy, null)
assert.equal(parseConfig({ updatedBy: 'x'.repeat(80) }).updatedBy.length, 30)
assert.equal(parseConfig({ updatedAt: 'not a date' }).updatedAt, null)
assert.equal(parseConfig({ updatedAt: 123 }).updatedAt, null)
assert.deepEqual(parseConfig(JSON.parse(JSON.stringify(p))), p)
const keys=[]; const walk=(o)=>{ if(o&&typeof o==='object') for (const [k,v] of Object.entries(o)){ keys.push(k); walk(v) } }; walk(p); assert.equal(keys.filter(k=>/[.$]/.test(k)).length, 0)
console.log('last editor: 10 asserts ok')