import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 홈 큐레이션 섹션 아래 슬롯 — 어드민의 자리별 스위치로 켜고 끈다.
const PLACEMENT = 'user.contents-home.curation:after'

export default function StarCommentsFeedCurationSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedCurationSlot, {
  name: 'star-comments-feed-curation',
  slot: 'user.contents-home.curation:after',
})
