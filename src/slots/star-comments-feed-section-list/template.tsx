import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 섹션 목록(전체보기) 페이지 위 슬롯 — 어드민의 자리별 스위치로 켜고 끈다(기본 꺼짐).
const PLACEMENT = 'section-list' // 어드민 설정의 자리 키(슬롯 id가 아님)

export default function StarCommentsFeedSectionListSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedSectionListSlot, {
  name: 'star-comments-feed-section-list',
  slot: 'user.contents-section.list:before',
})

