import { client } from './client'
import { CACHE_BUCKET_MS, LOCAL_PAGE_STORAGE_PREFIX, isTombstone, parseSchedulePage, scheduleKey, type SchedulePage } from './starScheduleConfig'

export type LoadResult = { state: 'ok'; page: SchedulePage } | { state: 'notfound' } | { state: 'error' }

const isNotFound = (err: unknown) => typeof err === 'object' && err !== null && (err as { status?: number }).status === 404

/**
 * 일정 페이지 한 건을 읽는다(공개 키).
 * - 로컬(localhost)에서는 브라우저 저장값을 먼저 쓴다 (어드민 없이 화면 확인용)
 * - 404면 없는 페이지, 그 밖의 실패는 오류(다시 시도)
 * 게이트웨이가 같은 주소의 응답을 오래 캐시해서, 주소 끝에 1분마다 바뀌는 값(v)을 붙인다. 이 요청이 실패하면 값 없이 한 번 더 읽는다.
 */
export async function loadSchedulePage(slug: string): Promise<LoadResult> {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    try {
      const local = window.localStorage.getItem(LOCAL_PAGE_STORAGE_PREFIX + slug)
      if (local) {
        if (isTombstone(local)) return { state: 'notfound' }
        const page = parseSchedulePage(local)
        return page ? { state: 'ok', page } : { state: 'error' }
      }
    } catch {
      // 저장소를 못 읽어도 아래 기본 흐름으로 간다.
    }
  }
  const read = (params?: Record<string, number>) =>
    client.get<unknown>('/home/v1/custom-template-data/{displayKey}', { path: { displayKey: scheduleKey(slug) }, params })
  try {
    const res = await read({ v: Math.floor(Date.now() / CACHE_BUCKET_MS) }).catch((err: unknown) => {
      if (isNotFound(err)) throw err
      return read()
    })
    if (isTombstone(res.data)) return { state: 'notfound' }
    const page: SchedulePage | null = parseSchedulePage(res.data)
    return page ? { state: 'ok', page } : { state: 'error' }
  } catch (err) {
    return isNotFound(err) ? { state: 'notfound' } : { state: 'error' }
  }
}
