# ChakraDrishti (चक्रदृष्टि)

Autonomous urban visual intelligence. ChakraDrishti detects and tracks every vehicle
across a city's cameras, recognises its make, model and colour, and finds a specific
vehicle by appearance, by a text description, or by a witness's spoken statement —
without relying on licence plates.

On top of the re-identification engine it adds a real-time tactical grid: a 3D globe
with camera viewsheds, live external stream ingest (YouTube Live / HLS) with automatic
geolocation, a multi-agent copilot for search / interception / dispatch, and
court-ready incident dossiers.

## Run it

The website works on any machine with Node 20+; the feed data ships in `web/public/cache`.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

- `#/` is the story: the problem, detection on real footage in any condition, a witness's
  voice statement turned into a search, and one car traced across cameras.
- `#/live` is the tactical grid: pick a camera to watch its feed with tracks, inspect a
  vehicle, follow it to other cameras, or connect any live stream and let the grid
  locate it on the globe.
- Press `~` (or **Under the hood**) for models, datasets and metrics.

### GPU backend (optional)

Text search with CLIP, voice transcription with Whisper, live-frame detection with YOLO,
and photo/video search run on a CUDA machine:

```bash
git lfs pull   # model weights in training/
pip install fastapi uvicorn python-multipart torch torchvision transformers openai-whisper ultralytics supervision opencv-python pillow yt-dlp
uvicorn backend.app:app --host 0.0.0.0 --port 8000
cd web && VITE_API_URL=http://<gpu-host>:8000 npm run dev
```

Set `GROQ_API_KEY` in the environment to enable the LLM copilot; without it the copilot
falls back to a deterministic on-device swarm. Without the backend, search matches the
indexed labels, voice uses the browser's speech recognition, and photo/live search are
unavailable.

To share the site through a tunnel, serve the built site and the API from the GPU machine
on one address:

```bash
cd web && VITE_API_URL=/api npm run build && cd ..
uvicorn backend.serve:app --host 0.0.0.0 --port 8000   # site at /, API at /api
cloudflared tunnel --url http://localhost:8000
```

## Layout

| Path | Contents |
| --- | --- |
| `web/` | Website (React + Vite + Cesium) |
| `backend/` | API: feeds, vehicles, CLIP search, Whisper transcription, live detection, photo/video search, stream geolocation, copilot |
| `pipeline/` | Footage selection, clip export, tracking, crop selection, indexing, map build |
| `training/` | Model training code, logs and weights: detector, classifier, embeddings model ([how to retrain](training/README.md)) |
| `demo_footage/` | Source datasets and intermediate exports (not committed) |

## Models

| Model | Weights | Role |
| --- | --- | --- |
| Detector | `training/yolo/runs/detect/train1/weights/best.pt` | YOLO, one `car` class, tracked with ByteTrack |
| Classifier | `training/reid/models/classifier.pt` | Make, model and generation |
| Embeddings model | `training/reid/models/embeddings_model.pt` | 2048-D appearance embedding for re-identification |
| Live detector | YOLOv8n | Real-time detection on external streams |

## Data

Camera locations on the map are illustrative; the footage comes from public datasets.

| Dataset | Use | Licence |
| --- | --- | --- |
| CityFlowV2 (AI City Challenge 2022) | Multi-camera feeds with cross-camera ground truth (US) | AIC 2022 data licence |
| RoundaboutHD | 4K multi-camera feeds | See dataset page |
| AAU RainSnow | Rain, snow and night feeds (Denmark) | CC BY 4.0 |
| MIO-TCD Localization | Camera-quality and angle evaluation | CC BY-NC-SA 4.0 |
| OpenStreetMap | Map geometry | ODbL, © OpenStreetMap contributors |
