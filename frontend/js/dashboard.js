import { API_BASE_URL } from "./config.js";

let currentUser = null;
let userAppliances = [];
let userRequests = [];
let selectedRequestId = null;

const $ = (id) => document.getElementById(id);
const roleDestinations = {
  admin: "admin-dashboard.html",
  company: "company-dashboard.html",
  franchise: "franchise-dashboard.html",
  branch: "franchise-dashboard.html",
  technician: "technician-dashboard.html",
};

function readStoredUser() {
  try { return JSON.parse(localStorage.getItem("servora_user") || "null"); }
  catch { localStorage.removeItem("servora_user"); return null; }
}

function apiFetch(path, options = {}) {
  const storedUser = currentUser || readStoredUser();
  const headers = { ...(options.headers || {}) };
  if (storedUser?.session_token) headers.Authorization = `Bearer ${storedUser.session_token}`;
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: options.credentials || "include",
    headers,
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function showToast(message, type = "info") {
  const container = $("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-700 bg-slate-900 text-white"}`;
  toast.textContent = message;
  container.append(toast);
  window.setTimeout(() => toast.remove(), 3800);
}

function setProfile(user) {
  const name = user.name || "Customer";
  $("userName").textContent = name;
  $("welcomeTitle").textContent = `Welcome, ${name.split(/\s+/)[0]}`;
  $("userAvatar").textContent = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "CU";
  $("todayLabel").textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date());
  if (user.address) $("bookAddress").value = user.address;
}

function redirectForRole(role) {
  if (role === "customer") return false;
  const destination = roleDestinations[role];
  if (destination) window.location.replace(`./${destination}`);
  else window.location.replace("./index.html");
  return true;
}

async function loadCurrentCustomer() {
  const cachedUser = readStoredUser();
  try {
    const response = await apiFetch("/api/auth/me");
    if (response.ok) {
      const data = await response.json();
      const token = currentUser?.session_token || cachedUser?.session_token;
      currentUser = { ...data.user, session_token: token };
      if (currentUser.role !== "customer") {
        redirectForRole(currentUser.role);
        return false;
      }
      localStorage.setItem("servora_user", JSON.stringify(currentUser));
      return true;
    }
  } catch (error) {
    console.warn("Could not confirm the customer session with the API.", error);
  }

  if (cachedUser?.role && cachedUser.role !== "customer") {
    currentUser = cachedUser;
    redirectForRole(cachedUser.role);
    return false;
  }
  if (!cachedUser || cachedUser.role !== "customer") {
    localStorage.removeItem("servora_user");
    window.location.replace("./index.html");
    return false;
  }
  currentUser = cachedUser;
  return true;
}

async function readApiJson(path, options) {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Could not load ${path}`);
  return data;
}

async function loadDashboardData() {
  try {
    const [appliancesResult, requestsResult] = await Promise.allSettled([
      readApiJson("/api/appliances"),
      readApiJson("/api/requests"),
    ]);

    if (appliancesResult.status === "fulfilled") {
      userAppliances = appliancesResult.value;
      renderAppliances();
    } else {
      $("applianceList").innerHTML = `<div class="col-span-full rounded-xl bg-rose-50 px-4 py-5 text-center text-xs text-rose-700">${escapeHtml(appliancesResult.reason.message || "Could not load appliances.")}</div>`;
    }

    if (requestsResult.status === "fulfilled") {
      userRequests = requestsResult.value;
      renderRequests();
    } else {
      $("requestsTable").innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-rose-600">${escapeHtml(requestsResult.reason.message || "Could not load service requests.")}</td></tr>`;
      showToast("Some customer dashboard data could not be loaded. Please refresh or contact support.", "error");
    }
  } catch (error) {
    console.error("Customer dashboard loading failed:", error);
    showToast("Could not connect to the Servora service. Please try again.", "error");
  }
}

function formatDate(value) {
  if (!value) return "Not scheduled";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

function statusClasses(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("complete")) return "bg-emerald-50 text-emerald-700";
  if (normalized.includes("progress") || normalized.includes("way")) return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-700";
}

