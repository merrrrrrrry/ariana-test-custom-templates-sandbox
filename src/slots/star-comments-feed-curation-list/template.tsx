import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 큐레이션 목록 페이지 위 슬롯 — 어드민의 자리별 스위치로 켜고 끈다(기본 꺼짐).
const PLACEMENT = 'user.contents-curation.list:before'

export default function StarCommentsFeedCurationListSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedCurationListSlot, {
  name: 'star-comments-feed-curation-list',
  slot: 'user.contents-curation.list:before',
})
