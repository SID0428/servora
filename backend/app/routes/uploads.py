import os
import uuid
import base64
import mimetypes
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import UploadedFileModel

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

class Base64UploadPayload(BaseModel):
    base64_data: str
    filename: Optional[str] = "image.png"

@router.post("")
async def upload_file(
    file: Optional[UploadFile] = File(None),
    base64_payload: Optional[Base64UploadPayload] = None,
    db: Session = Depends(get_db)
):
    # Handle Multipart File Upload
    if file:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"File extension {ext} not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}")
        
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File size exceeds 5MB limit")
        
        unique_name = f"{uuid.uuid4().hex[:12]}_{os.path.basename(file.filename)}"
        dest_path = os.path.join(UPLOAD_DIR, unique_name)
        try:
            with open(dest_path, "wb") as f:
                f.write(contents)
        except Exception:
            pass
        
        content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
        try:
            db_file = UploadedFileModel(
                filename=unique_name,
                content_type=content_type,
                file_data=contents,
                size=len(contents)
            )
            db.merge(db_file)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[Upload] DB persistence warning: {e}")

        return {"url": f"/uploads/{unique_name}", "filename": unique_name, "size": len(contents)}

    # Handle Base64 Payload Upload (e.g. signature canvas or preview image)
    if base64_payload and base64_payload.base64_data:
        raw = base64_payload.base64_data
        if "," in raw:
            header, b64_str = raw.split(",", 1)
            ext = ".png"
            if "jpeg" in header or "jpg" in header:
                ext = ".jpg"
            elif "webp" in header:
                ext = ".webp"
            elif "pdf" in header:
                ext = ".pdf"
        else:
            b64_str = raw
            ext = ".png"

        try:
            data = base64.b64decode(b64_str)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 encoding")

        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File size exceeds 5MB limit")

        unique_name = f"b64_{uuid.uuid4().hex[:12]}{ext}"
        dest_path = os.path.join(UPLOAD_DIR, unique_name)
        try:
            with open(dest_path, "wb") as f:
                f.write(data)
        except Exception:
            pass

        ct_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".pdf": "application/pdf",
            ".png": "image/png"
        }
        content_type = ct_map.get(ext, "image/png")
        try:
            db_file = UploadedFileModel(
                filename=unique_name,
                content_type=content_type,
                file_data=data,
                size=len(data)
            )
            db.merge(db_file)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[Upload Base64] DB persistence warning: {e}")

        return {"url": f"/uploads/{unique_name}", "filename": unique_name, "size": len(data)}

    raise HTTPException(status_code=400, detail="No file or base64 data provided")

@router.get("/{filename}")
def get_uploaded_file(filename: str, db: Session = Depends(get_db)):
    safe_name = os.path.basename(filename)
    dest_path = os.path.join(UPLOAD_DIR, safe_name)
    if os.path.exists(dest_path):
        try:
            with open(dest_path, "rb") as f:
                data = f.read()
            mime = mimetypes.guess_type(dest_path)[0] or "application/octet-stream"
            return Response(content=data, media_type=mime)
        except Exception:
            pass
    
    # Query database
    rec = db.query(UploadedFileModel).filter(UploadedFileModel.filename == safe_name).first()
    if rec and rec.file_data:
        # Restore to disk
        try:
            with open(dest_path, "wb") as f:
                f.write(rec.file_data)
        except Exception:
            pass
        return Response(content=rec.file_data, media_type=rec.content_type or "application/octet-stream")

    raise HTTPException(status_code=404, detail="File not found")

