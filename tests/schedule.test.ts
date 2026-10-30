import assert from 'node:assert/strict'
import {
  LABEL_COLORS,
  buildIcs,
  dayFull,
  dayHeading,
  eventDayRange,
  eventMonthSpan,
  eventsByDay,
  filterByLabel,
  fromKst,
  googleCalendarUrl,
  icsFileName,
  isTombstone,
  isValidSlug,
  layoutMonth,
  makeTombstone,
  monthTitle,
  monthWeeks,
  pageUrl,
  parseIndex,
  parseSchedulePage,
  shiftMonth,
  timeLabel,
  toKst,
  uiLocale,
  weekdayShort,
  whenLabel,
  assertSafeKeys,
  type ScheduleEvent,
} from '../src/shared/starScheduleConfig.ts'

let n = 0
const t = (name: string, fn: () => void) => {
  fn()
  n += 1
  console.log('ok -', name)
}
// Intl 은 시각과 AM/PM 사이에 좁은 공백(U+202F)을 쓸 수 있다
const flat = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ')

const ev = (id: string, title: string, startAt: string, endAt: string | null = null, extra: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id, title, allDay: false, startAt, endAt, labelId: null, link: null, description: null, ...extra,
})
// KST 날짜 → ISO 도우미
const k = (y: number, m: number, d: number, h = 0, mi = 0) => fromKst(y, m, d, h, mi)

t('slug 규칙', () => {
  for (const ok of ['luna', 'a', 'luna-2026', 'a1', 'x'.repeat(30)]) assert.equal(isValidSlug(ok), true, ok)
  for (const bad of ['', 'Luna', '-luna', 'luna-', 'lu na', 'lu.na', 'lu$na', '한글', 'x'.repeat(31), 3, null, undefined]) assert.equal(isValidSlug(bad as never), false, String(bad))
})

t('KST 변환과 왕복', () => {
  assert.deepEqual(toKst('2026-10-22T15:00:00Z'), { y: 2026, m: 10, d: 23, h: 0, mi: 0, dow: 5 })
  assert.equal(fromKst(2026, 10, 23, 0, 0), '2026-10-22T15:00:00.000Z')
  assert.equal(fromKst(2026, 12, 31, 23, 59), '2026-12-31T14:59:00.000Z')
  const back = toKst(fromKst(2026, 3, 1, 9, 30))
  assert.deepEqual([back.y, back.m, back.d, back.h, back.mi], [2026, 3, 1, 9, 30])
})

t('parseSchedulePage: 정상 값, 감싼 값, 문자열', () => {
  const raw = {
    version: 1, slug: 'luna', name: '  루나 일정  ', star: '루나', visibility: 'login',
    labels: [{ id: 'l1', name: 'Match', color: LABEL_COLORS[0] }],
    events: [
      { id: 'e2', title: '둘째', startAt: '2026-10-24T00:00:00Z', labelId: 'l1' },
      { id: 'e1', title: '첫째', startAt: '2026-10-23T00:00:00Z', endAt: '2026-10-25T00:00:00Z', link: 'https://example.com/x', description: ' 설명 ' },
    ],
    updatedBy: '나', updatedAt: '2026-10-30T00:00:00Z',
  }
  for (const input of [raw, { data: raw }, JSON.stringify(raw)]) {
    const p = parseSchedulePage(input)!
    assert.equal(p.slug, 'luna'); assert.equal(p.name, '루나 일정'); assert.equal(p.visibility, 'login')
    assert.deepEqual(p.events.map((e) => e.id), ['e1', 'e2'], '시작 시각순 정렬')
    assert.equal(p.events[0].link, 'https://example.com/x'); assert.equal(p.events[0].description, '설명')
    assert.equal(p.events[1].labelId, 'l1')
  }
})

