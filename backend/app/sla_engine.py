import json
import logging
import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.db.models import ServiceRequestModel, EscalationModel, UserModel
from app.notification_service import notify_escalation_raised

logger = logging.getLogger("sla_engine")

def parse_created_at(created_str: str) -> datetime | None:
    if not created_str:
        return None
    for fmt in ("%d %b %Y, %I:%M %p", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d %b %Y"):
        try:
            return datetime.strptime(created_str.strip(), fmt)
        except ValueError:
            pass
    return None

def evaluate_sla_breaches(db: Session) -> list[EscalationModel]:
    """
    Evaluates all active service requests against SRS 6.15 SLA thresholds:
    - Unassigned > 4h -> Level 1 (Franchise)
    - Unassigned > 8h -> Level 2 (Brand Manager)
    - Unassigned > 12h -> Level 3 (Platform Admin)
    - Unresolved > 48h -> Level 1 (Franchise)
    - Unresolved > 72h -> Level 2 (Brand Manager)
    - Unresolved > 96h -> Level 3 (Platform Admin)
    """
    now = datetime.now()
    now_str = now.strftime("%d %b %Y, %I:%M %p")
    new_escalations = []

    active_requests = db.query(ServiceRequestModel).filter(
        ServiceRequestModel.status != "Completed",
        ServiceRequestModel.status != "Cancelled"
    ).all()

    for req in active_requests:
        created_dt = parse_created_at(req.created_at)
        if not created_dt:
            continue

        elapsed_hours = (now - created_dt).total_seconds() / 3600.0
        target_level = 0
        target_role = "franchise"
        reason = ""

        # 1. Check Unassigned SLA (>4h)
        is_unassigned = not req.technician_id and req.status in ("Request Created", "Pending")
        if is_unassigned:
            if elapsed_hours >= 12.0:
                target_level = 3
                target_role = "admin"
                reason = f"Critical SLA Breach: Request #{req.id} unassigned for {int(elapsed_hours)}h (> 12h threshold)."
            elif elapsed_hours >= 8.0:
                target_level = 2
                target_role = "company"
                reason = f"Major SLA Breach: Request #{req.id} unassigned for {int(elapsed_hours)}h (> 8h threshold)."
            elif elapsed_hours >= 4.0:
                target_level = 1
                target_role = "franchise"
                reason = f"SLA Breach: Request #{req.id} unassigned for {int(elapsed_hours)}h (> 4h threshold)."

        # 2. Check Unresolved SLA (>48h)
        if elapsed_hours >= 48.0 and req.status != "Completed":
            unresolved_level = 1
            unresolved_role = "franchise"
            if elapsed_hours >= 96.0:
                unresolved_level = 3
                unresolved_role = "admin"
            elif elapsed_hours >= 72.0:
                unresolved_level = 2
                unresolved_role = "company"

            # Pick highest level between unassigned and unresolved breaches
            if unresolved_level > target_level:
                target_level = unresolved_level
                target_role = unresolved_role
                reason = f"SLA Breach: Service ticket #{req.id} unresolved for {int(elapsed_hours)}h (Level {target_level} SLA breach)."

        if target_level > 0:
            # Check existing open escalations for this request
            existing_esc = db.query(EscalationModel).filter(
                EscalationModel.request_id == req.id,
                EscalationModel.status.in_(["Open", "In Progress"])
            ).first()

            if existing_esc:
                if existing_esc.level < target_level:
                    logger.info("Upgrading escalation %s for request %s from L%s to L%s", existing_esc.id, req.id, existing_esc.level, target_level)
                    existing_esc.level = target_level
                    existing_esc.target_role = target_role
                    existing_esc.reason = reason
                    req.is_escalated = True
                    req.escalation_level = target_level
                    db.commit()
                    notify_escalation_raised(existing_esc, req, db)
                    new_escalations.append(existing_esc)
            else:
                esc_id = f"ESC-{random.randint(1000, 9999)}"
                due_dt = (now + timedelta(hours=4)).strftime("%d %b %Y, %I:%M %p")
                new_esc = EscalationModel(
                    id=esc_id,
                    request_id=req.id,
                    level=target_level,
                    target_role=target_role,
                    reason=reason,
                    status="Open",
                    due_date=due_dt,
                    created_at=now_str
                )
                db.add(new_esc)
                req.is_escalated = True
                req.escalation_level = target_level

                # Add timeline step
                try:
                    timeline = json.loads(req.timeline_json) if req.timeline_json else []
                    timeline.append({
                        "id": f"step_esc_{target_level}",
                        "title": f"SLA Escalation Level {target_level}",
                        "timestamp": now_str,
                        "description": reason,
                        "state": "current"
                    })
                    req.timeline_json = json.dumps(timeline)
                except Exception:
                    pass

                db.commit()
                db.refresh(new_esc)
                logger.info("Created new SLA escalation %s (Level %s) for request %s", esc_id, target_level, req.id)
                notify_escalation_raised(new_esc, req, db)
                new_escalations.append(new_esc)

    return new_escalations
