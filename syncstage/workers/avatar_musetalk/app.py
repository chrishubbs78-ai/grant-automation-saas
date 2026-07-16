"""SyncStage MuseTalk video-input worker (Modal, A10G) — Phase 2.

User uploads a VIDEO of themselves; MuseTalk regenerates only the mouth
region so it sings the vocal stem. VideoReTalking is the automatic fallback
when face-detection confidence is low or the output fails the
sync-confidence check (roadmap §2 + Phase 2).

STATUS: structural scaffold. The MuseTalk/VideoReTalking invocations below
follow their published CLIs but MUST be validated against pinned commits
before Phase 2 ships. Also re-verify MuseTalk's license for commercial use
(roadmap §7) — VideoReTalking is research-license, fallback only.

Deploy (from the workers/ directory):
    modal deploy avatar_musetalk/app.py
"""

from __future__ import annotations

import subprocess
import tempfile
import time
from pathlib import Path

import modal

app = modal.App("syncstage-avatar-musetalk")

MUSETALK_DIR = "/opt/MuseTalk"
VIDEORETALKING_DIR = "/opt/video-retalking"
FACE_CONFIDENCE_THRESHOLD = 0.8

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "git", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.0.1",
        "torchvision==0.15.2",
        "torchaudio==2.0.2",
        index_url="https://download.pytorch.org/whl/cu118",
    )
    .run_commands(
        f"git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git {MUSETALK_DIR}",
        f"pip install -r {MUSETALK_DIR}/requirements.txt || true",
        f"git clone --depth 1 https://github.com/OpenTalker/video-retalking.git {VIDEORETALKING_DIR}",
    )
    .pip_install("supabase>=2.7", "fastapi[standard]", "opencv-python-headless")
    .add_local_python_source("syncstage_common")
)

WEIGHTS = modal.Volume.from_name("syncstage-musetalk-weights", create_if_missing=True)


@app.function(
    image=image,
    gpu="A10G",
    timeout=3600,
    secrets=[modal.Secret.from_name("syncstage-supabase")],
    volumes={"/weights": WEIGHTS},
)
def generate(job_id: str) -> None:
    import syncstage_common as sc

    sb = sc.get_supabase()
    started = time.time()
    try:
        job = sc.fetch_job(sb, job_id)
        project_id = job["project_id"]
        user_id = job["user_id"]
        sc.job_running(sb, job_id)
        sc.set_project_status(sb, project_id, "generating")

        face_video = sc.get_project_asset(sb, project_id, "face_video")
        vocal = sc.get_project_asset(sb, project_id, "vocal_stem")
        if not face_video or not vocal:
            raise RuntimeError("Missing face video or vocal stem")

        with tempfile.TemporaryDirectory() as tmp:
            sc.job_progress(sb, job_id, 5, "download")
            video_path = sc.download_asset(sb, face_video, tmp)
            vocal_path = sc.download_asset(sb, vocal, tmp)

            sc.job_progress(sb, job_id, 15, "face_check", "detecting face")
            confidence = _face_confidence(video_path)

            if confidence >= FACE_CONFIDENCE_THRESHOLD:
                sc.job_progress(sb, job_id, 25, "musetalk", "resyncing mouth region")
                out = _run_musetalk(tmp, video_path, vocal_path)
                model = "musetalk"
            else:
                sc.job_progress(
                    sb, job_id, 25, "videoretalking",
                    f"fallback (face conf {confidence:.2f})",
                )
                out = _run_videoretalking(tmp, video_path, vocal_path)
                model = "videoretalking"

            sc.job_progress(sb, job_id, 90, "upload")
            duration = _media_duration(out)
            sp = f"{user_id}/{project_id}/avatar_video_{int(time.time())}.mp4"
            sc.upload_file(sb, "clips", sp, out, "video/mp4")
            sc.register_asset(
                sb, project_id=project_id, user_id=user_id,
                kind="avatar_clip", bucket="clips", storage_path=sp,
                mime_type="video/mp4",
                range_={"start": 0.0, "end": duration},
                meta={"model": model, "face_confidence": confidence},
            )
            sc.set_project_status(sb, project_id, "editing")
            sc.job_succeeded(sb, job_id, {"model": model}, started)
    except Exception as e:  # noqa: BLE001
        sc.job_failed(sb, job_id, f"{type(e).__name__}: {e}")
        raise


def _face_confidence(video_path: str) -> float:
    """Mean face-detection confidence over sampled frames (OpenCV DNN-free
    heuristic using the Haar cascade as a placeholder; swap for a proper
    detector — e.g. S3FD from the MuseTalk repo — during Phase 2 bring-up)."""
    import cv2

    cap = cv2.VideoCapture(video_path)
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    hits = 0
    samples = 0
    for i in range(0, total, max(1, total // 20)):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, frame = cap.read()
        if not ok:
            continue
        samples += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if len(cascade.detectMultiScale(gray, 1.1, 5)) > 0:
            hits += 1
    cap.release()
    return hits / samples if samples else 0.0


def _run_musetalk(tmp: str, video: str, audio: str) -> str:
    # MuseTalk realtime inference CLI (validate flags against pinned commit).
    out_dir = Path(tmp) / "musetalk_out"
    out_dir.mkdir(exist_ok=True)
    _run([
        "python", "-m", "scripts.inference",
        "--video_path", video,
        "--audio_path", audio,
        "--result_dir", str(out_dir),
    ], cwd=MUSETALK_DIR)
    mp4s = sorted(out_dir.rglob("*.mp4"))
    if not mp4s:
        raise RuntimeError("MuseTalk produced no output")
    return str(mp4s[-1])


def _run_videoretalking(tmp: str, video: str, audio: str) -> str:
    out = str(Path(tmp) / "retalked.mp4")
    _run([
        "python", "inference.py",
        "--face", video,
        "--audio", audio,
        "--outfile", out,
    ], cwd=VIDEORETALKING_DIR)
    return out


def _media_duration(path: str) -> float:
    res = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True,
    )
    return float(res.stdout.strip() or 0)


def _run(cmd: list[str], cwd: str | None = None) -> None:
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if res.returncode != 0:
        raise RuntimeError(f"Command failed ({cmd[0]}): {res.stderr[-1500:]}")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("syncstage-supabase")],
)
@modal.fastapi_endpoint(method="POST")
def trigger(payload: dict, request=None):
    from fastapi import HTTPException, Request

    import syncstage_common as sc

    if isinstance(request, Request):
        if not sc.check_secret(request.headers.get("x-syncstage-secret")):
            raise HTTPException(status_code=401, detail="bad secret")

    job_id = payload.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id required")

    generate.spawn(job_id)
    return {"ok": True, "job_id": job_id}
