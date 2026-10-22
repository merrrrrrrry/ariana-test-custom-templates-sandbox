import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 홈 섹션 묶음 위 슬롯 — 어드민의 자리별 스위치로 켜고 끈다.
const PLACEMENT = 'user.contents-home.contents-section:before'

export default function StarCommentsFeedBeforeSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedBeforeSlot, {
  name: 'star-comments-feed-before',
  slot: 'user.contents-home.contents-section:before',
})
