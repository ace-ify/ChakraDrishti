// Data contract shared with the backend (backend/app.py) and the offline cache
// written by pipeline/build_cache.py into web/public/cache/.

/** One detection: [trackId, x1, y1, x2, y2, confidence, classId] in source-video pixels. */
export type Det = [number, number, number, number, number, number, number]

export interface Tracks {
  w: number
  h: number
  fps: number
  n: number
  names: Record<string, string>
  frames: Det[][]
}

export interface Camera {
  id: string
  name: string
  lat: number
  lon: number
  /** Where the footage really comes from, shown in the UI so demo feeds are never passed off as Vancouver. */
  source: string
  condition: 'day' | 'dusk' | 'night' | 'rain' | 'snow'
  view: 'overpass' | 'pole' | 'roundabout' | 'intersection'
  res: string
  clip: string
  tracks: string
  poster: string
}

export interface Prediction { name: string; p: number }

export interface Sighting { cam: string; track: number; t: number; crop: string; sim: number; verified?: boolean; self?: boolean; correct?: boolean | null }

export interface Vehicle {
  gid: string
  crop: string
  crop_thumb?: string
  top5: Prediction[]
  color?: string
  speed?: number
  heading?: string
  quality?: number
  /** Body type and colour from CLIP, robust even when the make/model is not. */
  body?: string
  /** True only when crops agree, the margin is clear and the crop has enough detail. */
  reliable?: boolean
  evidence?: { consistency: number; margin: number; min_side: number; contrast: number; crops: number }
  sightings: Sighting[]
  /** The re-ID model's matches on other corridor cameras, in route order (includes itself); `correct` is graded by ground truth. */
  journey?: Sighting[]
  /** Look-alikes on other cameras, not confirmed to be the same car. */
  similar?: Sighting[]
}

