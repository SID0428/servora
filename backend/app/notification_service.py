import logging
import os
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.db.models import NotificationLogModel, UserModel, TechnicianModel, ServiceRequestModel
from app.email_service import send_brevo_email

logger = logging.getLogger("notifications")

def send_notification_email(
    to_email: str,
    to_name: str,
    subject: str,
    text_content: str,
    html_content: str | None = None,
    event_type: str = "general",
    reference_id: str | None = None,
    user_id: str | None = None,
    db: Session | None = None
) -> NotificationLogModel:
    """
    Sends an email notification via Brevo, safely catching errors so core transactions
    never fail in development/offline mode, and records an audit log entry in the database.
    """
    now_str = datetime.now().strftime("%d %b %Y, %I:%M %p")
    notif_id = f"NOTIF-{uuid.uuid4().hex[:8].upper()}"
    delivery_status = "sent"

    try:
        # Check if Brevo is configured
        if not os.getenv("BREVO_API_KEY") or not os.getenv("BREVO_SENDER_EMAIL"):
            logger.info("Brevo API key not set; simulating email dispatch to %s (%s)", to_email, subject)
            delivery_status = "simulated"
        else:
            send_brevo_email(
                to_email=to_email,
                to_name=to_name,
                subject=subject,
                text=text_content,
                html=html_content
            )
            logger.info("Successfully dispatched Brevo email to %s for event %s", to_email, event_type)
    except Exception as exc:
        logger.warning("Could not dispatch Brevo email to %s: %s", to_email, exc)
        delivery_status = "failed"

    notif_log = NotificationLogModel(
        id=notif_id,
        user_id=user_id,
        recipient_email=to_email,
        recipient_name=to_name,
        title=subject,
        body=text_content,
        channel="email",
        event_type=event_type,
        reference_id=reference_id,
        delivery_status=delivery_status,
        created_at=now_str
    )

    if db:
        try:
            db.add(notif_log)
            db.commit()
        except Exception as e:
            logger.warning("Failed to save notification log: %s", e)
            db.rollback()

    return notif_log

# -------------------------------------------------------------
# Transactional Event Dispatchers
# -------------------------------------------------------------

def notify_booking_created(req: ServiceRequestModel, db: Session):
    customer = db.query(UserModel).filter(UserModel.id == req.customer_id).first()
    to_email = customer.email if customer else "customer@servora.com"
    to_name = req.customer_name or "Valued Customer"
    subject = f"Servora Service Booking Confirmed: #{req.id}"
    
    text = f"""Hello {to_name},

Your service request #{req.id} for your {req.appliance_name} has been received and confirmed.

Booking Summary:
- Request ID: #{req.id}
- Appliance: {req.appliance_name} ({req.model_no})
- Reported Issue: {req.issue}
- Scheduled Date: {req.appointment_date}
- Time Slot: {req.appointment_slot}
- Doorstep Address: {req.customer_address}

Our authorized local franchise is assigning a certified technician to your doorstep visit.
You can track live technician status on your Servora Customer Dashboard.

Best regards,
Servora Customer Support Team
"""
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #1e293b; margin: 0;">Servora Service Confirmation</h2>
            <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;">Authorized Home Appliance Service Platform</p>
        </div>
        <p style="font-size: 15px; color: #334155;">Hello <strong>{to_name}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">Your service ticket <strong>#{req.id}</strong> for <strong>{req.appliance_name}</strong> has been confirmed.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; font-size: 14px; color: #334155;">
                <tr><td style="padding: 6px 0; color: #64748b; width: 40%;">Ticket ID:</td><td style="font-weight: bold; color: #2563eb;">#{req.id}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Appliance:</td><td>{req.appliance_name} ({req.model_no})</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Issue:</td><td>{req.issue}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Date & Slot:</td><td style="font-weight: 600;">{req.appointment_date} · {req.appointment_slot}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Address:</td><td>{req.customer_address}</td></tr>
            </table>
        </div>
        <p style="font-size: 13px; color: #64748b;">Our authorized franchise will assign a technician shortly. You will receive an arrival alert with your Service Start OTP.</p>
    </div>
    """
    send_notification_email(to_email, to_name, subject, text, html, "booking_created", req.id, req.customer_id, db)

def notify_technician_assigned(req: ServiceRequestModel, tech: TechnicianModel, db: Session):
    customer = db.query(UserModel).filter(UserModel.id == req.customer_id).first()
    to_email = customer.email if customer else "customer@servora.com"
    to_name = req.customer_name or "Valued Customer"
    start_otp = getattr(req, "start_otp", None) or req.verification_otp
    subject = f"Technician Assigned for Servora Ticket #{req.id}"

    text = f"""Hello {to_name},

Certified Technician {tech.name} has been assigned to your service request #{req.id}.

