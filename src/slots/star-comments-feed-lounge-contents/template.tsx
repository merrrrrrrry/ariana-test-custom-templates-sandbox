import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 라운지 콘텐츠 탭 섹션 위 슬롯 — 어드민의 자리별 스위치로 켜고 끈다(기본 꺼짐).
const PLACEMENT = 'lounge-contents' // 어드민 설정의 자리 키(슬롯 id가 아님)

export default function StarCommentsFeedLoungeContentsSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedLoungeContentsSlot, {
  name: 'star-comments-feed-lounge-contents',
  slot: 'user.lounge-contents.section:before',
})
