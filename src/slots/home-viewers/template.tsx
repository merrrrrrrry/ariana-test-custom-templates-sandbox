import { createTemplate } from '@bstage-sdk/react'
import ViewersBadge from '../../shared/viewers/ViewersBadge'

// ────────────────────────────────────────────────────────────────────────
// 자리: user.home.section:before (스테이지 홈 — 섹션 묶음 위)
// 이 자리는 카탈로그상 context를 주지 않는다(표의 context 칸 "—"). 집계 키는 아래 상수에 고정한다.
// 홈의 첫 섹션은 상단 바 아래로 당겨 그리는 브랜드 커버인 경우가 많고, 이 자리는 그 위에 놓인다.
// 그래서 인라인 위젯은 아래쪽 여백을 넉넉히 둔다(커버와 붙어 보이지 않게).
// 서버(ariana-test-viewers-server)가 "지금 홈을 보는 사람 수"를 세고, 화면은 15초마다 서버와 신호를 주고받는다.
// ────────────────────────────────────────────────────────────────────────
const PAGE_KEY = '/home'

export default function HomeViewers() {
  return (
    <div style={{ padding: '16px 16px 32px', boxSizing: 'border-box' }}>
      <ViewersBadge page={PAGE_KEY} />
    </div>
  )
}

createTemplate(HomeViewers, {
  name: 'ariana-test-home-viewers',
  slot: 'user.home.section:before',
})
