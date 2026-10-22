import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 라운지 스토리 탭 피드 위 슬롯 — 어드민의 자리별 스위치로 켜고 끈다(기본 꺼짐).
const PLACEMENT = 'lounge-story' // 어드민 설정의 자리 키(슬롯 id가 아님)

export default function StarCommentsFeedLoungeStorySlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedLoungeStorySlot, {
  name: 'star-comments-feed-lounge-story',
  slot: 'user.lounge-story.feed:before',
})
