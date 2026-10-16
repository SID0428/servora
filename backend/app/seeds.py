import json
from sqlalchemy.orm import Session
from app.db.session import engine, Base, SessionLocal
from app.db.models import UserModel, TechnicianModel, ApplianceModel, ServiceRequestModel

def seed_database(db: Session):
    # Ensure tables exist in MySQL or SQLite
    Base.metadata.create_all(bind=engine)

    # 1. Seed Users if not present
    if not db.query(UserModel).first():
        users = [
            UserModel(
                id="customer_1",
                name="Shreyansh Bansal",
                email="shreyansh@servora.com",
                phone="+91 98765 43210",
                role="customer",
                avatar="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80",
                address="12, Sector 4, Greater Noida, UP - 201310"
            ),
            UserModel(
                id="tech_1",
                name="Rahul Sharma",
                email="rahul.sharma@crompton-service.com",
                phone="+91 98111 22334",
                role="technician",
                avatar="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80",
                address="Sector 18, Noida"
            ),
            UserModel(
                id="branch_1",
                name="Amit Sharma",
                email="amit.noida@crompton-service.com",
                phone="+91 99887 76655",
                role="branch",
                avatar="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80",
                address="Noida Branch, Sector 63, Noida"
            ),
            UserModel(
                id="company_1",
                name="Riya Patel",
                email="riya.patel@crompton.com",
                phone="+91 98222 33445",
                role="company",
                avatar="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80",
                address="Crompton Corporate HQ, Mumbai"
            ),
            UserModel(
                id="admin_1",
                name="Vikramaditya Rao",
                email="admin@servora.com",
                phone="+91 99999 00000",
                role="admin",
                avatar="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=250&q=80",
                address="Servora Platform Command Center, Bengaluru"
            )
        ]
        db.add_all(users)
        db.commit()

    # 2. Seed Technicians
    if not db.query(TechnicianModel).first():
        techs = [
            TechnicianModel(
                id="tech_1",
                name="Rahul Sharma",
                title="Crompton Authorized Technician",
                company_branch="Noida Sector 63 Branch",
                rating=4.9,
                total_jobs=124,
                phone="+91 98111 22334",
                avatar="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80",
                is_verified=True
            ),
            TechnicianModel(
                id="tech_2",
                name="Suresh Kumar",
                title="LG Certified Senior Technician",
                company_branch="Greater Noida East Branch",
                rating=4.8,
                total_jobs=98,
                phone="+91 98234 56789",
                avatar="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80",
                is_verified=True
            )
        ]
        db.add_all(techs)
        db.commit()

    # 3. Seed Appliances
    if not db.query(ApplianceModel).first():
        apps = [
            ApplianceModel(
                id="app_1",
                user_id="customer_1",
                brand="Crompton",
                category="Air Conditioner",
                model_no="GL-5292",
                registered_on="12 Jun 2024",
                warranty_status="Active (Expires Jun 2026)",
                serial_no="CR-AC-2024-8841",
                icon="air-vent"
            ),
            ApplianceModel(
                id="app_2",
                user_id="customer_1",
                brand="LG",
                category="Refrigerator",
                model_no="GL-382",
                registered_on="03 Feb 2023",
                warranty_status="AMC Covered",
                serial_no="LG-REF-9921",
                icon="refrigerator"
            ),
            ApplianceModel(
                id="app_3",
                user_id="customer_1",
                brand="Samsung",
                category="Microwave Oven",
                model_no="MC-288",
                registered_on="15 Nov 2023",
                warranty_status="Active",
                serial_no="SAM-MW-4412",
                icon="microwave"
            )
        ]
        db.add_all(apps)
        db.commit()

    # 4. Seed Service Request SR-7845
    if not db.query(ServiceRequestModel).first():
        timeline_data = [
            {
                "id": "step_1",
                "title": "Request Created",
                "timestamp": "21 Jun 2025, 10:24 AM",
                "description": "Service ticket registered via Servora app",
                "state": "completed"
            },
            {
                "id": "step_2",
                "title": "Technician Assigned",
                "timestamp": "21 Jun 2025, 11:02 AM",
                "description": "Assigned to Rahul Sharma (Authorized Specialist)",
                "state": "completed"
            },
            {
                "id": "step_3",
                "title": "Technician on the Way",
                "timestamp": "21 Jun 2025, 03:45 PM",
                "description": "Live tracking available. ETA 15 mins",
                "state": "current"
            },
            {
                "id": "step_4",
                "title": "Service In Progress",
                "timestamp": None,
                "description": "Inspection, diagnosis & repair with genuine spare parts",
                "state": "pending"
            },
            {
                "id": "step_5",
                "title": "Completed",
                "timestamp": None,
                "description": "Job card signed and closed with digital invoice",
                "state": "pending"
            }
        ]
        
        req = ServiceRequestModel(
            id="SR-7845",
            customer_id="customer_1",
            customer_name="Shreyansh Bansal",
            customer_phone="+91 98765 43210",
            customer_address="12, Sector 4, Greater Noida",
            appliance_id="app_1",
            appliance_name="Crompton AC",
            brand="Crompton",
            model_no="GL-5292",
            issue="AC cooling issue / Low cooling in high ambient temperature",
            description="AC blower is running but cooling is insufficient. Strange rattling sound from indoor unit.",
            priority="High",
            status="Technician on the Way",
            status_badge="In Progress",
            created_at="21 Jun 2025, 10:24 AM",
            appointment_date="21 Jun 2025",
            appointment_slot="4:00 PM - 6:00 PM",
            technician_id="tech_1",
            verification_otp="8492",
            timeline_json=json.dumps(timeline_data)
        )
        db.add(req)
        db.commit()
