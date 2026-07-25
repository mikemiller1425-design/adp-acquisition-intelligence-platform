# FaceMatch Local

Real-time webcam face matching against a **local folder** of reference photos.
No cloud APIs, no accounts, no database — everything stays on your machine.

## Features (v1)

- Live webcam face detection + embeddings (**InsightFace** / ONNX Runtime)
- Gallery folder of jpg/png images with cached embeddings
- Continuous cosine-similarity matching with ranked top-N list
- Threshold slider (0.0–1.0) to filter weak matches
- Multiple faces in frame, each labeled
- **Save current face to gallery** (one click)
- **Refresh gallery embeddings**
- Basic error handling (no face, empty gallery, camera failure)

## Why InsightFace (not dlib)?

`face_recognition` / dlib often needs a C++ toolchain and fails to build on newer
Python versions. InsightFace installs with plain `pip` on Windows, macOS, and
Linux and downloads a small CPU model pack (`buffalo_sc`, ~16MB) on first run.

## Project layout

```
facematch-local/
  main.py              # Entry point + CustomTkinter GUI
  face_engine.py       # Webcam, detection, embeddings, matching
  gallery_manager.py   # Load / save / cache gallery embeddings
  requirements.txt
  README.md
  gallery/             # Default reference images (create on first run)
```

## Requirements

- Python **3.9–3.12** (3.11 is a safe default)
- A webcam
- ~100MB disk for Python packages + the InsightFace model cache (`~/.insightface`)

## Install

### 1. Create a virtual environment (recommended)

```bash
cd facematch-local
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

### 2. Install Python packages

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

That is enough on most machines. No CMake or Visual Studio Build Tools are required.

#### Optional: GPU (NVIDIA)

If you have a CUDA-capable GPU and want faster inference:

```bash
pip uninstall -y onnxruntime
pip install onnxruntime-gpu
```

Then change `providers=["CPUExecutionProvider"]` in `face_engine.py` to include
`CUDAExecutionProvider` (advanced; CPU is the supported default for v1).

### 3. Platform notes

#### Windows

```bat
python -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
python main.py
```

If `opencv-python` or `onnxruntime` wheels fail, upgrade pip and retry with
Python 3.10 or 3.11 from https://www.python.org/downloads/.

#### macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python main.py
```

Apple Silicon (M1/M2/M3): use an arm64 Python (python.org or Homebrew). The
CPU `onnxruntime` wheel works out of the box.

#### Linux (Debian / Ubuntu)

```bash
sudo apt-get update
# Usually enough for OpenCV GUI / webcam:
sudo apt-get install -y python3-venv libgl1 libglib2.0-0
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python main.py
```

#### Linux (Fedora)

```bash
sudo dnf install python3-devel mesa-libGL
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python main.py
```

### Alternative: face_recognition / dlib (optional)

If you specifically want the classic dlib stack instead, it is **not** required
for this project. Installing it typically means:

1. Install CMake + a C++ compiler (VS Build Tools on Windows, Xcode CLT on macOS,
   `build-essential cmake` on Debian/Ubuntu).
2. Prefer Python **3.10 or 3.11** (dlib often lacks wheels for newer versions).
3. `pip install dlib face_recognition`

This app’s code path uses InsightFace; switching engines would require code changes.

## Run

```bash
cd facematch-local
python main.py
```

## Tests

```bash
cd facematch-local
pip install -r requirements.txt
pytest -v
```

Unit tests use a fake face engine (no camera). Integration tests load InsightFace
models and the bundled sample image; mark filter: `pytest -m "not integration"`.

On first launch:

1. InsightFace may download `buffalo_sc` into `~/.insightface/models/` (~16MB).
2. The app creates `gallery/` next to `main.py`.

Add `.jpg` / `.png` photos to `gallery/`, or click **Save current face to gallery**
while looking at the camera.

## Using the app

1. Allow camera access when the OS prompts you.
2. Point **Gallery** at a folder of clear, front-facing photos (one primary face per image works best).
3. Click **Refresh gallery embeddings** after adding files externally.
4. Move the **Threshold** slider — higher means stricter matches (cosine similarity).
5. Watch the live feed: boxes label each face; the side panel lists ranked hits.
6. Click **Save current face to gallery** to enroll the current frame.

### Similarity note

Scores are **cosine similarity** in `[0, 1]` (higher = closer). For InsightFace
embeddings, start around **0.35–0.45**; raise the slider to reduce false positives.

Embeddings are cached as `gallery/embeddings_cache.npz`. Refresh or change files
to rebuild.

## Troubleshooting

| Problem | What to try |
| -------- | ----------- |
| `Could not open camera` | Close other apps using the webcam; try another `camera_index` in `FaceEngine(...)` inside `main.py`. |
| `No face detected` | Improve lighting; face the camera; move closer. |
| Gallery “No face in: …” | Crop to a clear face or use a different photo. |
| Model download fails | Check network access to GitHub releases; retry — models land in `~/.insightface/models/`. |
| `libGL` / OpenCV import errors on Linux | Install `libgl1` / `mesa-libGL` (see Linux section). |
| Low FPS | Expected on CPU — the app downscales frames and skips detection on alternate frames. |
| CustomTkinter look odd | Upgrade: `pip install -U customtkinter`. |

## Privacy

All processing is local. Images and embeddings never leave your computer unless
you copy the gallery folder yourself. Model files are downloaded once from the
InsightFace GitHub releases to your user cache.
