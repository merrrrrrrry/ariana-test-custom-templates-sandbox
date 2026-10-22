import { client } from './client'

// 로그인한 팬인지 확인한다. GET /account/v1/users 는 "현재 로그인한 유저의 정보"를 돌려주고,
// 로그인하지 않았거나 호출이 실패하면 오류가 난다. 확인할 수 없으면 로그인 안 한 것으로 본다(막는 쪽).
export async function isLoggedIn(): Promise<boolean> {
  try {
    const res = await client.get<{ id?: string }>('/account/v1/users')
    return Boolean(res.data?.id)
  } catch {
    return false
  }
}
