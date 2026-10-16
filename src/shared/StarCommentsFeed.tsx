import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigation } from '@bstage-sdk/react'
import { color, shadow, textStyle } from '@bstage-sdk/design/user'
import { client } from './client'

// ────────────────────────────────────────────────────────────────────────
// 스타 댓글 모아보기 — 공용 화면 컴포넌트 (createTemplate 호출 없음)
// 쓰는 곳: src/slots/star-comments-feed (콘텐츠 홈 슬롯), src/pages/star-story-comments (자체 주소 페이지)
// 슬롯은 context를 주지 않으므로 라운지 핸들은 현재 주소에서 읽는다.
//
// 데이터 출처 (스타 댓글을 작성자별로 모아 주는 API는 없다 — 아래를 조합):
//   1) 콘텐츠: 같은 도메인 GET /svc/home/api/v1/home/content → contentSections[].contents[]
//      + GET /home/v1/content-home/sections/curation, /home/v1/content-home/shows
//      (탭 시 /contents/{id}로 이동)
//   2) 스토리: GET /home/v1/star-home/lounges/{handle}/feeds → items[]
//      (핸들을 못 읽으면 GET /home/v1/star-home/feeds 로 대체, 탭 시 /story/feed/{id})
//      각 항목: typeId(글 id) · title · commentedStars[] · latestComment
//   3) GET /content/v1/contents/{ids}/extras?preferStarComment=true
//      → id별 latestComment(스타 댓글 우선) · 최신 reactionCounts
//   4) 글마다 스타 댓글 전부: 같은 도메인 GET /svc/content/api/v1/comments/stars?rootId&rootType=CONTENT
//      (여러 스타·여러 개, 답글 포함) + 반응 수는 GET /svc/content/api/v1/comments?parentId&parentType=CONTENT
//      (실패하면 3)의 최신 스타 댓글 1개로 대체)
//   5) 커뮤니티: GET /content/v1/boards → /boards/{id}/posts, 댓글 있는 최신 글의 최상위 댓글
//      (GET /svc/content/api/v1/comments?parentType=BOARD_CONTENT)에서 작성자 type이 STAR인 것
//      (탭 시 /community/board/{boardId}/post/{id})
//   6) 칩의 "모든 스타": GET /home/v1/star-home/stars + 댓글을 쓴 스타
// 한계: 스타가 남의 댓글에 단 답글은 반응 수를 알 수 없어 0으로 나온다. 최근 50개 글만 본다.
// ────────────────────────────────────────────────────────────────────────

interface StarRef {
  id: string
  nickname: string
  avatarImgPath?: string
  type?: string
}

interface CommentRaw {
  id: string
  body?: string
  contentId?: string
  createdAt?: string
  author?: StarRef
  reactionCounts?: Record<string, number>
}

type ContentKind = 'story' | 'contents' | 'community'

interface ContentItem {
  typeId: string
  title?: string
  description?: string
  commentedStars?: StarRef[]
  latestComment?: CommentRaw
  kind?: ContentKind
}

interface HomeContentResponse {
  contentSections?: { contents?: ContentItem[] }[]
}

interface CurationResponse {
  contents?: { items?: ContentItem[] }
}

interface ShowsResponse {
  shows?: ContentItem[]
}

interface ContentExtras {
  latestComment?: CommentRaw
  commentedStars?: StarRef[]
}

interface FeedsResponse {
  items?: ContentItem[]
}

type ExtrasMap = Record<string, ContentExtras>

interface StarComment {
  commentId: string
  contentId: string
  boardId?: string // 커뮤니티 글일 때만
  kind: ContentKind
  contentTitle: string
  star: StarRef
  body: string
  createdAt: number
  reactions: number
}

type SortKey = 'latest' | 'reactions'

const PAGE_SIZE = 50 // star-home feeds는 50으로 실검증됨(최대값은 문서에 없음)
const VISIBLE_COUNT = 12 // 1·2·3열 어디서든 마지막 줄이 비지 않는 수
const COMMUNITY_POST_LIMIT = 40 // 1분마다 갱신하므로 댓글 조회 요청 수를 제한한다
const REFRESH_INTERVAL_MS = 60_000

