import {
  CameraControls,
  CameraControlsImpl,
  useTexture,
} from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three'
import HeatmapLayer from '../heatmap/HeatmapLayer'
import type {
  GeographicHover,
  HeatmapLayerState,
  ViewLayer,
} from '../heatmap/types'
import type { Corridor, Mode } from '../lib/types'
import {
  anchorToVector,
  CorridorCurve,
  EARTH_RADIUS,
  magnitudeScale,
} from './geometry'
import { atmosphereFragment, earthFragment, earthVertex } from './shaders'

export interface SceneProps {
  viewLayer?: ViewLayer
  heatmap?: HeatmapLayerState
  onGeographicHover?: (hover: GeographicHover | null) => void
  routes: Corridor[]
  mode: Mode
  selected: string | null
  motion: boolean
  lowPower: boolean
  reset: number
  onSelect: (id: string) => void
  onHover: (route: Corridor | null, x?: number, y?: number) => void
  onReady: () => void
}

function Earth({ onReady, onHover }: Pick<SceneProps, 'onReady' | 'onHover'>) {
  const textures = useTexture(
    ['/textures/earth-day.jpg', '/textures/earth-night.jpg'],
    (loaded) => {
      for (const texture of loaded as import('three').Texture[]) {
        texture.colorSpace = SRGBColorSpace
        texture.anisotropy = 4
      }
    },
  )
  const uniforms = useMemo(
    () => ({
      dayMap: { value: textures[0] },
      nightMap: { value: textures[1] },
      sunDirection: { value: new Vector3(-0.5, 0.6, 1).normalize() },
    }),
    [textures],
  )
  useEffect(() => {
    onReady()
  }, [onReady])
  return (
    <>
      <mesh
        onPointerMove={(event) => {
          event.stopPropagation()
          onHover(null)
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <sphereGeometry args={[EARTH_RADIUS, 96, 64]} />
        <shaderMaterial
          vertexShader={earthVertex}
          fragmentShader={earthFragment}
          uniforms={uniforms}
        />
      </mesh>
      <mesh scale={1.022} raycast={() => null}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 48]} />
        <shaderMaterial
          vertexShader={earthVertex}
          fragmentShader={atmosphereFragment}
          transparent
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

const Route = memo(function Route({
  route,
  maximum,
  active,
  selected,
  onSelect,
  onHover,
}: {
  route: Corridor
  maximum: number
  active: boolean
  selected: boolean
} & Pick<SceneProps, 'onSelect' | 'onHover'>) {
  const material = useRef<import('three').MeshBasicMaterial>(null)
  const glow = useRef<import('three').MeshBasicMaterial>(null)
  const strength = magnitudeScale(route.value, maximum)
  const curve = useMemo(
    () => new CorridorCurve(route.origin.anchor!, route.destination.anchor!),
    [route],
  )
  const geometry = useMemo(
    () => new TubeGeometry(curve, 64, 0.0025 + strength * 0.004, 5, false),
    [curve, strength],
  )
  const hitGeometry = useMemo(
    () => new TubeGeometry(curve, 32, 0.021, 3, false),
    [curve],
  )
  const glowGeometry = useMemo(
    () =>
      new TubeGeometry(curve, 64, (0.0025 + strength * 0.004) * 2.7, 5, false),
    [curve, strength],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      hitGeometry.dispose()
      glowGeometry.dispose()
    },
    [geometry, hitGeometry, glowGeometry],
  )
  const invalidate = useThree((state) => state.invalidate)
  const opacity = useRef(0)
  useFrame((_, delta) => {
    const target = active ? 1 : 0
    opacity.current = active
      ? Math.min(1, opacity.current + Math.min(delta, 0.05) * 2.3)
      : Math.max(0, opacity.current - Math.min(delta, 0.05) * 2.3)
    if (material.current)
      material.current.opacity = opacity.current * (selected ? 1 : 0.72)
    if (glow.current)
      glow.current.opacity = opacity.current * (selected ? 0.35 : 0.09)
    if (opacity.current !== target) invalidate()
  })
  const color = selected ? '#efc779' : '#4bc8ff'
  const hover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    onHover(route, event.clientX, event.clientY)
  }
  return (
    <group>
      <mesh
        geometry={geometry}
        raycast={active ? Mesh.prototype.raycast : () => null}
        onPointerOver={hover}
        onPointerMove={hover}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(route.id)
        }}
      >
        <meshBasicMaterial
          ref={material}
          color={color}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={glowGeometry} raycast={() => null}>
        <meshBasicMaterial
          ref={glow}
          color={color}
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Wider invisible hit geometry makes narrow arcs usable without inflating their visual weight. */}
      <mesh
        geometry={hitGeometry}
        raycast={active ? Mesh.prototype.raycast : () => null}
        onPointerOver={hover}
        onPointerMove={hover}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(route.id)
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
})

