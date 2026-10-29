import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, VIEW_MODES, parseConfig } from '../src/shared/starCommentsConfig.ts'
assert.equal(DEFAULT_CONFIG.viewMode, 'block'); assert.equal(DEFAULT_CONFIG.allowViewSwitch, false)
assert.equal(parseConfig({}).viewMode, 'block')
assert.equal(parseConfig({ viewMode: 'list' }).viewMode, 'list')
assert.equal(parseConfig({ viewMode: 'grid' }).viewMode, 'block')
assert.equal(parseConfig({ viewMode: 3 }).viewMode, 'block')
assert.equal(parseConfig({ allowViewSwitch: true }).allowViewSwitch, true)
assert.equal(parseConfig({ allowViewSwitch: 'yes' }).allowViewSwitch, false)
assert.deepEqual(VIEW_MODES.map((m) => m.key), ['block', 'list'])
const p = parseConfig({ viewMode: 'list', allowViewSwitch: true })
assert.deepEqual(parseConfig(JSON.parse(JSON.stringify(p))), p)
console.log('view mode: 9 asserts ok')