t('parseSchedulePage: 잘못된 입력을 버린다', () => {
  assert.equal(parseSchedulePage(null), null)
  assert.equal(parseSchedulePage('not json'), null)
  assert.equal(parseSchedulePage({ slug: 'Bad Slug' }), null)
  const p = parseSchedulePage({
    slug: 'a',
    visibility: 'weird',
    labels: [{ id: 'l1', name: '', color: '#000' }, { id: 'l2', name: 'ok', color: '#123456' }, { id: 'l2', name: 'dup', color: '#EEB1B1' }, 7],
    events: [
      { id: 'x', title: '', startAt: '2026-10-23T00:00:00Z' },
      { id: 'y', title: 'no date' },
      { id: 'z', title: 'bad link', startAt: '2026-10-23T00:00:00Z', link: 'javascript:alert(1)', labelId: 'ghost', endAt: '2026-10-22T00:00:00Z' },
      { id: 'z', title: '중복 id', startAt: '2026-10-23T00:00:00Z' },
    ],
  })!
  assert.equal(p.visibility, 'public', '모르는 값은 공개로 두지 않고... 기본값(public)이지만 login은 명시해야만')
  assert.deepEqual(p.labels.map((l) => l.id), ['l2'])
  assert.equal(p.labels[0].color, LABEL_COLORS[0], '팔레트 밖 색은 첫 색으로')
  assert.equal(p.events.length, 1)
  assert.equal(p.events[0].link, null, 'http/https 아닌 링크는 버림')
  assert.equal(p.events[0].labelId, null, '없는 라벨 id는 null')
  assert.equal(p.events[0].endAt, null, '시작보다 이른 종료는 버림')
})

t('parseIndex', () => {
  const i = parseIndex({ pages: [{ slug: 'a', name: 'A', star: 's', visibility: 'login', eventCount: 3 }, { slug: 'a' }, { slug: 'Bad' }, 5] })
  assert.equal(i.pages.length, 1); assert.equal(i.pages[0].visibility, 'login'); assert.equal(i.pages[0].eventCount, 3)
  assert.deepEqual(parseIndex(null).pages, [])
})

t('삭제 표시(tombstone)', () => {
  const tomb = makeTombstone('luna')
  assert.equal(isTombstone(tomb), true); assert.equal(isTombstone({ data: tomb }), true); assert.equal(isTombstone(JSON.stringify(tomb)), true)
  assert.equal(isTombstone({ slug: 'luna', name: 'x' }), false); assert.equal(isTombstone(null), false)
  assert.equal(parseSchedulePage(tomb)?.events.length, 0, '삭제 표시도 빈 페이지로는 읽힌다 — 판정은 호출부가 isTombstone으로 한다')
})

t('assertSafeKeys: 점·$ 키 거부', () => {
  assert.doesNotThrow(() => assertSafeKeys({ a: { b: [1, { c: 2 }] } }))
  assert.throws(() => assertSafeKeys({ 'a.b': 1 }))
  assert.throws(() => assertSafeKeys({ ok: { $x: 1 } }))
})

t('monthWeeks: 2026년 10월(목요일 시작, 5주)', () => {
  const w = monthWeeks(2026, 10)
  assert.equal(w.length, 5)
  assert.deepEqual(w[0].map((c) => c.day), [null, null, null, null, 1, 2, 3])
  assert.deepEqual(w[4].map((c) => c.day), [25, 26, 27, 28, 29, 30, 31])
  assert.equal(w[0][4].key, '2026-10-01'); assert.equal(w[0][0].key, null)
  assert.equal(monthWeeks(2026, 9).length, 5)
  assert.equal(monthWeeks(2026, 2).length, 4, '2026년 2월은 일요일 시작이라 4주')
  assert.equal(monthWeeks(2026, 8).length, 6, '2026년 8월은 토요일 시작이라 6주')
})

t('eventDayRange: 종일은 종료일 포함, 시간 있는 일정은 자정 종료 제외', () => {
  const allDay = ev('a', '종일', k(2026, 10, 5), k(2026, 10, 7), { allDay: true })
  const r = eventDayRange(allDay); assert.equal(r.end - r.start, 2)
  const midnight = ev('b', '자정에 끝', k(2026, 10, 5, 22), k(2026, 10, 6, 0))
  const r2 = eventDayRange(midnight); assert.equal(r2.end - r2.start, 0, '정확히 자정이면 다음 날을 포함하지 않음')
  const over = ev('c', '다음 날까지', k(2026, 10, 5, 22), k(2026, 10, 6, 1))
  const r3 = eventDayRange(over); assert.equal(r3.end - r3.start, 1)
  const single = ev('d', '종료 없음', k(2026, 10, 5, 10)); assert.equal(eventDayRange(single).end, eventDayRange(single).start)
})

