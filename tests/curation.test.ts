import assert from 'node:assert/strict'
import { curateComments } from '../src/shared/curateComments.ts'
import {
  APPLY_WAIT_MS,
  CONFIG_CACHE_BUCKET_MS,
  DEFAULT_CONFIG,
  isVisible,
  parseConfig,
} from '../src/shared/starCommentsConfig.ts'

let n = 0
const t = (name: string, fn: () => void) => {
  fn()
  n += 1
  console.log('ok -', name)
}

const c = (id: string, post: string, nick: string, body: string, createdAt: number, reactions: number) => ({
  commentId: id, contentId: post, body, createdAt, reactions, star: { nickname: nick },
})
const data = [
  c('a1', 'p1', '메리', '첫 번째 댓글', 100, 5),
  c('a2', 'p1', 'Gini', '두 번째 댓글 광고', 300, 0),
  c('a3', 'p1', '메리', '세 번째 댓글', 200, 9),
  c('b1', 'p2', '메리', 'Hello World', 150, 1),
  c('c1', 'p3', '애뤼애나', '팬 여러분', 50, 0),
]
const rules = { hiddenStars: [], hiddenCommentIds: [], hiddenKeywords: [], minReactions: 0, perPostLimit: 0, perPostOrder: 'latest' as const }
const ids = (list: { commentId: string }[]) => list.map((x) => x.commentId).join(',')

// --- 거르기
t('기본 규칙은 아무것도 거르지 않는다', () => assert.equal(ids(curateComments(data, rules)), 'a1,a2,a3,b1,c1'))
t('숨긴 스타', () => assert.equal(ids(curateComments(data, { ...rules, hiddenStars: ['메리'] })), 'a2,c1'))
t('숨긴 댓글 ID', () => assert.equal(ids(curateComments(data, { ...rules, hiddenCommentIds: ['a2', 'c1'] })), 'a1,a3,b1'))
t('금칙어는 대소문자를 구분하지 않는다', () => assert.equal(ids(curateComments(data, { ...rules, hiddenKeywords: ['광고', 'hello'] })), 'a1,a3,c1'))
t('최소 반응 수', () => assert.equal(ids(curateComments(data, { ...rules, minReactions: 5 })), 'a1,a3'))

// --- 글당 최대 개수
t('글당 1개 · 최신', () => assert.equal(ids(curateComments(data, { ...rules, perPostLimit: 1 })), 'a2,b1,c1'))
t('글당 1개 · 반응 많은 순', () => assert.equal(ids(curateComments(data, { ...rules, perPostLimit: 1, perPostOrder: 'reactions' })), 'a3,b1,c1'))
t('글당 2개 · 최신', () => assert.equal(ids(curateComments(data, { ...rules, perPostLimit: 2 })), 'a2,a3,b1,c1'))
t('글당 개수는 다른 규칙으로 거른 뒤에 센다', () =>
  assert.equal(ids(curateComments(data, { ...rules, perPostLimit: 1, hiddenCommentIds: ['a2'] })), 'a3,b1,c1'))
t('원본 배열을 바꾸지 않는다', () => {
  const copy = JSON.stringify(data)
  curateComments(data, { ...rules, perPostLimit: 1, perPostOrder: 'reactions' })
  assert.equal(JSON.stringify(data), copy)
})

// --- 설정 검증
t('빈 값은 기본 설정', () => assert.deepEqual(parseConfig(null), DEFAULT_CONFIG))
t('기본 설정은 새 기능이 꺼진 상태', () => {
  assert.equal(DEFAULT_CONFIG.tagFilter.enabled, false)
  assert.equal(DEFAULT_CONFIG.perPostLimit, 0)
  assert.equal(DEFAULT_CONFIG.minReactions, 0)
  assert.deepEqual(DEFAULT_CONFIG.hiddenCommentIds, [])
})
t('기존 저장값(새 필드 없음)도 그대로 읽힌다', () => {
  const old = { version: 1, enabled: true, title: '제목', placements: { page: true } }
  const p = parseConfig(old)
  assert.equal(p.title, '제목')
  assert.equal(p.tagFilter.enabled, false)
  assert.equal(p.perPostLimit, 0)
})
t('태그 필터: 태그가 있으면 켜짐', () => {
  const p = parseConfig({ tagFilter: { enabled: true, tags: [' 스타픽 ', '스타픽', '이벤트', ''] } })
  assert.equal(p.tagFilter.enabled, true)
  assert.deepEqual(p.tagFilter.tags, ['스타픽', '이벤트'])
})
t('태그 필터: 태그가 없으면 켰어도 꺼진 것으로 본다', () => assert.equal(parseConfig({ tagFilter: { enabled: true, tags: [] } }).tagFilter.enabled, false))
t('태그 필터: 잘못된 모양은 기본값', () => {
  assert.equal(parseConfig({ tagFilter: 'x' }).tagFilter.enabled, false)
  assert.deepEqual(parseConfig({ tagFilter: { tags: 'a' } }).tagFilter.tags, [])
})
t('글당 개수 · 반응 수는 범위로 자른다', () => {
  assert.equal(parseConfig({ perPostLimit: 99 }).perPostLimit, 10)
  assert.equal(parseConfig({ perPostLimit: -3 }).perPostLimit, 0)
  assert.equal(parseConfig({ perPostLimit: 'x' }).perPostLimit, 0)
  assert.equal(parseConfig({ minReactions: 123456 }).minReactions, 9999)
  assert.equal(parseConfig({ minReactions: 2.6 }).minReactions, 3)
})
t('정렬 기준은 두 값만', () => {
  assert.equal(parseConfig({ perPostOrder: 'reactions' }).perPostOrder, 'reactions')
  assert.equal(parseConfig({ perPostOrder: 'zzz' }).perPostOrder, 'latest')
})
t('숨길 댓글 ID는 64자까지 · 중복 제거', () => {
  const p = parseConfig({ hiddenCommentIds: ['abc', 'abc', ' def ', 'x'.repeat(100)] })
  assert.deepEqual(p.hiddenCommentIds.slice(0, 2), ['abc', 'def'])
  assert.equal(p.hiddenCommentIds[2].length, 64)
})
t('저장 JSON에 점(.)이 든 키가 없다(게이트웨이 500 방지)', () => {
  const keys: string[] = []
  const walk = (o: unknown) => {
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.push(k); walk(v) }
  }
  walk(parseConfig({ tagFilter: { enabled: true, tags: ['a.b'] }, hiddenCommentIds: ['x.y'] }))
  assert.equal(keys.filter((k) => k.includes('.') || k.includes('$')).length, 0)
})
t('저장 → 읽기 왕복해도 같다', () => {
  const p = parseConfig({ tagFilter: { enabled: true, tags: ['스타픽'] }, perPostLimit: 2, perPostOrder: 'reactions', minReactions: 3, hiddenCommentIds: ['a2'] })
  assert.deepEqual(parseConfig(JSON.parse(JSON.stringify(p))), p)
})

// --- 노출 / 반영 대기
t('isVisible 기본', () => assert.equal(isVisible(DEFAULT_CONFIG, 'page'), true))
t('반영 대기 시간은 캐시 주기보다 길다', () => assert.ok(APPLY_WAIT_MS > CONFIG_CACHE_BUCKET_MS))

console.log(`\n${n} tests passed`)

