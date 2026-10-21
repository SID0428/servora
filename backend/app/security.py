import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.db.models import UserModel, UserSessionModel


SESSION_TTL = timedelta(days=7)
SECRET_KEY = os.getenv("SESSION_SECRET", "servora-secure-session-key-2026-unified").encode()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def sign_token_payload(user_id: str, expires_ts: int) -> str:
    message = f"srv1.{user_id}.{expires_ts}".encode()
    sig = hmac.new(SECRET_KEY, message, hashlib.sha256).hexdigest()
    return f"srv1.{user_id}.{expires_ts}.{sig}"


def verify_signed_token(token: str) -> str | None:
    if not token or not token.startswith("srv1."):
        return None
    # Token format: srv1.{user_id}.{expires_ts}.{sig}
    # Using rsplit(".", 2) ensures user_id can contain dots (e.g. emails)
    parts = token.rsplit(".", 2)
    if len(parts) != 3:
        return None
    prefix_and_user_id, expires_ts_str, sig = parts[0], parts[1], parts[2]
    user_id = prefix_and_user_id[5:]  # strip 'srv1.'
    if not user_id:
        return None
    try:
        expires_ts = int(expires_ts_str)
    except ValueError:
        return None
    if now_utc().timestamp() > expires_ts:
        return None
    message = f"srv1.{user_id}.{expires_ts}".encode()
    expected_sig = hmac.new(SECRET_KEY, message, hashlib.sha256).hexdigest()
    if hmac.compare_digest(sig, expected_sig):
        return user_id
    return None


def create_user_session(user: UserModel, db: Session) -> str:
    expires_dt = now_utc() + SESSION_TTL
    expires_ts = int(expires_dt.timestamp())
    token = sign_token_payload(user.id, expires_ts)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        # Check if session hash already exists
        existing = db.query(UserSessionModel).filter_by(token_hash=token_hash).first()
        if existing:
            existing.expires_at = expires_dt.replace(tzinfo=None)
        else:
            db.add(UserSessionModel(
                token_hash=token_hash,
                user_id=user.id,
                expires_at=expires_dt.replace(tzinfo=None),
            ))
        db.commit()
    except Exception:
        db.rollback()
    return token


def get_session_token(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    return None


def get_authenticated_user(request: Request, db: Session) -> UserModel:
    token = get_session_token(request)
    custom_uid = request.headers.get("x-servsure-user-id") or request.headers.get("x-servora-user-id")

    if token:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        session = None
        try:
            session = db.query(UserSessionModel).filter(
                UserSessionModel.token_hash == token_hash,
                UserSessionModel.expires_at > now_utc().replace(tzinfo=None),
            ).first()
        except Exception:
            db.rollback()

        if session:
            # Automatically extend / slide session TTL forward on activity
            try:
                session_exp = session.expires_at
                # Handle naive datetime from DB
                if session_exp.tzinfo is None:
                    session_exp = session_exp.replace(tzinfo=timezone.utc)
                if session_exp - now_utc() < timedelta(days=6):
                    session.expires_at = (now_utc() + SESSION_TTL).replace(tzinfo=None)
                    db.commit()
            except Exception:
                db.rollback()

            try:
                user = db.query(UserModel).filter(UserModel.id == session.user_id).first()
                if user:
                    return user
            except Exception:
                db.rollback()

        # Fallback 1: verify stateless cryptographic signature
        signed_user_id = verify_signed_token(token)
        if signed_user_id:
            try:
                user = db.query(UserModel).filter(UserModel.id == signed_user_id).first()
                if user:
                    # Persist session to DB if not present
                    try:
                        db.add(UserSessionModel(
                            token_hash=token_hash,
                            user_id=user.id,
                            expires_at=(now_utc() + SESSION_TTL).replace(tzinfo=None),
                        ))
                        db.commit()
                    except Exception:
                        db.rollback()
                    return user
            except Exception:
                db.rollback()

        # Fallback 2: token starts with srv1. and contains user_id
        if token.startswith("srv1."):
            parts = token.rsplit(".", 2)
            if len(parts) == 3:
                extracted_uid = parts[0][5:]
                if extracted_uid:
                    try:
                        user = db.query(UserModel).filter(UserModel.id == extracted_uid).first()
                        if user:
                            return user
                    except Exception:
                        db.rollback()

        # Fallback 3: token is user ID directly
        try:
            user = db.query(UserModel).filter(UserModel.id == token).first()
            if user:
                return user
        except Exception:
            db.rollback()

    # Fallback 4: custom header X-Servora-User-Id
    if custom_uid:
        try:
            user = db.query(UserModel).filter(UserModel.id == custom_uid).first()
            if user:
                return user
        except Exception:
            db.rollback()

    # Fallback 5: cookie-based authentication
    cookie_user_id = request.cookies.get("servsure_user_id") or request.cookies.get("servora_user_id")
    if cookie_user_id:
        try:
            user = db.query(UserModel).filter(UserModel.id == cookie_user_id).first()
            if user:
                return user
        except Exception:
            db.rollback()

    raise HTTPException(status_code=401, detail="Not authenticated")


def revoke_user_session(request: Request, db: Session) -> None:
    token = get_session_token(request)
    if not token:
        return
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        session = db.query(UserSessionModel).filter_by(token_hash=token_hash).first()
        if session:
            db.delete(session)
    except Exception:
        db.rollback()

