// Real alert engine. A watcher is a concrete predicate over live detections;
// every incoming frame is evaluated against active watchers, and a match fires
// an alert event exactly once per re-arm (no repeated spam while the target lingers).

import type { LiveDetection } from '../data'

export type AlertKind = 'color_type' | 'speed' | 'target_reappears'

export interface AlertRule {
  id: string
  kind: AlertKind
  /** Human description shown in the UI, e.g. "white SUV on any camera". */
  label: string
  /** color_type: lowercase colour word (white/black/…) and/or body (suv/sedan/truck…). */
  color?: string
  body?: string
  /** speed: fire when a detection's speed (km/h) meets or exceeds this. */
  minSpeed?: number
  /** target_reappears: the locked target gid to watch for. */
  targetGid?: string
  /** Restrict to one camera id; undefined = any camera. */
  camId?: string
  createdAt: number
}

export interface AlertEvent {
  id: string
  ruleId: string
  label: string
  camId: string
  detail: string
  at: number
}

type Listener = (e: AlertEvent) => void

const COLOR_WORDS = ['white', 'black', 'silver', 'grey', 'gray', 'red', 'blue', 'green', 'yellow', 'orange', 'brown', 'beige', 'dark', 'light']
const BODY_WORDS = ['suv', 'sedan', 'truck', 'pickup', 'van', 'bus', 'motorcycle', 'hatchback', 'coupe', 'taxi', 'compact', 'kei-van']

let rules: AlertRule[] = []
let events: AlertEvent[] = []
const listeners = new Set<Listener>()
// ruleId -> detection key currently inside the trigger condition (for re-arm)
const active = new Map<string, string>()

let seq = 0
const nid = (p: string) => `${p}-${Date.now()}-${seq++}`

export function addAlert(rule: Omit<AlertRule, 'id' | 'createdAt'>): AlertRule {
  const r: AlertRule = { ...rule, id: nid('rule'), createdAt: Date.now() }
  rules.push(r)
  return r
}

export function removeAlert(id: string) {
  rules = rules.filter((r) => r.id !== id)
  active.delete(id)
}

export function listAlerts(): AlertRule[] {
  return [...rules]
}

export function listAlertEvents(): AlertEvent[] {
  return [...events]
}

export function clearAlertEvents() {
  events = []
}

export function onAlert(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function fire(rule: AlertRule, camId: string, detail: string) {
  const e: AlertEvent = { id: nid('evt'), ruleId: rule.id, label: rule.label, camId, detail, at: Date.now() }
  events.push(e)
  listeners.forEach((fn) => fn(e))
}

function matchesColorType(r: AlertRule, d: LiveDetection): boolean {
  const hay = `${d.color || ''} ${d.label || ''} ${d.cls || ''}`.toLowerCase()
  if (r.color && !hay.includes(r.color)) return false
  if (r.body && !hay.includes(r.body)) return false
  return Boolean(r.color || r.body)
}

function ruleHits(r: AlertRule, camId: string, d: LiveDetection): string | null {
  if (r.camId && r.camId !== camId) return null
  switch (r.kind) {
    case 'color_type':
      return matchesColorType(r, d) ? `${d.label || d.cls}${d.color ? ' · ' + d.color : ''}` : null
    case 'speed':
      return typeof d.speed === 'number' && d.speed >= (r.minSpeed ?? 0) ? `${d.speed} km/h` : null
    case 'target_reappears':
      return r.targetGid && d.id != null && `${camId}:${d.id}` === r.targetGid ? 'target re-acquired' : null
    default:
      return null
  }
}

/** Evaluate one camera's detections for a frame. Called from the live-detection loop. */
export function evaluateFrame(camId: string, detections: LiveDetection[]) {
  if (!rules.length) return
  for (const r of rules) {
    for (const d of detections) {
      const hit = ruleHits(r, camId, d)
      if (!hit) continue
      // Re-arm: only fire again once this specific detection has left the condition.
      const key = `${camId}:${d.id}`
      if (active.get(r.id) === key) continue
      active.set(r.id, key)
      fire(r, camId, hit)
    }
  }
}

/** Parse a natural-language alert request into a rule, or null if it isn't an alert request. */
export function parseAlertRequest(q: string, ctx: { selectedGid?: string; activeCameraId?: string }): Omit<AlertRule, 'id' | 'createdAt'> | null {
  const s = q.toLowerCase()
  const wantsAlert = /(alert|notify|watch|monitor|flag|tell me when|let me know|ping me)/.test(s)
  if (!wantsAlert) return null

  const color = COLOR_WORDS.find((c) => s.includes(c))
  const body = BODY_WORDS.find((b) => s.includes(b))
  const speedMatch = s.match(/(\d{2,3})\s*(?:km\/?h|kmh|kph)/) || (/(over|above|exceed|faster than)\s*(\d{2,3})/.test(s) ? s.match(/(\d{2,3})/) : null)
  const onThisCam = /this cam|current cam|active cam|this feed/.test(s)
  const camId = onThisCam ? ctx.activeCameraId : undefined

  // "watch the target / this vehicle" → re-appears
  if (/(target|this (vehicle|car|one)|locked)/.test(s) && ctx.selectedGid) {
    return {
      kind: 'target_reappears',
      targetGid: ctx.selectedGid,
      camId,
      label: `Alert when locked target re-appears${camId ? ` on ${camId}` : ''}`,
    }
  }

  // speed threshold
  if (speedMatch) {
    const v = parseInt(speedMatch[1] || speedMatch[2]!, 10)
    return { kind: 'speed', minSpeed: v, camId, label: `Alert when any vehicle exceeds ${v} km/h${camId ? ` on ${camId}` : ''}` }
  }

  // color/body match
  if (color || body) {
    const parts = [color, body].filter(Boolean).join(' ')
    return { kind: 'color_type', color, body, camId, label: `Alert on ${parts}${camId ? ` · ${camId}` : ' · any camera'}` }
  }

  return null
}
