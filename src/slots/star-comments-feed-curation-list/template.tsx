import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 큐레이션 목록 페이지 위 슬롯 — 어드민의 자리별 스위치로 켜고 끈다(기본 꺼짐).
const PLACEMENT = 'curation-list' // 어드민 설정의 자리 키(슬롯 id가 아님)

export default function StarCommentsFeedCurationListSlot() {
  return <StarCommentsFeed placement={PLACEMENT} />
}

createTemplate(StarCommentsFeedCurationListSlot, {
  name: 'star-comments-feed-curation-list',
  slot: 'user.contents-curation.list:before',
})

