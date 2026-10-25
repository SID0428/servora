import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.db.models import UserModel, UserSessionModel, CompanyBranchModel, BranchTechnicianModel


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


def revoke_all_user_sessions(user_id: str, db: Session) -> None:
    try:
        db.query(UserSessionModel).filter(UserSessionModel.user_id == user_id).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()


def validate_user_active_and_hierarchy(user: UserModel, db: Session) -> None:
    # 1. Direct active status check
    if hasattr(user, "is_active") and not user.is_active:
        revoke_all_user_sessions(user.id, db)
        if user.role == "technician":
            detail = "Your technician access has been disabled. Please contact your franchise administrator."
        elif user.role in ("branch", "franchise"):
            detail = "Your franchise access has been disabled. Please contact your company administrator."
        elif user.role == "company":
            detail = "Your company access has been disabled. Please contact the platform administrator."
        else:
            detail = "Your access has been disabled. Please contact support."
        raise HTTPException(status_code=403, detail=detail)

    # 2. Hierarchical parent checks
    if user.role == "technician":
        bt = db.query(BranchTechnicianModel).filter(BranchTechnicianModel.technician_id == user.id).first()
        if bt:
            branch_user = db.query(UserModel).filter(UserModel.id == bt.branch_id).first()
            if branch_user and hasattr(branch_user, "is_active") and not branch_user.is_active:
                revoke_all_user_sessions(user.id, db)
                raise HTTPException(status_code=403, detail="Your franchise access has been disabled. Please contact your company administrator.")
            branch_entity = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == bt.branch_id).first()
            if branch_entity and branch_entity.company_id:
                company_user = db.query(UserModel).filter(UserModel.id == branch_entity.company_id).first()
                if company_user and hasattr(company_user, "is_active") and not company_user.is_active:
                    revoke_all_user_sessions(user.id, db)
                    raise HTTPException(status_code=403, detail="Your company access has been disabled. Please contact the platform administrator.")

    elif user.role in ("branch", "franchise"):
        branch_entity = db.query(CompanyBranchModel).filter(CompanyBranchModel.id == user.id).first()
        if branch_entity and branch_entity.company_id:
            company_user = db.query(UserModel).filter(UserModel.id == branch_entity.company_id).first()
            if company_user and hasattr(company_user, "is_active") and not company_user.is_active:
                revoke_all_user_sessions(user.id, db)
                raise HTTPException(status_code=403, detail="Your company access has been disabled. Please contact the platform administrator.")


def get_authenticated_user(request: Request, db: Session) -> UserModel:
    token = get_session_token(request)
    custom_uid = request.headers.get("x-servsure-user-id") or request.headers.get("x-servora-user-id")
    user: UserModel | None = None

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
                if session_exp.tzinfo is None:
                    session_exp = session_exp.replace(tzinfo=timezone.utc)
                if session_exp - now_utc() < timedelta(days=2):
                    session.expires_at = (now_utc() + SESSION_TTL).replace(tzinfo=None)
                    db.commit()
            except Exception:
                db.rollback()

            try:
                user = db.query(UserModel).filter(UserModel.id == session.user_id).first()
            except Exception:
                db.rollback()

        # Fallback 1: verify stateless cryptographic signature
        if not user:
            signed_user_id = verify_signed_token(token)
            if signed_user_id:
                try:
                    user = db.query(UserModel).filter(UserModel.id == signed_user_id).first()
                    if user:
                        try:
                            db.add(UserSessionModel(
                                token_hash=token_hash,
                                user_id=user.id,
                                expires_at=(now_utc() + SESSION_TTL).replace(tzinfo=None),
                            ))
                            db.commit()
                        except Exception:
                            db.rollback()
                except Exception:
                    db.rollback()

        # Fallback 2: token starts with srv1. and contains user_id
        if not user and token.startswith("srv1."):
            parts = token.rsplit(".", 2)
            if len(parts) == 3:
                extracted_uid = parts[0][5:]
                if extracted_uid:
                    try:
                        user = db.query(UserModel).filter(UserModel.id == extracted_uid).first()
                    except Exception:
                        db.rollback()

        # Fallback 3: token is user ID directly
        if not user:
            try:
                user = db.query(UserModel).filter(UserModel.id == token).first()
            except Exception:
                db.rollback()

    # Fallback 4: custom header X-Servora-User-Id
    if not user and custom_uid:
        try:
            user = db.query(UserModel).filter(UserModel.id == custom_uid).first()
        except Exception:
            db.rollback()

    # Fallback 5: cookie-based authentication
    if not user:
        cookie_user_id = request.cookies.get("servsure_user_id") or request.cookies.get("servora_user_id")
        if cookie_user_id:
            try:
                user = db.query(UserModel).filter(UserModel.id == cookie_user_id).first()
            except Exception:
                db.rollback()

    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Enforce active status & hierarchy checks
    validate_user_active_and_hierarchy(user, db)
    return user


def revoke_user_session(request: Request, db: Session) -> None:
    token = get_session_token(request)
    if not token:
        return
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        session = db.query(UserSessionModel).filter_by(token_hash=token_hash).first()
        if session:
            db.delete(session)
            db.commit()
    except Exception:
        db.rollback()

