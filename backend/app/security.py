import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.db.models import UserModel, UserSessionModel


SESSION_TTL = timedelta(days=7)


def create_user_session(user: UserModel, db: Session) -> str:
    token = secrets.token_urlsafe(48)
    db.add(UserSessionModel(
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        user_id=user.id,
        expires_at=datetime.utcnow() + SESSION_TTL,
    ))
    return token


def get_session_token(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    return None


def get_authenticated_user(request: Request, db: Session) -> UserModel:
    cookie_user_id = request.cookies.get("servora_user_id")
    if cookie_user_id:
        user = db.query(UserModel).filter(UserModel.id == cookie_user_id).first()
        if user:
            return user

    token = get_session_token(request)
    if token:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        session = db.query(UserSessionModel).filter(
            UserSessionModel.token_hash == token_hash,
            UserSessionModel.expires_at > datetime.utcnow(),
        ).first()
        if session:
            user = db.query(UserModel).filter(UserModel.id == session.user_id).first()
            if user:
                return user

    raise HTTPException(status_code=401, detail="Not authenticated")


def revoke_user_session(request: Request, db: Session) -> None:
    token = get_session_token(request)
    if not token:
        return
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    session = db.query(UserSessionModel).filter_by(token_hash=token_hash).first()
    if session:
        db.delete(session)