function Particles({
  routes,
  motion,
  selected,
}: Pick<SceneProps, 'routes' | 'motion' | 'selected'>) {
  const mesh = useRef<InstancedMesh>(null)
  const phase = useRef(0)
  const dummy = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])
  const curves = useMemo(
    () =>
      routes.map(
        (route) =>
          new CorridorCurve(route.origin.anchor!, route.destination.anchor!),
      ),
    [routes],
  )
  useFrame((_, delta) => {
    if (!mesh.current) return
    if (motion) phase.current += Math.min(delta, 0.05) * 0.12
    curves.forEach((curve, index) => {
      for (let particle = 0; particle < 2; particle++) {
        const t = (phase.current + index * 0.137 + particle * 0.5) % 1
        dummy.position.copy(curve.getPoint(t))
        dummy.scale.setScalar(selected === routes[index].id ? 1.5 : 1)
        dummy.updateMatrix()
        mesh.current!.setMatrixAt(index * 2 + particle, dummy.matrix)
        color.set(selected === routes[index].id ? '#ffe2a0' : '#a5edff')
        mesh.current!.setColorAt(index * 2 + particle, color)
      }
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true
  })
  if (!routes.length) return null
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, routes.length * 2]}
      frustumCulled={false}
      raycast={() => null}
    >
      <sphereGeometry args={[0.009, 6, 4]} />
      <meshBasicMaterial color="white" toneMapped={false} />
    </instancedMesh>
  )
}

export default function EarthScene(props: SceneProps) {
  const { mode, motion, lowPower, routes, reset, selected } = props
  const controls = useRef<CameraControlsImpl>(null)
  const dragging = useRef(false)
  const world = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const maximum = Math.max(1, ...routes.map((r) => r.value))
  useEffect(() => {
    if (world.current) world.current.rotation.y = 0
    const point = anchorToVector(
      mode === 'us'
        ? { latitude: 38, longitude: -100 }
        : { latitude: 24, longitude: -25 },
      mode === 'us' ? 5.6 : 6.6,
    )
    void controls.current?.setLookAt(point.x, point.y, point.z, 0, 0, 0, true)
  }, [mode, reset])
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const schedule = () => {
      clearInterval(timer)
      if (!document.hidden && motion)
        timer = setInterval(invalidate, 1000 / (lowPower ? 15 : 30))
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [invalidate, lowPower, motion])
  useFrame((_, delta) => {
    if (motion && !dragging.current && world.current)
      world.current.rotation.y += Math.min(delta, 0.05) * 0.035
  })
  return (
    <>
      <group ref={world}>
        <Earth onReady={props.onReady} onHover={props.onHover} />
        {props.heatmap && (
          <HeatmapLayer
            state={props.heatmap}
            lowPower={lowPower}
            onHover={props.onGeographicHover ?? (() => {})}
          />
        )}
        {routes.map((route) => (
          <Route
            key={`${route.id}:${route.year_end}:${route.measure}`}
            route={route}
            active={props.viewLayer !== 'heatmap'}
            maximum={maximum}
            selected={selected === route.id}
            onSelect={props.onSelect}
            onHover={props.onHover}
          />
        ))}
        <group visible={props.viewLayer !== 'heatmap'}>
          <Particles routes={routes} motion={motion} selected={selected} />
        </group>
      </group>
      <CameraControls
        ref={controls}
        makeDefault
        minDistance={2.75}
        maxDistance={10}
        smoothTime={0.65}
        draggingSmoothTime={0.12}
        dollySpeed={0.65}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI - 0.15}
        mouseButtons={{
          left: CameraControlsImpl.ACTION.ROTATE,
          middle: CameraControlsImpl.ACTION.DOLLY,
          right: CameraControlsImpl.ACTION.NONE,
          wheel: CameraControlsImpl.ACTION.DOLLY,
        }}
        touches={{
          one: CameraControlsImpl.ACTION.TOUCH_ROTATE,
          two: CameraControlsImpl.ACTION.TOUCH_DOLLY,
          three: CameraControlsImpl.ACTION.NONE,
        }}
        onStart={() => {
          dragging.current = true
          props.onHover(null)
          props.onGeographicHover?.(null)
        }}
        onEnd={() => {
          dragging.current = false
        }}
      />
    </>
  )
}