Technician Details:
- Name: {tech.name} ({tech.title})
- Contact: {tech.phone}
- Service Area: {tech.company_branch}

Doorstep Verification:
Your Service Start OTP is: {start_otp}
Please share this 4-digit OTP code ONLY when the technician arrives in person at your doorstep to initiate inspection.

Best regards,
Servora Operations
"""
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #1e293b; margin: 0;">Technician Assigned</h2>
            <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;">Service Ticket #{req.id}</p>
        </div>
        <p style="font-size: 15px; color: #334155;">Hello <strong>{to_name}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">A certified technician has been assigned for your <strong>{req.appliance_name}</strong> repair visit.</p>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; font-size: 14px; color: #166534;">
                <tr><td style="padding: 6px 0; color: #15803d; width: 40%;">Technician:</td><td style="font-weight: bold;">{tech.name} ({tech.title})</td></tr>
                <tr><td style="padding: 6px 0; color: #15803d;">Contact Phone:</td><td>{tech.phone}</td></tr>
                <tr><td style="padding: 6px 0; color: #15803d;">Branch:</td><td>{tech.company_branch}</td></tr>
            </table>
        </div>
        <div style="background-color: #fefce8; border: 1px dashed #ca8a04; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
            <span style="font-size: 12px; font-weight: bold; color: #854d0e; text-transform: uppercase; letter-spacing: 1px; display: block;">Doorstep Service Start OTP</span>
            <span style="font-size: 28px; font-weight: 800; color: #713f12; font-family: monospace; letter-spacing: 6px; display: block; margin-top: 6px;">{start_otp}</span>
            <p style="font-size: 12px; color: #a16207; margin: 6px 0 0 0;">Share this OTP code with the technician upon doorstep arrival to begin diagnosis.</p>
        </div>
    </div>
    """
    send_notification_email(to_email, to_name, subject, text, html, "technician_assigned", req.id, req.customer_id, db)

def notify_technician_arrival(req: ServiceRequestModel, db: Session):
    customer = db.query(UserModel).filter(UserModel.id == req.customer_id).first()
    to_email = customer.email if customer else "customer@servora.com"
    to_name = req.customer_name or "Valued Customer"
    start_otp = getattr(req, "start_otp", None) or req.verification_otp
    comp_otp = getattr(req, "completion_otp", None) or "----"
    subject = f"Technician is On the Way / Arriving for Servora Ticket #{req.id}"

    text = f"""Hello {to_name},

Your assigned technician is en route / arriving at your doorstep for ticket #{req.id}.

Verification Details:
- Start OTP: {start_otp} (share upon arrival)
- Completion OTP: {comp_otp} (share ONLY when repair is fully finished and tested)

Best regards,
Servora Support
"""
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #1e293b; margin: 0 0 16px 0;">Technician Doorstep Arrival Notice</h2>
        <p style="font-size: 14px; color: #334155;">Hello <strong>{to_name}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">Your technician is arriving for ticket <strong>#{req.id}</strong> ({req.appliance_name}).</p>
        <div style="display: flex; gap: 12px; margin: 20px 0;">
            <div style="flex: 1; background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 16px; text-align: center;">
                <span style="font-size: 11px; font-weight: bold; color: #854d0e; display: block;">START OTP (Arrival)</span>
                <span style="font-size: 24px; font-weight: 800; color: #713f12; font-family: monospace; letter-spacing: 4px; display: block; margin-top: 4px;">{start_otp}</span>
            </div>
            <div style="flex: 1; background-color: #e0e7ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 16px; text-align: center;">
                <span style="font-size: 11px; font-weight: bold; color: #3730a3; display: block;">COMPLETION OTP (End)</span>
                <span style="font-size: 24px; font-weight: 800; color: #312e81; font-family: monospace; letter-spacing: 4px; display: block; margin-top: 4px;">{comp_otp}</span>
            </div>
        </div>
        <p style="font-size: 12px; color: #64748b;">Do not share your Completion OTP until repair work is finished and verified to your satisfaction.</p>
    </div>
    """
    send_notification_email(to_email, to_name, subject, text, html, "technician_arrival", req.id, req.customer_id, db)

def notify_estimate_submitted(req: ServiceRequestModel, estimate, db: Session):
    customer = db.query(UserModel).filter(UserModel.id == req.customer_id).first()
    to_email = customer.email if customer else "customer@servora.com"
    to_name = req.customer_name or "Valued Customer"
    subject = f"Action Required: Approve Pre-Repair Estimate for Servora Ticket #{req.id}"

    text = f"""Hello {to_name},

