import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 상세 페이지 댓글 영역 위 슬롯 — 어드민의 자리별 스위치로 켜고 끈다(기본 꺼짐).
const PLACEMENT = 'contents-detail-comments' // 어드민 설정의 자리 키(슬롯 id가 아님)

export default function StarCommentsFeedContentsDetailCommentsSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedContentsDetailCommentsSlot, {
  name: 'star-comments-feed-contents-detail-comments',
  slot: 'user.contents-detail.comments:before',
})