function renderAppliances() {
  $("applianceCount").textContent = String(userAppliances.length);
  const select = $("bookApplianceSelect");
  const previousValue = select.value;
  select.innerHTML = `<option value="">Select a registered appliance</option>${userAppliances.map((appliance) => `<option value="${escapeHtml(appliance.id)}">${escapeHtml(appliance.brand)} ${escapeHtml(appliance.category)} · ${escapeHtml(appliance.model_no)}</option>`).join("")}`;
  if (userAppliances.some((appliance) => appliance.id === previousValue)) select.value = previousValue;

  const list = $("applianceList");
  if (!userAppliances.length) {
    list.innerHTML = `<div class="col-span-full rounded-xl bg-slate-50 px-4 py-8 text-center"><p class="text-sm font-semibold text-slate-700">No appliances registered yet</p><p class="mt-1 text-xs text-slate-500">Register an appliance to book a service visit.</p><button onclick="openAddApplianceModal()" class="mt-3 text-xs font-bold text-servora-600">Add your first appliance →</button></div>`;
    return;
  }

  list.innerHTML = userAppliances.map((appliance) => `
    <article class="rounded-xl border border-slate-200 p-4 transition hover:border-blue-200 hover:shadow-sm">
      <div class="flex items-start gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-servora-600"><i data-lucide="${/^[a-z0-9-]+$/i.test(appliance.icon || "") ? appliance.icon : "box"}" class="h-5 w-5"></i></span>
        <div class="min-w-0 flex-1"><h3 class="truncate text-sm font-bold text-slate-900">${escapeHtml(appliance.brand)} ${escapeHtml(appliance.category)}</h3><p class="mt-1 text-xs text-slate-500">Model: ${escapeHtml(appliance.model_no)}</p><p class="mt-1 text-[11px] text-slate-400">Serial: ${escapeHtml(appliance.serial_no || "Not provided")}</p></div>
      </div>
      <div class="mt-4 flex items-center justify-between gap-2"><span class="rounded-full px-2.5 py-1 text-[10px] font-semibold ${String(appliance.warranty_status || "").toLowerCase().includes("active") ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}">${escapeHtml(appliance.warranty_status || "Warranty details unavailable")}</span><button class="book-appliance text-xs font-bold text-servora-600 hover:text-servora-700" data-appliance-id="${escapeHtml(appliance.id)}">Book service</button></div>
    </article>`).join("");
  list.querySelectorAll(".book-appliance").forEach((button) => button.addEventListener("click", () => openBookingModal(button.dataset.applianceId)));
  if (window.lucide) window.lucide.createIcons();
}

function renderRequests() {
  const active = userRequests.filter((request) => request.status_badge !== "Completed");
  const completed = userRequests.filter((request) => request.status_badge === "Completed");
  $("activeRequestCount").textContent = String(active.length);
  $("completedRequestCount").textContent = String(completed.length);
  $("requestCount").textContent = `${userRequests.length} request${userRequests.length === 1 ? "" : "s"}`;

  const table = $("requestsTable");
  if (!userRequests.length) {
    table.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center"><p class="text-sm font-semibold text-slate-700">No service requests yet</p><p class="mt-1 text-xs text-slate-400">Your bookings will appear here.</p></td></tr>`;
    setTrackingEmpty();
    return;
  }

  table.innerHTML = userRequests.map((request) => `
    <tr class="hover:bg-slate-50/70">
      <td class="whitespace-nowrap px-5 py-4 font-semibold text-servora-600 sm:px-6">${escapeHtml(request.id)}</td>
      <td class="max-w-[230px] px-4 py-4"><strong class="block truncate font-semibold text-slate-800">${escapeHtml(request.appliance_name)}</strong><span class="mt-1 block truncate text-[11px] text-slate-400">${escapeHtml(request.issue)}</span></td>
      <td class="whitespace-nowrap px-4 py-4 text-slate-600">${escapeHtml(formatDate(request.appointment_date))}<span class="mt-1 block text-[10px] text-slate-400">${escapeHtml(request.appointment_slot || "")}</span></td>
      <td class="whitespace-nowrap px-4 py-4"><span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(request.status_badge)}">${escapeHtml(request.status_badge || request.status || "Pending")}</span></td>
      <td class="whitespace-nowrap px-5 py-4 text-right sm:px-6"><button class="track-request font-bold text-servora-600 hover:text-servora-700" data-request-id="${escapeHtml(request.id)}">View details →</button></td>
    </tr>`).join("");
  table.querySelectorAll(".track-request").forEach((button) => button.addEventListener("click", () => {
    const request = userRequests.find((item) => item.id === button.dataset.requestId);
    loadTrackingDetails(button.dataset.requestId, request);
  }));

  const selected = userRequests.find((request) => request.id === selectedRequestId)
    || userRequests.find((request) => request.status_badge !== "Completed")
    || userRequests[0];
  if (selected) loadTrackingDetails(selected.id, selected);
}

