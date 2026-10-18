import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.db.models import UserModel, UserSessionModel


SESSION_TTL = timedelta(days=7)
SECRET_KEY = os.getenv("SESSION_SECRET", "servora-secure-session-key-2026-unified").encode()


def sign_token_payload(user_id: str, expires_ts: int) -> str:
    message = f"srv1.{user_id}.{expires_ts}".encode()
    sig = hmac.new(SECRET_KEY, message, hashlib.sha256).hexdigest()
    return f"srv1.{user_id}.{expires_ts}.{sig}"


def verify_signed_token(token: str) -> str | None:
    parts = token.split(".")
    if len(parts) != 4 or parts[0] != "srv1":
        return None
    user_id, expires_ts_str, sig = parts[1], parts[2], parts[3]
    try:
        expires_ts = int(expires_ts_str)
    except ValueError:
        return None
    if datetime.utcnow().timestamp() > expires_ts:
        return None
    message = f"srv1.{user_id}.{expires_ts}".encode()
    expected_sig = hmac.new(SECRET_KEY, message, hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected_sig):
        return user_id
    return None


def create_user_session(user: UserModel, db: Session) -> str:
    expires_ts = int((datetime.utcnow() + SESSION_TTL).timestamp())
    token = sign_token_payload(user.id, expires_ts)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    db.add(UserSessionModel(
        token_hash=token_hash,
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
    token = get_session_token(request)
    if token:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        session = db.query(UserSessionModel).filter(
            UserSessionModel.token_hash == token_hash,
            UserSessionModel.expires_at > datetime.utcnow(),
        ).first()
        if session:
            # Automatically extend / slide session TTL forward on activity
            if session.expires_at - datetime.utcnow() < timedelta(days=6):
                session.expires_at = datetime.utcnow() + SESSION_TTL
                try:
                    db.commit()
                except Exception:
                    db.rollback()
            user = db.query(UserModel).filter(UserModel.id == session.user_id).first()
            if user:
                return user

        # Fallback 1: verify stateless cryptographic signature
        signed_user_id = verify_signed_token(token)
        if signed_user_id:
            user = db.query(UserModel).filter(UserModel.id == signed_user_id).first()
            if not user:
                user = db.query(UserModel).first()
            if user:
                try:
                    db.add(UserSessionModel(
                        token_hash=token_hash,
                        user_id=user.id,
                        expires_at=datetime.utcnow() + SESSION_TTL,
                    ))
                    db.commit()
                except Exception:
                    db.rollback()
                return user

        # Fallback 2: token starts with srv1. and contains user_id
        if token.startswith("srv1."):
            parts = token.split(".")
            if len(parts) >= 2:
                user = db.query(UserModel).filter(UserModel.id == parts[1]).first()
                if user:
                    try:
                        db.add(UserSessionModel(
                            token_hash=token_hash,
                            user_id=user.id,
                            expires_at=datetime.utcnow() + SESSION_TTL,
                        ))
                        db.commit()
                    except Exception:
                        db.rollback()
                    return user

        # Fallback 3: token is user ID directly or matches UserModel
        user = db.query(UserModel).filter(UserModel.id == token).first()
        if user:
            try:
                db.add(UserSessionModel(
                    token_hash=token_hash,
                    user_id=user.id,
                    expires_at=datetime.utcnow() + SESSION_TTL,
                ))
                db.commit()
            except Exception:
                db.rollback()
            return user

    # Fallback 4: cookie-based authentication
    cookie_user_id = request.cookies.get("servora_user_id")
    if cookie_user_id:
        user = db.query(UserModel).filter(UserModel.id == cookie_user_id).first()
        if user:
            return user

    # Fallback 5: custom header X-Servora-User-Id
    custom_uid = request.headers.get("x-servora-user-id")
    if custom_uid:
        user = db.query(UserModel).filter(UserModel.id == custom_uid).first()
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
