import { client } from './client'
import {
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
  try {
    const res = await client.get<unknown>('/home/v1/custom-template-data/{displayKey}', {
      path: { displayKey: CONFIG_KEY },
    })
    return parseConfig(unwrapStoredData(res.data))
  } catch {
    return DEFAULT_CONFIG
  }
}