Your technician has completed diagnosis for {req.appliance_name} (#{req.id}) and submitted an itemized pre-repair estimate.

Cost Breakdown:
- Inspection Fee: ₹{estimate.inspection_fee:.2f}
- Labor Charges: ₹{estimate.labor_estimate:.2f}
- Total Pre-Repair Estimate: ₹{estimate.total_estimate:.2f}

Under Servora Customer Protection (SRS 6.10), repair and parts replacement will NOT begin until you approve this estimate on your customer portal.

Please log in to your Servora Customer Dashboard to review and approve or decline this estimate.

Best regards,
Servora Customer Care
"""
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #1e293b; margin: 0;">Pre-Repair Estimate Approval Gate</h2>
            <p style="color: #b45309; font-size: 14px; margin: 4px 0 0 0;">Customer Authorization Required (SRS 6.10)</p>
        </div>
        <p style="font-size: 14px; color: #334155;">Hello <strong>{to_name}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">Your technician has prepared a repair estimate for ticket <strong>#{req.id}</strong>. Repair work will commence only upon your approval.</p>
        <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; font-size: 14px; color: #78350f;">
                <tr><td style="padding: 6px 0; color: #92400e;">Inspection Fee:</td><td style="text-align: right; font-weight: 600;">₹{estimate.inspection_fee:.2f}</td></tr>
                <tr><td style="padding: 6px 0; color: #92400e;">Labor Estimate:</td><td style="text-align: right; font-weight: 600;">₹{estimate.labor_estimate:.2f}</td></tr>
                <tr style="border-top: 1px solid #fde68a;"><td style="padding: 8px 0; font-weight: bold; color: #78350f;">Total Estimate:</td><td style="text-align: right; font-weight: 800; font-size: 18px; color: #b45309;">₹{estimate.total_estimate:.2f}</td></tr>
            </table>
        </div>
        <p style="font-size: 13px; color: #475569;">Please open your <strong>Servora Customer Portal</strong> to approve or decline the estimate.</p>
    </div>
    """
    send_notification_email(to_email, to_name, subject, text, html, "estimate_pending", req.id, req.customer_id, db)

def notify_escalation_raised(escalation, req: ServiceRequestModel, db: Session):
    recipient_email = "admin@servora.com"
    recipient_name = "Platform Administrator"
    
    if escalation.level == 1:
        if req.branch_id:
            branch_user = db.query(UserModel).filter(UserModel.id == req.branch_id).first()
            if branch_user:
                recipient_email = branch_user.email
                recipient_name = branch_user.name
        if recipient_email == "admin@servora.com":
            franchise = db.query(UserModel).filter(UserModel.role.in_(["branch", "franchise"])).first()
            if franchise:
                recipient_email = franchise.email
                recipient_name = franchise.name
    elif escalation.level == 2:
        if req.company_id:
            company_user = db.query(UserModel).filter(UserModel.id == req.company_id).first()
            if company_user:
                recipient_email = company_user.email
                recipient_name = company_user.name

    level_names = {1: "Level 1 (Franchise)", 2: "Level 2 (Brand Manager)", 3: "Level 3 (Platform Admin)"}
    lvl_label = level_names.get(escalation.level, f"Level {escalation.level}")
    subject = f"⚠️ [SLA ESCALATION] Ticket #{req.id} escalated to {lvl_label}"

    text = f"""ATTENTION: SLA Breach Escalation Notice

Ticket #{req.id} ({req.appliance_name}) has breached SLA thresholds and has been escalated to {lvl_label}.

Escalation Details:
- Escalation ID: #{escalation.id}
- Ticket ID: #{req.id}
- Customer: {req.customer_name} ({req.customer_phone})
- Reason: {escalation.reason}
- Tier: {lvl_label}
- Due Date: {escalation.due_date or 'Immediate Action Required'}

Under Servora SLA Governance (SRS 6.15), tickets cannot be closed without an authorized resolution note. Please take corrective operational action.

Servora SLA Escalation Engine
"""
    send_notification_email(recipient_email, recipient_name, subject, text, None, "escalation_raised", req.id, None, db)

def notify_escalation_resolved(escalation, req: ServiceRequestModel, db: Session):
    customer = db.query(UserModel).filter(UserModel.id == req.customer_id).first()
    to_email = customer.email if customer else "customer@servora.com"
    to_name = req.customer_name or "Valued Customer"
    subject = f"✓ [RESOLVED] Escalation #{escalation.id} for Servora Ticket #{req.id}"

    text = f"""Hello {to_name},

The escalation #{escalation.id} for your service ticket #{req.id} ({req.appliance_name}) has been resolved.

Resolution Details:
- Resolution Note: {escalation.resolution_note}
- Resolved At: {escalation.resolved_at}

Thank you for your patience with Servora.

Servora Support Team
"""
    send_notification_email(to_email, to_name, subject, text, None, "escalation_resolved", req.id, req.customer_id, db)
