import assert from 'node:assert/strict'
import { curateComments, pinOrder } from '../src/shared/curateComments.ts'
import { DEFAULT_CONFIG, parseConfig } from '../src/shared/starCommentsConfig.ts'
const c = (id: string, post: string, nick: string, body: string, createdAt: number, reactions: number) => ({ commentId: id, contentId: post, body, createdAt, reactions, star: { nickname: nick } })
const data = [c('a1','p1','메리','하나',100,0), c('a2','p1','Gini','둘',300,0), c('a3','p1','메리','셋',200,9), c('b1','p2','메리','넷',150,0)]
const base = { hiddenStars: [], hiddenCommentIds: [], hiddenKeywords: [], minReactions: 0, perPostLimit: 0, perPostOrder: 'latest' as const, pinnedCommentIds: [] as string[] }
const ids = (l: { commentId: string }[]) => l.map((x) => x.commentId).join(',')
// 설정
assert.deepEqual(DEFAULT_CONFIG.pinnedCommentIds, [])
assert.equal('pinnedKeywords' in DEFAULT_CONFIG, false)
assert.deepEqual(parseConfig({ pinnedCommentIds: [' x1 ', 'x1', 'x2'] }).pinnedCommentIds, ['x1', 'x2'])
assert.equal(parseConfig({ pinnedCommentIds: ['y'.repeat(100)] }).pinnedCommentIds[0].length, 64)
assert.deepEqual(parseConfig({ pinnedKeywords: ['옛 키워드'] }).pinnedCommentIds, [])
// 고정 순서
assert.equal(pinOrder(['b','a'], 'b'), 0); assert.equal(pinOrder(['b','a'], 'a'), 1); assert.equal(pinOrder(['b','a'], 'zz'), 2)
const sorted = [...data].sort((x, y) => pinOrder(['b1','a1'], x.commentId) - pinOrder(['b1','a1'], y.commentId) || y.createdAt - x.createdAt)
assert.equal(ids(sorted), 'b1,a1,a2,a3')
// 고정은 최소 반응 · 글당 개수에 걸리지 않는다
assert.equal(ids(curateComments(data, { ...base, minReactions: 5, pinnedCommentIds: ['b1'] })), 'a3,b1')
assert.equal(ids(curateComments(data, { ...base, perPostLimit: 1, pinnedCommentIds: ['a1'] })), 'a1,a2,b1')
// 숨김은 고정보다 우선
assert.equal(ids(curateComments(data, { ...base, hiddenCommentIds: ['a1'], pinnedCommentIds: ['a1'] })), 'a2,a3,b1')
assert.equal(ids(curateComments(data, { ...base, hiddenStars: ['메리'], pinnedCommentIds: ['a1'] })), 'a2')
assert.equal(ids(curateComments(data, { ...base, hiddenKeywords: ['둘'], pinnedCommentIds: ['a2'] })), 'a1,a3,b1')
// 고정이 비어 있으면 이전 동작 그대로
assert.equal(ids(curateComments(data, { ...base, perPostLimit: 1 })), 'a2,b1')
console.log('pin by id: 13 asserts ok')