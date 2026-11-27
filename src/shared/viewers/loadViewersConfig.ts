import { client } from '../client'
import { CONFIG_CACHE_BUCKET_MS, VIEWERS_CONFIG_KEY, parseViewersConfig, unwrapStoredData, type ViewersConfig } from './viewersConfig'

/**
 * 운영자가 어드민에서 정한 뷰어 수 설정을 읽는다(팬 화면용, 로그인 불필요).
 * 저장된 값이 없거나(404) 읽기에 실패하거나 형식이 틀리면 null — 호출한 쪽이 코드에 적어 둔 기본값을 쓴다.
 */
export async function loadViewersConfig(): Promise<ViewersConfig | null> {
  const read = (params?: Record<string, number>) =>
    client.get<unknown>('/home/v1/custom-template-data/{displayKey}', { path: { displayKey: VIEWERS_CONFIG_KEY }, params })
  try {
    // 게이트웨이는 같은 주소의 응답을 오래 캐시한다. 주소 끝에 1분마다 바뀌는 값(v)을 붙여
    // 어드민에서 저장한 설정이 1분 안에 팬 화면에 닿게 한다. 이 요청이 실패하면 값 없이 한 번 더 읽는다.
    const res = await read({ v: Math.floor(Date.now() / CONFIG_CACHE_BUCKET_MS) }).catch(() => read())
    return parseViewersConfig(unwrapStoredData(res.data))
  } catch {
    return null
  }
}