// 반응형 레이아웃 — 플랫폼 콘텐츠 섹션과 같은 규칙:
//   컨테이너 최대 1080px 가운데 정렬, 좌우 여백 16px(모바일) → 32px(668px 이상).
//   카드 목록: 1열(모바일) → 2열(668px~) → 3열(1000px~). Shadow DOM 안이라 <style>로 넣는다.
const RESPONSIVE_CSS = `
.scf-root { --scf-gutter: 16px; --scf-gap: 12px; width: 100%; max-width: 1080px; margin: 0 auto; box-sizing: border-box; padding: 24px var(--scf-gutter); }
.scf-chips { display: flex; gap: 8px; overflow-x: auto; padding: 0 var(--scf-gutter) 8px; margin: 0 calc(-1 * var(--scf-gutter)); scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.scf-chips::-webkit-scrollbar { display: none; }
.scf-sort { position: relative; display: inline-flex; align-items: center; }
.scf-sort select { appearance: none; -webkit-appearance: none; min-height: 36px; padding: 0 32px 0 14px; border: 1px solid var(--scf-sort-border); border-radius: 999px; background: transparent; cursor: pointer; font-family: inherit; }
.scf-sort select:focus-visible { outline: 2px solid var(--scf-sort-border); outline-offset: 2px; }
.scf-sort svg { position: absolute; right: 12px; pointer-events: none; }
.scf-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--scf-gap); }
@media (min-width: 668px) {
  .scf-root { --scf-gutter: 32px; --scf-gap: 16px; padding-top: 32px; padding-bottom: 32px; }
  .scf-chips { flex-wrap: wrap; overflow: visible; margin: 0; padding: 0 0 8px; }
  .scf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1000px) {
  .scf-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
`
const ENABLED_STORAGE_KEY = 'star-comments-feed-enabled'

// 기본은 켜짐. 사용자가 끈 적이 있으면('0') 꺼진 채로 시작한다.
function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}
// extras는 id를 콤마로 이어 경로에 넣는다 — 한 번에 너무 길어지지 않게 끊어서 호출.
const EXTRAS_CHUNK = 20

