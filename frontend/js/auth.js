import { API_BASE_URL, setCustomApiUrl } from "./config.js";

const role = document.body.dataset.role || "customer";
const roleSettings = {
  customer: { title: "Sign in to your account", subtitle: "Manage your home services, all in one place.", identifier: "Email or phone number", placeholder: "you@example.com", type: "text", destination: "./customer-dashboard.html" },
  company: { title: "Company sign in", subtitle: "Manage your organization and service network.", identifier: "Work email", placeholder: "name@company.com", type: "text", destination: "./company-dashboard.html" },
  franchise: { title: "Franchise sign in", subtitle: "Access your location and service operations.", identifier: "Email or phone number", placeholder: "you@example.com", type: "text", destination: "./franchise-dashboard.html" },
  technician: { title: "Technician sign in", subtitle: "View your assigned jobs and keep service moving.", identifier: "Work email or phone number", placeholder: "you@example.com or +91 98765 43210", type: "text", destination: "./technician-dashboard.html" },
  admin: { title: "Servora admin sign in", subtitle: "Sign in with your Servora administrator credentials.", identifier: "Administrator email", placeholder: "admin@servora.com", type: "email", destination: "./admin-dashboard.html" },
};
const config = roleSettings[role] || roleSettings.customer;
const byId = (id) => document.getElementById(id);

function setMessage(message, success = false, target = "formMessage") {
  const node = byId(target);
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("success", success);
}

let backendCheckTimer = null;
let isBackendOnline = false;

function updateApiStatus(state, label) {
  const dot = byId("backendDot");
  const text = byId("backendStatusText");
  if (dot) {
    dot.className = "connection-dot";
    if (state === "online" || state === true) {
      dot.classList.add("online");
    } else if (state === "offline") {
      dot.classList.add("offline");
    }
  }
  if (text) text.textContent = label;
}

window.promptApiUrl = function () {
  const current = localStorage.getItem("servora_api_url") || API_BASE_URL;
  const next = prompt("Enter your Render backend URL (for example https://servora-backend.onrender.com):", current);
  if (next !== null) setCustomApiUrl(next.trim());
};

async function checkBackend(isRetry = false) {
  if (!isBackendOnline && !isRetry) {
    updateApiStatus("pending", "Connecting to service…");
  }
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Backend unavailable");
    isBackendOnline = true;
    updateApiStatus("online", "Service connected");
    if (backendCheckTimer) {
      clearTimeout(backendCheckTimer);
      backendCheckTimer = null;
    }
  } catch {
    isBackendOnline = false;
    updateApiStatus("waking", "Waking up service… (takes ~45s)");
    clearTimeout(backendCheckTimer);
    backendCheckTimer = setTimeout(() => checkBackend(true), 4000);
  }
}

function handleAuthSuccess(user, session_token, targetMessageId = "formMessage") {
  const userRole = user?.role || role;
  const roleKey = (userRole === "branch" || userRole === "franchise") ? "franchise" : userRole;
  const userData = { ...user, session_token };
  localStorage.setItem("servora_user", JSON.stringify(userData));
  localStorage.setItem(`servora_user_${roleKey}`, JSON.stringify(userData));
  setMessage(`Welcome back, ${user.name}.`, true, targetMessageId);
  window.location.assign(config.destination);
}

// -------------------------------------------------------------
// Standard Password Login
// -------------------------------------------------------------
async function handleLogin(event) {
  event.preventDefault();
  const button = byId("submitBtn");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>Signing in…</span><span aria-hidden=\"true\">→</span>";
  setMessage("");
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier: byId("identifier").value.trim(), password: byId("password").value, role }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Unable to sign in. Check your details and try again.");
    handleAuthSuccess(data.user, data.session_token, "formMessage");
  } catch (error) {
    const isNetwork = error.name === "TypeError" || (error.message && error.message.toLowerCase().includes("fetch"));
    if (isNetwork && !isBackendOnline) {
      setMessage("Render server is currently spinning up from sleep. Please wait a few seconds and try again.");
    } else {
      setMessage(error.message || "Could not connect to the service. Please try again.");
    }
    button.disabled = false;
    button.innerHTML = original;
  }
}

// -------------------------------------------------------------
// Email OTP Login
// -------------------------------------------------------------
let loginOtpCountdown = null;
let activeLoginEmail = "";

