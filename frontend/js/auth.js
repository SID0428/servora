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
    // Default class .connection-dot without modifiers renders an amber dot for "waking"
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
    // Render free tier spins down when idle. Poll every 4 seconds until awake.
    clearTimeout(backendCheckTimer);
    backendCheckTimer = setTimeout(() => checkBackend(true), 4000);
  }
}

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
    localStorage.setItem("servora_user", JSON.stringify({ ...data.user, session_token: data.session_token }));
    setMessage(`Welcome back, ${data.user.name}.`, true);
    // Navigate immediately so static hosting and browser privacy settings cannot
    // interrupt the redirect timer after a successful response.
    window.location.assign(config.destination);
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

async function handleSignup(event) {
  event.preventDefault();
  const password = byId("signupPassword").value;
  const confirmPassword = byId("signupConfirmPassword").value;
  if (password !== confirmPassword) {
    setMessage("The passwords do not match.", false, "signupMessage");
    return;
  }

  const button = byId("signupSubmit");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>Creating account…</span><span aria-hidden=\"true\">→</span>";
  setMessage("", false, "signupMessage");
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: byId("signupName").value.trim(),
        email: byId("signupEmail").value.trim(),
        phone: byId("signupPhone").value.trim(),
        password,
        address: byId("signupAddress").value.trim() || null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Unable to create your account. Please try again.");
    localStorage.setItem("servora_user", JSON.stringify({ ...data.user, session_token: data.session_token }));
    setMessage(`Your account is ready, ${data.user.name}.`, true, "signupMessage");
    window.location.assign(config.destination);
  } catch (error) {
    setMessage(error.message || "Could not connect to Servora. Please try again.", false, "signupMessage");
    button.disabled = false;
    button.innerHTML = original;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.title = `${config.title} — Servora`;
  byId("pageTitle").textContent = config.title;
  byId("pageSubtitle").textContent = config.subtitle;
  byId("identifierLabel").textContent = config.identifier;
  byId("identifier").placeholder = config.placeholder;
  byId("identifier").type = config.type;
  byId("loginForm").addEventListener("submit", handleLogin);
  const signupForm = byId("signupForm");
  const signupToggle = byId("signupToggle");
  if (role === "customer" && signupForm && signupToggle) {
    signupForm.addEventListener("submit", handleSignup);
    signupToggle.addEventListener("click", (event) => {
      event.preventDefault();
      const openingSignup = signupForm.classList.contains("hidden");
      signupForm.classList.toggle("hidden", !openingSignup);
      byId("loginForm").classList.toggle("hidden", openingSignup);
      byId("pageTitle").textContent = openingSignup ? "Create your account" : config.title;
      byId("pageSubtitle").textContent = openingSignup ? "Create a customer account to manage appliances and service visits." : config.subtitle;
      byId("signupPrompt").textContent = openingSignup ? "Already have an account?" : "New to Servora?";
      signupToggle.textContent = openingSignup ? "Sign in" : "Create an account";
      setMessage("", false, "signupMessage");
      setMessage("");
      (openingSignup ? byId("signupName") : byId("identifier")).focus();
    });
  }
  byId("togglePassword").addEventListener("click", () => {
    const input = byId("password");
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    byId("togglePassword").textContent = visible ? "Hide" : "Show";
    byId("togglePassword").setAttribute("aria-label", visible ? "Hide password" : "Show password");
  });
  byId("forgotLink").addEventListener("click", (event) => {
    event.preventDefault();
    setMessage("For password assistance, contact your organization administrator or Servora support.");
  });
  checkBackend();
});
