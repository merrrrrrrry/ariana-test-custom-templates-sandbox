// tests/*.test.ts를 하나씩 실행한다. 각 파일은 assert가 실패하면 비정상 종료한다.
// 실행: npm test  (Node 22.6+ 의 --experimental-strip-types 사용, 별도 패키지 설치 없음)
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const dir = fileURLToPath(new URL('.', import.meta.url))
const files = readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort()
let failed = 0
for (const file of files) {
  const res = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(dir, file)], { encoding: 'utf8' })
  const ok = res.status === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}`)
  if (!ok) {
    failed += 1
    console.log(res.stdout + res.stderr)
  }
}
console.log(`\n${files.length - failed}/${files.length} files passed`)
process.exit(failed ? 1 : 0)