function startLoginOtpTimer(seconds = 30) {
  const resendBtn = byId("loginOtpResendBtn");
  const timerSpan = byId("loginOtpTimer");
  if (!resendBtn || !timerSpan) return;
  resendBtn.disabled = true;
  let remaining = seconds;
  timerSpan.textContent = remaining;
  if (loginOtpCountdown) clearInterval(loginOtpCountdown);
  loginOtpCountdown = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(loginOtpCountdown);
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend code";
    } else {
      timerSpan.textContent = remaining;
      resendBtn.innerHTML = `Resend code (<span id="loginOtpTimer">${remaining}</span>s)`;
    }
  }, 1000);
}

async function handleSendLoginOtp() {
  const emailInput = byId("loginOtpEmail");
  const email = (emailInput?.value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    setMessage("Please enter a valid email address.", false, "loginOtpMessage");
    return;
  }
  const button = byId("loginOtpSendBtn");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>Sending code…</span><span aria-hidden=\"true\">→</span>";
  setMessage("", false, "loginOtpMessage");

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Unable to send verification code.");

    activeLoginEmail = email;
    byId("loginOtpStep1").classList.add("hidden");
    byId("loginOtpStep2").classList.remove("hidden");
    byId("loginOtpDisplayEmail").textContent = email;
    startLoginOtpTimer(30);
    setMessage(data.message || `Verification code sent to ${email}`, true, "loginOtpMessage");
    byId("loginOtpCode").focus();
  } catch (error) {
    setMessage(error.message || "Failed to send code. Please try again.", false, "loginOtpMessage");
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function handleVerifyLoginOtp(event) {
  if (event) event.preventDefault();
  const code = (byId("loginOtpCode")?.value || "").trim();
  if (code.length !== 6) {
    setMessage("Please enter the 6-digit verification code.", false, "loginOtpMessage");
    return;
  }
  const button = byId("loginOtpVerifyBtn");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>Verifying code…</span><span aria-hidden=\"true\">→</span>";
  setMessage("", false, "loginOtpMessage");

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: activeLoginEmail, otp: code }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Invalid verification code.");

    handleAuthSuccess(data.user, data.session_token, "loginOtpMessage");
  } catch (error) {
    setMessage(error.message || "Verification failed.", false, "loginOtpMessage");
    button.disabled = false;
    button.innerHTML = original;
  }
}

// -------------------------------------------------------------
// Customer Signup Flow with Email OTP Verification
// -------------------------------------------------------------
let signupOtpCountdown = null;
let pendingSignupData = null;

function startSignupOtpTimer(seconds = 30) {
  const resendBtn = byId("signupOtpResendBtn");
  const timerSpan = byId("signupOtpTimer");
  if (!resendBtn || !timerSpan) return;
  resendBtn.disabled = true;
  let remaining = seconds;
  timerSpan.textContent = remaining;
  if (signupOtpCountdown) clearInterval(signupOtpCountdown);
  signupOtpCountdown = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(signupOtpCountdown);
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend code";
    } else {
      timerSpan.textContent = remaining;
      resendBtn.innerHTML = `Resend code (<span id="signupOtpTimer">${remaining}</span>s)`;
    }
  }, 1000);
}

async function handleSignupRequestOtp(event) {
  event.preventDefault();
  const password = byId("signupPassword").value;
  const confirmPassword = byId("signupConfirmPassword").value;
  if (password !== confirmPassword) {
    setMessage("The passwords do not match.", false, "signupMessage");
    return;
  }
  if (password.length < 10) {
    setMessage("Password must be at least 10 characters.", false, "signupMessage");
    return;
  }

  const payload = {
    name: byId("signupName").value.trim(),
    email: byId("signupEmail").value.trim().toLowerCase(),
    phone: byId("signupPhone").value.trim(),
    password,
    address: byId("signupAddress").value.trim() || null,
  };

  const button = byId("signupSubmit");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>Sending verification code…</span><span aria-hidden=\"true\">→</span>";
  setMessage("", false, "signupMessage");

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Unable to send verification code. Please check your details.");

    pendingSignupData = payload;
    byId("signupStep1").classList.add("hidden");
    byId("signupStep2").classList.remove("hidden");
    byId("signupOtpDisplayEmail").textContent = payload.email;
    startSignupOtpTimer(30);
    setMessage("", false, "signupOtpMessage");
    byId("signupOtpCode").focus();
  } catch (error) {
    setMessage(error.message || "Could not connect to Servora. Please try again.", false, "signupMessage");
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function handleSignupVerifyOtp() {
  const code = (byId("signupOtpCode")?.value || "").trim();
  if (code.length !== 6) {
    setMessage("Please enter the 6-digit verification code.", false, "signupOtpMessage");
    return;
  }
  if (!pendingSignupData) {
    setMessage("Registration session expired. Please fill in details again.", false, "signupOtpMessage");
    return;
  }

  const button = byId("signupOtpVerifyBtn");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>Creating account…</span><span aria-hidden=\"true\">→</span>";
  setMessage("", false, "signupOtpMessage");

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: pendingSignupData.email, otp: code }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Verification failed. Please check the code.");

    handleAuthSuccess(data.user, data.session_token, "signupOtpMessage");
  } catch (error) {
    setMessage(error.message || "Failed to create account. Please try again.", false, "signupOtpMessage");
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function handleSignupResendOtp() {
  if (!pendingSignupData) return;
  const resendBtn = byId("signupOtpResendBtn");
  resendBtn.disabled = true;
  setMessage("Resending code…", false, "signupOtpMessage");
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingSignupData),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Unable to resend verification code.");
    startSignupOtpTimer(30);
    setMessage(`New verification code sent to ${pendingSignupData.email}`, true, "signupOtpMessage");
  } catch (err) {
    setMessage(err.message || "Failed to resend code.", false, "signupOtpMessage");
    resendBtn.disabled = false;
  }
}

