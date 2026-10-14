import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { pub } from '../data'

interface Bench { gpu: string; detect_track_fps_1080p: number; reid_crops_per_s: number; match_ms_vs_1M_vehicles: number }

// Commodity GPU market pricing (RTX 3090, 24GB VRAM)
const GPU_PRICE_INR = 72000 // ₹72,000 (pre-owned RTX 3090 in Indian market)
const GPU_PRICE_USD = 850   // $850 USD
const SEARCH_MS = 36 // measured end to end: text query -> ranked crops, over the network

/** Cost & speed: measured throughput on one RTX 3090 and what a city deployment would need. */
export default function CostSpeed() {
  const [b, setB] = useState<Bench | null>(null)
  const [cams, setCams] = useState(250)
  const [fps, setFps] = useState(10)
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR')
  useEffect(() => { fetch(pub('cache/benchmark.json')).then((r) => (r.ok ? r.json() : null)).then(setB).catch(() => {}) }, [])

  const gpuFps = b?.detect_track_fps_1080p ?? 68
  const perGpu = Math.max(1, Math.floor(gpuFps / fps))
  const gpus = Math.ceil(cams / perGpu)
  const isINR = currency === 'INR'
  const unitPrice = isINR ? GPU_PRICE_INR : GPU_PRICE_USD
  const cost = gpus * unitPrice
  const hourMinutes = Math.round((3600 * fps) / gpuFps / 60)

  const formatCost = (amt: number) => {
    if (isINR) {
      if (amt >= 10000000) return `₹${(amt / 10000000).toFixed(2)} Cr`
      if (amt >= 100000) return `₹${(amt / 100000).toFixed(2)} Lakh`
      return `₹${amt.toLocaleString('en-IN')}`
    }
    return `$${amt.toLocaleString('en-US')}`
  }

  const speed: [string, string][] = [
    [`${Math.round(gpuFps)} fps`, 'detection + tracking at 1080p on one GPU'],
    [`${Math.round(b?.reid_crops_per_s ?? 427)}/s`, 'vehicles identified (make/model + fingerprint)'],
    [`${(b?.match_ms_vs_1M_vehicles ?? 9.9).toFixed(0)} ms`, 'to match one car against 1 million vehicles'],
    [`${SEARCH_MS} ms`, 'from a typed description to ranked results'],
  ]

  return (
    <section className="wrap" style={{ padding: '120px 28px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="label" style={{ color: 'var(--teal)' }}>04 / Cost and speed</div>
          <h2 style={{ fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 1.04, letterSpacing: -2, margin: '14px 0 16px', maxWidth: 900 }}>
            Hours of footage in minutes. <span style={{ color: 'var(--teal)' }}>A Smart City on commodity GPUs.</span>
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'var(--panel-2)', padding: 4, borderRadius: 8, border: 'var(--neu-border)' }}>
          <button
            onClick={() => setCurrency('INR')}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: 'none',
              background: isINR ? 'var(--teal)' : 'transparent',
              color: isINR ? 'var(--teal-ink)' : 'var(--muted)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            ₹ INR (India)
          </button>
          <button
            onClick={() => setCurrency('USD')}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: 'none',
              background: !isINR ? 'var(--teal)' : 'transparent',
              color: !isINR ? 'var(--teal-ink)' : 'var(--muted)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            $ USD
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 18, lineHeight: 1.55, maxWidth: 800, margin: '0 0 40px' }}>
        Measured on a single {b?.gpu ?? 'RTX 3090'} (24GB VRAM), one stream at a time with zero batching. No multi-crore proprietary servers: ChakraDrishti runs directly on commodity hardware connected to existing city RTSP feeds.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {speed.map(([v, l], i) => (
          <motion.div key={l} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="neu-card" style={{ padding: 26 }}>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5, color: 'var(--teal)' }}>{v}</div>
            <div style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.4, fontSize: 14 }}>{l}</div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 24 }}>
        <div className="neu-card" style={{ flex: '1 1 360px', padding: 26 }}>
          <div className="label" style={{ color: 'var(--teal)', fontSize: 11, marginBottom: 18, fontWeight: 700 }}>Smart City Deployment Calculator</div>
          <Slider
            label="Cameras"
            value={cams}
            min={10}
            max={1000}
            step={10}
            onChange={setCams}
            note={cams === 250 ? 'Lucknow ITMS Corridor' : cams === 220 ? 'Vancouver Testbed' : undefined}
          />
          <Slider label="Frames per second analysed" value={fps} min={2} max={30} step={1} onChange={setFps} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="chip" onClick={() => setCams(150)} style={{ cursor: 'pointer' }}>Tier-2 Hub (150)</button>
            <button className="chip" onClick={() => setCams(250)} style={{ cursor: 'pointer' }}>Lucknow Grid (250)</button>
            <button className="chip" onClick={() => setCams(600)} style={{ cursor: 'pointer' }}>Metro Sector (600)</button>
          </div>
          <p className="mono" style={{ fontSize: 11, color: 'var(--faint)', lineHeight: 1.6, margin: '16px 0 0' }}>
            {Math.round(gpuFps)} fps per GPU ÷ {fps} fps per camera = {perGpu} cameras per GPU. Used RTX 3090 ≈ {isINR ? `₹${GPU_PRICE_INR.toLocaleString('en-IN')}` : `$${GPU_PRICE_USD}`}.
          </p>
        </div>
        <div style={{ flex: '1 1 360px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {[
            [`${gpus}`, `GPUs for ${cams} cameras, live`],
            [formatCost(cost), 'one-time GPU hardware cost'],
            [formatCost(Math.round(cost / cams)), 'per camera, one time'],
            [`${hourMinutes} min`, 'to search one hour of footage from one camera'],
          ].map(([v, l]) => (
            <div key={l} className="neu-inset" style={{ padding: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1, color: 'var(--amber)' }}>{v}</div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="mono" style={{ fontSize: 11, color: 'var(--faint)', marginTop: 14 }}>
        Throughput measured in this repo (pipeline/benchmark.py). Batching streams and smaller edge GPUs would lower cost further.
      </p>
    </section>
  )
}

function Slider({ label, value, min, max, step, onChange, note }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; note?: string }) {
  const id = label.replace(/\W+/g, '-').toLowerCase()
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <label htmlFor={id} style={{ fontSize: 15 }}>{label}</label>
        <span className="mono" style={{ fontSize: 18, color: 'var(--teal)' }}>{value}{note && <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 8 }}>{note}</span>}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#5eead4' }} />
    </div>
  )
}