t('layoutMonth: 한 날의 여러 일정은 줄로 쌓인다', () => {
  const events = [ev('1', 'B', k(2026, 10, 7, 12)), ev('2', 'A', k(2026, 10, 7, 9)), ev('3', 'C', k(2026, 10, 7, 15))]
  const { weeks, maxLevels } = layoutMonth(2026, 10, events)
  const segs = weeks[1].segments
  assert.equal(segs.length, 3); assert.equal(maxLevels, 3)
  assert.deepEqual(segs.map((s) => s.event.title), ['A', 'B', 'C'], '시작 시각순으로 위에서 아래로')
  assert.deepEqual(segs.map((s) => s.level), [0, 1, 2])
  assert.ok(segs.every((s) => s.startCol === 3 && s.endCol === 3))
})

t('layoutMonth: 여러 날 막대는 먼저 놓이고 짧은 일정이 그 아래로', () => {
  const long = ev('L', '긴 일정', k(2026, 10, 6, 9), k(2026, 10, 9, 18))
  const short = ev('S', '짧은', k(2026, 10, 7, 9))
  const { weeks } = layoutMonth(2026, 10, [short, long])
  const segs = weeks[1].segments
  const l = segs.find((s) => s.event.id === 'L')!, s = segs.find((x) => x.event.id === 'S')!
  assert.equal(l.level, 0); assert.equal(s.level, 1)
  assert.equal(l.endCol - l.startCol, 3)
})

t('layoutMonth: 겹치지 않으면 같은 줄을 쓴다(first-fit)', () => {
  const a = ev('a', 'a', k(2026, 10, 6, 9), k(2026, 10, 7, 12))
  const b = ev('b', 'b', k(2026, 10, 8, 9), k(2026, 10, 9, 12))
  const { weeks } = layoutMonth(2026, 10, [a, b])
  assert.deepEqual(weeks[1].segments.map((s) => s.level), [0, 0]); assert.equal(weeks[1].levels, 1)
})

t('layoutMonth: 주 경계에서 끊기고 이어짐 표시', () => {
  const e = ev('x', '주를 넘김', k(2026, 10, 9, 9), k(2026, 10, 14, 18)) // 금 → 다음 주 수
  const { weeks } = layoutMonth(2026, 10, [e])
  const first = weeks[1].segments[0], second = weeks[2].segments[0]
  assert.equal(first.event.id, 'x'); assert.equal(first.continuesLeft, false); assert.equal(first.continuesRight, true); assert.equal(first.endCol, 6)
  assert.equal(second.continuesLeft, true); assert.equal(second.continuesRight, false); assert.equal(second.startCol, 0); assert.equal(second.endCol, 3)
})

t('layoutMonth: 달 밖에서 시작해 들어오는 일정', () => {
  const e = ev('y', '전달부터', k(2026, 9, 28, 9), k(2026, 10, 2, 18))
  const { weeks } = layoutMonth(2026, 10, [e])
  const seg = weeks[0].segments[0]
  assert.equal(seg.continuesLeft, true, '이 달 첫 칸보다 먼저 시작')
  assert.equal(seg.startCol, 4, '빈 칸(달 밖)에는 막대를 걸지 않고 1일 칸(목요일)부터'); assert.equal(seg.endCol, 5)
  assert.equal(layoutMonth(2026, 11, [e]).maxLevels, 0, '다음 달에는 나오지 않음')
  const tail = layoutMonth(2026, 10, [ev('t', '다음 달로', k(2026, 10, 30, 9), k(2026, 11, 3, 9))])
  const last = tail.weeks[4].segments[0]
  assert.equal(last.continuesRight, true); assert.equal(last.endCol, 6, '31일(토요일)에서 끊김')
})

