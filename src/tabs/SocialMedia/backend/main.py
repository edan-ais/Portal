import os
import threading
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from supabase import create_client, Client
from pipeline import build_montage_for_paths, TmpDir

# ---------- Env ----------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip() or os.environ.get("SUPABASE_ANON_KEY", "").strip()
SOCIAL_BUCKET = os.environ.get("SOCIAL_BUCKET", "social")
WORK_DIR = os.environ.get("SOCIAL_WORKDIR", "/tmp/social-work")
API_BEARER = os.environ.get("API_BEARER", "").strip()  # optional shared secret for POST /api/run

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON) in environment.")

os.makedirs(WORK_DIR, exist_ok=True)

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------- State ----------
RUN_LOCK = threading.Lock()
IS_CREATING = False
LAST_RUN: Optional[str] = None
STARTED_AT: Optional[str] = None

def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"

# ---------- DB & Storage helpers ----------
def sb_list_incoming_files() -> List[dict]:
    # Prefer DB view: files (not trashed) with file_path like 'incoming/%'
    res = sb.table("files") \
        .select("id,name,file_path,created_at,mime_type,file_size") \
        .like("file_path", "incoming/%") \
        .eq("is_trashed", False) \
        .order("created_at", desc=False) \
        .execute()
    return res.data or []

def sb_storage_download_to(path: str, local_path: str):
    data = sb.storage.from_(SOCIAL_BUCKET).download(path)
    with open(local_path, "wb") as f:
        f.write(data)

def sb_storage_upload_from(local_path: str, dest_path: str, content_type: Optional[str] = None):
    with open(local_path, "rb") as f:
        sb.storage.from_(SOCIAL_BUCKET).upload(
            dest_path,
            f,
            file_options={"contentType": content_type} if content_type else None
        )

def sb_storage_move(from_path: str, to_path: str):
    # Ensure unique dest (avoid collision)
    try:
        sb.storage.from_(SOCIAL_BUCKET).move(from_path, to_path)
    except Exception:
        base, ext = os.path.splitext(to_path)
        ts = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        sb.storage.from_(SOCIAL_BUCKET).move(from_path, f"{base}.{ts}{ext}")

def sb_update_file_paths(rows: List[dict], new_paths: List[str]):
    for row, newp in zip(rows, new_paths):
        sb.table("files").update({"file_path": newp, "updated_at": now_iso()}).eq("id", row["id"]).execute()

def sb_insert_output_row(name: str, path: str, size: int, mime: str = "video/mp4"):
    sb.table("files").insert({
        "folder_id": None,          # lives on the main page
        "name": name,
        "file_path": path,
        "file_size": size,
        "mime_type": mime,
        "is_trashed": False
    }).execute()

def latest_upload_iso(rows: List[dict]) -> Optional[str]:
    if not rows:
        return None
    rows_sorted = sorted(rows, key=lambda x: x.get("created_at") or "")
    return rows_sorted[-1].get("created_at")

# ---------- Build thread ----------
def run_build_pipeline():
    global IS_CREATING, LAST_RUN, STARTED_AT
    if IS_CREATING:
        return

    with RUN_LOCK:
        if IS_CREATING:
            return
        IS_CREATING = True
        STARTED_AT = now_iso()

    try:
        incoming_rows = sb_list_incoming_files()
        if not incoming_rows:
            # Nothing to do
            return

        # Download all to temp dir
        with TmpDir(WORK_DIR) as tmp:
            local_entries = []
            for r in incoming_rows:
                src = r["file_path"]  # e.g., "incoming/clip.mp4"
                local_path = os.path.join(tmp, os.path.basename(src))
                sb_storage_download_to(src, local_path)
                local_entries.append({"row": r, "local": local_path})

            # Build montage file
            output_local = build_montage_for_paths([e["local"] for e in local_entries])

            # Upload output
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            out_name = f"montage_output_{ts}.mp4"
            out_remote = f"outputs/{out_name}"
            sb_storage_upload_from(output_local, out_remote, content_type="video/mp4")

            # Archive inputs
            archived_paths = []
            for e in local_entries:
                src = e["row"]["file_path"]     # incoming/xxx
                base = os.path.basename(src)
                dest = f"archive/{base}.{ts}"
                sb_storage_move(src, dest)
                archived_paths.append(dest)

            # Update DB file_paths for archived inputs
            sb_update_file_paths([e["row"] for e in local_entries], archived_paths)

            # Insert DB row for output
            out_size = os.path.getsize(output_local)
            sb_insert_output_row(out_name, out_remote, out_size, mime="video/mp4")

            LAST_RUN = now_iso()
    finally:
        IS_CREATING = False


# ---------- FastAPI ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

@app.get("/")
def heartbeat():
    return {"ok": True, "service": "social-video"}

@app.get("/api/status")
def status():
    incoming = sb_list_incoming_files()
    return {
        "is_video_creating": IS_CREATING,
        "status": "creating" if IS_CREATING else "idle",
        "last_run": LAST_RUN,
        "started_at": STARTED_AT,
        "pending_count": len(incoming),
        "last_upload_at": latest_upload_iso(incoming)
    }

@app.post("/api/run")
def run(request: Request):
    # optional bearer check
    if API_BEARER:
        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer ") or auth.split(" ", 1)[1].strip() != API_BEARER:
            raise HTTPException(status_code=401, detail="Unauthorized")

    if IS_CREATING:
        return Response(
            content='{"accepted": true, "already_running": true}',
            media_type="application/json",
            status_code=202,
        )

    threading.Thread(target=run_build_pipeline, daemon=True).start()
    return {"accepted": True}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=False)
