# ServSure

ServSure is a home-appliance service platform with a static multi-portal frontend, a Python FastAPI backend, and a MySQL database. The frontend is in `frontend/`, and the Render service is in `backend/`.

## Login portals

Deploy the `frontend/` directory to Vercel with framework preset **Other**. The login pages are:

- Customer: `/` or `/login`
- Franchise: `/franchise` or `/franchise-login.html`
- Technician: `/technician` or `/technician-login.html`
- Company administrator: `/company` or `/company-login.html`
- ServSure administrator: `/admin` or `/admin-login.html`

After sign in, technician, franchise, company and ServSure admin accounts open their role-specific operations dashboard at `/technician-dashboard`, `/franchise-dashboard`, `/company-dashboard` and `/admin-dashboard`. Customer accounts open the existing customer service dashboard.

Every page checks the selected portal role against the account role returned by the backend. The dashboard and remaining service features are still the existing customer dashboard prototype.

## Local development

Run the API from the backend directory:

```sh
cd backend
python -m pip install -r requirements.txt
python main.py
```

The API listens at `http://127.0.0.1:8000` and uses local SQLite when `DATABASE_URL` is unset. Open `frontend/index.html` with a local static server, or deploy it to Vercel. Login accepts the demo password `password123` for seeded demo accounts; replace this behavior with provisioned password hashes before production use. Seeded accounts are `shreyansh@servsure.com` (customer), `amit.noida@crompton-service.com` (franchise), `riya.patel@crompton.com` (company), and `admin@servsure.com` (ServSure admin).

## Aiven MySQL

Create an Aiven MySQL service, then set `DATABASE_URL` in Render (or in `backend/.env` locally) to the service URI in SQLAlchemy format:

Use SQLAlchemy's PyMySQL driver prefix. Keep the Aiven SSL query option if it is included; the backend translates it to PyMySQL TLS settings:

```text
mysql+pymysql://avnadmin:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/defaultdb?ssl-mode=REQUIRED
```

Never commit the real database URI or password. The backend creates tables on startup and seeds example data into an empty database.

## Deploy the API to Render

Create a Render Web Service from this repository with root directory `backend`. `backend/render.yaml` defines the Python service, install command, and Uvicorn start command. Set these environment variables in Render:

- `DATABASE_URL`: your Aiven SQLAlchemy URI
- `ALLOWED_ORIGINS`: comma-separated exact frontend origins, such as `https://your-project.vercel.app`
- `DEMO_PASSWORD`: a strong value if you need seeded demo accounts
- `BREVO_API_KEY`: Brevo API key for company setup invitations and email OTPs
- `BREVO_SENDER_EMAIL`: a verified sender address in Brevo
- `BREVO_SENDER_NAME`: optional sender display name (defaults to ServSure)
- `FRONTEND_BASE_URL`: public Vercel frontend origin used to create company setup links

When an administrator adds a company, ServSure emails the registered company address a setup link. The company administrator confirms that email, creates a password, and verifies a six-digit email OTP before the account is activated. Passwords are stored as PBKDF2 hashes. The admin Companies directory shows setup status and the password-set date. Set the Brevo environment variables before adding companies; account creation returns an error rather than silently skipping the invitation when Brevo is unavailable.

Render provides `PORT`. The API health endpoint is `/health`; interactive API docs are at `/docs`.

## Deploy the frontend to Vercel

Import the repository in Vercel and set the project root directory to `frontend`. Set `DEFAULT_RENDER_API` in `frontend/js/config.js` to your actual Render service URL before deploying. The login page's API settings link can override the URL in the current browser for previewing.

For production, configure real account provisioning, a password reset flow, secure token/session expiry and authorization for each portal before inviting users. Demo accounts share the configured demo password and are intended only for development.
# servsure
