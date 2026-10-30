import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BstageLocaleProvider, useLocale, useMessages } from '@bstage-sdk/react'
import { color } from '@bstage-sdk/design/user'
import { isLoggedIn } from './isLoggedIn'
import { loadSchedulePage, type LoadResult } from './loadStarSchedule'
import {
  buildIcs,
  dayFull,
  dayHeading,
  dayNumberLabel,
  eventMonthSpan,
  eventsByDay,
  filterByLabel,
  googleCalendarUrl,
  icsFileName,
  isValidSlug,
  layoutMonth,
  monthTitle,
  pageUrl,
  shiftMonth,
  timeLabel,
  toKst,
  uiLocale,
  weekdayShort,
  whenLabel,
  type ScheduleEvent,
  type SchedulePage,
  type UiLocale,
} from './starScheduleConfig'

// ────────────────────────────────────────────────────────────────────────
// 스타 일정 페이지 — 팬 화면. 기존 비스테이지 일정(목록 / 월 격자 / 월 선택 / 라벨 칩 / 상세 팝업 / 캘린더 연결)과 같은 모양.
// 크기·간격은 레퍼런스를 측정한 값(star-schedule/spec.md 4.3), 색은 디자인 토큰만 쓴다.
// ────────────────────────────────────────────────────────────────────────

const MESSAGES = {
  ko: {
    all: '전체',
    allDay: '종일',
    prev: '이전달',
    next: '다음달',
    empty: '이 달에는 일정이 없어요.',
    loading: '불러오는 중…',
    notFound: '없는 일정 페이지예요.',
    noSlug: '일정 페이지 주소가 올바르지 않아요.',
    loadError: '일정을 불러오지 못했어요.',
    retry: '다시 시도',
    loginOnly: '로그인한 팬만 볼 수 있어요.',
    checking: '확인하는 중…',
    viewGrid: '달력으로 보기',
    viewList: '목록으로 보기',
    today: '오늘로 이동',
    share: '공유',
    pickMonth: '월 선택',
    close: '닫기',
    addToCalendar: '내 캘린더에 추가',
    apple: 'Apple 캘린더에 추가',
    google: 'Google 캘린더에 추가',
    download: '캘린더 파일 다운로드',
    copied: '링크를 복사했어요.',
    copyPrompt: '링크를 복사하세요',
    openLink: '링크 열기',
    labelFilter: '라벨',
    prevYear: '이전 해',
    nextYear: '다음 해',
  },
  en: {
    all: 'All',
    allDay: 'All day',
    prev: 'Previous',
    next: 'Next',
    empty: 'No events this month.',
    loading: 'Loading…',
    notFound: 'This schedule page does not exist.',
    noSlug: 'The schedule page address is not valid.',
    loadError: 'Could not load the schedule.',
    retry: 'Try again',
    loginOnly: 'Only logged-in fans can view this.',
    checking: 'Checking…',
    viewGrid: 'Calendar view',
    viewList: 'List view',
    today: 'Go to today',
    share: 'Share',
    pickMonth: 'Select month',
    close: 'Close',
    addToCalendar: 'Add to my calendar',
    apple: 'Add to Apple Calendar',
    google: 'Add to Google Calendar',
    download: 'Download Calendar File',
    copied: 'Link copied.',
    copyPrompt: 'Copy the link',
    openLink: 'Open link',
    labelFilter: 'Labels',
    prevYear: 'Previous year',
    nextYear: 'Next year',
  },
}

type T = (key: keyof (typeof MESSAGES)['ko']) => string

const VIEW_STORAGE_KEY = 'star-schedule-view'
// 라벨 색(운영자가 고른 파스텔) 위에 올리는 글자색. 테마 토큰이 아니라 라벨 색과의 대비로 정한다(레퍼런스도 검정).
const ON_LABEL_TEXT = '#000000'
const ROW_MIN = 120
const LEVEL_PITCH = 30

