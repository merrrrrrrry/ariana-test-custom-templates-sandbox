import { createTemplate } from '@bstage-sdk/react'
import StarCommentsFeed from '../../shared/StarCommentsFeed'

// 콘텐츠 홈 섹션 묶음 아래 슬롯. 화면 본체는 shared/StarCommentsFeed.
export default StarCommentsFeed

createTemplate(StarCommentsFeed, {
  name: 'star-comments-feed',
  slot: 'user.contents-home.contents-section:after',
})
