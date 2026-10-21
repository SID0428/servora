import json
import os
import urllib.error
import urllib.request

from fastapi import HTTPException


def send_brevo_email(to_email: str, to_name: str, subject: str, text: str, html: str | None = None) -> None:
    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    if not api_key or not sender_email:
        raise HTTPException(status_code=503, detail="Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL on the backend.")
    body = {
        "sender": {"name": os.getenv("BREVO_SENDER_NAME", "ServSure"), "email": sender_email},
        "to": [{"email": to_email, "name": to_name}], "subject": subject, "textContent": text,
    }
    if html:
        body["htmlContent"] = html
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email", data=json.dumps(body).encode(),
        headers={"api-key": api_key, "accept": "application/json", "content-type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status >= 300:
                raise HTTPException(status_code=502, detail="Brevo did not accept the message")
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Brevo could not send the email") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Could not connect to Brevo") from exc