const CSS = `
.ss-root { width: 100%; max-width: 704px; margin: 0 auto; box-sizing: border-box; color: ${color.text.primary}; font-family: inherit; padding-bottom: 60px; }
.ss-root *, .ss-root *::before, .ss-root *::after { box-sizing: border-box; }
:where(.ss-root) button { font-family: inherit; color: inherit; cursor: pointer; }
.ss-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px 4px; }
.ss-month { display: flex; align-items: center; gap: 4px; background: none; border: none; padding: 0; font-size: 28px; font-weight: 600; line-height: 34px; color: ${color.text.primary}; }
.ss-icons { display: flex; gap: 16px; }
.ss-icon-btn { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; border: none; border-radius: 6px; color: ${color.text.primary}; }
.ss-icon-btn:hover { background: ${color.overlay['hover-a']}; }
.ss-icon-btn[aria-pressed="true"] { background: ${color.overlay['hover-a']}; }
.ss-body { padding: 0 32px; }
.ss-chips-wrap { position: relative; margin: 16px 0 8px; }
.ss-chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-right: 36px; }
.ss-chips::-webkit-scrollbar { display: none; }
.ss-chip { flex: none; display: flex; align-items: center; gap: 8px; height: 34px; padding: 7px 12px; font-size: 13px; line-height: 18px; font-weight: 500; background: transparent; border: 0.8px solid ${color.border['default-a']}; border-radius: 120px; color: ${color.text.primary}; white-space: nowrap; }
.ss-chip[aria-pressed="true"] { border-color: ${color.text.primary}; }
.ss-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ss-chips-arrow { position: absolute; right: 0; top: 0; height: 34px; width: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: ${color.text.primary}; }
.ss-day { padding: 16px 8px; display: flex; align-items: baseline; justify-content: space-between; font-size: 16px; line-height: 24px; font-weight: 700; }
.ss-day-full { font-size: 14px; font-weight: 400; color: ${color.text.secondary}; }
.ss-card { display: flex; width: 100%; text-align: left; padding: 16px 20px; margin: 0 0 8px; background: transparent; border: 0.8px solid ${color.border['default-a']}; border-radius: 8px; flex-direction: column; gap: 4px; }
.ss-card:hover { background: ${color.overlay['hover-a']}; }
.ss-card-title { display: flex; align-items: center; gap: 8px; font-size: 16px; line-height: 24px; font-weight: 600; word-break: break-word; }
.ss-card-time { font-size: 14px; line-height: 20px; color: ${color.text.secondary}; padding-left: 0; }
.ss-card-time--dot { padding-left: 16px; }
.ss-empty { padding: 48px 8px; text-align: center; color: ${color.text.secondary}; font-size: 15px; line-height: 22px; }
.ss-bottom { margin-top: 24px; border-top: 0.8px solid ${color.border['default-a']}; padding-top: 24px; display: flex; gap: 8px; }
.ss-nav-btn { height: 40px; padding: 0 24px; font-size: 15px; line-height: 22px; font-weight: 500; background: transparent; border: 0.8px solid ${color.border['default-a']}; border-radius: 6px; color: ${color.text.primary}; }
.ss-nav-btn:disabled { color: ${color.text.tertiary}; cursor: default; }
.ss-nav-btn--next { margin-left: auto; }
.ss-wd { display: grid; grid-template-columns: repeat(7, 1fr); padding: 12px 0 8px; border-bottom: 0.8px solid ${color.border['default-a']}; }
.ss-wd span { text-align: right; padding-right: 4px; font-size: 16px; line-height: 24px; font-weight: 700; color: ${color.text.secondary}; }
.ss-week { position: relative; display: grid; grid-template-columns: repeat(7, 1fr); }
.ss-cell { padding: 4px; text-align: right; font-size: 16px; line-height: 24px; height: 100%; }
.ss-cell--weekend { color: ${color.text.secondary}; }
.ss-cell--today { background: ${color.bg['grouped-weak']}; }
.ss-seg { position: absolute; display: block; height: 24.4px; padding: 2px 4px; font-size: 13.6px; line-height: 20.4px; font-weight: 400; color: ${ON_LABEL_TEXT}; border: none; border-radius: 3px; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: clip; }
.ss-seg:hover { filter: brightness(0.88); }
.ss-seg--l { border-top-left-radius: 0; border-bottom-left-radius: 0; }
.ss-seg--r { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.ss-dim { position: fixed; inset: 0; z-index: 1000; background: ${color.overlay['press-a']}; display: flex; align-items: center; justify-content: center; }
.ss-modal { position: relative; width: 590px; max-width: calc(100vw - 32px); min-height: 360px; max-height: calc(100vh - 48px); overflow: auto; display: flex; flex-direction: column; padding: 24px; background: ${color.bg['grouped-weak']}; border-radius: 20px; }
.ss-modal-close { position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; background: none; border: none; color: ${color.text.primary}; }
.ss-modal-label { display: flex; align-items: center; gap: 8px; font-size: 14px; line-height: 20px; font-weight: 500; color: ${color.text.secondary}; margin-top: 8px; }
.ss-modal-title { font-size: 20px; line-height: 28px; font-weight: 700; margin: 8px 0 16px; padding-right: 32px; word-break: break-word; }
.ss-modal-line { border-top: 0.8px solid ${color.border['default-a']}; padding: 16px 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.ss-modal-desc { white-space: pre-wrap; font-size: 15px; line-height: 22px; font-weight: 400; color: ${color.text.primary}; word-break: break-word; border-top: 0.8px solid ${color.border['default-a']}; padding: 16px 0; }
.ss-modal-link { display: inline-block; margin-top: 4px; font-size: 15px; font-weight: 500; color: ${color.text.primary}; text-decoration: underline; word-break: break-all; }
.ss-modal-actions { margin-top: auto; padding-top: 24px; display: flex; gap: 10px; position: relative; }
.ss-share-btn { flex: none; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: transparent; border: 0.8px solid ${color.border['default-a']}; border-radius: 8px; color: ${color.text.primary}; }
.ss-primary-btn { flex: 1; height: 60px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 600; border: none; border-radius: 8px; background: ${color.surface['form-inverted']}; color: ${color.text['invert-a']}; }
.ss-menu { position: absolute; left: 70px; width: 285px; max-width: calc(100% - 70px); bottom: 70px; padding: 8px; background: ${color.surface.card}; border: 0.8px solid ${color.border['default-a']}; border-radius: 12px; display: flex; flex-direction: column; }
.ss-menu button { display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 12px; background: none; border: none; text-align: left; font-size: 15px; font-weight: 500; border-radius: 8px; color: ${color.text.primary}; }
.ss-menu button:hover { background: ${color.overlay['hover-a']}; }
.ss-picker { width: 400px; max-width: calc(100vw - 32px); padding: 24px; background: ${color.bg['grouped-weak']}; border-radius: 20px; position: relative; }
.ss-picker-year { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 16px; font-size: 18px; font-weight: 700; }
.ss-picker-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ss-picker-month { height: 44px; background: transparent; border: 1px solid transparent; border-radius: 8px; font-size: 15px; font-weight: 600; color: ${color.text.primary}; }
.ss-picker-month:disabled { color: ${color.text.tertiary}; cursor: default; }
.ss-picker-month[aria-current="true"] { border-color: ${color.text.primary}; }
.ss-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); z-index: 1100; padding: 12px 20px; border-radius: 8px; font-size: 14px; background: ${color.surface['form-inverted']}; color: ${color.text['invert-a']}; }
.ss-msg { padding: 64px 32px; text-align: center; color: ${color.text.secondary}; font-size: 15px; line-height: 22px; }
.ss-msg button { margin-top: 16px; }
@media (max-width: 600px) {
  .ss-head { padding: 12px 16px 0; }
  .ss-month { font-size: 24px; line-height: 28px; }
  .ss-body { padding: 0 16px; }
  .ss-dim { align-items: flex-end; }
  .ss-modal, .ss-picker { width: 100%; max-width: 100%; border-radius: 16px 16px 0 0; }
  .ss-modal { max-height: 90vh; min-height: 0; }
  .ss-picker { min-height: 376px; }
  .ss-menu { left: 0; width: auto; max-width: none; right: 0; }
}
`

