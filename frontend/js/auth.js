import { API_BASE_URL, setCustomApiUrl } from "./config.js";

const role = document.body.dataset.role || "customer";
const roleSettings = {
  customer: { title: "Sign in to your account", subtitle: "Manage your home services, all in one place.", identifier: "Email or phone number", placeholder: "you@example.com", type: "text", destination: "./dashboard.html" },
  company: { title: "Company sign in", subtitle: "Manage your organization and service network.", identifier: "Work email", placeholder: "name@company.com", type: "text", destination: "./company-dashboard.html" },
  franchise: { title: "Franchise sign in", subtitle: "Access your location and service operations.", identifier: "Email or phone number", placeholder: "you@example.com", type: "text", destination: "./franchise-dashboard.html" },
  technician: { title: "Technician sign in", subtitle: "View your assigned jobs and keep service moving.", identifier: "Work email or phone number", placeholder: "you@example.com or +91 98765 43210", type: "text", destination: "./technician-dashboard.html" },
  admin: { title: "Servora admin sign in", subtitle: "Sign in with your Servora administrator credentials.", identifier: "Administrator email", placeholder: "admin@servora.com", type: "email", destination: "./admin-dashboard.html" },
};
const config = roleSettings[role] || roleSettings.customer;
const byId = (id) => document.getElementById(id);

function setMessage(message, success = false) {
  const node = byId("formMessage");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("success", success);
}

function updateApiStatus(online, label) {
  const dot = byId("backendDot");
  const text = byId("backendStatusText");
  if (dot) dot.className = `connection-dot ${online ? "online" : "offline"}`;
  if (text) text.textContent = label;
}

window.promptApiUrl = function () {
  const current = localStorage.getItem("servora_api_url") || API_BASE_URL;
  const next = prompt("Enter your Render backend URL (for example https://servora-backend.onrender.com):", current);
  if (next !== null) setCustomApiUrl(next.trim());
};

async function checkBackend() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Backend unavailable");
    updateApiStatus(true, "Service connected");
  } catch {
    updateApiStatus(false, "Service unavailable");
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
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Unable to sign in. Check your details and try again.");
    localStorage.setItem("servora_user", JSON.stringify({ ...data.user, session_token: data.session_token }));
    setMessage(`Welcome back, ${data.user.name}.`, true);
    // Navigate immediately so static hosting and browser privacy settings cannot
    // interrupt the redirect timer after a successful response.
    window.location.assign(config.destination);
  } catch (error) {
    setMessage(error.message || "Could not connect to the service. Please try again.");
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
