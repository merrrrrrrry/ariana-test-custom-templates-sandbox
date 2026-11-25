import { LABEL_COLORS, fromKst, toKst, type ScheduleEvent, type ScheduleLabel, type SchedulePage } from './starScheduleConfig'

// 라운지 일정 예시 화면용 가짜 데이터. 저장소에는 아무것도 쓰지 않고, 오늘 날짜 기준으로 이번 달·다음 달에 일정을 만든다.
// 실제 일정은 어드민(star-schedule-settings)에서 라운지마다 일정 페이지를 만들어 넣는다.

export const SAMPLE_LOUNGES: { slug: string; star: string }[] = [
  { slug: 'bae-jinyoung', star: '배진영' },
  { slug: 'kwak-beom', star: '곽범' },
  { slug: 'park-semi', star: '박세미' },
  { slug: 'kim-dongha', star: '김동하' },
  { slug: 'danny-cho', star: 'Danny Cho' },
  { slug: 'psick-university', star: '피식대학' },
  { slug: 'shortbox', star: '숏박스' },
  { slug: 'eom-jiyoon', star: '엄지렐라' },
  { slug: 'kim-haejun', star: '김해준' },
]

const LABELS: ScheduleLabel[] = [
  { id: 'l_show', name: '공연', color: LABEL_COLORS[0] },
  { id: 'l_cast', name: '방송', color: LABEL_COLORS[5] },
  { id: 'l_fan', name: '팬 이벤트', color: LABEL_COLORS[4] },
]

function buildEvents(slug: string, star: string, index: number, y: number, m: number): ScheduleEvent[] {
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
  const ev = (n: number, partial: Omit<ScheduleEvent, 'id' | 'link' | 'description'> & { description?: string }): ScheduleEvent => ({
    id: `${slug}-e${n}`,
    link: null,
    description: partial.description ?? null,
    title: partial.title,
    allDay: partial.allDay,
    startAt: partial.startAt,
    endAt: partial.endAt,
    labelId: partial.labelId,
  })
  const showDay = 6 + (index % 3)
  const castDay = 13 + (index % 4)
  return [
    ev(1, {
      title: `${star} 단독 공연`,
      allDay: false,
      startAt: fromKst(y, m, showDay, 19, 0),
      endAt: fromKst(y, m, showDay, 21, 0),
      labelId: 'l_show',
    }),
    ev(2, { title: `${star} 라이브 방송`, allDay: false, startAt: fromKst(y, m, castDay, 20, 0), endAt: null, labelId: 'l_cast' }),
    ev(3, { title: `${star} 팬 이벤트`, allDay: true, startAt: fromKst(y, m, 21, 0, 0), endAt: null, labelId: 'l_fan' }),
    ev(4, { title: `${star} 지방 투어`, allDay: true, startAt: fromKst(y, m, 24, 0, 0), endAt: fromKst(y, m, 26, 0, 0), labelId: 'l_show' }),
    ev(5, { title: `${star} 새 영상 공개`, allDay: true, startAt: fromKst(next.y, next.m, 5, 0, 0), endAt: null, labelId: 'l_cast' }),
  ]
}

/** 라운지마다 일정 페이지 하나씩. now는 테스트에서 고정할 수 있다 */
export function sampleLoungePages(now: Date = new Date()): SchedulePage[] {
  const k = toKst(now.toISOString())
  return SAMPLE_LOUNGES.map(({ slug, star }, i) => ({
    version: 1 as const,
    slug,
    name: `${star} 일정 (예시)`,
    star,
    visibility: 'public' as const,
    labels: LABELS,
    events: buildEvents(slug, star, i, k.y, k.m),
    updatedBy: null,
    updatedAt: null,
  }))
}
