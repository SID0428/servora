import os
import uuid
import base64
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from pydantic import BaseModel

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
    base64_payload: Optional[Base64UploadPayload] = None
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
        with open(dest_path, "wb") as f:
            f.write(contents)
        
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
        with open(dest_path, "wb") as f:
            f.write(data)

        return {"url": f"/uploads/{unique_name}", "filename": unique_name, "size": len(data)}

    raise HTTPException(status_code=400, detail="No file or base64 data provided")
