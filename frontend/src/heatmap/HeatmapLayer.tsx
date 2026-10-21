import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  CanvasTexture,
  Mesh,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { EARTH_RADIUS } from '../globe/geometry'
import { earthVertex } from '../globe/shaders'
import { heatColor, pickPolygon, preparePolygons } from './geography'
import type { GeographicHover, HeatmapLayerState } from './types'

const fragment = `
  uniform sampler2D heatMap;
  uniform float heatOpacity;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 overlay = texture2D(heatMap, vUv);
    float daylight = smoothstep(-0.15, 0.22, dot(normalize(vNormal), sunDirection));
    gl_FragColor = vec4(overlay.rgb * (0.38 + 0.62 * daylight), overlay.a * heatOpacity);
    #include <colorspace_fragment>
  }
`

/** Imperative Three.js upload, intentionally separate from React-owned state. */
function uploadCanvas(texture: CanvasTexture) {
  texture.needsUpdate = true
}

export default function HeatmapLayer({
  state,
  lowPower,
  onHover,
}: {
  state: HeatmapLayerState
  lowPower: boolean
  onHover: (hover: GeographicHover | null) => void
}) {
  const { boundaries, page, cutoff, showUnavailable, active, opacity } = state
  const mobile = useThree((s) => s.size.width <= 760)
  const width = lowPower || mobile ? 1024 : 2048
  const material = useRef<ShaderMaterial>(null)
  const currentOpacity = useRef(0)
  const invalidate = useThree((s) => s.invalidate)
  const polygons = useMemo(
    () => preparePolygons(boundaries.features),
    [boundaries],
  )
  // Geometry paths are cached across data, opacity, and legend changes.
  const paths = useMemo(
    () =>
      polygons.map((polygon) => ({
        id: polygon.id,
        paths: [-1, 0, 1]
          .filter(
            (offset) =>
              polygon.bounds[2] + offset >= 0 &&
              polygon.bounds[0] + offset <= 1,
          )
          .map((offset) => {
            const path = new Path2D()
            for (const ring of polygon.rings) {
              ring.forEach(([x, y], index) => {
                if (index === 0)
                  path.moveTo((x + offset) * width, (y * width) / 2)
                else path.lineTo((x + offset) * width, (y * width) / 2)
              })
              path.closePath()
            }
            return path
          }),
      })),
    [polygons, width],
  )
  // Reuse one GPU texture per resolution; slider changes repaint instead of allocating textures.
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = width / 2
    const output = new CanvasTexture(canvas)
    output.colorSpace = SRGBColorSpace
    return output
  }, [width])
  const uniforms = useMemo(
    () => ({
      heatMap: { value: texture },
      heatOpacity: { value: 0 },
      // Matches the existing illustrative Earth lighting, including group rotation.
      sunDirection: { value: new Vector3(-0.5, 0.6, 1).normalize() },
    }),
    [texture],
  )
  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement
    const context = canvas.getContext('2d')!
    context.clearRect(0, 0, canvas.width, canvas.height)
    const values = new Map(page.items.map((row) => [row.id, row]))
    const tile = document.createElement('canvas')
    tile.width = 8
    tile.height = 8
    const hatch = tile.getContext('2d')!
    hatch.strokeStyle = 'rgba(200,210,220,0.5)'
    hatch.lineWidth = 1
    hatch.beginPath()
    hatch.moveTo(0, 8)
    hatch.lineTo(8, 0)
    hatch.stroke()
    const pattern = context.createPattern(tile, 'repeat')!
    for (const polygon of paths) {
      const row = values.get(polygon.id),
        value = row?.value ?? null
      if (value === null && !showUnavailable) continue
      for (const path of polygon.paths) {
        context.globalAlpha = value !== null && value < cutoff ? 0.12 : 1
        context.fillStyle =
          value === null ? '#738295' : heatColor(value, page.max_value)
        context.fill(path, 'evenodd')
        if (value === null || row?.status === 'partial') {
          context.fillStyle = pattern
          context.fill(path, 'evenodd')
        }
        context.strokeStyle = 'rgba(180,215,234,0.4)'
        context.lineWidth = 0.55
        context.stroke(path)
      }
    }
    uploadCanvas(texture)
    invalidate()
  }, [texture, paths, page, cutoff, showUnavailable, invalidate])
  useEffect(() => () => texture.dispose(), [texture])
  useFrame((_, delta) => {
    if (!material.current) return
    const target = active ? opacity : 0,
      step = Math.min(delta, 0.05) * 2
    const current = currentOpacity.current
    currentOpacity.current =
      current < target
        ? Math.min(target, current + step)
        : Math.max(target, current - step)
    material.current.uniforms.heatOpacity.value = currentOpacity.current
    if (Math.abs(currentOpacity.current - target) > 0.001) invalidate()
  })
  const hover = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!active || !event.uv) return
    event.stopPropagation()
    const region = pickPolygon(
      polygons,
      event.uv.x * 360 - 180,
      event.uv.y * 180 - 90,
    )
    onHover(
      region
        ? {
            id: region.id,
            name: region.name,
            x: event.clientX,
            y: event.clientY,
          }
        : null,
    )
  }
  return (
    <mesh
      raycast={active ? Mesh.prototype.raycast : () => null}
      onPointerOver={hover}
      onPointerMove={hover}
      onPointerOut={() => onHover(null)}
      onClick={(event) => {
        if (active) hover(event)
      }}
    >
      <sphereGeometry args={[EARTH_RADIUS + 0.004, 96, 64]} />
      <shaderMaterial
        ref={material}
        vertexShader={earthVertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
