import { useEffect, useState } from 'react'
import { color, textStyle } from '@bstage-sdk/design/user'
import { client } from '../client'
import {
  VIEWERS_SERVER_URL,
  VIEWERS_SPACE_ID,
  createViewersApi,
  nextDelay,
  normalizeServerUrl,
  resolveFetch,
  type ViewerStats,
} from './viewersApi'

// "지금 N명이 보는 중" 카드. 어느 페이지에든 <ViewersBadge page="/경로" />로 붙인다.
// - 로그인한 팬: 15초마다 하트비트(= 보는 사람으로 집계) + 현재 수를 받는다.
// - 로그인 안 한 팬: 수만 읽고(집계되지 않음), 로그인 안내를 보여 준다.
// - 서버가 안 되거나 주소가 비어 있어도 화면은 깨지지 않는다(안내 문구만).

type Status = 'unconfigured' | 'loading' | 'ok' | 'error'

// 로그인한 팬의 id. 로그인 안 했거나 호출이 실패하면 null(= 집계하지 않음). 서버는 원문을 저장하지 않고 해시한다.
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
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    if (!serverUrl) return
    const api = createViewersApi({ serverUrl, spaceId: VIEWERS_SPACE_ID, fetchFn: resolveFetch() })
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let memberId: string | null = null
    let failures = 0

    // 요청은 한 번에 하나씩만 보낸다(RATE_LIMITED 방지). 탭이 숨겨져 있으면 이번 신호는 건너뛴다.
    const tick = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timer = setTimeout(tick, nextDelay(failures))
        return
      }
      try {
        const next = memberId ? await api.heartbeat(page, memberId) : await api.read(page)
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
      memberId = id
      setLoggedIn(id !== null)
      void tick()
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      // 페이지를 떠나면 바로 '보는 중'에서 뺀다(실패해도 45초 뒤에는 자동으로 빠진다).
      if (memberId) void api.leave(page, memberId).catch(() => undefined)
    }
  }, [page, serverUrl])

  return { stats, status, loggedIn }
}

// quiet: 팬이 보는 화면(홈 등)용. 아직 값을 한 번도 못 받았으면 아무것도 그리지 않고(자리도 차지하지 않음),
// 받은 뒤 일시적으로 실패해도 오류 문구 없이 마지막 값을 그대로 보여 준다. 운영 확인용 안내는 일반 모드에서만 보인다.
// margin: 카드 바깥 여백. 래퍼 div에 padding을 주면 카드가 안 그려질 때도 자리를 차지하므로 카드 자체의 margin으로 받는다.
export default function ViewersBadge({
  page,
  quiet = false,
  margin,
}: {
  page: string
  quiet?: boolean
  margin?: string
}) {
  const { stats, status, loggedIn } = useViewers(page)

  if (quiet && !stats) return null

  let note: string | null = null
  if (status === 'unconfigured') note = '뷰어 수 서버 주소가 아직 설정되지 않았어요.'
  else if (status === 'error') {
    if (!quiet) note = stats ? '최신 값을 불러오지 못했어요. 다시 시도하는 중이에요.' : '뷰어 수를 불러오지 못했어요.'
  } else if (status === 'ok' && loggedIn === false) note = '로그인하면 보는 사람으로 집계돼요.'

  return (
    <div
      style={{
        background: color.surface.card,
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
        {stats ? `${stats.watching.toLocaleString('ko-KR')}명이 보는 중` : status === 'loading' ? '불러오는 중…' : '—'}
      </div>
      {stats && (
        <div style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>
          지금까지 {stats.totalViewers.toLocaleString('ko-KR')}명이 다녀갔어요
        </div>
      )}
      {note && <div style={{ ...textStyle('12/caption/reg'), color: color.text.tertiary }}>{note}</div>}
    </div>
  )
}
