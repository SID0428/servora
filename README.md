# ServSure (Unified Service Intelligence Platform - USIP)

ServSure is an enterprise-grade post-sales service lifecycle platform that connects appliance brands (manufacturers), authorized franchise service centers (branches), certified field technicians, and appliance owners (customers) under a unified service intelligence architecture.

---

## Table of Contents
- [1. Prerequisites](#1-prerequisites)
- [2. Installation & Local Development](#2-installation--local-development)
- [3. System Architecture & Multi-Tier Hierarchy](#3-system-architecture--multi-tier-hierarchy)
- [4. Frontend Portals & Routing](#4-frontend-portals--routing)
- [5. Database Schema (22 Relational Models)](#5-database-schema-22-relational-models)
- [6. Core API Endpoint Catalog](#6-core-api-endpoint-catalog)
- [7. Production Deployment (Render, Vercel, Aiven MySQL)](#7-production-deployment-render-vercel-aiven-mysql)
- [8. Troubleshooting & Common Operational Errors](#8-troubleshooting--common-operational-errors)
- [9. Discrepancy Log & Codebase Audit Notes](#9-discrepancy-log--codebase-audit-notes)

---

## 1. Prerequisites
- **Python**: 3.11, 3.12, or 3.13 (Docker base: Python 3.13.1)
- **Node.js**: 18+ (used for static syntax checking with `node --check`)
- **Database**: SQLite (default local fallback) or Aiven MySQL 8.0+
- **External Services**:
  - [Brevo (Sendinblue)](https://www.brevo.com/): Required for transactional onboarding emails and 6-digit verification OTPs.
  - [Google Cloud Console](https://console.cloud.google.com/): OAuth 2.0 Web Client ID for Google Identity Services sign-in.

---

## 2. Installation & Local Development

### Backend Setup
1. Clone the repository and navigate to the backend:
   ```bash
   git clone https://github.com/SID0428/servora.git
   cd servora/backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate

   # Windows
   python -m venv venv
   venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
4. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
   *(For offline local testing, no changes to `.env` are necessary; the backend defaults to `sqlite:///./servora.db`.)*
5. Start the FastAPI development server:
   ```bash
   python main.py
   ```
   - API Server: `http://127.0.0.1:8000`
   - Interactive Swagger Docs: `http://127.0.0.1:8000/docs`
   - ReDoc: `http://127.0.0.1:8000/redoc`

### Frontend Setup
In a separate terminal, serve the `frontend/` directory using any static web server:
```bash
cd servora/frontend
python3 -m http.server 3000
```
Open `http://localhost:3000` in your browser.

### Verified Seed Accounts
All pre-seeded test accounts use the password `password123`:
| Role | Email | Login Portal |
|---|---|---|
| **Platform Admin** | `admin@servsure.com` | `/admin-login.html` |
| **Field Technician** | `rahul.sharma@crompton-service.com` | `/technician-login.html` |
| **Field Technician 2** | `tech2@servora.com` | `/technician-login.html` |

*Note: Brand Companies and Franchise Branches are onboarded dynamically via Brevo setup email invitations where they create their own passwords.*

---

## 3. System Architecture & Multi-Tier Hierarchy

### Organizational Structure
```
       +---------------------------------------------+
       |             PLATFORM ADMIN                  |
       |  - Cross-tenant metrics & governance        |
       |  - Onboards Companies & toggles access      |
       |  - L3 SLA Handler (>12h unassigned / >96h)  |
       +----------------------+----------------------+
                              |
                              v
       +---------------------------------------------+
       |             COMPANY (BRAND)                 |
       |  - Manages authorized Franchise branches    |
       |  - Reviews & reimburses warranty claims     |
       |  - Defines AMC protection plans             |
       |  - L2 SLA Handler (>8h unassigned / >72h)   |
       +----------------------+----------------------+
                              |
                              v
       +---------------------------------------------+
       |            FRANCHISE (BRANCH)               |
       |  - Regional spare parts inventory hub       |
       |  - Onboards Technicians & dispatches tickets|
       |  - Submits warranty claims to brand         |
       |  - L1 SLA Handler (>4h unassigned / >48h)   |
       +----------------------+----------------------+
                              |
                              v
       +---------------------------------------------+
       |             FIELD TECHNICIAN                |
       |  - Accepts jobs via mobile-responsive UI    |
       |  - Verifies Start OTP & Completion OTP      |
       |  - Generates Digital Job Cards & invoices   |
       |  - Streams real-time GPS coordinates        |
       +----------------------+----------------------+
                              ^
                              | (Service Requests)
       +----------------------+----------------------+
       |                 CUSTOMER                    |
       |  - Registers appliances with invoice proof  |
       |  - Books repairs & tracks tech in real-time |
       |  - Approves repair estimates & buys AMC     |
       +---------------------------------------------+
```

### Operational Access Control & Cascading Deactivation
Enforced continuously by `validate_user_active_and_hierarchy` on all authenticated endpoints:
- **Admin Disables Company** (`PUT /api/admin/companies/{id}/access`): Company, all its branches, and all its technicians are immediately deactivated. All active sessions in `user_sessions` are terminated.
- **Company Disables Branch** (`PUT /api/company/branches/{id}/access`): Branch and its technicians are immediately deactivated.
- **Franchise Disables Technician** (`PUT /api/franchise/technicians/{id}/access`): Technician account is deactivated.
- **Blocked Message Strings**:
  - *Company*: `"Your company access has been disabled. Please contact the platform administrator."`
  - *Branch*: `"Your franchise access has been disabled. Please contact your company administrator."`
  - *Technician*: `"Your technician access has been disabled. Please contact your franchise administrator."`

### Background Workers
1. **Render Keep-Alive Loop** (`keep_alive_ping_loop`): Pings `/health` every 14 minutes (840s) to reset Render's 15-minute inactivity idle timer.
2. **SLA Monitor Loop** (`sla_monitor_loop`): Evaluates active service requests every 5 minutes against SRS 6.15 SLA thresholds and triggers multi-tier escalations.

---

## 4. Frontend Portals & Routing

| Role | Public Route | HTML File | Controller | Dashboard |
|---|---|---|---|---|
| **Customer** | `/` or `/login` | `index.html` | `js/auth.js` | `customer-dashboard.html` |
| **Platform Admin** | `/admin` | `admin-login.html` | `js/auth.js` | `admin-dashboard.html` |
| **Brand Company** | `/company` | `company-login.html` | `js/auth.js` | `company-dashboard.html` |
| **Franchise Hub** | `/franchise` | `franchise-login.html` | `js/auth.js` | `franchise-dashboard.html` |
| **Technician** | `/technician` | `technician-login.html` | `js/auth.js` | `technician-dashboard.html` |
| **Setup Invitations** | `/setup/*` | `*-setup.html` | `js/*-setup.js` | Role-specific login |

---

## 5. Database Schema (22 Relational Models)

Defined in [`backend/app/db/models.py`](file:///Users/siddharth/Desktop/python%20project/backend/app/db/models.py):

| Model Name | Table Name | Core Fields |
|---|---|---|
| `UserModel` | `users` | `id`, `name`, `email`, `phone`, `role`, `password_hash`, `is_active`, `address` |
| `UserSessionModel` | `user_sessions` | `token_hash`, `user_id`, `expires_at` |
| `AuthOtpModel` | `auth_otps` | `id`, `email`, `otp_hash`, `expires_at`, `user_data` |
| `CompanyOnboardingModel` | `company_onboarding` | `token_hash`, `email`, `name`, `otp_hash`, `password_set_at` |
| `BranchOnboardingModel` | `branch_onboarding` | `token_hash`, `company_id`, `branch_name`, `email`, `password_set_at` |
| `CompanyBranchModel` | `company_branches` | `id`, `company_id`, `branch_name`, `manager_name`, `email`, `mobile`, `address` |
| `TechnicianModel` | `technicians` | `id`, `name`, `title`, `company_branch`, `rating`, `total_jobs`, `phone` |
| `BranchTechnicianModel` | `branch_technicians` | `technician_id`, `branch_id`, `address`, `pincode` |
| `TechnicianOnboardingModel` | `technician_onboarding` | `token_hash`, `branch_id`, `name`, `title`, `email`, `password_set_at` |
| `ApplianceModel` | `appliances` | `id`, `user_id`, `brand`, `model_number`, `serial_number`, `warranty_status`, `amc_active` |
| `ServiceRequestModel` | `service_requests` | `id`, `customer_id`, `appliance_id`, `technician_id`, `status`, `start_otp`, `completion_otp`, `is_escalated` |
| `JobCardModel` | `job_cards` | `id`, `request_id`, `technician_id`, `diagnosis`, `work_done`, `parts_used`, `labor_cost`, `cgst_amount`, `sgst_amount`, `total_cost` |
| `ServiceFeedbackModel` | `service_feedback` | `id`, `request_id`, `customer_id`, `rating`, `feedback_text` |
| `SparePartModel` | `spare_parts` | `id`, `part_number`, `part_name`, `category`, `unit_price`, `mrp`, `is_active` |
| `FranchiseInventoryModel` | `franchise_inventory` | `id`, `branch_id`, `part_id`, `quantity_in_stock`, `min_reorder_level` |
| `InventoryTransactionModel` | `inventory_transactions` | `id`, `branch_id`, `part_id`, `transaction_type`, `quantity`, `unit_cost` |
| `WarrantyClaimModel` | `warranty_claims` | `id`, `branch_id`, `request_id`, `part_id`, `claim_status`, `claim_amount` |
| `AMCPlanModel` | `amc_plans` | `id`, `company_id`, `plan_name`, `duration_months`, `price`, `is_active` |
| `AMCSubscriptionModel` | `amc_subscriptions` | `id`, `user_id`, `appliance_id`, `plan_id`, `start_date`, `end_date`, `status` |
| `EstimateModel` | `estimates` | `id`, `request_id`, `branch_id`, `parts_cost`, `labor_cost`, `total_amount`, `status` |
| `EscalationModel` | `escalations` | `id`, `request_id`, `escalation_level`, `escalated_to_role`, `reason`, `status` |
| `NotificationLogModel` | `notification_logs` | `id`, `user_id`, `notification_type`, `channel`, `recipient`, `subject`, `status` |

---

## 6. Core API Endpoint Catalog

### Authentication (`/api/auth`)
- `POST /api/auth/login`: Email & password authentication with role check and PBKDF2 hash verification.
- `POST /api/auth/login-otp/request`: Sends 6-digit email OTP via Brevo.
- `POST /api/auth/login-otp/verify`: Verifies login OTP and returns session token.
- `POST /api/auth/google`: Verifies Google Identity Services ID token.
- `POST /api/auth/forgot-password/request-otp`: Sends password reset OTP to active account.
- `POST /api/auth/forgot-password/reset`: Verifies OTP, updates PBKDF2 hash, and revokes prior sessions.
- `POST /api/auth/change-password`: Changes password for logged-in user.
- `PUT /api/auth/profile`: Updates user profile (email editing permitted for `admin` and `company`).
- `GET /api/auth/me`: Returns active session user details.
- `POST /api/auth/logout`: Revokes active session token and clears cookies.

### Operational Controls
- `PUT /api/admin/companies/{id}/access`: Platform Admin enables or disables Company access.
- `PUT /api/company/branches/{id}/access`: Brand enables or disables Franchise Branch access.
- `PUT /api/franchise/technicians/{id}/access`: Franchise enables or disables Technician access.

---

## 7. Production Deployment (Render, Vercel, Aiven MySQL)

### Aiven MySQL Connection
Format the URI for PyMySQL with required TLS:
```text
mysql+pymysql://avnadmin:PASSWORD@HOST:PORT/defaultdb?ssl-mode=REQUIRED
```

### Render Backend Web Service
1. Root directory: `backend`
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Environment variables:
   - `DATABASE_URL`: Your Aiven MySQL URI
   - `ALLOWED_ORIGINS`: Comma-separated Vercel domains (`https://servsure.vercel.app`)
   - `BREVO_API_KEY`: Brevo API key
   - `BREVO_SENDER_EMAIL`: Verified sender address
   - `BREVO_SENDER_NAME`: `ServSure`
   - `FRONTEND_BASE_URL`: `https://servsure.vercel.app`
   - `GOOGLE_CLIENT_ID`: Google OAuth Web Client ID
   - `KEEP_ALIVE_INTERVAL_SECONDS`: `840`
   - `PING_URL`: Render public URL

### Vercel Frontend Deployment
1. Import repository in Vercel.
2. Root directory: `frontend`
3. Framework Preset: **Other**
4. Deploy (Vercel automatically honors `frontend/vercel.json` rewrites and headers).

---

## 8. Troubleshooting & Common Operational Errors

1. **`sqlite3.OperationalError: database is locked`**: Occurs in local dev when multiple background threads write concurrently. Ensure database sessions are closed with `db.close()`. For high load, use Aiven MySQL.
2. **Aiven SSL Transport Prohibition (`OperationalError 3159`)**: Append `?ssl-mode=REQUIRED` to `DATABASE_URL`. The backend translates this into `{ "check_hostname": False }` for PyMySQL.
3. **Brevo HTTP 502/503**: Check that `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` are valid and the sender email is verified in Brevo.
4. **Render Free-Tier Spin-Down**: The `keep_alive_ping_loop` worker continuously pings `/health` every 14 minutes, preventing container sleep.
5. **Role Mismatch on Login**: Attempting to log into the wrong portal (e.g. Technician at `/admin-login.html`) triggers an informative error modal redirecting the user to their authorized portal.

---

## 9. Discrepancy Log & Codebase Audit Notes

During the architectural audit, 5 major discrepancies were identified between the draft documentation and the actual codebase:
1. **Purged Demo Seed Accounts**: The initial draft cited `riya.patel@crompton.com` and `shreyansh@servsure.com`. In reality, both were completely purged from `servora.db` and [`seeds.py`]. Active seeds are `admin@servsure.com` and `rahul.sharma@crompton-service.com`.
2. **Prototype vs. Production Status**: The initial draft stated operational dashboards were prototypes lacking account provisioning and access controls. In reality, all 4 dashboards are fully live with real Brevo invitations, 2-step Forgot Password OTP, in-dashboard password change, multi-tier SLA monitoring, and digital job card generation.
3. **Operational Access Control**: The initial draft lacked documentation on hierarchical access controls. In reality, cascading deactivation and session revocation are active across Admin, Company, and Franchise tiers.
4. **Omitted Environment Variables**: The initial draft omitted `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS`, `FRONTEND_BASE_URL`, `KEEP_ALIVE_INTERVAL_SECONDS`, and `PING_URL`.
5. **Brand Standardization**: Residual references to `Servora` were standardized to `ServSure` while maintaining dual-brand session storage (`servsure_*` and `servora_*`) and request header compatibility.

---
