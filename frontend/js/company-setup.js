import { API_BASE_URL } from "./config.js";

const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";
const $ = (id) => document.getElementById(id);
const passwordForm = $("passwordForm");
const otpForm = $("otpForm");

function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}

async function submitJson(path, payload) {
  const response = await fetch(`${API_BASE_URL}/api/onboarding/company/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Could not complete setup. Please try again.");
  return data;
}

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!token) { message("This setup link is missing its invitation token. Ask Servora to resend it.", true); return; }
  if ($("password").value !== $("confirmPassword").value) { message("The passwords do not match.", true); return; }
  if ($("password").value.length < 10) { message("Use a password with at least 10 characters.", true); return; }
  const button = $("passwordSubmit"); button.disabled = true; button.textContent = "Sending code…"; message("");
  try {
    const data = await submitJson("password", { token, email: $("email").value.trim(), password: $("password").value });
    $("otpEmail").textContent = data.email;
    passwordForm.hidden = true; otpForm.hidden = false;
    $("setupTitle").textContent = "Verify your email";
    $("setupIntro").textContent = "Enter the code we emailed you to activate your company account.";
    message("Verification code sent.");
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; button.textContent = "Send verification code"; }
});

otpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("otpSubmit"); button.disabled = true; button.textContent = "Verifying…"; message("");
  try {
    const data = await submitJson("verify-otp", { token, email: $("email").value.trim(), otp: $("otp").value.trim() });
    $("setupTitle").textContent = "Your password is set";
    $("setupIntro").textContent = "Your company admin account is now active. Sign in with your registered email and new password.";
    otpForm.hidden = true;
    message("Email verified and password saved.");
    const signIn = document.createElement("a"); signIn.className = "primary-button setup-signin"; signIn.href = "./company-login.html"; signIn.textContent = "Go to company sign in";
    otpForm.after(signIn);
    history.replaceState({}, "", window.location.pathname);
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; button.textContent = "Verify and save password"; }
});

$("resendOtp").addEventListener("click", async () => {
  const button = $("resendOtp"); button.disabled = true; button.textContent = "Sending…"; message("");
  try {
    const data = await submitJson("password", { token, email: $("email").value.trim(), password: $("password").value });
    $("otpEmail").textContent = data.email; message("A new verification code has been sent.");
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; button.textContent = "Send a new code"; }
});

if (!token) message("This setup link is missing its invitation token. Ask Servora to resend it.", true);
