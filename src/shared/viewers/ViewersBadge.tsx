import { Component, useEffect, useState, type ReactNode } from 'react'
import { color, textStyle } from '@bstage-sdk/design/user'
import { client } from '../client'
import {
  VIEWERS_SERVER_URL,
  VIEWERS_SPACE_ID,
  browserStorage,
  createViewersApi,
  getOrCreateGuestId,
  nextDelay,
  normalizeServerUrl,
  resolveFetch,
  type ViewerStats,
} from './viewersApi'

// "지금 N명이 보는 중". 어느 페이지에든 <ViewersBadge page="/경로" />로 붙인다.
// - 로그인한 팬: 회원 id로 15초마다 하트비트(= 보는 사람으로 집계) + 현재 수를 받는다.
// - 로그인 안 한 방문자: 브라우저에 저장해 둔 임의의 방문자 id(guest-…)로 똑같이 집계한다.
//   브라우저를 바꾸거나 시크릿 창으로 열면 다른 사람으로 센다. 저장소를 못 쓰면 집계하지 않고 수만 읽는다.
// - 서버가 안 되거나 주소가 비어 있어도 화면은 깨지지 않는다(안내 문구만, quiet이면 아예 안 그림).

type Status = 'unconfigured' | 'loading' | 'ok' | 'error'

// 로그인한 팬의 id. 로그인 안 했거나 호출이 실패하면 null(→ 방문자 id로 대신). 서버는 원문을 저장하지 않고 해시한다.
async function loadMemberId(): Promise<string | null> {
  try {
    const res = await client.get<{ id?: string }>('/account/v1/users')
    return res.data?.id ?? null
  } catch {
    return null
  }
}

function useViewers(page: string) {
  const serverUrl = normalizeServerUrl(VIEWERS_SERVER_URL)
  const [stats, setStats] = useState<ViewerStats | null>(null)
  const [status, setStatus] = useState<Status>(serverUrl ? 'loading' : 'unconfigured')

  useEffect(() => {
    if (!serverUrl) return
    const api = createViewersApi({ serverUrl, spaceId: VIEWERS_SPACE_ID, fetchFn: resolveFetch() })
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // 집계에 쓰는 id: 로그인한 팬이면 회원 id, 아니면 방문자 id. 둘 다 없으면 null(수만 읽는다).
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

    void loadMemberId().then((id) => {
      if (cancelled) return
      viewerId = id ?? getOrCreateGuestId(browserStorage())
      void tick()
    })

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
  /** 바깥 여백. 래퍼 div에 padding을 주면 안 그려질 때도 자리를 차지하므로 본체의 margin으로 받는다. */
  margin?: string
}

function ViewersBadgeInner({ page, variant = 'card', quiet = false, margin }: ViewersBadgeProps) {
  const { stats, status } = useViewers(page)

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
      <div
        style={{
          background,
          borderRadius: 12,
          padding: '8px 12px',
          margin,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '2px 8px',
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: '50%', background: color.icon.green, flex: 'none' }}
        />
        <span style={{ ...textStyle('13/body/semibold'), color: color.text.primary }}>
          {stats ? `지금 ${watching}명이 보는 중` : status === 'loading' ? '불러오는 중…' : '—'}
        </span>
        {stats && (
          <>
            <span aria-hidden="true" style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>
              ·
            </span>
            <span style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>
              지금까지 {total}명이 다녀갔어요
            </span>
          </>
        )}
        {note && <span style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>{note}</span>}
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
