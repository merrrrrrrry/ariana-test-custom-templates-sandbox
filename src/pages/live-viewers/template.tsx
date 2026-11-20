import { createTemplate } from '@bstage-sdk/react'
import { color } from '@bstage-sdk/design/user'
import ViewersBadge from '../../shared/viewers/ViewersBadge'

// 실시간 뷰어 수 페이지 — hosting 서버(ariana-test-viewers-server)에 연결한 예제.
// 서버가 "지금 이 페이지를 보는 사람 수"를 세고, 팬 화면은 15초마다 서버와 신호를 주고받는다.
// 다른 페이지에도 <ViewersBadge page="/경로" />로 붙일 수 있다(page는 영문·숫자·/ _ . - 만).
const PAGE_KEY = '/live-viewers'

export default function LiveViewersPage() {
  return (
    <div style={{ minHeight: '100vh', background: color.bg.base, padding: 16, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <ViewersBadge page={PAGE_KEY} />
      </div>
    </div>
  )
}

createTemplate(LiveViewersPage, {
  name: 'ariana-test-live-viewers',
})
