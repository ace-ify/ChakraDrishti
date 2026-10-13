import type { Camera, Vehicle } from '../data'

export interface InterceptionWaypoint {
  name: string
  lat: number
  lon: number
  camId?: string
  distanceMeters: number
  etaSeconds: number
}

export interface InterceptionPrediction {
  targetGid: string
  headingDeg: number
  cardinal: string
  speedKmh: number
  speedMs: number
  lastCam: Camera
  nextWaypoint: InterceptionWaypoint
  alternateRoute?: {
    name: string
    lat: number
    lon: number
    probability: number
  }
  confidence: number
  coneVertices: { lat: number; lon: number }[]
  cordonRadiusMeters: number
  cordonCenter: { lat: number; lon: number }
}

/**
 * Calculates great-circle distance between two GPS coordinates in meters.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Computes forward azimuth/bearing in degrees (0 = North, 90 = East).
 */
export function computeBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)
  const theta = Math.atan2(y, x)
  return ((theta * 180) / Math.PI + 360) % 360
}

export function degreesToCardinal(deg: number): string {
  const dirs = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
  ]
  const idx = Math.round(deg / 22.5) % 16
  return dirs[idx]
}

/**
 * Projects a destination point given start, bearing (deg), and distance (meters).
 */
export function projectCoordinate(
  lat: number,
  lon: number,
  bearingDeg: number,
  distMeters: number
): { lat: number; lon: number } {
  const R = 6371000
  const delta = distMeters / R
  const theta = (bearingDeg * Math.PI) / 180
  const phi1 = (lat * Math.PI) / 180
  const lambda1 = (lon * Math.PI) / 180

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  )
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    )

  return {
    lat: (phi2 * 180) / Math.PI,
    lon: (lambda2 * 180) / Math.PI,
  }
}

/**
 * Computes tactical interception escape cone, next-hop intersection, and ETA for a vehicle.
 */
export function computeInterceptionPrediction(
  v: Vehicle,
  cameras: Camera[],
  currentCamId?: string
): InterceptionPrediction | null {
  if (!cameras.length) return null

  // 1. Determine vehicle's last known camera
  const sightings = v.journey && v.journey.length > 0 ? v.journey : v.sightings
  const lastSighting = sightings[sightings.length - 1]
  const lastCamId = lastSighting?.cam || currentCamId || cameras[0].id
  const lastCam = cameras.find((c) => c.id === lastCamId) || cameras[0]

  // 2. Speed estimation (km/h)
  const speedKmh = v.speed && v.speed > 10 ? v.speed : 54 // Default realistic city pursuit speed
  const speedMs = (speedKmh * 1000) / 3600

  // 3. Heading estimation:
  // If multiple sightings exist, derive true vector. Otherwise, use corridor flow or default camera view
  let headingDeg = 45 // Default NE corridor
  if (sightings.length >= 2) {
    const prevSighting = sightings[sightings.length - 2]
    const prevCam = cameras.find((c) => c.id === prevSighting.cam)
    if (prevCam && prevCam.id !== lastCam.id) {
      headingDeg = computeBearingDeg(prevCam.lat, prevCam.lon, lastCam.lat, lastCam.lon)
    }
  } else {
    // Derive from camera index in corridor or camera view orientation
    const camIdx = cameras.findIndex((c) => c.id === lastCam.id)
    headingDeg = ((camIdx * 65 + 40) % 360)
  }

  const cardinal = degreesToCardinal(headingDeg)

  // 4. Downstream candidate search:
  // Look for cameras in front of the vehicle along heading cone (+- 65 deg)
  const downstreamCams = cameras
    .filter((c) => c.id !== lastCam.id)
    .map((c) => {
      const dist = haversineDistanceMeters(lastCam.lat, lastCam.lon, c.lat, c.lon)
      const bearing = computeBearingDeg(lastCam.lat, lastCam.lon, c.lat, c.lon)
      const diff = Math.abs(((bearing - headingDeg + 180) % 360) - 180)
      return { cam: c, dist, bearing, diff }
    })
    .filter((item) => item.diff <= 75 && item.dist > 150)
    .sort((a, b) => a.dist - b.dist)

  let nextWaypoint: InterceptionWaypoint
  let alternateRoute: InterceptionPrediction['alternateRoute']

  if (downstreamCams.length > 0) {
    const best = downstreamCams[0]
    const etaSec = Math.max(18, Math.round(best.dist / speedMs))
    nextWaypoint = {
      name: best.cam.name,
      lat: best.cam.lat,
      lon: best.cam.lon,
      camId: best.cam.id,
      distanceMeters: Math.round(best.dist),
      etaSeconds: etaSec,
    }

    if (downstreamCams.length > 1) {
      const alt = downstreamCams[1]
      alternateRoute = {
        name: alt.cam.name,
        lat: alt.cam.lat,
        lon: alt.cam.lon,
        probability: 14.2,
      }
    }
  } else {
    // Extrapolate forward by 45 seconds of travel
    const projDist = speedMs * 45 // ~675 meters
    const projCoord = projectCoordinate(lastCam.lat, lastCam.lon, headingDeg, projDist)
    nextWaypoint = {
      name: `${cardinal} Arterial Junction (Sector ${Math.floor(headingDeg / 45) + 1})`,
      lat: projCoord.lat,
      lon: projCoord.lon,
      distanceMeters: Math.round(projDist),
      etaSeconds: 45,
    }
  }

  // 5. Tactical Escape Cone (30 deg sector fan)
  const coneDist = nextWaypoint.distanceMeters * 1.25
  const coneLeft = projectCoordinate(lastCam.lat, lastCam.lon, (headingDeg - 25 + 360) % 360, coneDist)
  const coneRight = projectCoordinate(lastCam.lat, lastCam.lon, (headingDeg + 25) % 360, coneDist)

  const coneVertices = [
    { lat: lastCam.lat, lon: lastCam.lon },
    coneLeft,
    { lat: nextWaypoint.lat, lon: nextWaypoint.lon },
    coneRight,
    { lat: lastCam.lat, lon: lastCam.lon },
  ]

  // 6. Cordon Lockdown radius and center
  const cordonCenter = {
    lat: (lastCam.lat + nextWaypoint.lat) / 2,
    lon: (lastCam.lon + nextWaypoint.lon) / 2,
  }
  const cordonRadiusMeters = Math.max(350, Math.round(nextWaypoint.distanceMeters * 0.75))

  return {
    targetGid: v.gid,
    headingDeg: Math.round(headingDeg),
    cardinal,
    speedKmh: Math.round(speedKmh),
    speedMs: Math.round(speedMs),
    lastCam,
    nextWaypoint,
    alternateRoute,
    confidence: v.reliable === false ? 68.4 : 89.2,
    coneVertices,
    cordonRadiusMeters,
    cordonCenter,
  }
}
