import json
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.db.session import engine, Base, SessionLocal
from app.db.models import (
    UserModel, TechnicianModel, ApplianceModel, ServiceRequestModel,
    CompanyBranchModel, BranchTechnicianModel, JobCardModel, ServiceFeedbackModel,
    SparePartModel, FranchiseInventoryModel, InventoryTransactionModel,
    WarrantyClaimModel, AMCPlanModel, AMCSubscriptionModel,
    EstimateModel, EscalationModel, NotificationLogModel, AuthOtpModel
)

def seed_database(db: Session):
    # Ensure tables exist in MySQL or SQLite
    Base.metadata.create_all(bind=engine)

    # Existing production databases need an explicit migration because
    # create_all() does not add columns to tables that already exist.
    user_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "password_hash" not in user_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL"))

    appliance_columns = {column["name"] for column in inspect(engine).get_columns("appliances")}
    if "company_id" not in appliance_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE appliances ADD COLUMN company_id VARCHAR(64) NULL"))
    if "warranty_start_date" not in appliance_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE appliances ADD COLUMN warranty_start_date VARCHAR(32) NULL"))
    if "warranty_end_date" not in appliance_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE appliances ADD COLUMN warranty_end_date VARCHAR(32) NULL"))
    if "amc_active" not in appliance_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE appliances ADD COLUMN amc_active BOOLEAN DEFAULT 0"))
    if "amc_plan_name" not in appliance_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE appliances ADD COLUMN amc_plan_name VARCHAR(64) NULL"))
    if "amc_end_date" not in appliance_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE appliances ADD COLUMN amc_end_date VARCHAR(32) NULL"))

    req_columns = {column["name"] for column in inspect(engine).get_columns("service_requests")}
    if "pincode" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN pincode VARCHAR(10) NULL"))
    if "branch_id" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN branch_id VARCHAR(64) NULL"))
    if "company_id" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN company_id VARCHAR(64) NULL"))
    if "latitude" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN latitude FLOAT NULL"))
    if "longitude" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN longitude FLOAT NULL"))
    if "tech_latitude" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN tech_latitude FLOAT NULL"))
    if "tech_longitude" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN tech_longitude FLOAT NULL"))
    if "tech_location_updated_at" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN tech_location_updated_at VARCHAR(64) NULL"))
    if "defect_photo" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN defect_photo TEXT NULL"))
    if "reopened_reason" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN reopened_reason TEXT NULL"))
    if "reopened_at" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN reopened_at VARCHAR(64) NULL"))
    if "start_otp" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN start_otp VARCHAR(16) NULL"))
    if "completion_otp" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN completion_otp VARCHAR(16) NULL"))
    if "previous_technician_id" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN previous_technician_id VARCHAR(64) NULL"))
    if "previous_technician_name" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN previous_technician_name VARCHAR(128) NULL"))
    if "previous_job_card_json" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN previous_job_card_json TEXT NULL"))
    if "is_reopened" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN is_reopened BOOLEAN DEFAULT 0"))
    if "is_under_warranty" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN is_under_warranty BOOLEAN DEFAULT 0"))
    if "payment_status" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN payment_status VARCHAR(32) DEFAULT 'Pending'"))
    if "payment_method" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN payment_method VARCHAR(32) NULL"))
    if "payment_transaction_id" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN payment_transaction_id VARCHAR(64) NULL"))
    if "paid_at" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN paid_at VARCHAR(64) NULL"))
    if "is_escalated" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN is_escalated BOOLEAN DEFAULT 0"))
    if "escalation_level" not in req_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE service_requests ADD COLUMN escalation_level INTEGER DEFAULT 0"))

    jc_columns = {column["name"] for column in inspect(engine).get_columns("job_cards")}
    if "inspection_fee" not in jc_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE job_cards ADD COLUMN inspection_fee FLOAT DEFAULT 299.0"))
    if "discount_amount" not in jc_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE job_cards ADD COLUMN discount_amount FLOAT DEFAULT 0.0"))
    if "cgst_amount" not in jc_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE job_cards ADD COLUMN cgst_amount FLOAT DEFAULT 0.0"))
    if "sgst_amount" not in jc_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE job_cards ADD COLUMN sgst_amount FLOAT DEFAULT 0.0"))
    if "is_warranty_covered" not in jc_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE job_cards ADD COLUMN is_warranty_covered BOOLEAN DEFAULT 0"))

    # 1. Seed Operational Users if not present
    if not db.query(UserModel).filter(UserModel.role != "customer").first():
        users = [
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

    # 2.5 Seed Branch & Technician assignment
    if not db.query(CompanyBranchModel).first():
        branch = CompanyBranchModel(
            id="branch_1",
            company_id="company_1",
            branch_name="Noida Sector 63 Branch",
            manager_name="Amit Sharma",
            email="amit.noida@crompton-service.com",
            mobile="+91 99887 76655",
            address="A-44, Sector 63, Noida, Uttar Pradesh",
            pincode="201310"
        )
        db.add(branch)
        db.commit()

    if not db.query(BranchTechnicianModel).first():
        bt = BranchTechnicianModel(
            technician_id="tech_1",
            branch_id="branch_1",
            address="Sector 18, Noida",
            pincode="201310"
        )
        db.add(bt)
        db.commit()

    # Clean up any legacy dummy customer and dummy service requests added previously
    try:
        dummy_reqs = db.query(ServiceRequestModel).filter(
            (ServiceRequestModel.customer_id == "customer_1") | (ServiceRequestModel.id == "SR-7845")
        ).all()
        dummy_req_ids = [r.id for r in dummy_reqs]
        if dummy_req_ids:
            db.query(JobCardModel).filter(JobCardModel.request_id.in_(dummy_req_ids)).delete(synchronize_session=False)
            db.query(EstimateModel).filter(EstimateModel.request_id.in_(dummy_req_ids)).delete(synchronize_session=False)
            db.query(EscalationModel).filter(EscalationModel.request_id.in_(dummy_req_ids)).delete(synchronize_session=False)
            db.query(NotificationLogModel).filter(NotificationLogModel.reference_id.in_(dummy_req_ids)).delete(synchronize_session=False)
            db.query(ServiceRequestModel).filter(ServiceRequestModel.id.in_(dummy_req_ids)).delete(synchronize_session=False)

        db.query(ApplianceModel).filter(ApplianceModel.user_id == "customer_1").delete(synchronize_session=False)
        db.query(NotificationLogModel).filter(NotificationLogModel.user_id == "customer_1").delete(synchronize_session=False)
        db.query(UserModel).filter(UserModel.id == "customer_1").delete(synchronize_session=False)
        db.commit()
    except Exception as cleanup_err:
        db.rollback()

    # 3. Seed Spare Parts Catalog (Phase 2 FR-INV-001)
    if not db.query(SparePartModel).first():
        parts = [
            SparePartModel(
                id="part_crm_cap01",
                part_code="PART-CRM-CAP01",
                name="Dual Run Capacitor 50+5 uF",
                category="Air Conditioner",
                brand="Crompton",
                unit_price=650.0,
                hsn_code="8532",
                description="Heavy duty AC run capacitor for outdoor compressor & fan motor"
            ),
            SparePartModel(
                id="part_crm_blw01",
                part_code="PART-CRM-BLW01",
                name="Cross Flow Indoor Blower Wheel",
                category="Air Conditioner",
                brand="Crompton",
                unit_price=1200.0,
                hsn_code="8414",
                description="Dynamically balanced ultra-quiet cross flow blower"
            ),
            SparePartModel(
                id="part_lg_comp01",
                part_code="PART-LG-COMP01",
                name="Inverter Linear Compressor 240V",
                category="Refrigerator",
                brand="LG",
                unit_price=4500.0,
                hsn_code="8418",
                description="High efficiency smart inverter linear compressor"
            ),
            SparePartModel(
                id="part_sam_mag01",
                part_code="PART-SAM-MAG01",
                name="High Voltage Magnetron 2M219J",
                category="Microwave Oven",
                brand="Samsung",
                unit_price=1850.0,
                hsn_code="8516",
                description="OEM grade heating magnetron for convection & grill microwaves"
            ),
            SparePartModel(
                id="part_whr_mtr01",
                part_code="PART-WHR-MTR01",
                name="Direct Drive Drain Pump Motor",
                category="Washing Machine",
                brand="Whirlpool",
                unit_price=1450.0,
                hsn_code="8450",
                description="Submersible drain pump assembly with lint filter interface"
            ),
            SparePartModel(
                id="part_unv_thm01",
                part_code="PART-UNV-THM01",
                name="Defrost Bi-Metal Thermostat Sensor",
                category="Refrigerator",
                brand="Universal",
                unit_price=450.0,
                hsn_code="9032",
                description="Snap-action defrost termination sensor with fuse"
            ),
            SparePartModel(
                id="part_vol_pcb01",
                part_code="PART-VOL-PCB01",
                name="Inverter AC Outdoor Main PCB Board",
                category="Air Conditioner",
                brand="Voltas",
                unit_price=3200.0,
                hsn_code="8534",
                description="Microcontroller drive PCB with IP65 moisture conformal coating"
            )
        ]
        db.add_all(parts)
        db.commit()

    # 6. Seed Franchise Warehouse Stock (Phase 2 FR-INV-002, FR-INV-004)
    if not db.query(FranchiseInventoryModel).first():
        stocks = [
            FranchiseInventoryModel(
                id="inv_br1_01",
                branch_id="branch_1",
                part_id="part_crm_cap01",
                quantity_available=18,
                reorder_level=5
            ),
            FranchiseInventoryModel(
                id="inv_br1_02",
                branch_id="branch_1",
                part_id="part_crm_blw01",
                quantity_available=8,
                reorder_level=4
            ),
            FranchiseInventoryModel(
                id="inv_br1_03",
                branch_id="branch_1",
                part_id="part_lg_comp01",
                quantity_available=3, # Low stock demo!
                reorder_level=5
            ),
            FranchiseInventoryModel(
                id="inv_br1_04",
                branch_id="branch_1",
                part_id="part_sam_mag01",
                quantity_available=2, # Low stock demo!
                reorder_level=3
            ),
            FranchiseInventoryModel(
                id="inv_br1_05",
                branch_id="branch_1",
                part_id="part_unv_thm01",
                quantity_available=24,
                reorder_level=6
            )
        ]
        db.add_all(stocks)
        db.commit()

    # 6b. Seed Inventory Transactions for Franchise Branch (Stock sent & received logistics history)
    if not db.query(InventoryTransactionModel).first():
        from datetime import datetime as dt
        txns = [
            InventoryTransactionModel(
                id="TXN-IN-8801",
                branch_id="branch_1",
                part_id="part_unv_thm01",
                transaction_type="stock_in",
                quantity=20,
                reference_id="CH-8801",
                performed_by="Central Warehouse Logistics",
                notes="Initial warehouse stock allocation received from Central OEM Logistics (Challan #CH-8801)",
                created_at=dt(2026, 10, 12, 11, 30)
            ),
            InventoryTransactionModel(
                id="TXN-IN-8802",
                branch_id="branch_1",
                part_id="part_lg_pcb01",
                transaction_type="stock_in",
                quantity=15,
                reference_id="SHP-9021",
                performed_by="OEM Brand Regional Depot",
                notes="Bulk OEM shipment dispatched and received from Regional Logistics Depot (Shipment #SHP-9021)",
                created_at=dt(2026, 10, 14, 14, 15)
            ),
            InventoryTransactionModel(
                id="TXN-IN-8803",
                branch_id="branch_1",
                part_id="part_crm_cap01",
                transaction_type="stock_in",
                quantity=10,
                reference_id="CH-9140",
                performed_by="Central Logistics Depot",
                notes="Replenishment stock received from Havells/LG Central Hub (Challan #CH-9140)",
                created_at=dt(2026, 10, 16, 16, 0)
            ),
            InventoryTransactionModel(
                id="TXN-OUT-7845",
                branch_id="branch_1",
                part_id="part_unv_thm01",
                transaction_type="job_consumption",
                quantity=1,
                reference_id="JC-7845",
                performed_by="Rahul Sharma (technician)",
                notes="Automatic deduction: 1x Thermostat Sensor consumed on customer ticket SR-7845",
                created_at=dt(2026, 10, 18, 10, 45)
            )
        ]
        db.add_all(txns)
        db.commit()

    # 7. Seed AMC Packages (Phase 2 FR-WAR-005)
    if not db.query(AMCPlanModel).first():
        plans = [
            AMCPlanModel(
                id="AMC-SILVER",
                name="Silver Care",
                category="All",
                duration_months=12,
                price=999.0,
                free_services=2,
                discount_parts_pct=10.0,
                zero_labor=True,
                description="2 routine tune-up visits per year, 10% off spare parts, and 100% free labor on breakdowns."
            ),
            AMCPlanModel(
                id="AMC-GOLD",
                name="Gold Comprehensive",
                category="All",
                duration_months=12,
                price=1999.0,
                free_services=3,
                discount_parts_pct=20.0,
                zero_labor=True,
                description="3 seasonal maintenance visits, 20% discount on genuine OEM parts, zero labor fee, priority 4-hour technician dispatch."
            ),
            AMCPlanModel(
                id="AMC-PLATINUM",
                name="Platinum Total Care",
                category="All",
                duration_months=24,
                price=3499.0,
                free_services=6,
                discount_parts_pct=100.0,
                zero_labor=True,
                description="24 months total protection. 6 maintenance visits, 100% free spare parts and labor, zero deductible."
            )
        ]
        db.add_all(plans)
        db.commit()