t('eventsByDay: 여러 날 일정은 걸친 날마다', () => {
  const e = ev('m', '3일', k(2026, 10, 5, 9), k(2026, 10, 7, 18))
  const map = eventsByDay(2026, 10, [e, ev('o', '다른', k(2026, 10, 6, 8))])
  assert.deepEqual([...map.keys()], ['2026-10-05', '2026-10-06', '2026-10-07'])
  assert.deepEqual(map.get('2026-10-06')!.map((x) => x.id), ['m', 'o'], '먼저 시작한 일정(5일 9시)이 6일 8시 일정보다 위')
})

t('eventMonthSpan과 shiftMonth', () => {
  assert.equal(eventMonthSpan([]), null)
  const s = eventMonthSpan([ev('a', 'a', k(2026, 10, 23)), ev('b', 'b', k(2026, 12, 1, 9), k(2027, 1, 3, 9))])!
  assert.deepEqual([s.first.y, s.first.m], [2026, 10]); assert.deepEqual([s.last.y, s.last.m], [2027, 1])
  assert.deepEqual(shiftMonth(2026, 12, 1), { y: 2027, m: 1 }); assert.deepEqual(shiftMonth(2026, 1, -1), { y: 2025, m: 12 })
  assert.deepEqual(shiftMonth(2026, 10, 0), { y: 2026, m: 10 })
})

t('filterByLabel', () => {
  const list = [ev('a', 'a', k(2026, 10, 1), null, { labelId: 'x' }), ev('b', 'b', k(2026, 10, 2))]
  assert.equal(filterByLabel(list, null).length, 2); assert.deepEqual(filterByLabel(list, 'x').map((e) => e.id), ['a'])
})

t('표기: 한국어', () => {
  assert.equal(uiLocale('ko'), 'ko'); assert.equal(uiLocale('ko-KR'), 'ko'); assert.equal(uiLocale('ja'), 'en'); assert.equal(uiLocale(undefined), 'en')
  assert.equal(monthTitle('ko', 2026, 10), '10월, 2026')
  assert.equal(dayHeading('ko', 23, 5), '23일 금요일')
  assert.equal(dayFull('ko', 2026, 10, 23), '2026. 10. 23.')
  assert.equal(timeLabel('ko', k(2026, 10, 23, 0, 0)), '오전 12:00', '레퍼런스의 "오전 12:00"과 같다')
  assert.equal(weekdayShort('ko', 0), '일'); assert.equal(weekdayShort('ko', 6), '토')
})

t('표기: 영어', () => {
  assert.equal(monthTitle('en', 2026, 10), 'Oct, 2026')
  assert.equal(dayHeading('en', 24, 6), '24 Saturday')
  assert.equal(dayFull('en', 2026, 10, 24), '10/24/2026')
  assert.equal(flat(timeLabel('en', k(2026, 10, 24, 8, 0))), '08:00 AM')
  assert.equal(weekdayShort('en', 0), 'Sun')
  const e = ev('w', 'Worlds', k(2026, 10, 24, 8, 0))
  assert.equal(flat(whenLabel('en', e)), '10/24/2026, 8:00 AM', '캡처의 상세 팝업 일시와 같다')
  assert.equal(whenLabel('en', { ...e, allDay: true }), '10/24/2026')
})

t('whenLabel: 여러 날', () => {
  const e = ev('m', '긴', k(2026, 10, 5, 9), k(2026, 10, 7, 18))
  assert.ok(whenLabel('ko', e).includes(' ~ '))
  const same = ev('s', '같은 날', k(2026, 10, 5), k(2026, 10, 5), { allDay: true })
  assert.ok(!whenLabel('ko', same).includes('~'))
})

t('pageUrl', () => {
  assert.equal(pageUrl('https://x.test/star-schedule', 'luna'), 'https://x.test/star-schedule?p=luna')
  assert.equal(pageUrl('https://x.test/star-schedule', 'luna', 'e_1'), 'https://x.test/star-schedule?p=luna&e=e_1')
})

