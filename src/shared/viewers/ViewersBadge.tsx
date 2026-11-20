import { Component, useEffect, useState, type ReactNode } from 'react'
import { color, textStyle } from '@bstage-sdk/design/user'
import {
  VIEWERS_SERVER_URL,
  VIEWERS_SPACE_ID,
  browserStorage,
  createViewersApi,
  getOrCreateGuestId,
  isCrowdedEnough,
  nextDelay,
  normalizeServerUrl,
  resolveFetch,
  type ViewerStats,
} from './viewersApi'

// "지금 N명이 보는 중". 어느 페이지에든 <ViewersBadge page="/경로" />로 붙인다.
// - 로그인 여부와 상관없이, 브라우저에 저장해 둔 임의의 방문자 id(guest-…)로 15초마다 하트비트(= 보는 사람으로 집계)하고 현재 수를 받는다.
//   브라우저를 바꾸거나 시크릿 창으로 열면 다른 사람으로 센다. 저장소를 못 쓰면 집계하지 않고 수만 읽는다.
// - 일부러 로그인 확인용 계정 API 호출을 하지 않는다: 로그인 안 한 방문자에게는 401이 나고,
//   사이트가 그 401을 보고 "로그인 정보를 확인할 수 없어요" 팝업을 띄운다(실제로 겪음).
// - 서버가 안 되거나 주소가 비어 있어도 화면은 깨지지 않는다(안내 문구만, quiet이면 아예 안 그림).

type Status = 'unconfigured' | 'loading' | 'ok' | 'error'

function useViewers(page: string) {
  const serverUrl = normalizeServerUrl(VIEWERS_SERVER_URL)
  const [stats, setStats] = useState<ViewerStats | null>(null)
  const [status, setStatus] = useState<Status>(serverUrl ? 'loading' : 'unconfigured')

  useEffect(() => {
    if (!serverUrl) return
    const api = createViewersApi({ serverUrl, spaceId: VIEWERS_SPACE_ID, fetchFn: resolveFetch() })
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // 집계에 쓰는 id(브라우저 방문자 id). 저장소를 못 쓰면 null(수만 읽는다).
    let viewerId: string | null = null
    let failures = 0

    // 요청은 한 번에 하나씩만 보낸다(RATE_LIMITED 방지). 탭이 숨겨져 있으면 이번 신호는 건너뛴다.
    const tick = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timer = setTimeout(tick, nextDelay(failures))
        return
      }
      try {
        const next = viewerId ? await api.heartbeat(page, viewerId) : await api.read(page)
        if (cancelled) return
        failures = 0
        setStats(next)
        setStatus('ok')
      } catch {
        if (cancelled) return
        failures += 1
        setStatus('error')
      }
      if (!cancelled) timer = setTimeout(tick, nextDelay(failures))
    }

    viewerId = getOrCreateGuestId(browserStorage())
    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      // 페이지를 떠나면 바로 '보는 중'에서 뺀다(실패해도 45초 뒤에는 자동으로 빠진다).
      if (viewerId) void api.leave(page, viewerId).catch(() => undefined)
    }
  }, [page, serverUrl])

  return { stats, status }
}

export interface ViewersBadgeProps {
  page: string
  /** 'card': 큰 카드(전용 페이지용) / 'banner': 한 줄짜리 작은 배너(홈 등 다른 화면 위에 얹을 때) */
  variant?: 'card' | 'banner'
  /**
   * 팬이 보는 화면용. 아직 값을 한 번도 못 받았으면 아무것도 그리지 않고(자리도 차지하지 않음),
   * 받은 뒤 일시적으로 실패해도 오류 문구 없이 마지막 값을 그대로 보여 준다. 운영 확인용 안내는 일반 모드에서만 보인다.
   */
  quiet?: boolean
  /**
   * 지금 보는 사람이 이 수보다 적으면 배지를 아예 그리지 않는다(사람이 적어 썰렁해 보이는 걸 막으려고). 0이면 항상 보여 준다.
   * 0보다 크게 두면 값을 아직 못 받았을 때도 그리지 않는다. 보는 사람에는 나 자신도 들어가므로 3이면 나 말고 2명 이상일 때 보인다.
   */
  minWatching?: number
  /**
   * 바깥 여백(카드 모양에만 적용). 래퍼 div에 padding을 주면 안 그려질 때도 자리를 차지하므로 본체의 margin으로 받는다.
   * 배너 모양은 플랫폼 화면 여백(모바일 16px, 넓은 화면 32px)을 스스로 따라가므로 이 값을 쓰지 않는다.
   */
  margin?: string
}

// 배너 위치: 플랫폼은 콘텐츠를 가운데 정렬한 칸(최대 폭 1080px)에 두고 그 안쪽 좌우 여백을 모바일 16px, 넓은 화면 32px로 준다.
// 배너도 같은 칸 모양으로 그려서 화면 폭이 바뀌어도(창이 넓어져 칸이 가운데로 밀려도) 캡슐의 왼쪽 끝이 아래 섹션 제목과 맞는다.
// 이 값들은 플랫폼 화면에서 잰 값이다. 넓은 화면 판단은 플랫폼이 body에 붙이는
// data-screen-variant="LARGE"를 읽는다. 위젯은 shadow DOM 안에서 그려져 CSS 선택자로는 바깥 body를 볼 수 없어 직접 읽고 지켜본다.
// 공식 SDK 문서에는 없는 값이라, 바뀌어 사라지거나 격리(iframe)로 돌면 모든 폭에서 16px로 보일 뿐 깨지지는 않는다.
const PAGE_CONTENT_MAX_WIDTH = 1080