function setTrackingEmpty() {
  $("trackingEmpty").classList.remove("hidden");
  $("trackingDetails").classList.add("hidden");
  $("trackingStatus").classList.add("hidden");
}

function renderTimeline(steps) {
  const timeline = $("trackingTimeline");
  if (!Array.isArray(steps) || !steps.length) {
    timeline.innerHTML = `<p class="text-xs text-slate-400">Progress updates will appear here.</p>`;
    return;
  }
  timeline.innerHTML = steps.map((step) => {
    const done = step.state === "completed";
    const current = step.state === "current";
    const dot = done ? "bg-emerald-500" : current ? "bg-servora-500 ring-4 ring-blue-100" : "bg-slate-200";
    const heading = done || current ? "font-semibold text-slate-800" : "font-medium text-slate-400";
    return `<div class="relative flex gap-3"><span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot}"></span><div><p class="text-xs ${heading}">${escapeHtml(step.title)}</p>${step.timestamp ? `<p class="mt-0.5 text-[10px] text-slate-400">${escapeHtml(step.timestamp)}</p>` : ""}${step.description ? `<p class="mt-0.5 text-[10px] text-slate-400">${escapeHtml(step.description)}</p>` : ""}</div></div>`;
  }).join("");
}

async function loadTrackingDetails(requestId, fallbackRequest = null) {
  if (!requestId) { setTrackingEmpty(); return; }
  try {
    const request = await readApiJson(`/api/requests/${encodeURIComponent(requestId)}`);
    selectedRequestId = request.id;
    $("trackingEmpty").classList.add("hidden");
    $("trackingDetails").classList.remove("hidden");
    const status = $("trackingStatus");
    status.textContent = request.status_badge || request.status || "Pending";
    status.className = `rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(status.textContent)}`;
    $("trackingAppliance").textContent = request.appliance_name || "Service request";
    $("trackingMeta").textContent = `${request.id} · ${formatDate(request.appointment_date)}${request.appointment_slot ? ` · ${request.appointment_slot}` : ""}`;
    $("trackingIssue").textContent = request.issue || "No issue description provided.";
    const technician = request.technician;
    $("trackingTechnician").textContent = technician ? `${technician.name}${technician.title ? ` · ${technician.title}` : ""}` : "Not assigned yet";
    $("technicianVerified").classList.toggle("hidden", !technician?.is_verified);
    $("otpPanel").classList.toggle("hidden", !request.verification_otp);
    $("trackingOtp").textContent = request.verification_otp || "";
    renderTimeline(request.timeline);
  } catch (error) {
    if (fallbackRequest) {
      const request = fallbackRequest;
      selectedRequestId = request.id;
      $("trackingEmpty").classList.add("hidden");
      $("trackingDetails").classList.remove("hidden");
      const status = $("trackingStatus");
      status.textContent = request.status_badge || request.status || "Pending";
      status.className = `rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(status.textContent)}`;
      $("trackingAppliance").textContent = request.appliance_name || "Service request";
      $("trackingMeta").textContent = `${request.id} · ${formatDate(request.appointment_date)}${request.appointment_slot ? ` · ${request.appointment_slot}` : ""}`;
      $("trackingIssue").textContent = request.issue || "No issue description provided.";
      $("trackingTechnician").textContent = request.technician?.name || "Not assigned yet";
      $("technicianVerified").classList.toggle("hidden", !request.technician?.is_verified);
      $("otpPanel").classList.toggle("hidden", !request.verification_otp);
      $("trackingOtp").textContent = request.verification_otp || "";
      renderTimeline(request.timeline);
      return;
    }
    showToast(error.message || "Could not load request details.", "error");
  }
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog?.showModal) dialog.showModal();
  else dialog?.classList.remove("hidden");
}
function closeDialog(id) { $(id)?.close?.(); }

