import { createTemplate, useSlotContext } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 커뮤니티 게시판 피드 위 슬롯 — 호스트가 넘겨 주는 board(id · title)로 그 게시판의 스타 댓글만 보여 준다.
// 어드민의 자리별 스위치로 켜고 끈다.
const PLACEMENT = 'user.community-board.feed:before'

export default function StarCommentsFeedBoardSlot() {
  const context = useSlotContext<'user.community-board.feed:before'>()
  const boardId = context?.board?.id
  // 게시판 id를 못 받으면(호스트 변경 등) 엉뚱한 전체 목록을 보여 주지 않고 아무것도 그리지 않는다.
  if (!boardId) return null
  return <StarCommentsFeed placement={PLACEMENT} boardId={boardId} />
}

createTemplate(StarCommentsFeedBoardSlot, {
  name: 'star-comments-feed-board',
  slot: 'user.community-board.feed:before',
})
