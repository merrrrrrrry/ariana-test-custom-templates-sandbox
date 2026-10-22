import { client } from './client'
import {
  CONFIG_CACHE_BUCKET_MS,
  CONFIG_KEY,
  DEFAULT_CONFIG,
  LOCAL_CONFIG_STORAGE_KEY,
  parseConfig,
  unwrapStoredData,
  type StarCommentsConfig,
} from './starCommentsConfig'

/**
 * 운영자 설정을 읽는다.
 * - 로컬(localhost)에서는 브라우저 저장값을 먼저 쓴다 (어드민 없이 화면 확인용)
 * - 저장값이 없거나(404) 읽기에 실패하면 기본 설정 — 화면은 어드민 도입 전과 똑같이 나온다
 */
export async function loadStarCommentsConfig(): Promise<StarCommentsConfig> {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    try {
      const local = window.localStorage.getItem(LOCAL_CONFIG_STORAGE_KEY)
      if (local) return parseConfig(local)
    } catch {
      // 저장소를 못 읽어도 아래 기본 흐름으로 간다.
    }
  }
  const read = (params?: Record<string, number>) =>
    client.get<unknown>('/home/v1/custom-template-data/{displayKey}', { path: { displayKey: CONFIG_KEY }, params })
  try {
    // 게이트웨이는 같은 주소의 응답을 오래 캐시한다. 주소 끝에 1분마다 바뀌는 값(v)을 붙여
    // 어드민에서 저장한 설정이 1분 안에 팬 화면에 닿게 한다. 이 요청이 실패하면 값 없이 한 번 더 읽는다.
    const res = await read({ v: Math.floor(Date.now() / CONFIG_CACHE_BUCKET_MS) }).catch(() => read())
    return parseConfig(unwrapStoredData(res.data))
  } catch {
    return DEFAULT_CONFIG
  }
}
