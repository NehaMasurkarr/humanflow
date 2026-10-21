import { Curve, Vector3 } from 'three'
import type { Anchor } from '../lib/types'

export const EARTH_RADIUS = 2

/** Matches Three SphereGeometry's equirectangular UVs: Greenwich is +X, east is -Z. */
export function anchorToVector(
  anchor: Pick<Anchor, 'latitude' | 'longitude'>,
  radius = EARTH_RADIUS,
) {
  const latitude = (anchor.latitude * Math.PI) / 180
  const longitude = (anchor.longitude * Math.PI) / 180
  return new Vector3(
    radius * Math.cos(latitude) * Math.cos(longitude),
    radius * Math.sin(latitude),
    -radius * Math.cos(latitude) * Math.sin(longitude),
  )
}

/** A raised great-circle relationship. The curve always starts at origin (t=0). */
export class CorridorCurve extends Curve<Vector3> {
  private start: Vector3
  private tangent: Vector3
  private angle: number
  private height: number
  constructor(origin: Anchor, destination: Anchor) {
    super()
    this.start = anchorToVector(origin, 1)
    const end = anchorToVector(destination, 1)
    this.angle = Math.acos(Math.max(-1, Math.min(1, this.start.dot(end))))
    this.tangent = end.clone().addScaledVector(this.start, -this.start.dot(end))
    if (this.tangent.lengthSq() < 1e-10) {
      // Deterministic plane for antipodal anchors; no geographic point is invented.
      this.tangent.crossVectors(
        this.start,
        Math.abs(this.start.y) < 0.9
          ? new Vector3(0, 1, 0)
          : new Vector3(1, 0, 0),
      )
    }
    this.tangent.normalize()
    this.height = Math.min(0.68, Math.max(0.07, this.angle * 0.32))
  }
  getPoint(t: number, target = new Vector3()) {
    target
      .copy(this.start)
      .multiplyScalar(Math.cos(this.angle * t))
      .addScaledVector(this.tangent, Math.sin(this.angle * t))
    return target.multiplyScalar(
      EARTH_RADIUS + 0.018 + Math.sin(Math.PI * t) * this.height,
    )
  }
}

export function magnitudeScale(value: number, maximum: number) {
  return maximum > 0 ? Math.sqrt(Math.max(0, value) / maximum) : 0
}
