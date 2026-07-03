"""SyncStage analysis worker (Modal).

Pipeline (per the roadmap, section 3.1):
  1. Demucs (htdemucs) -> vocal + instrumental stems
  2. FFmpeg conditioning on the vocal (high-pass + light compression)
  3. librosa -> tempo + beat grid
  4. CREPE (torchcrepe) -> pitch curve on the vocal stem
  5. WhisperX -> word-level timestamps on the conditioned vocal
  -> analysis.json + stems uploaded to Supabase Storage, assets registered.

Deploy (from the workers/ directory):
    modal deploy analyze/app.py

Requires a Modal secret `syncstage-supabase` with:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SHARED_SECRET
"""

from __future__ import annotations

import subprocess
import tempfile
import time
from pathlib import Path

import modal

app = modal.App("syncstage-analyze")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "torch==2.4.1",
        "torchaudio==2.4.1",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "demucs==4.0.1",
        "librosa==0.10.2",
        "torchcrepe==0.0.23",
        "soundfile",
        "numpy<2",
        "supabase>=2.7",
        "fastapi[standard]",
    )
    .pip_install("whisperx==3.1.5")
    .add_local_python_source("syncstage_common")
)

MODEL_CACHE = modal.Volume.from_name("syncstage-model-cache", create_if_missing=True)


@app.function(
    image=image,
    gpu="T4",
    timeout=1800,
    secrets=[modal.Secret.from_name("syncstage-supabase")],
    volumes={"/cache": MODEL_CACHE},
)
def analyze(job_id: str) -> None:
    import syncstage_common as sc

    sb = sc.get_supabase()
    started = time.time()
    try:
        job = sc.fetch_job(sb, job_id)
        project_id = job["project_id"]
        user_id = job["user_id"]
        sc.job_running(sb, job_id)
        sc.set_project_status(sb, project_id, "analyzing")

        song = sc.get_project_asset(sb, project_id, "song")
        if not song:
            raise RuntimeError("No song asset on this project")

        with tempfile.TemporaryDirectory() as tmp:
            sc.job_progress(sb, job_id, 5, "download", "fetching song")
            song_path = sc.download_asset(sb, song, tmp)

            # Normalize input to wav for the rest of the pipeline
            wav_path = str(Path(tmp) / "song.wav")
            _run(["ffmpeg", "-y", "-i", song_path, "-ac", "2", "-ar", "44100", wav_path])

            # 1. Demucs stem separation ------------------------------------
            sc.job_progress(sb, job_id, 10, "demucs", "separating vocals")
            _run(
                [
                    "python", "-m", "demucs.separate",
                    "--two-stems", "vocals",
                    "-n", "htdemucs",
                    "-o", str(Path(tmp) / "demucs"),
                    wav_path,
                ],
                env_extra={"TORCH_HOME": "/cache/torch"},
            )
            stem_dir = Path(tmp) / "demucs" / "htdemucs" / "song"
            vocal_raw = stem_dir / "vocals.wav"
            instrumental = stem_dir / "no_vocals.wav"

            # 2. Condition the vocal for lip-sync models -------------------
            # High-pass at 80 Hz + gentle compression: cleaner phoneme energy
            # for the audio encoders (see roadmap §3.2).
            sc.job_progress(sb, job_id, 35, "condition", "filtering vocal stem")
            vocal = str(Path(tmp) / "vocal_conditioned.wav")
            _run([
                "ffmpeg", "-y", "-i", str(vocal_raw),
                "-af", "highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=10:release=120",
                "-ac", "1", "-ar", "16000", vocal,
            ])

            # 3. librosa beats / tempo -------------------------------------
            sc.job_progress(sb, job_id, 45, "librosa", "beat tracking")
            import librosa
            import numpy as np

            y, sr = librosa.load(wav_path, sr=22050, mono=True)
            duration = float(len(y) / sr)
            tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
            beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
            tempo_bpm = float(np.atleast_1d(tempo)[0])

            # 4. CREPE pitch curve on the vocal stem ------------------------
            sc.job_progress(sb, job_id, 55, "crepe", "pitch tracking")
            pitch = _pitch_curve(vocal)

            # 5. WhisperX word timestamps -----------------------------------
            sc.job_progress(sb, job_id, 70, "whisperx", "transcribing vocal")
            words = _word_timestamps(vocal)

            # Upload outputs -------------------------------------------------
            sc.job_progress(sb, job_id, 90, "upload", "storing stems + analysis")
            base = f"{user_id}/{project_id}"
            vocal_sp = f"{base}/vocal.wav"
            inst_sp = f"{base}/instrumental.wav"
            analysis_sp = f"{base}/analysis.json"

            sc.upload_file(sb, "stems", vocal_sp, str(vocal_raw), "audio/wav")
            sc.upload_file(sb, "stems", inst_sp, str(instrumental), "audio/wav")

            analysis = {
                "version": 1,
                "duration": duration,
                "sample_rate": 44100,
                "tempo_bpm": tempo_bpm,
                "beats": beats,
                "pitch": pitch,
                "words": words,
                "stems": {"vocal": vocal_sp, "instrumental": inst_sp},
            }
            analysis_local = sc.save_json(analysis, str(Path(tmp) / "analysis.json"))
            sc.upload_file(sb, "stems", analysis_sp, analysis_local, "application/json")

            for kind, sp, mime in [
                ("vocal_stem", vocal_sp, "audio/wav"),
                ("instrumental_stem", inst_sp, "audio/wav"),
                ("analysis", analysis_sp, "application/json"),
            ]:
                sc.register_asset(
                    sb, project_id=project_id, user_id=user_id, kind=kind,
                    bucket="stems", storage_path=sp, mime_type=mime,
                )

            sc.set_project_status(sb, project_id, "ready_to_generate", duration=duration)
            sc.job_succeeded(sb, job_id, {"duration": duration, "words": len(words)}, started)
    except Exception as e:  # noqa: BLE001
        sc.job_failed(sb, job_id, f"{type(e).__name__}: {e}")
        raise


