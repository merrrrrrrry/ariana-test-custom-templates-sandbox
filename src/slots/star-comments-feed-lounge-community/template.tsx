import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 라운지 커뮤니티 탭 게시판 위 슬롯 — 어드민의 자리별 스위치로 켜고 끈다(기본 꺼짐).
const PLACEMENT = 'lounge-community' // 어드민 설정의 자리 키(슬롯 id가 아님)

export default function StarCommentsFeedLoungeCommunitySlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedLoungeCommunitySlot, {
  name: 'star-comments-feed-lounge-community',
  slot: 'user.lounge-community.feed:before',
})