// ── 아이콘 ──────────────────────────────────────────────────────────────

function Svg({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const IconGrid = () => (
  <Svg>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 5v15M15 5v15M4 15h16" />
  </Svg>
)
const IconToday = () => (
  <Svg>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M8 3v4M16 3v4M4 10h16" />
    <rect x="11" y="13" width="3" height="3" rx="0.5" fill="currentColor" />
  </Svg>
)
const IconShare = () => (
  <Svg>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </Svg>
)
const IconChevron = ({ dir = 'down' }: { dir?: 'down' | 'up' | 'left' | 'right' }) => {
  const d = { down: 'M6 9l6 6 6-6', up: 'M6 15l6-6 6 6', left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6' }[dir]
  return (
    <Svg size={16}>
      <path d={d} />
    </Svg>
  )
}
const IconClose = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)
const IconCalendarPlus = () => (
  <Svg>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M8 3v4M16 3v4M4 10h16M12 13v5M9.5 15.5h5" />
  </Svg>
)
const IconCalendar = () => (
  <Svg>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </Svg>
)
const IconDownload = () => (
  <Svg>
    <path d="M12 4v11M8 11l4 4 4-4" />
    <path d="M5 19h14" />
  </Svg>
)

// ── 작은 도우미 ─────────────────────────────────────────────────────────

function readStoredView(): 'list' | 'grid' {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function monthNames(locale: UiLocale): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    locale === 'ko' ? `${i + 1}월` : new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1)))
  )
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape])
}