t('buildIcs: 시간 있는 일정', () => {
  const e = ev('e_1', '팬미팅, "특별" 행사; 1부', '2026-10-23T03:00:00.000Z', '2026-10-23T05:00:00.000Z', { description: '첫 줄\n둘째 줄', link: 'https://example.com/a' })
  const ics = buildIcs(e, { pageName: '루나 일정', url: 'https://x.test/star-schedule?p=luna&e=e_1', now: new Date('2026-10-30T00:00:00Z') })
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n')); assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
  assert.ok(!/(^|[^\r])\n/.test(ics), '모든 줄바꿈은 CRLF')
  assert.ok(ics.includes('UID:e_1@star-schedule')); assert.ok(ics.includes('DTSTAMP:20261030T000000Z'))
  assert.ok(ics.includes('DTSTART:20261023T030000Z')); assert.ok(ics.includes('DTEND:20261023T050000Z'))
  assert.ok(ics.includes('SUMMARY:팬미팅\\, "특별" 행사\\; 1부'), '쉼표·세미콜론 이스케이프')
  assert.ok(ics.includes('\\n'), '설명의 줄바꿈은 \\n으로')
})

t('buildIcs: 종일 일정은 종료일이 포함이 아니라 다음 날', () => {
  const e = ev('a', '종일', k(2026, 10, 5), k(2026, 10, 7), { allDay: true })
  const ics = buildIcs(e, { pageName: 'p', url: 'https://x.test/', now: new Date('2026-10-30T00:00:00Z') })
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261005')); assert.ok(ics.includes('DTEND;VALUE=DATE:20261008'))
  const one = buildIcs(ev('b', '하루', k(2026, 12, 31), null, { allDay: true }), { pageName: 'p', url: 'https://x.test/' })
  assert.ok(one.includes('DTSTART;VALUE=DATE:20261231')); assert.ok(one.includes('DTEND;VALUE=DATE:20270101'), '연말 경계')
})

t('buildIcs: 종료 없는 일정은 1시간, 긴 줄은 75바이트 이하로 접힘', () => {
  const e = ev('c', '가'.repeat(60), '2026-10-23T03:00:00.000Z')
  const ics = buildIcs(e, { pageName: 'p', url: 'https://x.test/', now: new Date('2026-10-30T00:00:00Z') })
  assert.ok(ics.includes('DTEND:20261023T040000Z'))
  const enc = new TextEncoder()
  for (const line of ics.split('\r\n')) assert.ok(enc.encode(line).length <= 75, `줄이 너무 김: ${line.length}`)
  const unfolded = ics.replace(/\r\n /g, '')
  assert.ok(unfolded.includes('SUMMARY:' + '가'.repeat(60)), '접었다 펴면 원문과 같다')
})

t('googleCalendarUrl', () => {
  const e = ev('g', '팬미팅 & 사인회', '2026-10-23T03:00:00.000Z', '2026-10-23T05:00:00.000Z', { description: '설명' })
  const u = new URL(googleCalendarUrl(e, { url: 'https://x.test/star-schedule?p=luna' }))
  assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render')
  assert.equal(u.searchParams.get('action'), 'TEMPLATE'); assert.equal(u.searchParams.get('text'), '팬미팅 & 사인회')
  assert.equal(u.searchParams.get('dates'), '20261023T030000Z/20261023T050000Z')
  assert.ok(u.searchParams.get('details')!.includes('https://x.test/star-schedule?p=luna'))
  const all = new URL(googleCalendarUrl(ev('h', '종일', k(2026, 10, 5), k(2026, 10, 7), { allDay: true }), { url: 'u' }))
  assert.equal(all.searchParams.get('dates'), '20261005/20261008')
})

t('icsFileName', () => {
  assert.equal(icsFileName(ev('a', '팬미팅: 1부/2부', k(2026, 10, 1))), '팬미팅-1부-2부.ics')
  assert.equal(icsFileName(ev('b', '???', k(2026, 10, 1))), 'event.ics')
})

console.log(`schedule: ${n} groups ok`)
