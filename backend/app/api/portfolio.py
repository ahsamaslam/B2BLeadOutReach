"""
Portfolio file management API.
Supports upload (PDF, DOCX, PPTX, PNG, JPG), list, download, delete.
Files are stored per-workspace: tenant{tenant_id}_ prefix for tenant users,
user{id}_ prefix for super-admins (no tenant). This means all users in the
same workspace share the same portfolio files.
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.auth import get_current_user
from app.models import User

router = APIRouter()

UPLOAD_DIR = Path("/app/uploads/portfolio")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx",
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".xlsx", ".xls", ".csv", ".zip",
}


def _ensure_upload_dir():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _workspace_prefix(user: User) -> str:
    """Return a prefix shared by all users in the same workspace."""
    if user.tenant_id:
        return f"tenant{user.tenant_id}_"
    return f"user{user.id}_"


@router.get("/")
def list_portfolio(current_user: User = Depends(get_current_user)):
    """List all portfolio files belonging to the current user."""
    _ensure_upload_dir()
    prefix = _workspace_prefix(current_user)
    files = []
    for f in UPLOAD_DIR.iterdir():
        if f.is_file() and f.name.startswith(prefix):
            display_name = f.name[len(prefix):]
            files.append({
                "filename": display_name,
                "stored_name": f.name,
                "size": f.stat().st_size,
                "url": f"/api/portfolio/download/{f.name}",
            })
    files.sort(key=lambda x: x["filename"])
    return files


@router.post("/upload")
async def upload_portfolio(
    files: list[UploadFile] = File(description="One or more portfolio files"),
    current_user: User = Depends(get_current_user),
):
    """Upload one or more portfolio files (max 10 MB each)."""
    _ensure_upload_dir()
    prefix = _workspace_prefix(current_user)
    saved = []

    for upload in files:
        # Validate extension
        suffix = Path(upload.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{suffix}' not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        content = await upload.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"{upload.filename} exceeds 10 MB limit")

        # Sanitise filename and prepend user prefix
        safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in (upload.filename or "file"))
        safe_name = safe_name.strip().replace(" ", "_")
        dest = UPLOAD_DIR / f"{prefix}{safe_name}"

        # Avoid accidental overwrites by appending a short UUID if needed
        if dest.exists():
            dest = UPLOAD_DIR / f"{prefix}{Path(safe_name).stem}_{uuid.uuid4().hex[:6]}{suffix}"

        dest.write_bytes(content)
        saved.append({"filename": safe_name, "stored_name": dest.name, "size": len(content)})

    return {"uploaded": saved}


@router.get("/download/{stored_name}")
def download_portfolio(
    stored_name: str,
    current_user: User = Depends(get_current_user),
):
    """Download a portfolio file (must belong to the current user)."""
    prefix = _workspace_prefix(current_user)
    if not stored_name.startswith(prefix):
        raise HTTPException(status_code=403, detail="Access denied")

    file_path = UPLOAD_DIR / stored_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    display_name = stored_name[len(prefix):]
    return FileResponse(path=str(file_path), filename=display_name)


@router.delete("/{stored_name}")
def delete_portfolio(
    stored_name: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a portfolio file (must belong to the current user)."""
    prefix = _workspace_prefix(current_user)
    if not stored_name.startswith(prefix):
        raise HTTPException(status_code=403, detail="Access denied")

    file_path = UPLOAD_DIR / stored_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    file_path.unlink()
    return {"message": "Deleted", "stored_name": stored_name}
