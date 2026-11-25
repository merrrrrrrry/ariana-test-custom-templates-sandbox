import { createTemplate } from '@bstage-sdk/react'
import { color } from '@bstage-sdk/design/user'
import LoungeScheduleDemo from '../../shared/LoungeScheduleDemo'

// 라운지 일정 예시 페이지 — 라운지(스타)를 칩으로 고르면 그 라운지의 일정이 나온다. 주소: /lounge-schedule
// 임시 예시 데이터를 쓴다(저장소를 읽지 않음). 실제 일정 연결은 별도 작업.
export default function LoungeSchedulePage() {
  return (
    <div style={{ minHeight: '100vh', background: color.bg.base }}>
      <LoungeScheduleDemo />
    </div>
  )
}

createTemplate(LoungeSchedulePage, {
  name: 'lounge-schedule',
})
