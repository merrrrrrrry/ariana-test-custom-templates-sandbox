import { createTemplate } from '@bstage-sdk/react'
import { color } from '@bstage-sdk/design/user'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 스타 스토리 댓글 모아보기 — 자체 주소가 있는 페이지 버전.
// 라운지 주소가 아니므로 라운지 핸들이 없고, 전체 스타 피드(GET /home/v1/star-home/feeds)를 쓴다.
// 화면 본체는 shared/StarCommentsFeed (라운지 스토리 슬롯 위젯과 공용).
export default function StarStoryCommentsPage() {
  return (
    <div style={{ minHeight: '100vh', background: color.bg.base }}>
      <StarCommentsFeed placement="page" />
    </div>
  )
}

createTemplate(StarStoryCommentsPage, {
  name: 'star-story-comments',
})