export interface SearchHit { gid: string; cam: string; track: number; crop: string; score: number }

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
// Lets API calls through ngrok's free-plan browser warning page when the backend is shared that way.
const API_HEADERS = { 'ngrok-skip-browser-warning': '1' }
/** A file in web/public, under the base path the site is deployed at (e.g. /ReTrace/ on GitHub Pages). */
export const pub = (p: string) => import.meta.env.BASE_URL + p.replace(/^\//, '')
const CACHE = pub('cache')

export type Mode = 'live' | 'cached'

// Feeds, tracks and vehicles always load from the bundled index (fast, works offline);
// the GPU backend is only used for CLIP search and Whisper transcription.
let mode: Mode = API ? 'live' : 'cached'
export const getMode = () => mode

async function getJson<T>(_livePath: string, cachePath: string): Promise<T> {
  const r = await fetch(CACHE + cachePath, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`missing ${cachePath}`)
  return (await r.json()) as T
}

export const asset = (p: string) => (!p ? '' : p.startsWith('data:') || p.startsWith('http') || p.startsWith('blob:') ? p : `${CACHE}/${p}`)

export const loadCameras = () => getJson<Camera[]>('/cameras', '/cameras.json')
export const loadTracks = (cam: Camera) => getJson<Tracks>(`/cameras/${cam.id}/tracks`, '/' + cam.tracks)
export const loadVehicles = () => getJson<Record<string, Vehicle>>('/vehicles', '/vehicles.json')
export const loadLanding = () => getJson<LandingData>('/landing', '/landing.json')

export async function searchText(q: string): Promise<SearchHit[]> {
  if (mode === 'live' && API) {
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}`, { headers: API_HEADERS, signal: AbortSignal.timeout(6000) })
      if (r.ok) return r.json()
    } catch {
      mode = 'cached' // backend unreachable: keep the demo running on label matching
    }
  }
  // Offline fallback: match the query words against cached class names and colours.
  const vehicles = await loadVehicles()
  const words = q.toLowerCase().split(/\W+/).filter(Boolean)
  return Object.values(vehicles)
    .map((v) => {
      const hay = `${v.color ?? ''} ${v.top5.map((t) => t.name).join(' ')}`.toLowerCase()
      const score = words.filter((w) => hay.includes(w)).length / Math.max(1, words.length)
      const s = v.sightings[0]
      return { gid: v.gid, cam: s?.cam ?? '', track: s?.track ?? 0, crop: v.crop, score }
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
}

export async function transcribe(audio: Blob): Promise<string> {
  if (!API) throw new Error('Voice search needs the live backend')
  const body = new FormData()
  body.append('audio', audio, 'query.webm')
  const r = await fetch(`${API}/transcribe`, { method: 'POST', body, headers: API_HEADERS })
  if (!r.ok) throw new Error('transcription failed')
  return ((await r.json()) as { text: string }).text
}

/** What the backend found in an uploaded photo or clip. */
export interface PhotoQuery {
  crop: string // data URL of the vehicle crop that was searched
  source: 'photo' | 'video'
  found: boolean // false: no vehicle detected, the whole image was used
  frames: number
  crops: number
  body: string
  colour: string
  guess: { name: string; p: number }
}
export interface PhotoHit extends SearchHit { match: boolean }

export async function searchPhoto(file: File): Promise<{ query: PhotoQuery; results: PhotoHit[] }> {
  if (!API) throw new Error('Photo search needs the live backend')
  const body = new FormData()
  body.append('file', file, file.name)
  const r = await fetch(`${API}/search/photo`, { method: 'POST', body, headers: API_HEADERS, signal: AbortSignal.timeout(120000) })
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { detail?: string } | null)?.detail ?? 'Photo search failed')
  return r.json()
}

/** Scenes and the traced car used by the landing page. */
export interface LandingScene { cam: string; title: string; sub: string; clip: string; tracks: string; poster: string; res: string }
export interface LandingData {
  scenes: LandingScene[]
  trace: { cam: string; clip: string; tracks: string; poster: string; track: number; t: number; vehicle: string }
  witness?: { transcript: string; query: string; hits: SearchHit[] }
  vehicles?: Record<string, Vehicle>
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** What we can honestly call a vehicle: its make/model when reliable, otherwise colour + body type. */
export function vehicleTitle(v: Vehicle): string {
  if (v.reliable !== false && v.top5[0]) return v.top5[0].name
  return cap([v.color, v.body].filter(Boolean).join(' ') || 'vehicle')
}

/** Geocoded location of a resolved stream, used to fly the globe to wherever the feed actually is. */
export interface StreamLocation {
  name: string
  lat: number
  lon: number
  city: string
  country: string
  /** False when the backend couldn't pin it to a real place — attach to the current camera instead. */
  located?: boolean
}

export interface ResolvedStream {
  url: string
  title: string
  location?: StreamLocation
}

/** Calls backend to extract live .m3u8 stream from YouTube or web stream using yt-dlp.
 *  Returns the stream URL plus the auto-geocoded location so the globe can fly there. */
export async function resolveStream(url: string): Promise<ResolvedStream> {
  const endpoint = API || 'http://localhost:8000'
  const res = await fetch(`${endpoint}/resolve_stream?url=${encodeURIComponent(url)}`, { headers: API_HEADERS })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to extract stream' }))
    throw new Error(err.detail || 'Stream resolution failed')
  }
  const data = await res.json()
  return { url: data.url, title: data.title || 'Live Stream', location: data.location }
}

export interface LiveDetection {
  id: number
  box: [number, number, number, number]
  norm_box: [number, number, number, number]
  cx: number
  cy: number
  conf: number
  cls: string
  label: string
  speed: number
  heading: string
  color?: string
}

export interface LiveDetectResult {
  status: string
  cam_id: string
  width: number
  height: number
  count: number
  detections: LiveDetection[]
  latency_ms: number
  device: string
  timestamp: number
}

export async function detectLiveFrame(
  image: string,
  camId = 'custom',
  streamName = 'Live Feed',
  confThresh = 0.28
): Promise<LiveDetectResult> {
  const endpoint = API || 'http://localhost:8000'
  const res = await fetch(`${endpoint}/detect_live_frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    body: JSON.stringify({ image, cam_id: camId, stream_name: streamName, conf_thresh: confThresh }),
  })
  if (!res.ok) {
    throw new Error('Detection frame failed')
  }
  return res.json()
}