function readLargeScreen(): boolean {
  try {
    return document.body?.getAttribute('data-screen-variant') === 'LARGE'
  } catch {
    return false
  }
}

function useLargeScreen(): boolean {
  const [large, setLarge] = useState(readLargeScreen)
  useEffect(() => {
    if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined') return
    const update = () => setLarge(readLargeScreen())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-screen-variant'] })
    return () => observer.disconnect()
  }, [])
  return large
}

// 배너의 초록 점 애니메이션. 클래스 이름에 접두사를 붙여 같은 화면의 다른 위젯 스타일과 겹치지 않게 한다.
const BANNER_CSS = `
@keyframes bmf-viewers-ping { 0% { transform: scale(1); opacity: .55 } 80%, 100% { transform: scale(2.6); opacity: 0 } }
.bmf-viewers-ring { animation: bmf-viewers-ping 1.8s cubic-bezier(0, 0, .2, 1) infinite }
@media (prefers-reduced-motion: reduce) { .bmf-viewers-ring { animation: none; opacity: 0 } }
`

function ViewersBadgeInner({ page, variant = 'card', quiet = false, minWatching = 0, margin }: ViewersBadgeProps) {
  const { stats, status } = useViewers(page)
  const largeScreen = useLargeScreen()

  // 썰렁한 곳(보는 사람이 minWatching명 미만)에서는 그리지 않는다. 숫자가 15초마다 바뀌므로 사람이 늘면 그때 나타난다.
  if (minWatching > 0 && !(stats && isCrowdedEnough(stats.watching, minWatching))) return null

  if (quiet && !stats) return null

  let note: string | null = null
  if (status === 'unconfigured') note = '뷰어 수 서버 주소가 아직 설정되지 않았어요.'
  else if (status === 'error') {
    if (!quiet) note = stats ? '최신 값을 불러오지 못했어요. 다시 시도하는 중이에요.' : '뷰어 수를 불러오지 못했어요.'
  }

  // 배경은 테마를 따라 바뀌는 반투명 틴트(라이트: 검정 6%, 다크: 흰색 6%). surface/card는 라이트에서 흰색이라 흰 화면에서 안 보인다.
  const background = color.bg['grouped-weak-a']
  const watching = stats ? stats.watching.toLocaleString('ko-KR') : null
  const total = stats ? stats.totalViewers.toLocaleString('ko-KR') : null

  if (variant === 'banner') {
    return (
      // 바깥 칸: 플랫폼 콘텐츠 칸과 같은 모양(가운데 정렬, 최대 폭 1080px, 좌우 여백 16/32px)이라 어떤 화면 폭에서도
      // 캡슐의 왼쪽 끝이 아래 섹션 제목과 같은 선에 선다.
      <div
        style={{
          maxWidth: PAGE_CONTENT_MAX_WIDTH,
          margin: '0 auto',
          boxSizing: 'border-box',
          padding: `16px ${largeScreen ? 32 : 16}px 12px`,
        }}
      >
        {/* 안쪽 캡슐: 글자 폭만큼만 차지하는 작은 모양(왼쪽 정렬). 너무 좁아 줄이 바뀌어도 모서리가 어색하지 않게 반지름은 18. */}
        <div
          style={{
            background,
            borderRadius: 18,
            padding: '8px 16px 8px 14px',
            width: 'fit-content',
            maxWidth: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '2px 10px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <style>{BANNER_CSS}</style>
          {/* 살아 있다는 느낌의 초록 점: 바깥 고리가 천천히 퍼진다(동작 줄이기 설정이면 멈춤) */}
          <span aria-hidden="true" style={{ position: 'relative', width: 8, height: 8, flex: 'none' }}>
            <span
              className="bmf-viewers-ring"
              style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color.icon.green }}
            />
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color.icon.green }} />
          </span>
          <span style={{ ...textStyle('13/body/semibold'), color: color.text.primary }}>
            {stats ? `지금 ${watching}명이 보는 중` : status === 'loading' ? '불러오는 중…' : '—'}
          </span>
          {stats && (
            <>
              <span
                aria-hidden="true"
                style={{ width: 1, height: 10, flex: 'none', background: color.text.tertiary, opacity: 0.35 }}
              />
              <span style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>
                {total}명 다녀갔어요
              </span>
            </>
          )}
          {note && <span style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>{note}</span>}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background,
        borderRadius: 16,
        padding: 20,
        margin,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ ...textStyle('13/body/semibold'), color: color.text.secondary }}>지금 이 페이지를</div>
      <div style={{ ...textStyle('16/title/semibold'), color: color.text.primary, fontSize: 28, lineHeight: '36px' }}>
        {stats ? `${watching}명이 보는 중` : status === 'loading' ? '불러오는 중…' : '—'}
      </div>
      {stats && (
        <div style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>지금까지 {total}명이 다녀갔어요</div>
      )}
      {note && <div style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>{note}</div>}
    </div>
  )
}

// 다른 위젯과 한 자리를 같이 쓸 때를 위한 안전장치: 이 배지가 그리는 중 오류를 내도 아무것도 안 그리고 끝낸다.
// (React는 오류가 나면 위젯 전체를 내리므로, 같은 위젯 안의 다른 컴포넌트까지 사라지는 일을 막는다.)
class ViewersBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export default function ViewersBadge(props: ViewersBadgeProps) {
  return (
    <ViewersBoundary>
      <ViewersBadgeInner {...props} />
    </ViewersBoundary>
  )
}
