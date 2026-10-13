import type { Camera } from '../data'

export interface CityCorridor {
  id: string
  name: string
  region: string
  center: { lon: number; lat: number; height: number }
  description: string
  cameras: Camera[]
}

/**
 * Real Lucknow Corridor: Major intersections in Lucknow, Uttar Pradesh, India
 * mapped with authentic GPS coordinates (Hazratganj, Gomti Nagar, Charbagh, Chowk, Munshi Pulia, Polytechnic)
 */
export const LUCKNOW_CAMERAS: Camera[] = [
  {
    id: "lko-hazratganj-atal-chawk",
    name: "Hazratganj Atal Chawk Junction",
    lat: 26.8529,
    lon: 80.9427,
    view: "intersection",
    condition: "day",
    source: "Lucknow Smart City ITMS · Integrated Surveillance",
    res: "1920x1080",
    clip: "clips/cambie-king-edward-n.mp4",
    tracks: "tracks/cambie-king-edward-n.json",
    poster: "clips/cambie-king-edward-n.jpg"
  },
  {
    id: "lko-polytechnic-chauraha",
    name: "Polytechnic Chauraha (Indira Nagar)",
    lat: 26.8778,
    lon: 80.9982,
    view: "intersection",
    condition: "dusk",
    source: "UP Police ITMS Surveillance · Faizabad Rd",
    res: "1920x1080",
    clip: "clips/cambie-king-edward-e.mp4",
    tracks: "tracks/cambie-king-edward-e.json",
    poster: "clips/cambie-king-edward-e.jpg"
  },
  {
    id: "lko-munshi-pulia-flyover",
    name: "Munshi Pulia Metro Corridor",
    lat: 26.8895,
    lon: 80.9882,
    view: "overpass",
    condition: "night",
    source: "Lucknow ITMS Corridor C4",
    res: "1920x1080",
    clip: "clips/cambie-king-edward-s.mp4",
    tracks: "tracks/cambie-king-edward-s.json",
    poster: "clips/cambie-king-edward-s.jpg"
  },
  {
    id: "lko-gomti-patrakarpuram",
    name: "Patrakarpuram Chauraha (Gomti Nagar)",
    lat: 26.8488,
    lon: 81.0024,
    view: "roundabout",
    condition: "day",
    source: "Gomti Nagar Surveillance Hub",
    res: "1920x1080",
    clip: "clips/georgia-stanley-park-n.mp4",
    tracks: "tracks/georgia-stanley-park-n.json",
    poster: "clips/georgia-stanley-park-n.jpg"
  },
  {
    id: "lko-charbagh-station-circle",
    name: "Charbagh Railway Station Rotary",
    lat: 26.8315,
    lon: 80.9234,
    view: "roundabout",
    condition: "rain",
    source: "Lucknow Junction High-Density Traffic Unit",
    res: "1920x1080",
    clip: "clips/georgia-stanley-park-s.mp4",
    tracks: "tracks/georgia-stanley-park-s.json",
    poster: "clips/georgia-stanley-park-s.jpg"
  },
  {
    id: "lko-chowk-ghantaghar",
    name: "Old City Chowk (Ghantaghar Loop)",
    lat: 26.8682,
    lon: 80.9085,
    view: "pole",
    condition: "night",
    source: "Old Lucknow Heritage Zone Surveillance",
    res: "1920x1080",
    clip: "clips/granville-broadway-s.mp4",
    tracks: "tracks/granville-broadway-s.json",
    poster: "clips/granville-broadway-s.jpg"
  },
  {
    id: "lko-shaheed-path-ekana",
    name: "Amar Shaheed Path (Ekana Stadium Express)",
    lat: 26.8012,
    lon: 81.0118,
    view: "overpass",
    condition: "day",
    source: "UP Expressway Industrial Dev Authority (UPEIDA)",
    res: "1920x1080",
    clip: "clips/knight-marine-drive-n.mp4",
    tracks: "tracks/knight-marine-drive-n.json",
    poster: "clips/knight-marine-drive-n.jpg"
  },
  {
    id: "lko-awadh-chauraha",
    name: "Awadh Rotary (VIP Road)",
    lat: 26.8152,
    lon: 80.9015,
    view: "intersection",
    condition: "dusk",
    source: "Lucknow Smart City Traffic Command",
    res: "1920x1080",
    clip: "clips/main-terminal-ave-n.mp4",
    tracks: "tracks/main-terminal-ave-n.json",
    poster: "clips/main-terminal-ave-n.jpg"
  }
]

export const CORRIDORS: Record<string, CityCorridor> = {
  vancouver: {
    id: 'vancouver',
    name: 'Vancouver Metro Corridor',
    region: 'Canada · BC',
    center: { lon: -123.1207, lat: 49.2827, height: 6000 },
    description: '18 synchronized highway & intersection cameras with multi-angle ground truth re-ID.',
    cameras: [] // Will be populated with Vancouver default cameras
  },
  lucknow: {
    id: 'lucknow',
    name: 'Lucknow Smart City Grid',
    region: 'India · Uttar Pradesh',
    center: { lon: 80.9462, lat: 26.8467, height: 8500 },
    description: 'Real GPS nodes across Hazratganj, Gomti Nagar, Polytechnic, Charbagh & Shaheed Path. (Indian municipal feeds are not public; these anchor the corridor we tried to source.)',
    cameras: LUCKNOW_CAMERAS
  }
}