def _pitch_curve(vocal_path: str, target_hz: float = 20.0) -> list[dict]:
    """CREPE (torchcrepe) f0 curve, decimated to ~target_hz points/sec."""
    import torch
    import torchaudio
    import torchcrepe

    audio, sr = torchaudio.load(vocal_path)
    if sr != 16000:
        audio = torchaudio.functional.resample(audio, sr, 16000)
        sr = 16000
    audio = audio.mean(dim=0, keepdim=True)

    hop = int(sr / 100)  # 10 ms frames
    device = "cuda" if torch.cuda.is_available() else "cpu"
    f0, periodicity = torchcrepe.predict(
        audio, sr, hop_length=hop, fmin=50.0, fmax=1100.0,
        model="full", batch_size=512, device=device, return_periodicity=True,
    )
    f0 = f0.squeeze(0).cpu().numpy()
    conf = periodicity.squeeze(0).cpu().numpy()

    step = max(1, int(100 / target_hz))  # 100 Hz frames -> ~20 Hz output
    out = []
    for i in range(0, len(f0), step):
        out.append({
            "t": round(i * hop / sr, 3),
            "f0": round(float(f0[i]), 2),
            "conf": round(float(conf[i]), 3),
        })
    return out


def _word_timestamps(vocal_path: str) -> list[dict]:
    """WhisperX transcription + forced alignment -> word-level timestamps."""
    import torch
    import whisperx

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute = "float16" if device == "cuda" else "int8"

    model = whisperx.load_model(
        "large-v2", device, compute_type=compute, download_root="/cache/whisperx"
    )
    audio = whisperx.load_audio(vocal_path)
    result = model.transcribe(audio, batch_size=8)

    align_model, metadata = whisperx.load_align_model(
        language_code=result["language"], device=device, model_dir="/cache/whisperx"
    )
    aligned = whisperx.align(
        result["segments"], align_model, metadata, audio, device,
        return_char_alignments=False,
    )

    words = []
    idx = 0
    for seg in aligned["segments"]:
        for w in seg.get("words", []):
            if "start" not in w or "end" not in w:
                continue
            words.append({
                "id": f"w{idx:04d}",
                "text": w["word"].strip(),
                "start": round(float(w["start"]), 3),
                "end": round(float(w["end"]), 3),
                "score": round(float(w.get("score", 0.0)), 3),
            })
            idx += 1
    return words


def _run(cmd: list[str], env_extra: dict | None = None) -> None:
    import os

    env = {**os.environ, **(env_extra or {})}
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if res.returncode != 0:
        raise RuntimeError(
            f"Command failed ({cmd[0]}): {res.stderr[-1500:]}"
        )


# ---------------------------------------------------------------------------
# Web endpoint: the Next.js /api/jobs route POSTs {"job_id": ...} here.
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

    analyze.spawn(job_id)
    return {"ok": True, "job_id": job_id}
