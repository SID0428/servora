import json
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.db.session import engine, Base, SessionLocal
from app.db.models import (
    UserModel, TechnicianModel, ApplianceModel, ServiceRequestModel,
    CompanyBranchModel, BranchTechnicianModel, JobCardModel, ServiceFeedbackModel,
    SparePartModel, FranchiseInventoryModel, InventoryTransactionModel,
    WarrantyClaimModel, AMCPlanModel, AMCSubscriptionModel
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

    # 3. Seed Appliances
    if not db.query(ApplianceModel).first():
        apps = [
            ApplianceModel(
                id="app_1",
                user_id="customer_1",
                company_id="company_1",
                brand="Crompton",
                category="Air Conditioner",
                model_no="GL-5292",
                registered_on="12 Jun 2024",
                warranty_status="Under Warranty",
                warranty_start_date="12 Jun 2024",
                warranty_end_date="12 Jun 2026",
                amc_active=False,
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
                warranty_status="AMC Active",
                warranty_start_date="03 Feb 2023",
                warranty_end_date="03 Feb 2024",
                amc_active=True,
                amc_plan_name="Gold Comprehensive",
                amc_end_date="03 Feb 2026",
                serial_no="LG-REF-9921",
                icon="refrigerator"
            ),
            ApplianceModel(
                id="app_3",
                user_id="customer_1",
                brand="Samsung",
                category="Microwave Oven",
                model_no="MC-288",
                registered_on="15 Nov 2022",
                warranty_status="Out of Warranty",
                warranty_start_date="15 Nov 2022",
                warranty_end_date="15 Nov 2023",
                amc_active=False,
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
            branch_id="branch_1",
            company_id="company_1",
            pincode="201310",
            latitude=28.4744,
            longitude=77.5040,
            verification_otp="8492",
            timeline_json=json.dumps(timeline_data)
        )
        db.add(req)
        db.commit()

    # 5. Seed Spare Parts Catalog (Phase 2 FR-INV-001)
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

