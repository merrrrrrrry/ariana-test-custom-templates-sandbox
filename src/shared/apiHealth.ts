// 팬 화면이 쓰는 API의 마지막 응답 결과를 기록해 두었다가, 운영자용 ?curate=1 점검 줄에서 보여 준다.
// 팬 화면은 일부 호출이 실패해도 빈 목록으로 넘어가서(화면이 깨지지 않게) 실패가 눈에 안 띈다 — 그걸 드러내는 용도다.
// 결과는 메모리에만 두고 어디에도 보내지 않는다.

export interface ApiHealthEntry {
  name: string
  ok: boolean
  /** 오류 응답의 HTTP 상태. 네트워크 오류 등으로 알 수 없으면 null */
  status: number | null
  at: number
}

const entries = new Map<string, ApiHealthEntry>()

/** 호출 결과(성공/실패)를 기록하고, 결과는 그대로 돌려준다(실패하면 같은 오류를 다시 던진다). */
export function trackApi<T>(name: string, call: Promise<T>): Promise<T> {
  return call.then(
    (value) => {
      entries.set(name, { name, ok: true, status: null, at: Date.now() })
      return value
    },
    (err: unknown) => {
      const status = typeof err === 'object' && err !== null ? (err as { status?: number }).status : undefined
      entries.set(name, { name, ok: false, status: typeof status === 'number' ? status : null, at: Date.now() })
      throw err
    }
  )
}

export function getApiHealth(): ApiHealthEntry[] {
  return Array.from(entries.values())
}
