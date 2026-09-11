import { createTemplate } from '@bstage-sdk/react'
import { color, textStyle } from '@bstage-sdk/design/user'

// 무지개 그라디언트 텍스트는 디자인 토큰에 없는 순수 장식 효과이므로
// <style> 태그(Shadow DOM 내부)에 직접 넣는다. 배경/타이포는 토큰 사용.
const RAINBOW_STYLE = `
@keyframes rainbow-hue {
  0% { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
}
.rainbow-text {
  /* 텍스트 전체 폭에 무지개 7색을 항상 고정 배치하고,
     hue-rotate로 색만 순환시켜 어느 순간에도 전체 스펙트럼이 보이게 한다. */
  background-image: linear-gradient(
    90deg,
    #ff0000, #ff9900, #ffee00, #33ff00, #00ffee, #0066ff, #9900ff
  );
  background-size: 100% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: rainbow-hue 4s linear infinite;
}
`

export default function ArianaTestHelloTemplate() {
  // ── 플랫폼 네비게이션 ──
  // const { navigate, goBack, openExternal } = useNavigation()
  // navigate('/profile', { userId: '123' })

  // ── PlatformBridge 직접 접근 ──
  // const { bridge } = useBstageContext()
  // bridge.emit('toast', { message: '저장 완료', variant: 'success' })

  // ── API 호출 (shared/client.ts의 인스턴스를 직접 import해 사용) ──
  // useEffect(() => {
  //   client.get('/content/v1/boards').then(res => console.log(res.data))
  // }, [])

  return (
    <div
      style={{
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        background: color.bg.base,
        minHeight: '100%',
      }}
    >
      <style>{RAINBOW_STYLE}</style>
      <h1 className="rainbow-text" style={{ ...textStyle('40/title/semibold'), margin: 0 }}>
        hello merry
      </h1>
    </div>
  )
}

createTemplate(ArianaTestHelloTemplate, {
  name: 'ariana-test-hello',
})