function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="ss-msg" role="status">
      {children}
      {action}
    </div>
  )
}

// ── 월 선택 ─────────────────────────────────────────────────────────────

function MonthPicker({
  locale,
  t,
  year,
  month,
  allowed,
  onPick,
  onClose,
}: {
  locale: UiLocale
  t: T
  year: number
  month: number
  allowed: { from: number; to: number }
  onPick: (y: number, m: number) => void
  onClose: () => void
}) {
  const [shownYear, setShownYear] = useState(year)
  useEscape(onClose)
  const names = monthNames(locale)
  const idx = (y: number, m: number) => y * 12 + (m - 1)
  const minYear = Math.floor(allowed.from / 12)
  const maxYear = Math.floor(allowed.to / 12)
  return (
    <div className="ss-dim" onClick={onClose}>
      <div className="ss-picker" role="dialog" aria-modal="true" aria-label={t('pickMonth')} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ss-modal-close" onClick={onClose} aria-label={t('close')}>
          <IconClose />
        </button>
        <div className="ss-picker-year">
          <button type="button" className="ss-icon-btn" aria-label={t('prevYear')} disabled={shownYear <= minYear} onClick={() => setShownYear((y) => y - 1)}>
            <IconChevron dir="left" />
          </button>
          <span>{shownYear}</span>
          <button type="button" className="ss-icon-btn" aria-label={t('nextYear')} disabled={shownYear >= maxYear} onClick={() => setShownYear((y) => y + 1)}>
            <IconChevron dir="right" />
          </button>
        </div>
        <div className="ss-picker-grid">
          {names.map((name, i) => {
            const m = i + 1
            const ok = idx(shownYear, m) >= allowed.from && idx(shownYear, m) <= allowed.to
            return (
              <button
                key={name}
                type="button"
                className="ss-picker-month"
                disabled={!ok}
                aria-current={shownYear === year && m === month ? 'true' : undefined}
                onClick={() => {
                  onPick(shownYear, m)
                  onClose()
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── 일정 상세 팝업 ──────────────────────────────────────────────────────

function EventModal({
  locale,
  t,
  page,
  event,
  baseUrl,
  onClose,
  onShare,
}: {
  locale: UiLocale
  t: T
  page: SchedulePage
  event: ScheduleEvent
  baseUrl: string
  onClose: () => void
  onShare: (url: string, title: string) => void
}) {
  const [menu, setMenu] = useState(false)
  useEscape(onClose)
  const label = page.labels.find((l) => l.id === event.labelId) ?? null
  const url = pageUrl(baseUrl, page.slug, event.id)

  const downloadIcs = () => {
    const ics = buildIcs(event, { pageName: page.name, url })
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = icsFileName(event)
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    setMenu(false)
  }

  return (
    <div className="ss-dim" onClick={onClose}>
      <div className="ss-modal" role="dialog" aria-modal="true" aria-label={event.title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ss-modal-close" onClick={onClose} aria-label={t('close')}>
          <IconClose />
        </button>
        {label && (
          <div className="ss-modal-label">
            <span className="ss-dot" style={{ background: label.color }} />
            {label.name}
          </div>
        )}
        <div className="ss-modal-title">{event.title}</div>
        <div className="ss-modal-line">{whenLabel(locale, event)}</div>
        {(event.description || event.link) && (
          <div className="ss-modal-desc">
            {event.description}
            {event.link && (
              <div>
                <a className="ss-modal-link" href={event.link} target="_blank" rel="noopener noreferrer">
                  {t('openLink')}
                </a>
              </div>
            )}
          </div>
        )}
        <div className="ss-modal-actions">
          <button type="button" className="ss-share-btn" aria-label={t('share')} onClick={() => onShare(url, event.title)}>
            <IconShare />
          </button>
          <button type="button" className="ss-primary-btn" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <IconCalendarPlus />
            {t('addToCalendar')}
          </button>
          {menu && (
            <div className="ss-menu" role="menu">
              <button type="button" role="menuitem" onClick={downloadIcs}>
                <IconCalendar />
                {t('apple')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  window.open(googleCalendarUrl(event, { url }), '_blank', 'noopener,noreferrer')
                  setMenu(false)
                }}
              >
                <IconCalendar />
                {t('google')}
              </button>
              <button type="button" role="menuitem" onClick={downloadIcs}>
                <IconDownload />
                {t('download')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 본문 ────────────────────────────────────────────────────────────────

function ScheduleBody() {
  const { current } = useLocale()
  const locale = uiLocale(current)
  const t: T = useMessages(MESSAGES)

  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const slug = params.get('p')
  const today = useMemo(() => toKst(new Date().toISOString()), [])

  const [ym, setYm] = useState(() => {
    const y = Number(params.get('y'))
    const m = Number(params.get('m'))
    return Number.isInteger(y) && y >= 2000 && y <= 2100 && Number.isInteger(m) && m >= 1 && m <= 12 ? { y, m } : { y: today.y, m: today.m }
  })
  const [result, setResult] = useState<LoadResult | null>(null)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [view, setView] = useState<'list' | 'grid'>(readStoredView)
  const [labelId, setLabelId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(params.get('e'))
  const [toast, setToast] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const deepHandled = useRef(false)
  const chipsRef = useRef<HTMLDivElement | null>(null)

  // 일정 페이지를 읽는다. 일정 링크(?e=)로 들어왔으면 읽은 직후 그 달로 가서 상세 팝업을 연다.
  useEffect(() => {
    if (!slug || !isValidSlug(slug)) return
    let alive = true
    loadSchedulePage(slug).then((r) => {
      if (!alive) return
      setResult(r)
      if (r.state !== 'ok' || deepHandled.current) return
      deepHandled.current = true
      const id = params.get('e')
      if (!id) return
      const ev = r.page.events.find((e) => e.id === id)
      if (!ev) setOpenId(null)
      else if (!params.get('y') || !params.get('m')) {
        const k = toKst(ev.startAt)
        setYm({ y: k.y, m: k.m })
      }
    })
    return () => {
      alive = false
    }
  }, [slug, attempt, params])

  const retry = useCallback(() => {
    setResult(null)
    setAttempt((n) => n + 1)
  }, [])

  const page = result?.state === 'ok' ? result.page : null
  const gated = page !== null && page.visibility === 'login'

  // 로그인 전용 페이지: 로그인 여부 확인. 확인할 수 없으면 로그인 안 한 것으로 본다(막는 쪽).
  useEffect(() => {
    if (!gated) return
    let alive = true
    const check = () => {
      isLoggedIn().then((v) => alive && setLoggedIn(v))
    }
    check()
    // 다른 탭에서 로그인하고 돌아오면 다시 확인한다.
    window.addEventListener('focus', check)
    return () => {
      alive = false
      window.removeEventListener('focus', check)
    }
  }, [gated])

  const canShow = page !== null && (!gated || loggedIn === true)

  // 주소를 현재 상태와 맞춰 둔다(공유, 새로고침)
  useEffect(() => {
    if (!slug) return
    const q = new URLSearchParams({ p: slug, y: String(ym.y), m: String(ym.m) })
    if (openId) q.set('e', openId)
    try {
      window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`)
    } catch {
      // 주소를 못 바꿔도 화면에는 영향이 없다.
    }
  }, [slug, ym, openId])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(id)
  }, [toast])

  const baseUrl = `${window.location.origin}${window.location.pathname}`

  const share = useCallback(
    async (url: string, title: string) => {
      const nav = navigator as Navigator & { share?: (data: { title?: string; url?: string }) => Promise<void> }
      if (typeof nav.share === 'function') {
        try {
          await nav.share({ title, url })
          return
        } catch (err) {
          if ((err as { name?: string }).name === 'AbortError') return
        }
      }
      try {
        await navigator.clipboard.writeText(url)
        setToast(t('copied'))
      } catch {
        window.prompt(t('copyPrompt'), url)
      }
    },
    [t]
  )

  const setViewMode = (next: 'list' | 'grid') => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // 기억하지 못해도 화면은 바뀐다.
    }
  }

  const events = useMemo(() => (page ? filterByLabel(page.events, labelId) : []), [page, labelId])
  const span = useMemo(() => (page ? eventMonthSpan(page.events) : null), [page])
  const idx = (y: number, m: number) => y * 12 + (m - 1)
  // 이전달은 일정이 있는 첫 달까지만, 월 선택은 [첫 일정 달, 마지막 일정 달과 다음 달 중 늦은 쪽]까지(레퍼런스에서 읽은 규칙을 추정해 적용)
  const allowed = useMemo(() => {
    const cur = idx(today.y, today.m)
    const first = span ? idx(span.first.y, span.first.m) : cur
    const last = span ? idx(span.last.y, span.last.m) : cur
    return { from: first, to: Math.max(last, cur + 1) }
  }, [span, today])

  const layout = useMemo(() => layoutMonth(ym.y, ym.m, events), [ym, events])
  const byDay = useMemo(() => eventsByDay(ym.y, ym.m, events), [ym, events])
  const rowHeight = Math.max(ROW_MIN, 31 + layout.maxLevels * LEVEL_PITCH)
  const opened = page && openId ? page.events.find((e) => e.id === openId) ?? null : null

  if (!slug || !isValidSlug(slug)) return <Notice>{t('noSlug')}</Notice>
  if (result === null) return <Notice>{t('loading')}</Notice>
  if (result.state === 'notfound') return <Notice>{t('notFound')}</Notice>
  if (result.state === 'error')
    return (
      <Notice
        action={
          <div>
            <button type="button" className="ss-nav-btn" onClick={retry}>
              {t('retry')}
            </button>
          </div>
        }
      >
        {t('loadError')}
      </Notice>
    )
  if (gated && loggedIn === null) return <Notice>{t('checking')}</Notice>
  if (!canShow || !page) return <Notice>{t('loginOnly')}</Notice>

  const goMonth = (delta: number) => setYm((cur) => shiftMonth(cur.y, cur.m, delta))
  const prevDisabled = idx(ym.y, ym.m) <= allowed.from
  const dayNum = (key: string) => Number(key.slice(8))

  const renderListEvent = (ev: ScheduleEvent) => {
    const label = page.labels.find((l) => l.id === ev.labelId)
    return (
      <button key={ev.id} type="button" className="ss-card" onClick={() => setOpenId(ev.id)}>
        <span className="ss-card-title">
          {label && <span className="ss-dot" style={{ background: label.color }} />}
          {ev.title}
        </span>
        <span className={label ? 'ss-card-time ss-card-time--dot' : 'ss-card-time'}>{ev.allDay ? t('allDay') : timeLabel(locale, ev.startAt)}</span>
      </button>
    )
  }

  return (
    <div className="ss-root">
      <style>{CSS}</style>

      <div className="ss-head">
        <button type="button" className="ss-month" aria-haspopup="dialog" aria-label={t('pickMonth')} onClick={() => setPickerOpen(true)}>
          {monthTitle(locale, ym.y, ym.m)}
          <IconChevron dir={pickerOpen ? 'up' : 'down'} />
        </button>
        <div className="ss-icons">
          <button
            type="button"
            className="ss-icon-btn"
            aria-pressed={view === 'grid'}
            aria-label={view === 'grid' ? t('viewList') : t('viewGrid')}
            onClick={() => setViewMode(view === 'grid' ? 'list' : 'grid')}
          >
            <IconGrid />
          </button>
          <button type="button" className="ss-icon-btn" aria-label={t('today')} onClick={() => setYm({ y: today.y, m: today.m })}>
            <IconToday />
          </button>
          <button type="button" className="ss-icon-btn" aria-label={t('share')} onClick={() => share(pageUrl(baseUrl, page.slug), page.name)}>
            <IconShare />
          </button>
        </div>
      </div>

      <div className="ss-body">
        {page.labels.length > 0 && (
          <div className="ss-chips-wrap">
            <div className="ss-chips" ref={chipsRef} role="group" aria-label={t('labelFilter')}>
              <button type="button" className="ss-chip" aria-pressed={labelId === null} onClick={() => setLabelId(null)}>
                {t('all')}
              </button>
              {page.labels.map((l) => (
                <button key={l.id} type="button" className="ss-chip" aria-pressed={labelId === l.id} onClick={() => setLabelId(l.id)}>
                  <span className="ss-dot" style={{ background: l.color }} />
                  {l.name}
                </button>
              ))}
            </div>
            <button type="button" className="ss-chips-arrow" aria-label={t('next')} onClick={() => chipsRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}>
              <IconChevron dir="right" />
            </button>
          </div>
        )}

        {view === 'list' ? (
          byDay.size === 0 ? (
            <div className="ss-empty">{t('empty')}</div>
          ) : (
            [...byDay.entries()].map(([key, list]) => {
              const d = dayNum(key)
              const dow = new Date(Date.UTC(ym.y, ym.m - 1, d)).getUTCDay()
              return (
                <section key={key}>
                  <div className="ss-day">
                    <span>{dayHeading(locale, d, dow)}</span>
                    <span className="ss-day-full">{dayFull(locale, ym.y, ym.m, d)}</span>
                  </div>
                  {list.map(renderListEvent)}
                </section>
              )
            })
          )
        ) : (
          <div>
            <div className="ss-wd">
              {Array.from({ length: 7 }, (_, c) => (
                <span key={c}>{weekdayShort(locale, c)}</span>
              ))}
            </div>
            {layout.weeks.map((week, wi) => (
              <div key={wi} className="ss-week" style={{ height: rowHeight }}>
                {week.cells.map((cell, ci) => {
                  const isToday = cell.day !== null && ym.y === today.y && ym.m === today.m && cell.day === today.d
                  const cls = ['ss-cell', cell.dow === 0 || cell.dow === 6 ? 'ss-cell--weekend' : '', isToday ? 'ss-cell--today' : ''].filter(Boolean).join(' ')
                  return (
                    <div key={ci} className={cls} data-day={cell.key ?? undefined}>
                      {cell.day !== null && (
                        <>
                          {isToday && <span aria-hidden="true">• </span>}
                          {dayNumberLabel(locale, cell.day)}
                        </>
                      )}
                    </div>
                  )
                })}
                {week.segments.map((s) => {
                  const label = page.labels.find((l) => l.id === s.event.labelId)
                  const cls = ['ss-seg', s.continuesLeft ? 'ss-seg--l' : '', s.continuesRight ? 'ss-seg--r' : ''].filter(Boolean).join(' ')
                  return (
                    <button
                      key={`${s.event.id}-${s.startCol}`}
                      type="button"
                      className={cls}
                      title={s.event.title}
                      style={{
                        top: 26 + s.level * LEVEL_PITCH,
                        left: `calc(${(s.startCol / 7) * 100}% + ${s.continuesLeft ? 0 : 2}px)`,
                        width: `calc(${((s.endCol - s.startCol + 1) / 7) * 100}% - ${(s.continuesLeft ? 0 : 2) + (s.continuesRight ? 0 : 2)}px)`,
                        background: label?.color ?? color.surface.card,
                        color: label ? ON_LABEL_TEXT : color.text.primary,
                      }}
                      onClick={() => setOpenId(s.event.id)}
                    >
                      {s.event.title}
                    </button>
                  )
                })}
              </div>
            ))}
            {layout.maxLevels === 0 && <div className="ss-empty">{t('empty')}</div>}
          </div>
        )}

        <div className="ss-bottom">
          <button type="button" className="ss-nav-btn" disabled={prevDisabled} onClick={() => goMonth(-1)}>
            {t('prev')}
          </button>
          <button type="button" className="ss-nav-btn ss-nav-btn--next" onClick={() => goMonth(1)}>
            {t('next')}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <MonthPicker
          locale={locale}
          t={t}
          year={ym.y}
          month={ym.m}
          allowed={allowed}
          onPick={(y, m) => setYm({ y, m })}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {opened && <EventModal locale={locale} t={t} page={page} event={opened} baseUrl={baseUrl} onClose={() => setOpenId(null)} onShare={share} />}
      {toast && (
        <div className="ss-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

export default function StarSchedule() {
  return (
    <BstageLocaleProvider>
      <ScheduleBody />
    </BstageLocaleProvider>
  )
}
