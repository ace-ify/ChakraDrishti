import * as Cesium from 'cesium'

export interface FrustumGeometry {
  rangeM: number
  vFovDeg: number
  halfW: number
  halfH: number
  mount: { lat: number; lon: number; alt: number }
  capCenter: { lat: number; lon: number; alt: number }
  corners: {
    tl: { lat: number; lon: number; alt: number }
    tr: { lat: number; lon: number; alt: number }
    br: { lat: number; lon: number; alt: number }
    bl: { lat: number; lon: number; alt: number }
  }
}

export interface FrustumCartesians {
  mount: Cesium.Cartesian3
  capCenter: Cesium.Cartesian3
  tl: Cesium.Cartesian3
  tr: Cesium.Cartesian3
  br: Cesium.Cartesian3
  bl: Cesium.Cartesian3
}

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

/**
 * Projects a lat/lon point along a bearing (degrees) by distanceM (metres).
 */
export function projectPoint(lat: number, lon: number, bearingDeg: number, distanceM: number) {
  const R = 6378137 // Earth radius (WGS84)
  const brng = bearingDeg * DEG2RAD
  const dByR = distanceM / R
  const lat1 = lat * DEG2RAD
  const lon1 = lon * DEG2RAD

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(brng)
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dByR) * Math.cos(lat1),
      Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2)
    )

  return {
    lat: lat2 * RAD2DEG,
    lon: lon2 * RAD2DEG,
  }
}

/**
 * Computes exact 5-point 3D frustum pyramid geometry (Mount point + 4 cap corners)
 * derived from God's Eye View cctvViewshed/geometry architecture.
 */
export function computeFrustumGeometry(camera: {
  lat: number
  lon: number
  headingDeg?: number
  pitchDeg?: number
  fovDeg?: number
  rangeM?: number
  mountHeightM?: number
}): FrustumGeometry {
  const lat = camera.lat
  const lon = camera.lon
  const heading = camera.headingDeg ?? 0
  const pitchDeg = Math.min(85, Math.max(-85, camera.pitchDeg ?? -20))
  const fovDeg = Math.min(140, Math.max(15, camera.fovDeg ?? 65))
  const rangeM = camera.rangeM ?? 160
  const mountHeightM = camera.mountHeightM ?? 18

  const pRad = pitchDeg * DEG2RAD
  const hFovRad = fovDeg * DEG2RAD

  // Vertical FOV assuming 16:9 aspect ratio
  const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / (16 / 9))
  const vFovDeg = vFovRad * RAD2DEG

  const halfW = rangeM * Math.tan(hFovRad / 2)
  const halfH = rangeM * Math.tan(vFovRad / 2)

  const horizDist = rangeM * Math.cos(pRad)
  const vertDist = rangeM * Math.sin(pRad)

  // Cap center in lat/lon
  const capLL = projectPoint(lat, lon, heading, horizDist)
  const unliftedCapAlt = mountHeightM + vertDist

  // Lateral spread for left/right
  const capL = projectPoint(capLL.lat, capLL.lon, heading - 90, halfW)
  const capR = projectPoint(capLL.lat, capLL.lon, heading + 90, halfW)

  // Vertical offsets along pitch (God's Eye View cctvFootprint math)
  const upHoriz = -Math.sin(pRad) * halfH
  const upVert = Math.cos(pRad) * halfH

  // Rigid lift calculation (from God's Eye View requiredPlaneLift):
  // Ensures the lowest corner (bl/br at sign = -1) is lifted so it stays at least 2.5m above ground level (0m)
  const lowestCornerAlt = unliftedCapAlt - upVert
  const minGroundClearance = 2.5
  const liftM = Math.max(0, minGroundClearance - lowestCornerAlt)
  const capAltLifted = unliftedCapAlt + liftM

  const corner = (base: { lat: number; lon: number }, sign: number) => {
    const pt = projectPoint(base.lat, base.lon, heading, sign * upHoriz)
    return {
      lat: pt.lat,
      lon: pt.lon,
      alt: capAltLifted + sign * upVert,
    }
  }

  return {
    rangeM,
    vFovDeg,
    halfW,
    halfH,
    mount: { lat, lon, alt: mountHeightM },
    capCenter: { lat: capLL.lat, lon: capLL.lon, alt: capAltLifted },
    corners: {
      tl: corner(capL, 1),
      tr: corner(capR, 1),
      br: corner(capR, -1),
      bl: corner(capL, -1),
    },
  }
}

/**
 * Converts FrustumGeometry into ECEF Cartesians for Cesium primitives
 */
export function frustumCartesians(geom: FrustumGeometry): FrustumCartesians {
  return {
    mount: Cesium.Cartesian3.fromDegrees(geom.mount.lon, geom.mount.lat, geom.mount.alt),
    capCenter: Cesium.Cartesian3.fromDegrees(geom.capCenter.lon, geom.capCenter.lat, geom.capCenter.alt),
    tl: Cesium.Cartesian3.fromDegrees(geom.corners.tl.lon, geom.corners.tl.lat, geom.corners.tl.alt),
    tr: Cesium.Cartesian3.fromDegrees(geom.corners.tr.lon, geom.corners.tr.lat, geom.corners.tr.alt),
    br: Cesium.Cartesian3.fromDegrees(geom.corners.br.lon, geom.corners.br.lat, geom.corners.br.alt),
    bl: Cesium.Cartesian3.fromDegrees(geom.corners.bl.lon, geom.corners.bl.lat, geom.corners.bl.alt),
  }
}

export function frustumVolumeGeometryData(positions: FrustumCartesians, omitCap = false) {
  const pts = [positions.mount, positions.tl, positions.tr, positions.br, positions.bl]
  const flat = new Float64Array(15)
  pts.forEach((p, i) => {
    flat[i * 3] = p.x
    flat[i * 3 + 1] = p.y
    flat[i * 3 + 2] = p.z
  })

  // Apex=0, tl=1, tr=2, br=3, bl=4: 4 side triangles + optional 2 far-cap triangles
  const indicesList = [
    0, 1, 2, // side top
    0, 2, 3, // side right
    0, 3, 4, // side bottom
    0, 4, 1, // side left
  ]
  if (!omitCap) {
    indicesList.push(1, 2, 3, 1, 3, 4) // far cap 1 & 2
  }

  const indices = new Uint16Array(indicesList)
  return { positions: flat, indices }
}

/**
 * Builds the translucent volumetric viewshed primitive for Cesium Scene
 */
export function createFrustumVolumePrimitive(
  positions: FrustumCartesians,
  color: Cesium.Color,
  omitCap = false
): Cesium.Primitive {
  const { positions: flat, indices } = frustumVolumeGeometryData(positions, omitCap)

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: flat,
      }),
    } as any,
    indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(Array.from(flat)),
  })

  return new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
      },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: true,
      translucent: true,
      renderState: {
        cull: { enabled: false },
      },
    }),
    asynchronous: false,
    allowPicking: false,
  })
}