window.openBookingModal = function (applianceId = "") {
  if (!userAppliances.length) {
    showToast("Register an appliance before booking a service visit.");
    window.openAddApplianceModal();
    return;
  }
  const select = $("bookApplianceSelect");
  if (applianceId) select.value = applianceId;
  $("bookingMessage").textContent = "";
  openDialog("bookingDialog");
};
window.openAddApplianceModal = function () {
  $("applianceMessage").textContent = "";
  openDialog("applianceDialog");
};

async function submitBooking(event) {
  event.preventDefault();
  const button = $("bookingSubmit");
  button.disabled = true;
  button.textContent = "Booking…";
  $("bookingMessage").textContent = "";
  try {
    const request = await readApiJson("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appliance_id: $("bookApplianceSelect").value,
        issue: $("bookIssue").value.trim(),
        preferred_date: $("bookDate").value,
        preferred_slot: $("bookSlot").value,
        address: $("bookAddress").value.trim(),
      }),
    });
    closeDialog("bookingDialog");
    $("bookingForm").reset();
    if (currentUser?.address) $("bookAddress").value = currentUser.address;
    selectedRequestId = request.id;
    await loadDashboardData();
    await loadTrackingDetails(request.id, request);
    showToast(`Service request ${request.id} created.`, "success");
  } catch (error) {
    $("bookingMessage").textContent = error.message || "Could not create your request.";
  } finally {
    button.disabled = false;
    button.textContent = "Confirm booking";
  }
}

async function submitAppliance(event) {
  event.preventDefault();
  const button = $("applianceSubmit");
  button.disabled = true;
  button.textContent = "Saving…";
  $("applianceMessage").textContent = "";
  try {
    const appliance = await readApiJson("/api/appliances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: $("newAppCategory").value,
        brand: $("newAppBrand").value.trim(),
        model_no: $("newAppModel").value.trim(),
        serial_no: $("newAppSerial").value.trim(),
      }),
    });
    closeDialog("applianceDialog");
    $("applianceForm").reset();
    await loadDashboardData();
    $("bookApplianceSelect").value = appliance.id;
    showToast(`${appliance.brand} ${appliance.category} added.`, "success");
  } catch (error) {
    $("applianceMessage").textContent = error.message || "Could not save this appliance.";
  } finally {
    button.disabled = false;
    button.textContent = "Save appliance";
  }
}

function setupNavigation() {
  document.querySelectorAll("[data-section-link]").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll("[data-section-link]").forEach((item) => item.removeAttribute("aria-current"));
      document.querySelectorAll(`[data-section-link="${link.dataset.sectionLink}"]`).forEach((item) => item.setAttribute("aria-current", "page"));
      $("crumbTitle").textContent = link.dataset.sectionLink === "overview" ? "Overview" : link.dataset.sectionLink === "appliances" ? "My appliances" : "Service requests";
    });
  });
}

function logout() {
  const token = currentUser?.session_token;
  localStorage.removeItem("servora_user");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST", headers, credentials: "include", keepalive: true }).catch(() => {});
  window.location.replace("./index.html");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) window.lucide.createIcons();
  setupNavigation();
  $("bookingForm").addEventListener("submit", submitBooking);
  $("applianceForm").addEventListener("submit", submitAppliance);
  $("closeBooking").addEventListener("click", () => closeDialog("bookingDialog"));
  $("cancelBooking").addEventListener("click", () => closeDialog("bookingDialog"));
  $("closeAppliance").addEventListener("click", () => closeDialog("applianceDialog"));
  $("cancelAppliance").addEventListener("click", () => closeDialog("applianceDialog"));
  $("logoutBtn").addEventListener("click", logout);
  $("mobileLogoutBtn").addEventListener("click", logout);
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  $("bookDate").min = localToday;
  $("bookDate").value = localToday;

  if (await loadCurrentCustomer()) {
    setProfile(currentUser);
    await loadDashboardData();
  }
});
