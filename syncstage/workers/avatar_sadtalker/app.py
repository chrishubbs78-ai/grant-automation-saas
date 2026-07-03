"""SyncStage SadTalker avatar worker (Modal, A10G).

Photo + vocal stem -> lip-synced talking-head clips.

Strategy (roadmap Phase 1):
- Chunk the song into ~25s segments and run SadTalker per chunk, in parallel.
  Keeps GPU memory stable and gives us segment-level re-rendering for free.
- `generate` handles the full song; `rerender_segment` re-syncs only an
  edited time range (typically 2-6s) after the user drags word markers.
- Always driven by the Demucs VOCAL STEM, never the full mix (roadmap §3.2).
- Optional GFPGAN face enhancement (Phase 3) via SadTalker's --enhancer flag.

Deploy (from the workers/ directory):
    modal deploy avatar_sadtalker/app.py

First run downloads SadTalker + GFPGAN checkpoints into the shared volume.
"""

from __future__ import annotations

import subprocess
import tempfile
import time
from pathlib import Path

import modal

app = modal.App("syncstage-avatar-sadtalker")

CHUNK_SECONDS = 25.0
SADTALKER_DIR = "/opt/SadTalker"

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
        f"git clone --depth 1 https://github.com/OpenTalker/SadTalker.git {SADTALKER_DIR}",
        f"pip install -r {SADTALKER_DIR}/requirements.txt",
    )
    .pip_install("supabase>=2.7", "fastapi[standard]")
    .add_local_python_source("syncstage_common")
)

WEIGHTS = modal.Volume.from_name("syncstage-sadtalker-weights", create_if_missing=True)


def _ensure_weights() -> str:
    """Download SadTalker checkpoints into the volume on first use."""
    ckpt_dir = Path("/weights/checkpoints")
    if not (ckpt_dir / "SadTalker_V0.0.2_256.safetensors").exists():
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["bash", f"{SADTALKER_DIR}/scripts/download_models.sh"],
            cwd="/weights",
            check=True,
        )
        WEIGHTS.commit()
    return str(ckpt_dir)


@app.function(
    image=image,
    gpu="A10G",
    timeout=3600,
    secrets=[modal.Secret.from_name("syncstage-supabase")],
    volumes={"/weights": WEIGHTS},
)
def generate(job_id: str) -> None:
    """Full-song avatar generation, chunked."""
    import syncstage_common as sc

    sb = sc.get_supabase()
    started = time.time()
    try:
        job = sc.fetch_job(sb, job_id)
        project_id = job["project_id"]
        user_id = job["user_id"]
        sc.job_running(sb, job_id)
        sc.set_project_status(sb, project_id, "generating")

        face = sc.get_project_asset(sb, project_id, "face_photo")
        vocal = sc.get_project_asset(sb, project_id, "vocal_stem")
        if not face or not vocal:
            raise RuntimeError("Missing face photo or vocal stem — run analysis first")

        project = sb.table("projects").select("duration").eq("id", project_id).single().execute().data
        duration = float(project["duration"] or 0)
        if duration <= 0:
            raise RuntimeError("Project duration unknown — analysis incomplete")

        ckpt = _ensure_weights()

        with tempfile.TemporaryDirectory() as tmp:
            sc.job_progress(sb, job_id, 3, "download", "fetching inputs")
            face_path = sc.download_asset(sb, face, tmp)
            vocal_path = sc.download_asset(sb, vocal, tmp)

            # Build chunk list
            chunks: list[tuple[float, float]] = []
            t = 0.0
            while t < duration:
                chunks.append((t, min(t + CHUNK_SECONDS, duration)))
                t += CHUNK_SECONDS

            for i, (start, end) in enumerate(chunks):
                pct = 5 + 90 * (i / len(chunks))
                sc.job_progress(
                    sb, job_id, pct, f"sadtalker:chunk {i + 1}/{len(chunks)}",
                    f"{start:.0f}s–{end:.0f}s",
                )
                clip = _render_chunk(tmp, face_path, vocal_path, start, end, ckpt)
                sp = f"{user_id}/{project_id}/avatar_{start:07.2f}_{end:07.2f}.mp4"
                sc.upload_file(sb, "clips", sp, clip, "video/mp4")
                sc.register_asset(
                    sb, project_id=project_id, user_id=user_id,
                    kind="avatar_clip", bucket="clips", storage_path=sp,
                    mime_type="video/mp4",
                    range_={"start": start, "end": end},
                    meta={"model": "sadtalker", "chunk": i},
                )

            sc.set_project_status(sb, project_id, "editing")
            sc.job_succeeded(sb, job_id, {"chunks": len(chunks)}, started)
    except Exception as e:  # noqa: BLE001
        sc.job_failed(sb, job_id, f"{type(e).__name__}: {e}")
        raise


