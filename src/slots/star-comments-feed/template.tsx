import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 홈 섹션 묶음 아래 슬롯. 화면 본체는 shared/StarCommentsFeed.
// 한 위젯은 한 자리만 붙을 수 있어서, 같은 화면을 다른 자리에 붙이려면 위젯 파일을 따로 둔다
// (star-comments-feed-curation-list · -section-list). 어느 자리에 보일지는 어드민 설정(자리별 스위치)이 정한다.
const PLACEMENT = 'user.contents-home.contents-section:after'

export default function StarCommentsFeedSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedSlot, {
  name: 'star-comments-feed',
  slot: 'user.contents-home.contents-section:after',
})
