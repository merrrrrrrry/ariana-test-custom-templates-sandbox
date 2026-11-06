import { createTemplate } from '@bstage-sdk/react'
import { color } from '@bstage-sdk/design/user'
import StarSchedule from '../../shared/StarSchedule'

// 스타 일정 페이지 — 운영자가 어드민(star-schedule-settings)에서 만든 일정 페이지를 보여준다.
// 주소: /star-schedule?p=<슬러그> (선택: &y=2026&m=10, &e=<일정 id>로 상세 팝업을 바로 연다).
// 기존 비스테이지 일정(월 목록 / 달력 / 라벨 칩 / 상세 팝업 / 캘린더 연결)과 같은 모양. 기획서: star-schedule/spec.md
export default function StarSchedulePage() {
  return (
    <div style={{ minHeight: '100vh', background: color.bg.base }}>
      <StarSchedule />
    </div>
  )
}

createTemplate(StarSchedulePage, {
  name: 'star-schedule',
})