@app.function(
    image=image,
    gpu="A10G",
    timeout=900,
    secrets=[modal.Secret.from_name("syncstage-supabase")],
    volumes={"/weights": WEIGHTS},
)
def rerender_segment(job_id: str) -> None:
    """Re-sync only an edited time range — the cheap, interactive path."""
    import syncstage_common as sc

    sb = sc.get_supabase()
    started = time.time()
    try:
        job = sc.fetch_job(sb, job_id)
        project_id = job["project_id"]
        user_id = job["user_id"]
        rng = (job.get("payload") or {}).get("range")
        if not rng:
            raise RuntimeError("segment_rerender job missing payload.range")
        start, end = float(rng["start"]), float(rng["end"])

        sc.job_running(sb, job_id)

        face = sc.get_project_asset(sb, project_id, "face_photo")
        vocal = sc.get_project_asset(sb, project_id, "vocal_stem")
        if not face or not vocal:
            raise RuntimeError("Missing face photo or vocal stem")

        ckpt = _ensure_weights()
        with tempfile.TemporaryDirectory() as tmp:
            sc.job_progress(sb, job_id, 10, "download")
            face_path = sc.download_asset(sb, face, tmp)
            vocal_path = sc.download_asset(sb, vocal, tmp)

            sc.job_progress(sb, job_id, 30, "sadtalker", f"{start:.1f}s–{end:.1f}s")
            clip = _render_chunk(tmp, face_path, vocal_path, start, end, ckpt)

            sp = f"{user_id}/{project_id}/segment_{start:07.2f}_{end:07.2f}_{int(time.time())}.mp4"
            sc.upload_file(sb, "clips", sp, clip, "video/mp4")
            sc.register_asset(
                sb, project_id=project_id, user_id=user_id,
                kind="avatar_clip", bucket="clips", storage_path=sp,
                mime_type="video/mp4",
                range_={"start": start, "end": end},
                meta={"model": "sadtalker", "segment_rerender": True},
            )
            sc.job_succeeded(sb, job_id, {"range": rng}, started)
    except Exception as e:  # noqa: BLE001
        sc.job_failed(sb, job_id, f"{type(e).__name__}: {e}")
        raise


def _render_chunk(tmp: str, face_path: str, vocal_path: str,
                  start: float, end: float, ckpt_dir: str) -> str:
    """Cut the vocal stem to [start, end) and run SadTalker on it."""
    seg_audio = str(Path(tmp) / f"seg_{start:.2f}.wav")
    _run([
        "ffmpeg", "-y", "-i", vocal_path,
        "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
        "-ac", "1", "-ar", "16000", seg_audio,
    ])

    out_dir = Path(tmp) / f"out_{start:.2f}"
    out_dir.mkdir(parents=True, exist_ok=True)
    _run([
        "python", f"{SADTALKER_DIR}/inference.py",
        "--driven_audio", seg_audio,
        "--source_image", face_path,
        "--checkpoint_dir", ckpt_dir,
        "--result_dir", str(out_dir),
        "--still",
        "--preprocess", "full",
        "--enhancer", "gfpgan",
    ], cwd=SADTALKER_DIR)

    mp4s = sorted(out_dir.rglob("*.mp4"))
    if not mp4s:
        raise RuntimeError(f"SadTalker produced no output for {start:.1f}-{end:.1f}s")

    # Strip audio: video is muxed with the full mix at final render.
    final = str(Path(tmp) / f"clip_{start:.2f}.mp4")
    _run(["ffmpeg", "-y", "-i", str(mp4s[-1]), "-an", "-c:v", "copy", final])
    return final


def _run(cmd: list[str], cwd: str | None = None) -> None:
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if res.returncode != 0:
        raise RuntimeError(f"Command failed ({cmd[0]}): {res.stderr[-1500:]}")


# ---------------------------------------------------------------------------
# Web endpoint: handles both avatar_generate and segment_rerender jobs.
# ---------------------------------------------------------------------------

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

    sb = sc.get_supabase()
    job = sc.fetch_job(sb, job_id)
    if job["type"] == "segment_rerender":
        rerender_segment.spawn(job_id)
    else:
        generate.spawn(job_id)
    return {"ok": True, "job_id": job_id, "type": job["type"]}
