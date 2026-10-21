import { Canvas } from '@react-three/fiber'
import {
  Component,
  Suspense,
  useCallback,
  useState,
  type ReactNode,
} from 'react'
import { ACESFilmicToneMapping } from 'three'
import EarthScene, { type SceneProps } from './EarthScene'

class RenderBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="globe-fallback" role="status">
        The 3D view needs WebGL. You can still explore the corridor list and
        filters.
      </div>
    ) : (
      this.props.children
    )
  }
}

export default function GlobeViewport(props: Omit<SceneProps, 'onReady'>) {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  return (
    <div
      className="globe-viewport"
      aria-label="Interactive Earth"
      data-ready={ready}
      data-layer={props.viewLayer ?? 'arcs'}
      data-heatmap-ready={!!props.heatmap}
    >
      <RenderBoundary>
        <Canvas
          camera={{ position: [5.5, 2.7, 2.5], fov: 43, near: 0.1, far: 50 }}
          frameloop="demand"
          dpr={props.lowPower ? 1 : [1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'low-power',
            toneMapping: ACESFilmicToneMapping,
          }}
          fallback={
            <div className="globe-fallback">
              WebGL is unavailable. Explore the corridor list below.
            </div>
          }
        >
          <Suspense fallback={null}>
            <EarthScene {...props} onReady={onReady} />
          </Suspense>
        </Canvas>
      </RenderBoundary>
      {!ready && (
        <div className="earth-loading" role="status">
          <span className="loading-orbit" />
          Preparing Earth imagery
        </div>
      )}
    </div>
  )
}