function sumReactions(counts: Record<string, number> | undefined): number {
  if (!counts) return 0
  return Object.values(counts).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0)
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function timeAgo(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}일 전`
  return new Date(ts).toLocaleDateString('ko-KR')
}

// /lounge/{handle}/story 에서 핸들을 읽는다. 못 읽으면 null → 전체 스타 피드로 대체.
function readLoungeHandle(): string | null {
  const match = window.location.pathname.match(/\/lounge\/([^/]+)\/story/)
  return match ? decodeURIComponent(match[1]) : null
}

// 콘텐츠 탭이 실제로 그리는 섹션들. 게이트웨이에는 섹션 목록 API가 없고(sections/{id}만 있음),
// curation·shows는 운영자가 직접 큐레이션한 것만 담겨 비어 있기 쉽다. 그래서 같은 도메인의
// 홈 콘텐츠 API(로그인 쿠키로 호출)에서 섹션별 콘텐츠를 읽는다. 실패하면 조용히 건너뛴다.
async function loadHomeSectionContents(): Promise<ContentItem[]> {
  const res = await fetch(`${window.location.origin}/svc/home/api/v1/home/content`, { credentials: 'include' })
  if (!res.ok) return []
  const data = (await res.json()) as HomeContentResponse
  return (data.contentSections ?? []).flatMap((section) => section.contents ?? [])
}

interface CommentListResponse {
  items?: CommentRaw[]
}

// 글 상세 화면이 쓰는 같은 도메인 API(로그인 쿠키). 게이트웨이에는 댓글 목록 API가 없다.
//   GET /svc/content/api/v1/comments/stars?rootId&rootType=CONTENT → 그 글에 스타가 쓴 댓글(답글 포함) 전부
//   GET /svc/content/api/v1/comments?parentId&parentType=CONTENT   → 최상위 댓글(반응 수 포함)
// 실패(권한·경로 변경)하면 null → 호출한 쪽이 최신 스타 댓글 1개로 대체한다.
async function loadStarCommentsOf(contentId: string): Promise<CommentRaw[] | null> {
  try {
    const res = await fetch(
      `${window.location.origin}/svc/content/api/v1/comments/stars?pageSize=50&rootId=${encodeURIComponent(contentId)}&rootType=CONTENT`,
      { credentials: 'include' }
    )
    if (!res.ok) return null
    return ((await res.json()) as CommentListResponse).items ?? []
  } catch {
    return null
  }
}

// 최상위 댓글 목록(반응 수 포함). 실패하면 빈 목록.
async function loadTopLevelComments(parentId: string, parentType: 'CONTENT' | 'BOARD_CONTENT'): Promise<CommentRaw[]> {
  try {
    const res = await fetch(
      `${window.location.origin}/svc/content/api/v1/comments?includesPivot=false&pageSize=48&parentId=${encodeURIComponent(parentId)}&parentType=${parentType}`,
      { credentials: 'include' }
    )
    if (!res.ok) return []
    return ((await res.json()) as CommentListResponse).items ?? []
  } catch {
    return [] // 못 읽어도 나머지는 보여 준다.
  }
}

async function loadReactionCounts(contentId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const c of await loadTopLevelComments(contentId, 'CONTENT')) map.set(c.id, sumReactions(c.reactionCounts))
  return map
}

interface BoardSummary {
  id: string
  title?: string
}

interface BoardPost {
  id: string
  title?: string
  description?: string
  commentCount?: number
  createdAt?: string
}

interface BoardPostsResponse {
  boardContents?: { items?: BoardPost[] }
}

// 커뮤니티: 게시판 글은 commentedStars가 비어 있고 글당 스타 댓글 API(comments/stars)도 비어 있다.
// 그래서 댓글이 있는 최신 글의 최상위 댓글 목록에서 작성자 type이 STAR인 것을 고른다.
async function loadCommunityStarComments(): Promise<StarComment[]> {
  const boards = (await client.get<BoardSummary[]>('/content/v1/boards')).data ?? []
  const postsByBoard = await Promise.all(
    boards.map((board) =>
      client
        .get<BoardPostsResponse>('/content/v1/boards/{boardId}/posts', {
          path: { boardId: board.id },
          params: { request: '' },
        })
        .then((res) =>
          (res.data?.boardContents?.items ?? [])
            .filter((post) => (post.commentCount ?? 0) > 0)
            .map((post) => ({ board, post }))
        )
        .catch(() => [] as { board: BoardSummary; post: BoardPost }[])
    )
  )
  const targets = postsByBoard
    .flat()
    .sort((a, b) => Date.parse(b.post.createdAt ?? '') - Date.parse(a.post.createdAt ?? ''))
    .slice(0, COMMUNITY_POST_LIMIT)

  const lists = await Promise.all(
    targets.map(async ({ board, post }) => {
      const out: StarComment[] = []
      for (const comment of await loadTopLevelComments(post.id, 'BOARD_CONTENT')) {
        if (comment.author?.type !== 'STAR' || !comment.body) continue
        out.push({
          commentId: comment.id,
          contentId: post.id,
          boardId: board.id,
          kind: 'community',
          contentTitle: post.title || post.description || '(제목 없음)',
          star: comment.author,
          body: comment.body,
          createdAt: comment.createdAt ? Date.parse(comment.createdAt) : 0,
          reactions: sumReactions(comment.reactionCounts),
        })
      }
      return out
    })
  )
  return lists.flat()
}

function detailPath(c: StarComment): string {
  if (c.kind === 'contents') return `/contents/${c.contentId}`
  if (c.kind === 'community') return `/community/board/${c.boardId}/post/${c.contentId}`
  return `/story/feed/${c.contentId}`
}

async function loadStarComments(): Promise<{ comments: StarComment[]; stars: StarRef[] }> {
  // 커뮤니티 스타 댓글은 다른 소스와 독립이라 먼저 시작해 두고 마지막에 합친다.
  const communityPromise = loadCommunityStarComments().catch(() => [] as StarComment[])
  const { comments, stars } = await loadStoryAndContentsStarComments()
  const community = await communityPromise
  const seenIds = new Set(comments.map((c) => c.commentId))
  return { comments: [...comments, ...community.filter((c) => !seenIds.has(c.commentId))], stars }
}

async function loadStoryAndContentsStarComments(): Promise<{ comments: StarComment[]; stars: StarRef[] }> {
  const handle = readLoungeHandle()
  const [feeds, curation, shows, homeSections] = await Promise.all([
    (handle
      ? client.get<FeedsResponse>('/home/v1/star-home/lounges/{loungeHandle}/feeds', {
          path: { loungeHandle: handle },
          params: { page: 1, pageSize: PAGE_SIZE },
        })
      : client.get<FeedsResponse>('/home/v1/star-home/feeds', { params: { page: 1, pageSize: PAGE_SIZE } })
    )
      .then((res) => res.data?.items ?? [])
      .catch(() => [] as ContentItem[]),
    client
      .get<CurationResponse>('/home/v1/content-home/sections/curation', { params: { page: 1, pageSize: PAGE_SIZE } })
      .then((res) => res.data?.contents?.items ?? [])
      .catch(() => [] as ContentItem[]),
    client
      .get<ShowsResponse>('/home/v1/content-home/shows')
      .then((res) => res.data?.shows ?? [])
      .catch(() => [] as ContentItem[]),
    loadHomeSectionContents().catch(() => [] as ContentItem[]),
  ])

  // 중복 제거 + 스타가 댓글을 단 글만 남긴다. 콘텐츠 쪽을 먼저 넣어 같은 id면 콘텐츠로 본다.
  const byId = new Map<string, ContentItem>()
  const tagged: ContentItem[] = [
    ...[...homeSections, ...curation, ...shows].map((item) => ({ ...item, kind: 'contents' as const })),
    ...feeds.map((item) => ({ ...item, kind: 'story' as const })),
  ]
  for (const item of tagged) {
    if (item?.typeId && (item.commentedStars?.length ?? 0) > 0 && !byId.has(item.typeId)) {
      byId.set(item.typeId, item)
    }
  }
  const contents = Array.from(byId.values())
  // 칩에 보여 줄 "모든 스타": 스타 목록 API + 댓글을 쓴 스타(아래에서 합친다).
  const allStars = await client
    .get<StarRef[]>('/home/v1/star-home/stars')
    .then((res) => (Array.isArray(res.data) ? res.data : []))
    .catch(() => [] as StarRef[])
  if (contents.length === 0) return { comments: [], stars: allStars }

  // 스타 댓글 우선(latestComment) + 최신 카운트를 extras로 일괄 조회.
  const extrasList = await Promise.all(
    chunk(contents.map((c) => c.typeId), EXTRAS_CHUNK).map((ids) =>
      // path 치환은 콤마를 %2C로 인코딩하므로 URL을 직접 조립한다(리터럴 콤마 필요).
      client
        .get<ExtrasMap>(`/content/v1/contents/${ids.join(',')}/extras`, { params: { preferStarComment: true } })
        .then((res) => res.data ?? {})
        .catch(() => ({}) as ExtrasMap)
    )
  )
  const extras: ExtrasMap = Object.assign({}, ...extrasList)

  const comments: StarComment[] = []
  const seen = new Set<string>()
  await Promise.all(
    contents.map(async (content) => {
      // extras(스타 댓글 우선)가 비면 피드가 준 latestComment로 대체.
      const latest = extras[content.typeId]?.latestComment ?? content.latestComment
      const starIds = new Set((extras[content.typeId]?.commentedStars ?? content.commentedStars ?? []).map((s) => s.id))

      // 글의 스타 댓글 전부(여러 스타·여러 개). 실패하면 최신 스타 댓글 1개로 대체한다.
      const raws = (await loadStarCommentsOf(content.typeId)) ?? (latest ? [latest] : [])
      // 반응 수는 스타 댓글 목록에 없어서 일반 댓글 목록 + extras의 최신 댓글에서 id로 찾아 붙인다.
      const reactionsById = raws.length > 0 ? await loadReactionCounts(content.typeId) : new Map<string, number>()
      if (latest?.id) reactionsById.set(latest.id, sumReactions(latest.reactionCounts))

      for (const comment of raws) {
        const author = comment.author
        if (!author || !comment.body || seen.has(comment.id)) continue
        // 작성자가 "댓글 단 스타"일 때만 스타 댓글로 인정한다(스타 API는 이미 스타 것만 준다).
        if (starIds.size > 0 && !starIds.has(author.id) && author.type !== 'STAR') continue
        seen.add(comment.id)
        comments.push({
          commentId: comment.id,
          contentId: content.typeId,
          kind: content.kind ?? 'story',
          contentTitle: content.title || content.description || '(제목 없음)',
          star: author,
          body: comment.body,
          createdAt: comment.createdAt ? Date.parse(comment.createdAt) : 0,
          reactions: reactionsById.get(comment.id) ?? sumReactions(comment.reactionCounts),
        })
      }
    })
  )
  return { comments, stars: allStars }
}

export default function StarCommentsFeed() {
  const { navigate } = useNavigation()
  const [comments, setComments] = useState<StarComment[] | null>(null)
  const [knownStars, setKnownStars] = useState<StarRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedStars, setSelectedStars] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortKey>('latest')

  const [enabled, setEnabled] = useState(readEnabled)
  const setEnabledAndSave = (next: boolean) => {
    setEnabled(next)
    try {
      window.localStorage.setItem(ENABLED_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // 저장소를 못 써도(시크릿 모드 등) 이번 방문 동안은 동작한다.
    }
  }

  // silent=true: 화면은 그대로 두고 조용히 갱신(실패해도 기존 목록 유지).
  const load = useCallback((silent = false) => {
    if (!silent) {
      setComments(null)
      setError(null)
    }
    loadStarComments()
      .then((next) => {
        setComments(next.comments)
        setKnownStars(next.stars)
        setError(null)
      })
      .catch((err) => {
        if (!silent) setError(err instanceof Error ? err.message : '스타 댓글을 불러오지 못했습니다')
      })
  }, [])

  useEffect(() => {
    if (enabled) load()
  }, [load, enabled])

  // 열려 있는 동안 스타가 새 댓글을 달아도 보이도록: 탭에 다시 돌아올 때 + 1분마다 갱신.
  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load, enabled])

  // 칩: 댓글을 쓴 스타 + 스타 목록 API의 모든 스타(아직 댓글이 없어도 고를 수 있다).
  const stars = useMemo(() => {
    const map = new Map<string, StarRef>()
    for (const s of knownStars) map.set(s.id, s)
    for (const c of comments ?? []) map.set(c.star.id, c.star)
    return Array.from(map.values())
  }, [comments, knownStars])

  const [shownCount, setShownCount] = useState(VISIBLE_COUNT)
  const { visible, total } = useMemo(() => {
    const filtered = (comments ?? []).filter((c) => selectedStars.size === 0 || selectedStars.has(c.star.id))
    const sorted = [...filtered].sort((a, b) =>
      sort === 'latest' ? b.createdAt - a.createdAt : b.reactions - a.reactions || b.createdAt - a.createdAt
    )
    return { visible: sorted.slice(0, shownCount), total: sorted.length }
  }, [comments, selectedStars, sort, shownCount])

  const toggleStar = (id: string) =>
    setSelectedStars((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const chipStyle = (active: boolean) => ({
    ...textStyle('13/body/semibold'),
    border: 'none',
    borderRadius: 999,
    padding: '8px 14px',
    minHeight: 36, // 터치하기 편한 최소 높이
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    background: active ? color.surface['form-inverted'] : color.bg['grouped-weak'],
    color: active ? color.text['invert-a'] : color.text.primary,
  })

  return (
    <section
      className="scf-root"
      style={{ background: color.bg.base, ['--scf-sort-border' as string]: color.border['default-a'] }}
    >
      <style>{RESPONSIVE_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ ...textStyle('20/title/semibold'), color: color.text.primary, margin: '0 0 4px' }}>
          스타의 댓글 모아보기
        </h2>
        {/* 켜기/끄기: 끄면 목록을 접고 불러오기도 멈춘다. 선택은 이 브라우저에 기억한다. */}
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="스타 댓글 모아보기 켜기/끄기"
          onClick={() => setEnabledAndSave(!enabled)}
          style={{
            flexShrink: 0,
            width: 44,
            height: 26,
            padding: 3,
            border: 'none',
            borderRadius: 999,
            cursor: 'pointer',
            display: 'flex',
            justifyContent: enabled ? 'flex-end' : 'flex-start',
            background: enabled ? color.surface['form-inverted'] : color.bg['grouped-weak'],
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: 999, background: enabled ? color.text['invert-a'] : color.text.secondary }} />
        </button>
      </div>
      {enabled ? (
        <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 16px' }}>
          스타가 남긴 댓글을 한곳에서 확인해보세요
        </p>
      ) : (
        <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: 0 }}>꺼져 있어요. 스위치를 켜면 다시 보여드려요.</p>
      )}
      {enabled && (
        <>

      {/* 필터: 스타 선택(복수) + 정렬 */}
      {stars.length > 0 && (
        <div className="scf-chips">
          <button onClick={() => setSelectedStars(new Set())} style={chipStyle(selectedStars.size === 0)}>
            전체 스타
          </button>
          {stars.map((star) => (
            <button key={star.id} onClick={() => toggleStar(star.id)} style={chipStyle(selectedStars.has(star.id))}>
              {star.nickname}
            </button>
          ))}
        </div>
      )}
      {comments && comments.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '4px 0 12px' }}>
          {/* 정렬: 네이티브 select를 알약 모양으로 — 모바일에서는 OS 선택창이 열려 누르기 편하다. */}
          <label className="scf-sort">
            <select
              aria-label="정렬"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              style={{ ...textStyle('13/body/semibold'), color: color.text.primary }}
            >
              <option value="latest">최신순</option>
              <option value="reactions">반응 많은 순</option>
            </select>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              fill="none"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ stroke: color.icon['secondary-a'] }}
            >
              <path d="M2.5 4.5 6 8l3.5-3.5" />
            </svg>
          </label>
        </div>
      )}

      {error && (
        <div style={{ ...textStyle('14/body/reg'), color: color.text.secondary }}>
          {error}{' '}
          <button
            onClick={() => load()}
            style={{ ...textStyle('14/body/semibold'), border: 'none', background: 'transparent', color: color.text.primary, cursor: 'pointer' }}
          >
            다시 시도
          </button>
        </div>
      )}
      {!error && comments === null && (
        <p style={{ ...textStyle('14/body/reg'), color: color.text.secondary, margin: 0 }}>불러오는 중…</p>
      )}
      {!error && comments !== null && comments.length === 0 && (
        <p style={{ ...textStyle('14/body/reg'), color: color.text.secondary, margin: 0 }}>
          아직 스타 댓글이 없어요.
        </p>
      )}
      {!error && comments !== null && comments.length > 0 && visible.length === 0 && (
        <p style={{ ...textStyle('14/body/reg'), color: color.text.secondary, margin: 0 }}>선택한 스타의 댓글이 없어요.</p>
      )}

      <div className="scf-grid">
        {visible.map((c) => (
          <button
            key={c.commentId}
            onClick={() => navigate(detailPath(c))}
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              minWidth: 0,
              height: '100%',
              boxSizing: 'border-box',
              textAlign: 'left',
              border: `1px solid ${color.border['default-a']}`,
              borderRadius: 16,
              padding: 16,
              cursor: 'pointer',
              background: color.surface.card,
              boxShadow: shadow['default-small'],
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {c.star.avatarImgPath ? (
                <img
                  src={c.star.avatarImgPath}
                  alt=""
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <span
                  style={{ width: 32, height: 32, borderRadius: '50%', background: color.bg['grouped-weak'], flexShrink: 0 }}
                />
              )}
              <span style={{ ...textStyle('14/body/semibold'), color: color.text.primary }}>{c.star.nickname}</span>
              <span style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary, marginLeft: 'auto' }}>
                {timeAgo(c.createdAt)}
              </span>
            </div>
            <p
              style={{
                ...textStyle('15/body/reg'),
                color: color.text.primary,
                margin: '0 0 12px',
                flex: 1,
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {c.body}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 10,
                background: color.bg['grouped-weak'],
              }}
            >
              <span
                style={{
                  ...textStyle('12/caption/med'),
                  color: color.text.secondary,
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {c.contentTitle}
              </span>
              {c.reactions > 0 && (
                <span style={{ ...textStyle('12/caption/semibold'), color: color.text.secondary, flexShrink: 0 }}>
                  ❤️ {c.reactions}
                </span>
              )}
              <span style={{ ...textStyle('12/caption/semibold'), color: color.text.primary, flexShrink: 0 }}>
                원글 보기 ›
              </span>
            </div>
          </button>
        ))}
      </div>
      {total > visible.length && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            onClick={() => setShownCount((n) => n + VISIBLE_COUNT)}
            style={{ ...textStyle('14/body/semibold'), minHeight: 40, padding: '0 20px', borderRadius: 999, border: `1px solid ${color.border['default-a']}`, background: 'transparent', color: color.text.primary, cursor: 'pointer' }}
          >
            더보기 ({total - visible.length})
          </button>
        </div>
      )}
        </>
      )}
    </section>
  )
}

