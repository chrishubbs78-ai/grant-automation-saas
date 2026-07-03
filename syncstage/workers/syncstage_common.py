"""Shared helpers for SyncStage Modal workers.

Workers authenticate to Supabase with the service-role key (bypasses RLS).
Set these in a Modal secret named `syncstage-supabase`:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SHARED_SECRET
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Optional


def get_supabase():
    from supabase import create_client

    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def check_secret(header_value: Optional[str]) -> bool:
    expected = os.environ.get("WORKER_SHARED_SECRET", "")
    return bool(expected) and header_value == expected


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

def fetch_job(sb, job_id: str) -> dict:
    res = sb.table("jobs").select("*").eq("id", job_id).single().execute()
    if not res.data:
        raise RuntimeError(f"Job {job_id} not found")
    return res.data


def job_running(sb, job_id: str) -> None:
    sb.table("jobs").update(
        {"status": "running", "started_at": _now()}
    ).eq("id", job_id).execute()


def job_progress(sb, job_id: str, pct: float, stage: str, detail: str = "") -> None:
    sb.table("jobs").update(
        {"progress": {"pct": round(pct, 1), "stage": stage, "detail": detail}}
    ).eq("id", job_id).execute()


def job_succeeded(sb, job_id: str, output: Optional[dict] = None,
                  started: Optional[float] = None) -> None:
    update: dict[str, Any] = {
        "status": "succeeded",
        "finished_at": _now(),
        "progress": {"pct": 100, "stage": "done"},
    }
    if output is not None:
        update["output"] = output
    if started is not None:
        update["duration_ms"] = int((time.time() - started) * 1000)
    sb.table("jobs").update(update).eq("id", job_id).execute()


def job_failed(sb, job_id: str, error: str) -> None:
    sb.table("jobs").update(
        {"status": "failed", "error": error[:2000], "finished_at": _now()}
    ).eq("id", job_id).execute()


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Storage & assets
# ---------------------------------------------------------------------------

def download_asset(sb, asset: dict, dest_dir: str) -> str:
    """Download a storage object to dest_dir, returns local path."""
    Path(dest_dir).mkdir(parents=True, exist_ok=True)
    local = str(Path(dest_dir) / Path(asset["storage_path"]).name)
    data = sb.storage.from_(asset["bucket"]).download(asset["storage_path"])
    with open(local, "wb") as f:
        f.write(data)
    return local


def upload_file(sb, bucket: str, storage_path: str, local_path: str,
                content_type: str) -> None:
    with open(local_path, "rb") as f:
        sb.storage.from_(bucket).upload(
            storage_path,
            f.read(),
            file_options={"content-type": content_type, "upsert": "true"},
        )


def register_asset(sb, *, project_id: str, user_id: str, kind: str,
                   bucket: str, storage_path: str,
                   mime_type: Optional[str] = None,
                   range_: Optional[dict] = None,
                   meta: Optional[dict] = None) -> dict:
    row = {
        "project_id": project_id,
        "user_id": user_id,
        "kind": kind,
        "bucket": bucket,
        "storage_path": storage_path,
        "mime_type": mime_type,
        "range": range_,
        "meta": meta,
    }
    res = sb.table("assets").insert(row).execute()
    return res.data[0]


def get_project_asset(sb, project_id: str, kind: str) -> Optional[dict]:
    res = (
        sb.table("assets")
        .select("*")
        .eq("project_id", project_id)
        .eq("kind", kind)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def set_project_status(sb, project_id: str, status: str, **extra) -> None:
    sb.table("projects").update({"status": status, **extra}).eq(
        "id", project_id
    ).execute()


def save_json(obj: Any, path: str) -> str:
    with open(path, "w") as f:
        json.dump(obj, f)
    return path
