import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 상세 페이지 본문 아래 슬롯 — 어드민의 자리별 스위치로 켜고 끈다(기본 꺼짐).
const PLACEMENT = 'contents-detail-after' // 어드민 설정의 자리 키(슬롯 id가 아님)

export default function StarCommentsFeedContentsDetailAfterSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedContentsDetailAfterSlot, {
  name: 'star-comments-feed-contents-detail-after',
  slot: 'user.contents-detail.body:after',
})