// -------------------------------------------------------------
// Google OAuth Authentication
// -------------------------------------------------------------
async function handleGoogleCredential(credential) {
  setMessage("Signing in with Google…", false, "formMessage");
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ credential }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Google sign-in failed. Please try again.");
    handleAuthSuccess(data.user, data.session_token, "formMessage");
  } catch (error) {
    setMessage(error.message || "Unable to sign in with Google.", false, "formMessage");
  }
}

let configuredGoogleClientId = "";

async function initGoogleOAuth() {
  if (role !== "customer") return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/config`);
    const cfg = await res.json().catch(() => ({}));
    configuredGoogleClientId = cfg.google_client_id || "";

    const btnContainer = byId("googleBtnContainer");
    const customBtn = byId("googleCustomBtn");

    if (configuredGoogleClientId && window.google?.accounts?.id && btnContainer) {
      window.google.accounts.id.initialize({
        client_id: configuredGoogleClientId,
        callback: (resp) => {
          if (resp?.credential) handleGoogleCredential(resp.credential);
        },
      });
      window.google.accounts.id.renderButton(btnContainer, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        width: 320,
        text: "continue_with",
      });
      customBtn?.classList.add("hidden");
    } else if (customBtn) {
      // Fallback custom button when GIS button isn't active or clientId is pending
      customBtn.classList.remove("hidden");
      customBtn.onclick = () => {
        if (!configuredGoogleClientId) {
          alert("Google Sign-In is configured on the backend. Please provide GOOGLE_CLIENT_ID in your backend environment variables to connect your Google Cloud Console project.");
        } else if (window.google?.accounts?.id) {
          window.google.accounts.id.prompt();
        }
      };
    }
  } catch {
    // If backend isn't ready yet, leave fallback available
    const customBtn = byId("googleCustomBtn");
    if (customBtn) customBtn.classList.remove("hidden");
  }
}

// -------------------------------------------------------------
// DOM Initialization & Event Wireup
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  document.title = `${config.title} — Servora`;
  byId("pageTitle").textContent = config.title;
  byId("pageSubtitle").textContent = config.subtitle;

  // Operational portals setup
  if (role !== "customer") {
    byId("googleAuthSection")?.classList.add("hidden");
    byId("loginAuthDivider")?.classList.add("hidden");
    byId("loginAuthTabs")?.classList.add("hidden");
    byId("loginOtpForm")?.classList.add("hidden");
    byId("identifierLabel").textContent = config.identifier;
    byId("identifier").placeholder = config.placeholder;
    byId("identifier").type = config.type;
  }

  // Password Login
  byId("loginForm")?.addEventListener("submit", handleLogin);

  // Customer Features
  if (role === "customer") {
    // Tab switching: Password vs Email OTP
    const tabPasswordBtn = byId("tabPasswordBtn");
    const tabOtpBtn = byId("tabOtpBtn");
    const loginForm = byId("loginForm");
    const loginOtpForm = byId("loginOtpForm");

    tabPasswordBtn?.addEventListener("click", () => {
      tabPasswordBtn.classList.add("active");
      tabOtpBtn.classList.remove("active");
      loginForm.classList.remove("hidden");
      loginOtpForm.classList.add("hidden");
      setMessage("");
    });

    tabOtpBtn?.addEventListener("click", () => {
      tabOtpBtn.classList.add("active");
      tabPasswordBtn.classList.remove("active");
      loginForm.classList.add("hidden");
      loginOtpForm.classList.remove("hidden");
      setMessage("", false, "loginOtpMessage");
    });

    // Login with OTP events
    byId("loginOtpSendBtn")?.addEventListener("click", handleSendLoginOtp);
    byId("loginOtpForm")?.addEventListener("submit", handleVerifyLoginOtp);
    byId("loginOtpResendBtn")?.addEventListener("click", () => {
      handleSendLoginOtp();
    });
    byId("loginOtpChangeEmail")?.addEventListener("click", (e) => {
      e.preventDefault();
      byId("loginOtpStep2").classList.add("hidden");
      byId("loginOtpStep1").classList.remove("hidden");
      byId("loginOtpSendBtn").disabled = false;
      byId("loginOtpSendBtn").innerHTML = "<span>Send verification code</span><span aria-hidden=\"true\">→</span>";
      setMessage("", false, "loginOtpMessage");
      byId("loginOtpEmail").focus();
    });

    // Signup form events
    const signupForm = byId("signupForm");
    const signupToggle = byId("signupToggle");

    if (signupForm && signupToggle) {
      signupForm.addEventListener("submit", handleSignupRequestOtp);
      byId("signupOtpVerifyBtn")?.addEventListener("click", handleSignupVerifyOtp);
      byId("signupOtpResendBtn")?.addEventListener("click", handleSignupResendOtp);
      byId("signupBackBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        byId("signupStep2").classList.add("hidden");
        byId("signupStep1").classList.remove("hidden");
        const submitBtn = byId("signupSubmit");
        submitBtn.disabled = false;
        submitBtn.innerHTML = "<span>Continue to verify email</span><span aria-hidden=\"true\">→</span>";
        setMessage("", false, "signupMessage");
      });

      signupToggle.addEventListener("click", (event) => {
        event.preventDefault();
        const openingSignup = signupForm.classList.contains("hidden");
        signupForm.classList.toggle("hidden", !openingSignup);

        // Reset signup steps if opening
        if (openingSignup) {
          byId("signupStep1").classList.remove("hidden");
          byId("signupStep2").classList.add("hidden");
          byId("signupSubmit").disabled = false;
          byId("signupSubmit").innerHTML = "<span>Continue to verify email</span><span aria-hidden=\"true\">→</span>";
        }

        // Toggle login forms and auth tabs
        byId("googleAuthSection")?.classList.toggle("hidden", openingSignup);
        byId("loginAuthDivider")?.classList.toggle("hidden", openingSignup);
        byId("loginAuthTabs")?.classList.toggle("hidden", openingSignup);

        if (openingSignup) {
          loginForm.classList.add("hidden");
          loginOtpForm.classList.add("hidden");
        } else {
          const isOtpActive = tabOtpBtn?.classList.contains("active");
          loginForm.classList.toggle("hidden", isOtpActive);
          loginOtpForm.classList.toggle("hidden", !isOtpActive);
        }

        byId("pageTitle").textContent = openingSignup ? "Create your account" : config.title;
        byId("pageSubtitle").textContent = openingSignup ? "Create a customer account to manage appliances and service visits." : config.subtitle;
        byId("signupPrompt").textContent = openingSignup ? "Already have an account?" : "New to Servora?";
        signupToggle.textContent = openingSignup ? "Sign in" : "Create an account";
        setMessage("", false, "signupMessage");
        setMessage("", false, "signupOtpMessage");
        setMessage("");
        (openingSignup ? byId("signupName") : (tabOtpBtn?.classList.contains("active") ? byId("loginOtpEmail") : byId("identifier"))).focus();
      });
    }

    // Initialize Google OAuth
    initGoogleOAuth();
  }

  // Toggle Password visibility
  byId("togglePassword")?.addEventListener("click", () => {
    const input = byId("password");
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    byId("togglePassword").textContent = visible ? "Hide" : "Show";
    byId("togglePassword").setAttribute("aria-label", visible ? "Hide password" : "Show password");
  });

  // Forgot password placeholder
  byId("forgotLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    setMessage("For password assistance, contact your organization administrator or Servora support.");
  });

  checkBackend();
});
