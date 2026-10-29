import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, parseConfig } from '../src/shared/starCommentsConfig.ts'
assert.equal(DEFAULT_CONFIG.showToggle, true)
assert.equal(parseConfig({}).showToggle, true)
assert.equal(parseConfig({ showToggle: false }).showToggle, false)
assert.equal(parseConfig({ showToggle: 'no' }).showToggle, true)
assert.deepEqual(parseConfig(JSON.parse(JSON.stringify(parseConfig({ showToggle: false })))).showToggle, false)
console.log('showToggle: 5 asserts ok')