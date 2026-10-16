import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 라운지 스토리(/lounge/{handle}/story) 피드 위 슬롯. 화면 본체는 shared/StarCommentsFeed.
export default StarCommentsFeed

createTemplate(StarCommentsFeed, {
  name: 'star-comments-feed',
  slot: 'user.lounge-story.feed:before',
})
