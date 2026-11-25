import { useMemo } from 'react'
import { color } from '@bstage-sdk/design/user'
import StarSchedule from './StarSchedule'
import { sampleLoungePages } from './loungeScheduleSample'

// 라운지 일정 예시 화면 — 한 라운지(배진영)의 일정이 기존 일정 화면 모양으로 나온다(라운지 선택 칩은 숨김).
// 주소의 ?p= 를 읽지 않으므로 격리(iframe) 환경에서도 동작한다. 데이터는 예시이고 저장소를 읽거나 쓰지 않는다.

const CSS = `
.ls-root { width: 100%; max-width: 704px; margin: 0 auto; box-sizing: border-box; color: ${color.text.primary}; font-family: inherit; }
.ls-root *, .ls-root *::before, .ls-root *::after { box-sizing: border-box; }
`

export default function LoungeScheduleDemo() {
  // 라운지 고르는 칩은 숨겼다. 첫 라운지(배진영)의 예시 일정만 고정으로 보여준다.
  const page = useMemo(() => sampleLoungePages()[0], [])

  return (
    <div className="ls-root">
      <style>{CSS}</style>
      <StarSchedule key={page.slug} fixedPage={page} />
    </div>
  )
}
