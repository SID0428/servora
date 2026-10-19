import { API_BASE_URL } from "./config.js";

let currentUser = null;
let userAppliances = [];
let userRequests = [];
let registeredCompanies = [];
let companyListLoadError = false;
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
  try {
    const specific = localStorage.getItem("servora_user_customer");
    if (specific) {
      const parsed = JSON.parse(specific);
      if (parsed && parsed.role === "customer") return parsed;
    }
    const generic = localStorage.getItem("servora_user");
    if (generic) {
      const parsed = JSON.parse(generic);
      if (parsed && parsed.role === "customer") return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function apiFetch(path, options = {}) {
  const storedUser = currentUser || readStoredUser();
  const headers = { ...(options.headers || {}) };
  if (storedUser?.session_token) {
    headers.Authorization = `Bearer ${storedUser.session_token}`;
  }
  if (storedUser?.id) {
    headers["X-Servora-User-Id"] = storedUser.id;
  }
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: options.credentials || "include",
    headers,
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showToast(message, type = "info") {
  const container = $("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all duration-300 ${
    type === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-slate-700 bg-slate-900 text-white"
  }`;
  toast.textContent = message;
  container.append(toast);
  window.setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-1");
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

function setProfile(user) {
  const name = user.name || "Customer";
  const firstName = name.split(/\s+/)[0] || "Customer";
  const initials =
    name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "CU";

  if ($("userName")) $("userName").textContent = name;
  if ($("welcomeTitle")) {
    $("welcomeTitle").innerHTML = `<span>Hello ${escapeHtml(firstName)}</span> <span class="inline-block text-2xl">👋</span>`;
  }
  if ($("userAvatar")) $("userAvatar").textContent = initials;
  if ($("userAvatarHeader")) $("userAvatarHeader").textContent = initials;
  if ($("profileAvatarBig")) $("profileAvatarBig").textContent = initials;
  if ($("profileFullName")) $("profileFullName").textContent = name;
  if ($("profileEmail")) $("profileEmail").textContent = user.email || "customer@servora.com";
  if ($("profilePhone")) $("profilePhone").textContent = user.phone || "+91 98765 43210";
  if ($("profileAddress")) $("profileAddress").textContent = user.address || "No address provided";

  if ($("todayLabel")) {
    try {
      $("todayLabel").textContent = new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
      }).format(new Date());
    } catch {
      $("todayLabel").textContent = new Date().toDateString();
    }
  }

  if ($("bookingSavedAddrText")) {
    $("bookingSavedAddrText").textContent = user.address || "12, Sector 4, Greater Noida, UP - 201310";
  }
  if ($("bookAddress")) {
    $("bookAddress").value = user.address || "12, Sector 4, Greater Noida, UP - 201310";
  }
  const m = (user.address || "").match(/\b(\d{6})\b/);
  if ($("bookPincode")) {
    $("bookPincode").value = m ? m[1] : "201310";
  }
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
      const token = data.session_token || currentUser?.session_token || cachedUser?.session_token;
      currentUser = { ...currentUser, ...cachedUser, ...data.user, session_token: token };
      if (currentUser.role !== "customer") {
        redirectForRole(currentUser.role);
        return false;
      }
      localStorage.setItem("servora_user", JSON.stringify(currentUser));
      localStorage.setItem("servora_user_customer", JSON.stringify(currentUser));
      return true;
    } else if (response.status === 401) {
      if (cachedUser && cachedUser.id) {
        console.warn("Transient 401 on /api/auth/me; retaining cached customer session.");
        currentUser = cachedUser;
        return true;
      }
      window.location.replace("./index.html");
      return false;
    }
  } catch (error) {
    console.warn("Backend waking up or network unavailable, retaining local session.", error);
  }

  if (cachedUser?.role && cachedUser.role !== "customer") {
    currentUser = cachedUser;
    redirectForRole(cachedUser.role);
    return false;
  }
  if (!cachedUser) {
    window.location.replace("./index.html");
    return false;
  }
  currentUser = cachedUser;
  return true;
}

function extractErrorMessage(errData, fallback = "Operation failed") {
  if (!errData) return fallback;
  const detail = errData.detail ?? errData.message ?? errData;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => (typeof item === "object" ? (item.msg || item.message || JSON.stringify(item)) : String(item))).join("; ");
  }
  if (typeof detail === "object") {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  return String(detail);
}

async function readApiJson(path, options) {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractErrorMessage(data, `Could not load ${path}`));
  return data;
}

function formatDate(value, defaultText = "Not scheduled") {
  if (!value) return defaultText;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusClasses(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("complete")) {
    return "bg-emerald-50 text-emerald-700 border border-emerald-100";
  }
  if (
    normalized.includes("progress") ||
    normalized.includes("way") ||
    normalized.includes("assign")
  ) {
    return "bg-blue-50 text-[#0066ff] border border-blue-100";
  }
  return "bg-amber-50 text-amber-700 border border-amber-100";
}

function getApplianceSvg(category = "", brand = "") {
  const c = `${category} ${brand}`.toLowerCase();

  if (c.includes("ac") || c.includes("air") || c.includes("condition")) {
    return `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="4" width="20" height="11" rx="2"/>
      <path d="M6 15v2M18 15v2M6 10h12M18 7h.01M6 18h12"/>
      <path d="M7 15c0 2 2 3 5 3s5-1 5-3"/>
    </svg>`;
  }

  if (c.includes("fridge") || c.includes("refrigerat")) {
    return `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2.5"/>
      <line x1="5" y1="9" x2="19" y2="9"/>
      <line x1="8" y1="5" x2="8" y2="7"/>
      <line x1="8" y1="12" x2="8" y2="15"/>
    </svg>`;
  }

  if (c.includes("wash") || c.includes("laundry")) {
    return `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="2" width="18" height="20" rx="2"/>
      <circle cx="12" cy="13" r="5"/>
      <path d="M12 15a2 2 0 1 0-2-2"/>
      <line x1="7" y1="6" x2="7.01" y2="6"/>
      <line x1="10" y1="6" x2="10.01" y2="6"/>
      <line x1="14" y1="6" x2="17" y2="6"/>
    </svg>`;
  }

  if (c.includes("micro") || c.includes("oven")) {
    return `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="4" width="20" height="15" rx="2"/>
      <rect x="5" y="7" width="10" height="9" rx="1"/>
      <line x1="18" y1="8" x2="18.01" y2="8"/>
      <line x1="18" y1="12" x2="18.01" y2="12"/>
      <line x1="18" y1="15" x2="18.01" y2="15"/>
    </svg>`;
  }

  if (c.includes("water") || c.includes("purif") || c.includes("ro")) {
    return `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2"/>
      <path d="M12 7c-2 2.5-3 4-3 5.5a3 3 0 0 0 6 0C15 11 14 9.5 12 7z"/>
      <line x1="8" y1="18" x2="16" y2="18"/>
    </svg>`;
  }

  return `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="3" x2="12" y2="5"/>
    <line x1="12" y1="19" x2="12" y2="21"/>
  </svg>`;
}

async function loadDashboardData() {
  try {
    const [appliancesResult, requestsResult, companiesResult] =
      await Promise.allSettled([
        readApiJson("/api/appliances"),
        readApiJson("/api/requests"),
        readApiJson("/api/appliances/companies"),
      ]);

    if (companiesResult.status === "fulfilled") {
      registeredCompanies = companiesResult.value;
      companyListLoadError = false;
    } else {
      registeredCompanies = [];
      companyListLoadError = true;
      console.error(
        "Could not load registered companies:",
        companiesResult.reason
      );
    }
    renderCompanyOptions();

    if (appliancesResult.status === "fulfilled") {
      userAppliances = appliancesResult.value;
      renderAppliances();
    } else {
      if ($("applianceList")) {
        $("applianceList").innerHTML = `<div class="p-6 rounded-2xl bg-rose-50 text-center text-xs text-rose-700">${escapeHtml(
          appliancesResult.reason.message || "Could not load appliances."
        )}</div>`;
      }
    }

    if (requestsResult.status === "fulfilled") {
      userRequests = requestsResult.value;
      renderRequests();
    } else {
      if ($("activeRequestsList")) {
        $("activeRequestsList").innerHTML = `<div class="p-6 rounded-2xl bg-rose-50 text-center text-xs text-rose-700">${escapeHtml(
          requestsResult.reason.message || "Could not load service requests."
        )}</div>`;
      }
      if ($("requestsTable")) {
        $("requestsTable").innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-rose-600">${escapeHtml(
          requestsResult.reason.message || "Could not load service requests."
        )}</td></tr>`;
      }
      showToast(
        "Some customer dashboard data could not be loaded. Please refresh or contact support.",
        "error"
      );
    }
  } catch (error) {
    console.error("Customer dashboard loading failed:", error);
    showToast(
      "Could not connect to the Servora service. Please try again.",
      "error"
    );
  }
}

function renderAppliances() {
  if ($("applianceCount")) {
    $("applianceCount").textContent = String(userAppliances.length);
  }

  const select = $("bookApplianceSelect");
  if (select) {
    const previousValue = select.value;
    select.innerHTML = `<option value="">Select a registered appliance</option>${userAppliances
      .map(
        (appliance) =>
          `<option value="${escapeHtml(appliance.id)}">${escapeHtml(
            appliance.brand
          )} ${escapeHtml(appliance.category)} · ${escapeHtml(
            appliance.model_no
          )}</option>`
      )
      .join("")}`;
    if (userAppliances.some((appliance) => appliance.id === previousValue)) {
      select.value = previousValue;
    }
  }

  // 1. Home Tab: Mobile/Laptop Card List matching mockup
  const list = $("applianceList");
  if (list) {
    if (!userAppliances.length) {
      list.innerHTML = `
        <div class="rounded-2xl bg-white border border-slate-100 p-8 text-center shadow-sm">
          <div class="w-12 h-12 rounded-2xl bg-blue-50 text-[#0066ff] flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="7" rx="1.5"/><path d="M12 10v4M6 14h12M6 14v7M18 14v7"/></svg>
          </div>
          <p class="text-sm font-bold text-slate-800">No appliances registered yet</p>
          <p class="mt-1 text-xs text-slate-400">Register an appliance to book single-click service visits.</p>
          <button onclick="openAddApplianceModal()" class="mt-4 px-4 py-2 bg-[#0066ff] text-white font-bold text-xs rounded-xl shadow-sm hover:bg-blue-700 transition">
            + Register your first appliance
          </button>
        </div>`;
    } else {
      list.innerHTML = userAppliances
        .map((appliance) => {
          const registeredText =
            appliance.registered_on ||
            formatDate(appliance.created_at, "12 Jan 2024");
          return `
            <div class="appliance-card bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-200 transition group" data-appliance-id="${escapeHtml(
              appliance.id
            )}">
              <div class="flex items-center gap-3.5 min-w-0">
                <div class="w-12 h-12 rounded-2xl bg-[#eff6ff] text-[#0066ff] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  ${getApplianceSvg(appliance.category, appliance.brand)}
                </div>
                <div class="min-w-0">
                  <h3 class="font-display font-bold text-[15px] text-slate-900 truncate">
                    ${escapeHtml(appliance.brand)} ${escapeHtml(
            appliance.category
          )}
                  </h3>
                  <p class="text-xs text-slate-500 font-medium truncate mt-0.5">
                    Model: ${escapeHtml(appliance.model_no || "N/A")}
                  </p>
                  <p class="text-[11px] text-slate-400 mt-0.5">
                    Registered: ${escapeHtml(registeredText)}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2 pl-2 shrink-0">
                <button class="book-this-appliance text-xs font-bold text-[#0066ff] hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition hidden sm:inline-block" data-id="${escapeHtml(
                  appliance.id
                )}">Book</button>
                <span class="text-xl font-bold text-[#0066ff] group-hover:translate-x-0.5 transition-transform">›</span>
              </div>
            </div>`;
        })
        .join("");

      list.querySelectorAll(".appliance-card").forEach((card) => {
        card.addEventListener("click", () => {
          openBookingModal(card.dataset.applianceId);
        });
      });
      list.querySelectorAll(".book-this-appliance").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openBookingModal(btn.dataset.id);
        });
      });
    }
  }

  // 2. Appliances Tab: Full Catalog List
  const catalog = $("fullAppliancesCatalog");
  if (catalog) {
    if (!userAppliances.length) {
      catalog.innerHTML = `
        <div class="rounded-2xl bg-white border border-slate-100 p-8 text-center shadow-sm">
          <p class="text-sm font-bold text-slate-800">No appliances registered</p>
          <p class="mt-1 text-xs text-slate-400">Click below to add your home appliances.</p>
          <button onclick="openAddApplianceModal()" class="mt-4 px-4 py-2 bg-[#0066ff] text-white font-bold text-xs rounded-xl shadow-sm">
            + Add Appliance
          </button>
        </div>`;
    } else {
      catalog.innerHTML = userAppliances
        .map(
          (appliance) => `
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-2xl bg-[#eff6ff] text-[#0066ff] flex items-center justify-center shrink-0">
                ${getApplianceSvg(appliance.category, appliance.brand)}
              </div>
              <div>
                <h3 class="font-display font-bold text-base text-slate-900">${escapeHtml(
                  appliance.brand
                )} ${escapeHtml(appliance.category)}</h3>
                <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>Model: <strong class="text-slate-700">${escapeHtml(
                    appliance.model_no || "N/A"
                  )}</strong></span>
                  <span>Serial: <strong class="text-slate-700">${escapeHtml(
                    appliance.serial_no || "N/A"
                  )}</strong></span>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <span class="rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    String(appliance.warranty_status || "")
                      .toLowerCase()
                      .includes("active") ||
                    String(appliance.warranty_status || "")
                      .toLowerCase()
                      .includes("covered") ||
                    String(appliance.warranty_status || "")
                      .toLowerCase()
                      .includes("under")
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-600"
                  }">
                    ${escapeHtml(
                      appliance.warranty_status || "Warranty details unavailable"
                    )}
                  </span>
                  ${
                    appliance.warranty_end_date
                      ? `<span class="text-[11px] text-slate-500 font-medium">Valid until: <strong class="text-slate-700">${escapeHtml(appliance.warranty_end_date)}</strong></span>`
                      : ""
                  }
                  ${
                    appliance.amc_active
                      ? `<span class="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">🛡️ AMC: ${escapeHtml(appliance.amc_plan_name || 'Active')} · Exp: ${escapeHtml(appliance.amc_end_date || '')}</span>`
                      : ""
                  }
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 self-end sm:self-center">
              ${
                !appliance.amc_active
                  ? `<button class="buy-amc-btn px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition" data-id="${escapeHtml(appliance.id)}">
                      🛡️ Buy AMC
                    </button>`
                  : ""
              }
              <button class="book-catalog-btn px-4 py-2 bg-[#0066ff] hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-sm" data-id="${escapeHtml(
                appliance.id
              )}">
                Book Service
              </button>
            </div>
          </div>`
        )
        .join("");

      catalog.querySelectorAll(".book-catalog-btn").forEach((btn) => {
        btn.addEventListener("click", () => openBookingModal(btn.dataset.id));
      });
      catalog.querySelectorAll(".buy-amc-btn").forEach((btn) => {
        btn.addEventListener("click", () => openAmcModal(btn.dataset.id));
      });
    }
  }
}

function renderCompanyOptions() {
  const select = $("newAppCompany");
  if (!select) return;
  if (companyListLoadError) {
    select.innerHTML = `<option value="">Company list unavailable</option>`;
    select.disabled = true;
    if ($("applianceSubmit")) $("applianceSubmit").disabled = true;
    if ($("applianceCompanyHelp")) {
      $("applianceCompanyHelp").textContent =
        "Could not load registered companies. Refresh the page and try again.";
    }
    return;
  }
  select.disabled = registeredCompanies.length === 0;
  if ($("applianceSubmit")) {
    $("applianceSubmit").disabled = registeredCompanies.length === 0;
  }
  select.innerHTML = `<option value="">${
    registeredCompanies.length
      ? "Select a registered company"
      : "No companies registered yet"
  }</option>${registeredCompanies
    .map(
      (company) =>
        `<option value="${escapeHtml(company.id)}">${escapeHtml(
          company.name
        )}</option>`
    )
    .join("")}`;
  if ($("applianceCompanyHelp")) {
    $("applianceCompanyHelp").textContent = registeredCompanies.length
      ? "Choose the company associated with this appliance."
      : "A Servora registered company must be available before you can register an appliance.";
  }
}

function renderRequests() {
  const active = userRequests.filter(
    (request) => request.status_badge !== "Completed"
  );
  const completed = userRequests.filter(
    (request) => request.status_badge === "Completed"
  );

  if ($("activeRequestCount")) {
    $("activeRequestCount").textContent = String(active.length);
  }
  if ($("completedRequestCount")) {
    $("completedRequestCount").textContent = String(completed.length);
  }
  if ($("requestCount")) {
    $("requestCount").textContent = `${userRequests.length} request${
      userRequests.length === 1 ? "" : "s"
    }`;
  }

  // 1. Home Tab: Active Requests Cards matching mockup
  const activeList = $("activeRequestsList");
  if (activeList) {
    const listToRender = active.length > 0 ? active : userRequests.slice(0, 3);
    if (!listToRender.length) {
      activeList.innerHTML = `
        <div class="rounded-2xl bg-white border border-slate-100 p-8 text-center shadow-sm">
          <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <p class="text-sm font-bold text-slate-800">All clear! No active requests</p>
          <p class="mt-1 text-xs text-slate-400">When you book a service, live technician updates will appear here.</p>
        </div>`;
      setTrackingEmpty();
    } else {
      activeList.innerHTML = listToRender
        .map((request) => {
          const appointmentInfo = request.technician
            ? `Technician assigned · ${formatDate(
                request.appointment_date
              )}, ${request.appointment_slot || "4:00 PM"}`
            : `${formatDate(request.appointment_date)} · ${
                request.appointment_slot || "Scheduled"
              }`;
          return `
            <div class="request-card bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3 cursor-pointer hover:border-blue-200 transition group" data-request-id="${escapeHtml(
              request.id
            )}">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3.5 min-w-0">
                  <div class="w-11 h-11 rounded-2xl bg-[#eff6ff] text-[#0066ff] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    ${getApplianceSvg(
                      request.category || "",
                      request.appliance_name || ""
                    )}
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-display font-bold text-[15px] text-slate-900 truncate">
                      ${escapeHtml(request.appliance_name || "Appliance")}
                    </h3>
                    <p class="text-xs text-slate-500 font-medium">
                      Request ID: <span class="font-semibold text-slate-700">${escapeHtml(
                        request.id
                      )}</span>
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusClasses(
                    request.status_badge
                  )}">
                    ${escapeHtml(
                      request.status_badge || request.status || "In Progress"
                    )}
                  </span>
                  <span class="text-xl font-bold text-[#0066ff] group-hover:translate-x-0.5 transition-transform">›</span>
                </div>
              </div>
              <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <div class="flex items-center gap-2 truncate">
                  <span class="w-2 h-2 rounded-full bg-[#0066ff] shrink-0"></span>
                  <span class="truncate font-medium text-slate-600">${escapeHtml(
                    appointmentInfo
                  )}</span>
                </div>
                ${
                  request.verification_otp
                    ? `<span class="font-mono font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[10px]">OTP: ${escapeHtml(
                        request.verification_otp
                      )}</span>`
                    : ""
                }
              </div>
            </div>`;
        })
        .join("");

      activeList.querySelectorAll(".request-card").forEach((card) => {
        card.addEventListener("click", () => {
          const req = userRequests.find(
            (item) => item.id === card.dataset.requestId
          );
          loadTrackingDetails(card.dataset.requestId, req);
          const trackingSec = $("trackingSection");
          if (trackingSec) {
            trackingSec.scrollIntoView({ behavior: "smooth" });
          }
        });
      });
    }
  }

  // 2. Requests Tab: Table View for Desktop / History
  const table = $("requestsTable");
  if (table) {
    if (!userRequests.length) {
      table.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center"><p class="text-sm font-semibold text-slate-700">No service requests yet</p><p class="mt-1 text-xs text-slate-400">Your bookings will appear here.</p></td></tr>`;
      setTrackingEmpty();
    } else {
      table.innerHTML = userRequests
        .map(
          (request) => `
        <tr class="hover:bg-slate-50/70 transition">
          <td class="whitespace-nowrap px-5 py-4 font-bold text-[#0066ff] sm:px-6">${escapeHtml(
            request.id
          )}</td>
          <td class="max-w-[230px] px-4 py-4">
            <strong class="block truncate font-semibold text-slate-800">${escapeHtml(
              request.appliance_name
            )}</strong>
            <span class="mt-0.5 block truncate text-[11px] text-slate-400">${escapeHtml(
              request.issue
            )}</span>
          </td>
          <td class="whitespace-nowrap px-4 py-4 text-slate-600">
            ${escapeHtml(formatDate(request.appointment_date))}
            <span class="mt-0.5 block text-[10px] text-slate-400">${escapeHtml(
              request.appointment_slot || ""
            )}</span>
          </td>
          <td class="whitespace-nowrap px-4 py-4">
            <span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(
              request.status_badge
            )}">
              ${escapeHtml(
                request.status_badge || request.status || "Pending"
              )}
            </span>
          </td>
          <td class="whitespace-nowrap px-5 py-4 text-right sm:px-6">
            <button class="track-request font-bold text-[#0066ff] hover:text-blue-700" data-request-id="${escapeHtml(
              request.id
            )}">View details →</button>
          </td>
        </tr>`
        )
        .join("");

      table.querySelectorAll(".track-request").forEach((button) =>
        button.addEventListener("click", () => {
          const req = userRequests.find(
            (item) => item.id === button.dataset.requestId
          );
          loadTrackingDetails(button.dataset.requestId, req);
          switchTab("home");
          const trackingSec = $("trackingSection");
          if (trackingSec) {
            trackingSec.scrollIntoView({ behavior: "smooth" });
          }
        })
      );
    }
  }

  // Preload tracking details with selected request or first active
  const selected =
    userRequests.find((request) => request.id === selectedRequestId) ||
    userRequests.find((request) => request.status_badge !== "Completed") ||
    userRequests[0];
  if (selected) {
    loadTrackingDetails(selected.id, selected);
  }
}

function setTrackingEmpty() {
  if ($("trackingEmpty")) $("trackingEmpty").classList.remove("hidden");
  if ($("trackingDetails")) $("trackingDetails").classList.add("hidden");
  if ($("trackingStatus")) $("trackingStatus").classList.add("hidden");
}

let currentAddrMode = "saved";
let miniMapInstance = null;
let liveMapInstance = null;

function setupAddressModes() {
  const btnSaved = $("addrModeSaved");
  const btnNew = $("addrModeNew");
  const viewSaved = $("bookingSavedAddrView");
  const viewNew = $("bookingNewAddrView");

  function setMode(mode) {
    currentAddrMode = mode;
    if (btnSaved) btnSaved.className = mode === "saved" ? "py-2 px-3 rounded-lg bg-white text-[#0066ff] shadow-xs text-center transition" : "py-2 px-3 rounded-lg text-slate-600 hover:text-slate-900 text-center transition";
    if (btnNew) btnNew.className = mode === "new" ? "py-2 px-3 rounded-lg bg-white text-[#0066ff] shadow-xs text-center transition" : "py-2 px-3 rounded-lg text-slate-600 hover:text-slate-900 text-center transition";

    if (viewSaved) viewSaved.classList.toggle("hidden", mode !== "saved");
    if (viewNew) viewNew.classList.toggle("hidden", mode !== "new");

    syncBookingAddress();
  }

  if (btnSaved) btnSaved.onclick = () => setMode("saved");
  if (btnNew) btnNew.onclick = () => setMode("new");

  if ($("changeSavedAddrBtn")) {
    $("changeSavedAddrBtn").onclick = () => {
      closeDialog("bookingDialog");
      switchTab("profile");
      window.openAddressModal();
    };
  }

  if ($("detectGpsBtn")) {
    $("detectGpsBtn").onclick = detectUserGps;
  }

  ["bookNewHouse", "bookNewCity", "bookNewPincode"].forEach((id) => {
    if ($(id)) $(id).addEventListener("input", syncBookingAddress);
  });
}

function syncBookingAddress() {
  if (currentAddrMode === "saved") {
    const saved = currentUser?.address || "12, Sector 4, Greater Noida, UP - 201310";
    if ($("bookAddress")) $("bookAddress").value = saved;
    const m = saved.match(/\b(\d{6})\b/);
    if ($("bookPincode")) $("bookPincode").value = m ? m[1] : "201310";
  } else if (currentAddrMode === "new") {
    const house = $("bookNewHouse")?.value.trim() || "";
    const city = $("bookNewCity")?.value.trim() || "";
    const pin = $("bookNewPincode")?.value.trim() || "";
    if ($("bookAddress")) $("bookAddress").value = [house, city, pin].filter(Boolean).join(", ");
    if ($("bookPincode")) $("bookPincode").value = pin;
  }
}

function detectUserGps() {
  const pill = $("gpsStatusPill");
  const coordsText = $("gpsCoordsText");
  const miniMap = $("bookingMiniMap");

  function applyCoords(lat, lng) {
    if ($("bookLat")) $("bookLat").value = lat;
    if ($("bookLng")) $("bookLng").value = lng;
    if (pill) pill.classList.remove("hidden");
    if (coordsText) coordsText.textContent = `Coordinates: ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;

    if (miniMap && window.L) {
      miniMap.classList.remove("hidden");
      setTimeout(() => {
        if (!miniMapInstance) {
          miniMapInstance = window.L.map("bookingMiniMap").setView([lat, lng], 14);
          window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap",
            maxZoom: 18,
          }).addTo(miniMapInstance);
          window.L.marker([lat, lng]).addTo(miniMapInstance).bindPopup("Doorstep Pin").openPopup();
        } else {
          miniMapInstance.setView([lat, lng], 14);
          miniMapInstance.invalidateSize();
        }
      }, 100);
    }
    showToast("Live GPS location captured successfully!", "success");
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => applyCoords(pos.coords.latitude, pos.coords.longitude),
      () => applyCoords(28.4744, 77.5040),
      { timeout: 7000 }
    );
  } else {
    applyCoords(28.4744, 77.5040);
  }
}

function renderTimeline(steps, request) {
  const timeline = $("trackingTimeline");
  if (!timeline) return;
  if (!Array.isArray(steps) || !steps.length) {
    timeline.innerHTML = `<p class="text-xs text-slate-400">Progress updates will appear here.</p>`;
    return;
  }
  timeline.innerHTML = steps
    .map((step) => {
      const done = step.state === "completed";
      const current = step.state === "current";
      const isWay = step.title.toLowerCase().includes("way") || step.id === "step_3";

      const dot = done
        ? `<span class="mt-1 h-5 w-5 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">✓</span>`
        : current
        ? `<span class="mt-1 h-5 w-5 shrink-0 rounded-full bg-[#0066ff] ring-4 ring-blue-100 flex items-center justify-center text-white text-[9px] font-bold animate-pulse">●</span>`
        : `<span class="mt-1 h-5 w-5 shrink-0 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center text-[10px]">○</span>`;

      const heading =
        done || current
          ? "font-bold text-slate-800 text-xs"
          : "font-semibold text-slate-400 text-xs";

      const hasTech = Boolean(request?.technician_id || request?.technician?.id || request?.technician);
      const isDispatched = request?.status === "Technician on the Way" || request?.status === "Service In Progress";
      const showLiveTracking = isWay && hasTech && (isDispatched || current);

      return `
        <div class="relative flex items-start gap-3 pb-2.5">
          ${dot}
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <p class="${heading}">${escapeHtml(step.title)}</p>
              ${step.timestamp ? `<span class="text-[10px] text-slate-400 font-medium">${escapeHtml(step.timestamp)}</span>` : ""}
            </div>
            ${
              step.description
                ? `<p class="mt-0.5 text-[11px] text-slate-500">${escapeHtml(step.description)}</p>`
                : ""
            }
            ${
              showLiveTracking
                ? `<button type="button" class="mt-1.5 text-xs font-bold text-[#0066ff] hover:underline flex items-center gap-1" onclick="window.openLiveTrackingModal('${request?.id || "SR-7845"}')">
                    <span>Technician on the Way (Live tracking available &gt;)</span>
                   </button>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");
}

async function loadTrackingDetails(requestId, fallbackRequest = null) {
  if (!requestId) {
    setTrackingEmpty();
    return;
  }
  try {
    const request = await readApiJson(
      `/api/requests/${encodeURIComponent(requestId)}`
    );
    populateTracking(request);
  } catch (error) {
    if (fallbackRequest) {
      populateTracking(fallbackRequest);
      return;
    }
    showToast(error.message || "Could not load request details.", "error");
  }
}

function populateTracking(request) {
  selectedRequestId = request.id;
  if ($("trackingEmpty")) $("trackingEmpty").classList.add("hidden");
  if ($("trackingDetails")) $("trackingDetails").classList.remove("hidden");

  if ($("trackingTicketId")) $("trackingTicketId").textContent = request.id;

  const status = $("trackingStatus");
  if (status) {
    status.classList.remove("hidden");
    status.textContent =
      request.status_badge || request.status || "In Progress";
    status.className = `rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(
      status.textContent
    )}`;
  }

  if ($("trackingPriorityPill")) {
    $("trackingPriorityPill").textContent = `${request.priority || "Medium"} Priority`;
  }

  if ($("trackingAppliance")) {
    $("trackingAppliance").textContent =
      `${request.appliance_name || "Service request"}${request.model_no ? ` (${request.model_no})` : ""}`;
  }
  if ($("trackingMeta")) {
    $("trackingMeta").textContent = `${request.id} · ${formatDate(
      request.appointment_date
    )}${request.appointment_slot ? ` · ${request.appointment_slot}` : ""}`;
  }
  if ($("trackingIssue")) {
    $("trackingIssue").textContent =
      request.issue || "No issue description provided.";
  }

  const isAssigned = Boolean(request.technician && (request.technician_id || request.technician.id));
  const technician = isAssigned ? request.technician : null;

  if ($("trackingTechnician")) {
    $("trackingTechnician").textContent = technician ? technician.name : "Awaiting Technician Assignment";
  }
  if ($("trackingTechTitle")) {
    $("trackingTechTitle").textContent = technician?.title || "Your service ticket is being reviewed by the nearest franchise";
  }
  if ($("trackingTechRating")) {
    $("trackingTechRating").innerHTML = technician?.rating
      ? `★ ${technician.rating} <span class="text-slate-400 font-normal">(${technician.total_jobs || 0} jobs completed)</span>`
      : `<span class="text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">⏳ Franchise Assignment Pending</span>`;
  }
  if ($("trackingTechAvatar")) {
    $("trackingTechAvatar").src = technician?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80";
  }
  if ($("techCallBtn")) {
    $("techCallBtn").style.display = technician?.phone ? "inline-flex" : "none";
    if (technician?.phone) $("techCallBtn").href = `tel:${technician.phone}`;
  }
  if ($("techMessageBtn")) {
    $("techMessageBtn").style.display = technician?.phone ? "inline-flex" : "none";
    if (technician?.phone) {
      $("techMessageBtn").onclick = () => {
        showToast(`Contacting technician at ${technician.phone}`);
      };
    }
  }

  if ($("trackingAppointmentText")) {
    $("trackingAppointmentText").textContent = `${formatDate(request.appointment_date)} • ${request.appointment_slot || "Scheduled Slot"}`;
  }
  if ($("rescheduleBtn")) {
    $("rescheduleBtn").onclick = () => {
      showToast("To reschedule this visit, choose an updated date/slot or contact support.");
    };
  }

  if ($("technicianVerified")) {
    $("technicianVerified").classList.toggle("hidden", !technician?.is_verified);
  }

  // Dynamic Two-Step OTP & Settlement State
  const otpPanel = $("otpPanel");
  const otpTitle = $("otpPanelTitle");
  const otpDesc = $("otpPanelDesc");
  const otpDisplay = $("trackingOtp");

  if (otpPanel && otpDisplay) {
    if (request.status === "Completed") {
      otpPanel.classList.remove("hidden");
      otpPanel.className = "rounded-2xl border border-emerald-300 bg-emerald-50/80 p-4 transition-all";
      if (otpTitle) {
        otpTitle.textContent = "SERVICE COMPLETED & SETTLED";
        otpTitle.className = "text-[10px] font-bold text-emerald-800 uppercase tracking-wider block";
      }
      if (otpDesc) {
        otpDesc.textContent = "Work verified with OTP. Official payment receipt generated.";
        otpDesc.className = "text-xs text-emerald-900 mt-0.5";
      }
      otpDisplay.textContent = "PAID";
      otpDisplay.className = "font-sans text-xs uppercase font-extrabold text-emerald-700 bg-white px-3 py-1 rounded-xl border border-emerald-300 shadow-sm shrink-0 tracking-wider";
    } else if (request.status === "Service In Progress") {
      otpPanel.classList.remove("hidden");
      otpPanel.className = "rounded-2xl border border-indigo-300 bg-indigo-50/80 p-4 transition-all";
      if (otpTitle) {
        otpTitle.textContent = "SERVICE COMPLETION OTP";
        otpTitle.className = "text-[10px] font-bold text-indigo-800 uppercase tracking-wider block";
      }
      if (otpDesc) {
        otpDesc.textContent = "Share this OTP with technician ONLY after repair is completed & tested.";
        otpDesc.className = "text-xs text-indigo-900 mt-0.5";
      }
      otpDisplay.textContent = request.completion_otp || request.verification_otp || "----";
      otpDisplay.className = "font-mono text-2xl text-indigo-950 bg-white px-3.5 py-1.5 rounded-xl border border-indigo-200 shadow-sm tracking-widest shrink-0";
    } else if (request.status === "Reopened / Under Review") {
      otpPanel.classList.remove("hidden");
      otpPanel.className = "rounded-2xl border border-rose-300 bg-rose-50/80 p-4 transition-all";
      if (otpTitle) {
        otpTitle.textContent = "REVISIT SERVICE START OTP";
        otpTitle.className = "text-[10px] font-bold text-rose-800 uppercase tracking-wider block";
      }
      if (otpDesc) {
        otpDesc.textContent = "Share with revisit technician upon arrival at your doorstep.";
        otpDesc.className = "text-xs text-rose-900 mt-0.5";
      }
      otpDisplay.textContent = request.start_otp || request.verification_otp || "----";
      otpDisplay.className = "font-mono text-2xl text-rose-950 bg-white px-3.5 py-1.5 rounded-xl border border-rose-200 shadow-sm tracking-widest shrink-0";
    } else {
      // Technician Assigned or Technician on the Way
      const startOtpVal = request.start_otp || request.verification_otp;
      if (startOtpVal) {
        otpPanel.classList.remove("hidden");
        otpPanel.className = "rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition-all";
        if (otpTitle) {
          otpTitle.textContent = "SERVICE START OTP";
          otpTitle.className = "text-[10px] font-bold text-amber-800 uppercase tracking-wider block";
        }
        if (otpDesc) {
          const isEnRoute = request.status === "Technician on the Way";
          otpDesc.innerHTML = isEnRoute
            ? `<span>Share with technician upon arrival.</span> <button type="button" class="ml-2 inline-flex items-center gap-1 font-bold text-blue-600 hover:underline text-xs" onclick="window.openLiveTrackingModal('${request.id}')">📍 Track Live Location →</button>`
            : "Share with technician upon arrival to begin inspection.";
          otpDesc.className = "text-xs text-amber-900 mt-0.5 flex flex-wrap items-center";
        }
        otpDisplay.textContent = startOtpVal;
        otpDisplay.className = "font-mono text-2xl text-amber-950 bg-white px-3.5 py-1.5 rounded-xl border border-amber-200 shadow-sm tracking-widest shrink-0";
      } else {
        otpPanel.classList.add("hidden");
      }
    }
  }

  // Defect Photo Display (Phase 1 FR-TKT-004)
  if ($("trackingDefectCard")) {
    if (request.defect_photo) {
      $("trackingDefectCard").classList.remove("hidden");
      if ($("trackingDefectImg")) $("trackingDefectImg").src = request.defect_photo;
    } else {
      $("trackingDefectCard").classList.add("hidden");
    }
  }

  // Reopen Banner Display (Phase 1 FR-FBK-005)
  if ($("trackingReopenBanner")) {
    const isActivelyReopened = (request.status === "Reopened / Under Review" || request.status_badge === "Reopened" || (Boolean(request.is_reopened) && request.status !== "Completed"));
    if (isActivelyReopened) {
      $("trackingReopenBanner").classList.remove("hidden");
      if ($("trackingReopenReason")) {
        $("trackingReopenReason").textContent = request.reopened_reason || "Customer requested priority revisit & review under Servora Customer Protection.";
      }
      if ($("openPrevReceiptFromBannerBtn")) {
        $("openPrevReceiptFromBannerBtn").onclick = () => window.openReceiptModal(request.id, true);
      }
    } else {
      $("trackingReopenBanner").classList.add("hidden");
    }
  }

  // Completion & Sign-off Hub (Phase 1 FR-JOB-001 & FR-FBK-001)
  const isCompletedOrDisputed = request.status === "Completed" || request.status === "Reopened / Under Review" || request.status === "Disputed" || Boolean(request.is_reopened);
  if ($("trackingCompletionCard")) {
    $("trackingCompletionCard").classList.toggle("hidden", !isCompletedOrDisputed);
    if (isCompletedOrDisputed) {
      const isReopenedResolved = Boolean((request.is_reopened || request.previous_job_card) && request.status === "Completed");
      if ($("openReceiptBtn")) {
        if (isReopenedResolved) {
          const d2 = request.paid_at || new Date().toLocaleDateString('en-IN');
          $("openReceiptBtn").innerHTML = `<span>🧾 Resolution Receipt (${d2})</span>`;
        } else {
          $("openReceiptBtn").innerHTML = `<span>🧾 Download Receipt</span>`;
        }
        $("openReceiptBtn").onclick = () => window.openReceiptModal(request.id, false);
      }
      if ($("openPrevReceiptBtn")) {
        const hasPrevious = Boolean(request.is_reopened || request.previous_job_card);
        $("openPrevReceiptBtn").classList.toggle("hidden", !hasPrevious);
        if (hasPrevious) {
          const d1 = (request.previous_job_card && request.previous_job_card.completed_at) || request.reopened_at || request.appointment_date || "Visit 1";
          $("openPrevReceiptBtn").innerHTML = `<span>🧾 Initial Receipt (${d1})</span>`;
          $("openPrevReceiptBtn").onclick = () => window.openReceiptModal(request.id, true);
        }
      }
      if ($("openJobCardBtn")) $("openJobCardBtn").onclick = () => window.openJobCardModal(request.id);
      if ($("openFeedbackBtn")) $("openFeedbackBtn").onclick = () => window.openFeedbackModal(request.id);
      if ($("openReopenBtn")) {
        $("openReopenBtn").onclick = () => window.openReopenModal(request.id);
        $("openReopenBtn").style.display = request.status === "Completed" ? "inline-flex" : "none";
      }

      readApiJson(`/api/requests/${encodeURIComponent(request.id)}/job-card`)
        .then(jc => {
          const isWarranty = Boolean(request.is_under_warranty || jc.is_warranty_covered);
          const isPaid = request.payment_status === "Paid" || request.payment_status === "Paid (Warranty Covered)";

          if ($("openPayNowBtn")) {
            $("openPayNowBtn").classList.toggle("hidden", isPaid || isWarranty);
            if (!isPaid && !isWarranty) {
              $("openPayNowBtn").innerHTML = `<span>💳 Pay Now (₹${Number(jc.total_amount || 0).toFixed(2)})</span>`;
              $("openPayNowBtn").onclick = () => window.openPaymentModal(request.id);
            }
          }

          if ($("jobCardStatusBadge")) {
            if (isWarranty) {
              $("jobCardStatusBadge").textContent = "✓ Brand Warranty (₹0.00)";
              $("jobCardStatusBadge").className = "text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200";
            } else if (isPaid) {
              $("jobCardStatusBadge").textContent = "✓ Paid & Settled";
              $("jobCardStatusBadge").className = "text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200";
            } else if (jc.customer_status === "disputed") {
              $("jobCardStatusBadge").textContent = "⚠️ Disputed";
              $("jobCardStatusBadge").className = "text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200";
            } else {
              $("jobCardStatusBadge").textContent = `Payment Pending (₹${Number(jc.total_amount || 0).toFixed(2)})`;
              $("jobCardStatusBadge").className = "text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200";
            }
          }
        })
        .catch(() => {
          if ($("openPayNowBtn")) $("openPayNowBtn").classList.add("hidden");
          if ($("jobCardStatusBadge")) {
            $("jobCardStatusBadge").textContent = "Pending Technician Submission";
            $("jobCardStatusBadge").className = "text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200";
          }
        });
    }
  }

  // Pre-Repair Estimate Banner (SRS 6.10)
  if ($("trackingEstimateBanner")) {
    const hasEst = Boolean(request.has_estimate || request.status === "Estimate Pending Approval" || request.status === "Repair in Progress" || request.status === "Estimate Rejected");
    if (hasEst) {
      $("trackingEstimateBanner").classList.remove("hidden");
      readApiJson(`/api/requests/${encodeURIComponent(request.id)}/estimate`)
        .then(est => {
          if ($("estimateTotalPreview")) $("estimateTotalPreview").textContent = `Total: ₹${Number(est.total_estimate).toFixed(2)}`;
          if ($("estimatePendingPill")) {
            if (est.status === "approved") {
              $("estimatePendingPill").textContent = "✓ Approved by You";
              $("estimatePendingPill").className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200";
            } else if (est.status === "rejected") {
              $("estimatePendingPill").textContent = "✕ Declined by You";
              $("estimatePendingPill").className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200";
            } else {
              $("estimatePendingPill").textContent = "Approval Required";
              $("estimatePendingPill").className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300";
            }
          }
        })
        .catch(() => {});
    } else {
      $("trackingEstimateBanner").classList.add("hidden");
    }
  }

  // SLA Escalation Banner (SRS 6.15)
  if ($("trackingEscalationBanner")) {
    if (request.is_escalated) {
      $("trackingEscalationBanner").classList.remove("hidden");
      const lvl = request.escalation_level || 1;
      const lvlMap = { 1: "Tier 1 - Franchise", 2: "Tier 2 - Brand Manager", 3: "Tier 3 - Platform Admin" };
      if ($("trackingEscalationLevelBadge")) {
        $("trackingEscalationLevelBadge").textContent = lvlMap[lvl] || `Tier ${lvl}`;
      }
      if ($("trackingEscalationReason")) {
        $("trackingEscalationReason").textContent = "Operational escalation active. Management has intervened to expedite service.";
      }
    } else {
      $("trackingEscalationBanner").classList.add("hidden");
    }
  }

  renderTimeline(request.timeline, request);
}

let trackingAnimationTimer = null;

let liveTrackingPollTimer = null;
function stopTrackingAnimation() {
  if (liveTrackingPollTimer) {
    clearInterval(liveTrackingPollTimer);
    liveTrackingPollTimer = null;
  }
}

function calculateCustomerDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

window.openLiveTrackingModal = function (requestId) {
  openDialog("liveTrackingMapDialog");
  const req = userRequests.find((r) => r.id === requestId) || userRequests[0] || {};
  const techName = req.technician?.name || "Assigned Technician";

  stopTrackingAnimation();

  const customerLat = req.latitude || 28.5355;
  const customerLng = req.longitude || 77.3910;
  const hasLiveGps = (req.tech_latitude != null && req.tech_longitude != null);
  let techLat = hasLiveGps ? req.tech_latitude : (customerLat + 0.016);
  let techLng = hasLiveGps ? req.tech_longitude : (customerLng - 0.014);

  if ($("liveMapTechEta")) {
    $("liveMapTechEta").textContent = hasLiveGps
      ? `${techName} is on the way · Connecting to live GPS…`
      : `${techName} is on the way · Waiting for technician GPS signal…`;
  }

  setTimeout(() => {
    if (liveMapInstance) {
      liveMapInstance.remove();
      liveMapInstance = null;
    }
    if (window.L && $("osmMapContainer")) {
      liveMapInstance = window.L.map("osmMapContainer").setView([customerLat, customerLng], 14);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(liveMapInstance);

      // Customer Doorstep Marker (Green Home Pin)
      const homeIcon = window.L.divIcon({
        className: "custom-doorstep-pin",
        html: `<div style="background:#10b981;color:white;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:16px;box-shadow:0 4px 12px rgba(16,185,129,0.45);border:2.5px solid white;">🏠</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      const customerMarker = window.L.marker([customerLat, customerLng], { icon: homeIcon }).addTo(liveMapInstance);
      customerMarker.bindPopup(`<b>Customer Doorstep</b><br>${escapeHtml(req.customer_address || "Service Location")}`);

      // Technician Vehicle Marker (Blue Bike with Pulsing Radar Ring)
      const techIcon = window.L.divIcon({
        className: "custom-tech-pin",
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(0,102,255,0.22);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;background:#0066ff;color:white;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:16px;box-shadow:0 4px 14px rgba(0,102,255,0.45);border:2.5px solid white;">🛵</div>
        </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const techMarker = window.L.marker([techLat, techLng], { icon: techIcon }).addTo(liveMapInstance);

      // Route line between technician and customer doorstep
      const activeRouteLine = window.L.polyline([[techLat, techLng], [customerLat, customerLng]], {
        color: "#0066ff",
        weight: 5,
        dashArray: hasLiveGps ? null : "6, 8"
      }).addTo(liveMapInstance);

      function updateCustomerRouteDisplay(lat, lng, isLive, lastUpdated) {
        const distKm = calculateCustomerDistanceKm(lat, lng, customerLat, customerLng);
        const etaMins = Math.max(1, Math.round((distKm / 25) * 60));

        if (distKm < 0.05) {
          const statusText = `✓ ${techName} has arrived at your doorstep! Share your Service Start OTP with the technician.`;
          if ($("liveMapTechEta")) $("liveMapTechEta").textContent = statusText;
          techMarker.getPopup()?.setContent(`<b>${escapeHtml(techName)}</b><br><span style="color:#10b981;font-weight:bold;">✓ Arrived at your doorstep</span>`);
        } else if (isLive) {
          const statusText = `${techName} is on the way · ~${distKm.toFixed(1)} km away (ETA ~${etaMins} mins)`;
          if ($("liveMapTechEta")) $("liveMapTechEta").textContent = statusText;
          techMarker.getPopup()?.setContent(`<b>${escapeHtml(techName)}</b><br><span>Live GPS: ~${distKm.toFixed(1)} km away (${etaMins} mins)</span>`);
        } else {
          const statusText = `${techName} has started visit · Waiting for live GPS location…`;
          if ($("liveMapTechEta")) $("liveMapTechEta").textContent = statusText;
          techMarker.getPopup()?.setContent(`<b>${escapeHtml(techName)}</b><br><span>En route · Waiting for GPS</span>`);
        }
      }

      techMarker.bindPopup(`<b>${escapeHtml(techName)}</b><br><span id="livePopupEta">Technician Location</span>`).openPopup();
      updateCustomerRouteDisplay(techLat, techLng, hasLiveGps, req.tech_location_updated_at);
      liveMapInstance.fitBounds(window.L.latLngBounds([[techLat, techLng], [customerLat, customerLng]]), { padding: [50, 50] });

      // Poll every 8 seconds for live technician coordinates from backend
      liveTrackingPollTimer = setInterval(async () => {
        if (!liveMapInstance) {
          stopTrackingAnimation();
          return;
        }
        try {
          const updated = await readApiJson(`/api/requests/${encodeURIComponent(req.id)}`);
          if (updated && updated.tech_latitude != null && updated.tech_longitude != null) {
            const newLat = updated.tech_latitude;
            const newLng = updated.tech_longitude;
            techMarker.setLatLng([newLat, newLng]);
            activeRouteLine.setLatLngs([[newLat, newLng], [customerLat, customerLng]]);
            activeRouteLine.setStyle({ dashArray: null });
            updateCustomerRouteDisplay(newLat, newLng, true, updated.tech_location_updated_at);
          }
        } catch (e) {}
      }, 8000);
    }
  }, 200);
};

window.openEditProfileModal = function () {
  if (currentUser) {
    if ($("editProfileName")) $("editProfileName").value = currentUser.name || "";
    if ($("editProfilePhone")) $("editProfilePhone").value = currentUser.phone || "";
    if ($("editProfileEmail")) $("editProfileEmail").value = currentUser.email || "";
  }
  if ($("editProfileMessage")) $("editProfileMessage").textContent = "";
  openDialog("editProfileDialog");
};

async function submitProfileEdit(event) {
  event.preventDefault();
  const button = $("editProfileSubmit");
  button.disabled = true;
  button.textContent = "Saving…";
  if ($("editProfileMessage")) $("editProfileMessage").textContent = "";

  try {
    const updated = await readApiJson("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("editProfileName").value.trim(),
        phone: $("editProfilePhone").value.trim(),
        email: $("editProfileEmail").value.trim() || null,
      }),
    });
    closeDialog("editProfileDialog");
    if (currentUser) {
      currentUser.name = updated.name;
      currentUser.phone = updated.phone;
      if (updated.email) currentUser.email = updated.email;
      localStorage.setItem("servora_user", JSON.stringify(currentUser));
      localStorage.setItem("servora_user_customer", JSON.stringify(currentUser));
      setProfile(currentUser);
    }
    showToast("Profile details updated successfully!", "success");
  } catch (error) {
    if ($("editProfileMessage")) {
      $("editProfileMessage").textContent =
        error.message || "Could not update profile details.";
    }
  } finally {
    button.disabled = false;
    button.textContent = "Save Changes";
  }
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog?.showModal) dialog.showModal();
  else dialog?.classList.remove("hidden");
}

function closeDialog(id) {
  if (id === "liveTrackingMapDialog") stopTrackingAnimation();
  const dialog = $(id);
  if (dialog?.close) dialog.close();
  else dialog?.classList.add("hidden");
}

window.openBookingModal = function (applianceId = "") {
  if (!userAppliances.length) {
    showToast("Register an appliance before booking a service visit.");
    window.openAddApplianceModal();
    return;
  }
  const select = $("bookApplianceSelect");
  if (select && applianceId) select.value = applianceId;
  if ($("bookingMessage")) $("bookingMessage").textContent = "";
  syncBookingAddress();
  openDialog("bookingDialog");
};

window.openAddApplianceModal = function () {
  if ($("applianceMessage")) $("applianceMessage").textContent = "";
  openDialog("applianceDialog");
};

window.openAddressModal = function () {
  if ($("addressMessage")) $("addressMessage").textContent = "";
  openDialog("addressDialog");
};

async function submitBooking(event) {
  event.preventDefault();
  const button = $("bookingSubmit");
  button.disabled = true;
  button.textContent = "Booking…";
  if ($("bookingMessage")) $("bookingMessage").textContent = "";

  syncBookingAddress();
  const address = $("bookAddress")?.value.trim() || currentUser?.address || "12, Sector 4, Greater Noida, UP - 201310";
  const pincode = $("bookPincode")?.value.trim() || (address.match(/\b(\d{6})\b/) ? address.match(/\b(\d{6})\b/)[1] : "201310");
  const lat = $("bookLat")?.value ? parseFloat($("bookLat").value) : 28.4744;
  const lng = $("bookLng")?.value ? parseFloat($("bookLng").value) : 77.5040;

  try {
    const request = await readApiJson("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appliance_id: $("bookApplianceSelect").value,
        issue: $("bookIssue").value.trim(),
        preferred_date: $("bookDate").value,
        preferred_slot: $("bookSlot").value,
        address: address,
        pincode: pincode,
        latitude: lat,
        longitude: lng,
        defect_photo: $("bookDefectPhoto")?.value || null,
      }),
    });
    closeDialog("bookingDialog");
    $("bookingForm").reset();
    if ($("defectPhotoPreviewWrap")) $("defectPhotoPreviewWrap").classList.add("hidden");
    if ($("defectPhotoPreview")) $("defectPhotoPreview").src = "";
    if ($("bookDefectPhoto")) $("bookDefectPhoto").value = "";
    if ($("defectPhotoBtnLabel")) $("defectPhotoBtnLabel").textContent = "Attach Photo";
    if (currentUser?.address && $("bookAddress")) {
      $("bookAddress").value = currentUser.address;
    }
    selectedRequestId = request.id;
    await loadDashboardData();
    await loadTrackingDetails(request.id, request);
    showToast(`Service request ${request.id} created successfully!`, "success");
  } catch (error) {
    if ($("bookingMessage")) {
      $("bookingMessage").textContent =
        error.message || "Could not create your request.";
    }
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
  if ($("applianceMessage")) $("applianceMessage").textContent = "";

  if (
    !registeredCompanies.some(
      (company) => company.id === $("newAppCompany").value
    )
  ) {
    if ($("applianceMessage")) {
      $("applianceMessage").textContent =
        "Select a company registered on Servora before saving.";
    }
    button.disabled = registeredCompanies.length === 0;
    button.textContent = "Save appliance";
    return;
  }

  try {
    const appliance = await readApiJson("/api/appliances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: $("newAppCompany").value,
        category: $("newAppCategory").value,
        brand: $("newAppBrand").value.trim(),
        model_no: $("newAppModel").value.trim(),
        serial_no: $("newAppSerial").value.trim(),
      }),
    });
    closeDialog("applianceDialog");
    $("applianceForm").reset();
    await loadDashboardData();
    if ($("bookApplianceSelect")) $("bookApplianceSelect").value = appliance.id;
    showToast(
      `${appliance.brand} ${appliance.category} added to your appliances.`,
      "success"
    );
  } catch (error) {
    if ($("applianceMessage")) {
      $("applianceMessage").textContent =
        error.message || "Could not save this appliance.";
    }
  } finally {
    button.disabled = false;
    button.textContent = "Save appliance";
  }
}

async function submitAddress(event) {
  event.preventDefault();
  const button = $("addressSubmit");
  button.disabled = true;
  button.textContent = "Saving…";
  if ($("addressMessage")) $("addressMessage").textContent = "";

  const pincode = $("addrPincode").value.trim();
  if (!/^\d{6}$/.test(pincode)) {
    if ($("addressMessage")) {
      $("addressMessage").textContent = "Please enter a valid 6-digit postal PIN code.";
    }
    button.disabled = false;
    button.textContent = "Save Service Address";
    return;
  }

  try {
    const data = await readApiJson("/api/auth/address", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        house_flat: $("addrHouseFlat").value.trim(),
        street_area: $("addrStreetArea").value.trim(),
        landmark: $("addrLandmark").value.trim() || null,
        city: $("addrCity").value.trim(),
        state: $("addrState").value.trim(),
        pincode: pincode,
      }),
    });
    closeDialog("addressDialog");
    $("addressForm").reset();
    if (currentUser) {
      currentUser.address = data.address;
      localStorage.setItem("servora_user", JSON.stringify(currentUser));
      localStorage.setItem("servora_user_customer", JSON.stringify(currentUser));
      setProfile(currentUser);
    }
    if ($("bookAddress")) $("bookAddress").value = data.address;
    showToast("Service address saved successfully!", "success");
  } catch (error) {
    if ($("addressMessage")) {
      $("addressMessage").textContent =
        error.message || "Could not save this address.";
    }
  } finally {
    button.disabled = false;
    button.textContent = "Save Service Address";
  }
}

function switchTab(tabId) {
  // 1. Switch visibility of tab content sections
  document.querySelectorAll("[data-tab-content]").forEach((el) => {
    const isCurrent = el.dataset.tabContent === tabId;
    el.classList.toggle("hidden", !isCurrent);
  });

  // 2. Update mobile bottom navigation buttons (.nav-tab)
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    const isCurrent = btn.dataset.tab === tabId;
    btn.classList.toggle("text-[#0066ff]", isCurrent);
    btn.classList.toggle("text-slate-400", !isCurrent);
    btn.classList.toggle("active", isCurrent);
    const label = btn.querySelector("span");
    if (label) {
      label.classList.toggle("font-bold", isCurrent);
      label.classList.toggle("font-semibold", !isCurrent);
    }
  });

  // 3. Update desktop sidebar links (.desktop-nav-link)
  document.querySelectorAll(".desktop-nav-link").forEach((btn) => {
    const isCurrent = btn.dataset.tabNav === tabId;
    btn.classList.toggle("bg-[#eff6ff]", isCurrent);
    btn.classList.toggle("text-[#0066ff]", isCurrent);
    btn.classList.toggle("active", isCurrent);
    btn.classList.toggle("text-slate-600", !isCurrent);
    btn.classList.toggle("hover:bg-slate-50", !isCurrent);
  });

  // 4. Update drawer links (.drawer-nav-link)
  document.querySelectorAll(".drawer-nav-link").forEach((btn) => {
    const isCurrent = btn.dataset.tabNav === tabId;
    btn.classList.toggle("bg-blue-50", isCurrent);
    btn.classList.toggle("text-[#0066ff]", isCurrent);
    btn.classList.toggle("font-bold", isCurrent);
  });

  // 5. Update desktop header breadcrumbs
  const crumb = $("crumbTitle");
  if (crumb) {
    const titles = {
      home: "Home",
      requests: "Service Requests",
      appliances: "My Appliances",
      profile: "My Account",
    };
    crumb.textContent = titles[tabId] || "Overview";
  }

  // Smooth scroll back to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openDrawer() {
  const drawer = $("mobileDrawer");
  const panel = $("mobileDrawerPanel");
  if (!drawer || !panel) return;
  drawer.classList.remove("hidden");
  // force layout reflow for animation
  void drawer.offsetHeight;
  panel.classList.remove("-translate-x-full");
  panel.classList.add("translate-x-0");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  const drawer = $("mobileDrawer");
  const panel = $("mobileDrawerPanel");
  if (!drawer || !panel) return;
  panel.classList.remove("translate-x-0");
  panel.classList.add("-translate-x-full");
  setTimeout(() => {
    drawer.classList.add("hidden");
    document.body.style.overflow = "";
  }, 200);
}
window.closeDrawer = closeDrawer;

function logout() {
  const token = currentUser?.session_token;
  localStorage.removeItem("servora_user");
  localStorage.removeItem("servora_user_customer");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers,
    credentials: "include",
    keepalive: true,
  }).catch(() => {});
  window.location.replace("./index.html");
}

/* ============================================================== */
/* PHASE 1: DIGITAL JOB CARD, FEEDBACK, REOPEN, MEDIA UPLOAD     */
/* ============================================================== */

function setupDefectPhotoUpload() {
  const fileInput = $("bookDefectFileInput");
  const previewWrap = $("defectPhotoPreviewWrap");
  const previewImg = $("defectPhotoPreview");
  const hiddenInput = $("bookDefectPhoto");
  const btnLabel = $("defectPhotoBtnLabel");
  const removeBtn = $("removeDefectPhotoBtn");

  if (!fileInput) return;

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast("Photo must be less than 5MB", "error");
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      if (previewImg) previewImg.src = dataUrl;
      if (previewWrap) previewWrap.classList.remove("hidden");
      if (hiddenInput) hiddenInput.value = dataUrl;
      if (btnLabel) btnLabel.textContent = "Change Photo";
    };
    reader.readAsDataURL(file);
  });

  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      fileInput.value = "";
      if (previewImg) previewImg.src = "";
      if (previewWrap) previewWrap.classList.add("hidden");
      if (hiddenInput) hiddenInput.value = "";
      if (btnLabel) btnLabel.textContent = "Attach Photo";
    });
  }
}

let isDrawingSig = false;
let hasDrawnSig = false;

function setupCustomerSignaturePad() {
  const canvas = $("customerSigCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawingSig = true;
    hasDrawnSig = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!isDrawingSig) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw() {
    isDrawingSig = false;
  }

  canvas.addEventListener("pointerdown", startDraw);
  canvas.addEventListener("pointermove", draw);
  window.addEventListener("pointerup", endDraw);

  if ($("clearSigBtn")) {
    $("clearSigBtn").onclick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawnSig = false;
    };
  }
}

window.openJobCardModal = async function(requestId) {
  const reqId = requestId || selectedRequestId;
  if (!reqId) return;

  openDialog("jobCardDialog");
  if ($("jcActionMsg")) $("jcActionMsg").textContent = "";

  try {
    const jc = await readApiJson(`/api/requests/${encodeURIComponent(reqId)}/job-card`);
    const targetReq = userRequests.find(r => r.id === reqId) || {};
    const prevJc = targetReq.previous_job_card || null;
    const isReopenedResolved = Boolean((targetReq.is_reopened || prevJc) && (targetReq.status === "Completed" || jc));

    const tech1 = targetReq.previous_technician_name || "Authorized Field Technician";
    const tech2 = targetReq.technician?.name || "Authorized Field Technician";
    const date1 = (prevJc && prevJc.completed_at) || targetReq.reopened_at || targetReq.appointment_date || "Visit 1";
    const date2 = (jc && jc.completed_at) || targetReq.paid_at || new Date().toLocaleDateString('en-IN');

    function renderJobCardView(data, techName, subtitle, isHistorical = false) {
      if (!data) return;
      if ($("jcCardId")) $("jcCardId").textContent = data.id || `JC-${reqId}`;
      if ($("jcRequestId")) $("jcRequestId").textContent = data.request_id || reqId;
      if ($("jcWorkSummary")) $("jcWorkSummary").textContent = data.work_summary || "Routine appliance inspection & diagnosis.";
      if ($("jcSubtitle")) $("jcSubtitle").textContent = subtitle || "Service breakdown and customer sign-off";

      if ($("jcPartsBody")) {
        if (Array.isArray(data.parts_used) && data.parts_used.length > 0) {
          $("jcPartsBody").innerHTML = data.parts_used.map(p => `
            <tr>
              <td class="py-2.5 px-3 font-medium text-slate-800">${escapeHtml(p.part_name)}</td>
              <td class="py-2.5 px-3 text-center font-semibold text-slate-600">${p.quantity || 1}</td>
              <td class="py-2.5 px-3 text-right text-slate-600">₹${Number(p.unit_price || 0).toFixed(2)}</td>
              <td class="py-2.5 px-3 text-right font-bold text-slate-800">₹${Number(p.total_price || ((p.quantity || 1) * (p.unit_price || 0))).toFixed(2)}</td>
            </tr>
          `).join("");
        } else {
          $("jcPartsBody").innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">No spare parts billed. Standard diagnosis performed.</td></tr>`;
        }
      }

      const pCost = Number(data.parts_cost || 0);
      const lCost = Number(data.labor_cost || 0);
      const tCost = Number(data.tax_amount || 0);
      const grandTotal = Number(data.total_amount || 0);
      if ($("jcPartsTotal")) $("jcPartsTotal").textContent = `₹${pCost.toFixed(2)}`;
      if ($("jcLaborCost")) $("jcLaborCost").textContent = `₹${lCost.toFixed(2)}`;
      if ($("jcTaxAmount")) $("jcTaxAmount").textContent = `₹${tCost.toFixed(2)}`;
      if ($("jcGrandTotal")) $("jcGrandTotal").textContent = `₹${grandTotal.toFixed(2)}`;

      // Technician Signature
      if (data.technician_signature && $("jcTechSigImg")) {
        $("jcTechSigImg").src = data.technician_signature;
        $("jcTechSigImg").classList.remove("hidden");
        if ($("jcTechSigPlaceholder")) $("jcTechSigPlaceholder").classList.add("hidden");
      } else {
        if ($("jcTechSigImg")) $("jcTechSigImg").classList.add("hidden");
        if ($("jcTechSigPlaceholder")) $("jcTechSigPlaceholder").classList.remove("hidden");
      }

      // Customer Status & Signatures
      if (data.customer_status === "accepted" || isHistorical) {
        if ($("jcStatusPill")) {
          $("jcStatusPill").textContent = isHistorical ? "Initial Visit (Settled)" : "Signed & Approved";
          $("jcStatusPill").className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200";
        }
        if ($("jcCustomerSigImg") && data.customer_signature) {
          $("jcCustomerSigImg").src = data.customer_signature;
          $("jcCustomerSigImg").classList.remove("hidden");
          if ($("jcCustomerSigPlaceholder")) $("jcCustomerSigPlaceholder").classList.add("hidden");
        } else {
          if ($("jcCustomerSigImg")) $("jcCustomerSigImg").classList.add("hidden");
          if ($("jcCustomerSigPlaceholder")) $("jcCustomerSigPlaceholder").classList.remove("hidden");
        }
        if ($("jcCustomerSigStatus")) $("jcCustomerSigStatus").textContent = "✓ Verified Digital Signature";
        if ($("jcSignaturePadBlock")) $("jcSignaturePadBlock").classList.add("hidden");
        if ($("jcDisputeBlock")) $("jcDisputeBlock").classList.add("hidden");
      } else if (data.customer_status === "disputed") {
        if ($("jcStatusPill")) {
          $("jcStatusPill").textContent = "Disputed by Customer";
          $("jcStatusPill").className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200";
        }
        if ($("jcSignaturePadBlock")) $("jcSignaturePadBlock").classList.add("hidden");
        if ($("jcDisputeBlock")) {
          $("jcDisputeBlock").classList.remove("hidden");
          if ($("jcDisputeRemarks")) $("jcDisputeRemarks").textContent = data.customer_remarks || "Dispute reason recorded.";
        }
      } else {
        if ($("jcStatusPill")) {
          $("jcStatusPill").textContent = "Awaiting Customer Sign-off";
          $("jcStatusPill").className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200";
        }
        if ($("jcCustomerSigImg")) $("jcCustomerSigImg").classList.add("hidden");
        if ($("jcCustomerSigPlaceholder")) $("jcCustomerSigPlaceholder").classList.remove("hidden");
        if ($("jcSignaturePadBlock")) $("jcSignaturePadBlock").classList.remove("hidden");
        if ($("jcDisputeBlock")) $("jcDisputeBlock").classList.add("hidden");
        setupCustomerSignaturePad();
      }
    }

    // Populate Reopened & Resolved Dual Receipts Section
    if (isReopenedResolved) {
      if ($("jcDualReceiptsSection")) {
        $("jcDualReceiptsSection").classList.remove("hidden");
        if ($("jcRec1No")) $("jcRec1No").textContent = `REC-${reqId}-V1`;
        if ($("jcRec1Date")) $("jcRec1Date").textContent = date1;
        if ($("jcRec1Total")) $("jcRec1Total").textContent = prevJc ? (prevJc.is_warranty_covered ? "₹0.00 (Warranty)" : `₹${Number(prevJc.total_amount || 0).toFixed(2)}`) : "₹0.00";
        if ($("jcRec1TechName")) $("jcRec1TechName").textContent = `Technician: ${tech1}`;
        if ($("jcOpenRec1Btn")) $("jcOpenRec1Btn").onclick = () => window.openReceiptModal(reqId, true);

        if ($("jcRec2No")) $("jcRec2No").textContent = `REC-${reqId}-V2`;
        if ($("jcRec2Date")) $("jcRec2Date").textContent = date2;
        if ($("jcRec2Total")) $("jcRec2Total").textContent = jc ? (jc.is_warranty_covered ? "₹0.00 (Warranty)" : `₹${Number(jc.total_amount || 0).toFixed(2)}`) : "₹0.00";
        if ($("jcRec2TechName")) $("jcRec2TechName").textContent = `Technician: ${tech2}`;
        if ($("jcOpenRec2Btn")) $("jcOpenRec2Btn").onclick = () => window.openReceiptModal(reqId, false);
      }

      if ($("jcVisitSwitcherBar")) {
        $("jcVisitSwitcherBar").classList.remove("hidden");
        const setVisitTab = (activeTab) => {
          if ($("jcTabVisit1") && $("jcTabVisit2")) {
            if (activeTab === 1) {
              $("jcTabVisit1").className = "px-3 py-1 rounded-lg font-bold text-xs transition bg-white text-blue-600 shadow-2xs";
              $("jcTabVisit2").className = "px-3 py-1 rounded-lg font-bold text-xs transition text-slate-600 hover:text-slate-900";
            } else {
              $("jcTabVisit1").className = "px-3 py-1 rounded-lg font-bold text-xs transition text-slate-600 hover:text-slate-900";
              $("jcTabVisit2").className = "px-3 py-1 rounded-lg font-bold text-xs transition bg-white text-blue-600 shadow-2xs";
            }
          }
        };

        if ($("jcTabVisit1")) {
          $("jcTabVisit1").onclick = () => {
            setVisitTab(1);
            renderJobCardView(prevJc || jc, tech1, `Visit 1: Initial Service (Completed ${date1})`, true);
          };
        }
        if ($("jcTabVisit2")) {
          $("jcTabVisit2").onclick = () => {
            setVisitTab(2);
            renderJobCardView(jc, tech2, `Visit 2: Reopened Revisit (Resolved ${date2})`, false);
          };
        }
        setVisitTab(2);
      }
    } else {
      if ($("jcDualReceiptsSection")) $("jcDualReceiptsSection").classList.add("hidden");
      if ($("jcVisitSwitcherBar")) $("jcVisitSwitcherBar").classList.add("hidden");
    }

    renderJobCardView(jc, tech2, isReopenedResolved ? `Visit 2: Reopened Revisit (Resolved ${date2})` : "Service breakdown and customer sign-off", false);

    if ($("approveJobCardBtn")) {
      $("approveJobCardBtn").onclick = async () => {
        if (!hasDrawnSig) {
          if ($("jcActionMsg")) $("jcActionMsg").textContent = "Please provide your touch or mouse signature above before approving.";
          return;
        }
        const canvas = $("customerSigCanvas");
        const sigData = canvas ? canvas.toDataURL("image/png") : null;
        try {
          $("approveJobCardBtn").disabled = true;
          $("approveJobCardBtn").textContent = "Submitting…";
          await readApiJson(`/api/requests/${encodeURIComponent(reqId)}/job-card/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "accept", customer_signature: sigData })
          });
          showToast("Job Card signed & approved successfully!", "success");
          closeDialog("jobCardDialog");
          await loadDashboardData();
          await loadTrackingDetails(reqId);
        } catch (err) {
          if ($("jcActionMsg")) $("jcActionMsg").textContent = err.message || "Failed to submit approval.";
        } finally {
          $("approveJobCardBtn").disabled = false;
          $("approveJobCardBtn").textContent = "✓ Approve & Sign Job Card";
        }
      };
    }

    if ($("disputeJobCardBtn")) {
      $("disputeJobCardBtn").onclick = async () => {
        const remarks = prompt("Please state the reason for disputing this job card / billing:", "Discrepancy in parts or labor charges");
        if (!remarks) return;
        try {
          $("disputeJobCardBtn").disabled = true;
          await readApiJson(`/api/requests/${encodeURIComponent(reqId)}/job-card/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "dispute", remarks: remarks })
          });
          showToast("Job Card dispute recorded. Escalated to franchise review.", "info");
          closeDialog("jobCardDialog");
          await loadDashboardData();
          await loadTrackingDetails(reqId);
        } catch (err) {
          alert(err.message || "Failed to record dispute.");
        } finally {
          $("disputeJobCardBtn").disabled = false;
        }
      };
    }

  } catch (err) {
    showToast(err.message || "Job card is not yet generated by the technician.", "info");
    closeDialog("jobCardDialog");
  }
};

function setupStarRatings() {
  document.querySelectorAll(".star-rating").forEach(ratingEl => {
    const field = ratingEl.getAttribute("data-rating-field");
    const stars = ratingEl.querySelectorAll("[data-star]");
    const inputId = field === "overall" ? "fbRatingOverall" : field === "quality" ? "fbRatingQuality" : field === "behavior" ? "fbRatingBehavior" : "fbRatingPricing";
    const hiddenInput = $(inputId);

    stars.forEach(star => {
      star.addEventListener("click", () => {
        const val = parseInt(star.getAttribute("data-star"), 10);
        if (hiddenInput) hiddenInput.value = val;
        stars.forEach(s => {
          const sVal = parseInt(s.getAttribute("data-star"), 10);
          if (sVal <= val) {
            s.className = "text-amber-400 hover:scale-110 transition";
          } else {
            s.className = "text-slate-200 hover:scale-110 transition";
          }
        });
      });
    });
  });
}

window.openFeedbackModal = async function(requestId) {
  const reqId = requestId || selectedRequestId;
  if (!reqId) return;

  openDialog("feedbackDialog");
  if ($("fbMessage")) $("fbMessage").textContent = "";

  try {
    const existing = await readApiJson(`/api/requests/${encodeURIComponent(reqId)}/feedback`);
    if (existing) {
      if ($("fbRatingOverall")) $("fbRatingOverall").value = existing.rating_overall;
      if ($("fbRatingQuality")) $("fbRatingQuality").value = existing.rating_quality;
      if ($("fbRatingBehavior")) $("fbRatingBehavior").value = existing.rating_behavior;
      if ($("fbRatingPricing")) $("fbRatingPricing").value = existing.rating_pricing;
      if ($("fbComment")) $("fbComment").value = existing.comment || "";
      document.querySelectorAll(".star-rating").forEach(ratingEl => {
        const field = ratingEl.getAttribute("data-rating-field");
        const val = existing[`rating_${field}`] || 5;
        ratingEl.querySelectorAll("[data-star]").forEach(s => {
          const sVal = parseInt(s.getAttribute("data-star"), 10);
          s.className = sVal <= val ? "text-amber-400 hover:scale-110 transition" : "text-slate-200 hover:scale-110 transition";
        });
      });
      if ($("fbSubmitBtn")) $("fbSubmitBtn").textContent = "Update Review";
    }
  } catch (e) {
    // No feedback yet
  }

  if ($("feedbackForm")) {
    $("feedbackForm").onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("fbSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Submitting…";
      try {
        const payload = {
          rating_overall: parseInt($("fbRatingOverall")?.value || "5", 10),
          rating_quality: parseInt($("fbRatingQuality")?.value || "5", 10),
          rating_behavior: parseInt($("fbRatingBehavior")?.value || "5", 10),
          rating_pricing: parseInt($("fbRatingPricing")?.value || "5", 10),
          comment: $("fbComment")?.value.trim() || null
        };
        await readApiJson(`/api/requests/${encodeURIComponent(reqId)}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        showToast("Thank you! Your verified review has been recorded.", "success");
        closeDialog("feedbackDialog");
        await loadDashboardData();
        await loadTrackingDetails(reqId);
      } catch (err) {
        if ($("fbMessage")) $("fbMessage").textContent = err.message || "Failed to submit feedback.";
      } finally {
        btn.disabled = false;
        btn.textContent = "Submit Review";
      }
    };
  }
};

window.openReopenModal = function(requestId) {
  const reqId = requestId || selectedRequestId;
  if (!reqId) return;

  openDialog("reopenDialog");
  if ($("reopenMessage")) $("reopenMessage").textContent = "";
  if ($("reopenForm")) $("reopenForm").reset();

  if ($("reopenForm")) {
    $("reopenForm").onsubmit = async (e) => {
      e.preventDefault();
      const reason = $("reopenReasonSelect")?.value;
      if (!reason) {
        if ($("reopenMessage")) $("reopenMessage").textContent = "Please select a reason for reopening.";
        return;
      }
      const notes = $("reopenNotes")?.value.trim() || null;
      const btn = $("reopenSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Reopening…";

      try {
        await readApiJson(`/api/requests/${encodeURIComponent(reqId)}/reopen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, notes })
        });
        showToast("Service ticket reopened. Franchise supervisor will review.", "success");
        closeDialog("reopenDialog");
        await loadDashboardData();
        await loadTrackingDetails(reqId);
      } catch (err) {
        if ($("reopenMessage")) $("reopenMessage").textContent = err.message || "Could not reopen ticket.";
      } finally {
        btn.disabled = false;
        btn.textContent = "Confirm Reopen";
      }
    };
  }
};

window.openReceiptModal = async function(requestId, showPrevious = false) {
  const reqId = requestId || selectedRequestId;
  if (!reqId) return;

  const targetReq = userRequests.find(r => r.id === reqId) || {};
  openDialog("receiptModal");

  // Determine which job card to display (current vs previous preserved snapshot)
  let jc = null;
  if (showPrevious && targetReq.previous_job_card) {
    jc = targetReq.previous_job_card;
  } else {
    try {
      jc = await readApiJson(`/api/requests/${encodeURIComponent(reqId)}/job-card`);
    } catch (e) {
      if (targetReq.previous_job_card) {
        jc = targetReq.previous_job_card;
      }
    }
  }

  const hasMultipleReceipts = Boolean(targetReq.previous_job_card || targetReq.is_reopened);
  const date1 = (targetReq.previous_job_card && targetReq.previous_job_card.completed_at) || targetReq.reopened_at || targetReq.appointment_date || "Visit 1";
  const date2 = (jc && jc.completed_at) || targetReq.paid_at || new Date().toLocaleDateString('en-IN');

  const switcherEl = $("receiptVisitSwitcher");
  if (switcherEl) {
    switcherEl.classList.toggle("hidden", !hasMultipleReceipts);
    if (hasMultipleReceipts) {
      if ($("receiptSwitchDate1")) $("receiptSwitchDate1").textContent = date1;
      if ($("receiptSwitchDate2")) $("receiptSwitchDate2").textContent = date2;

      if ($("receiptSwitchTab1") && $("receiptSwitchTab2")) {
        if (showPrevious) {
          $("receiptSwitchTab1").className = "px-3 py-1.5 rounded-lg font-bold text-xs transition bg-blue-600 text-white shadow-2xs";
          $("receiptSwitchTab2").className = "px-3 py-1.5 rounded-lg font-bold text-xs transition text-slate-600 hover:text-slate-900";
        } else {
          $("receiptSwitchTab1").className = "px-3 py-1.5 rounded-lg font-bold text-xs transition text-slate-600 hover:text-slate-900";
          $("receiptSwitchTab2").className = "px-3 py-1.5 rounded-lg font-bold text-xs transition bg-blue-600 text-white shadow-2xs";
        }
        $("receiptSwitchTab1").onclick = () => window.openReceiptModal(reqId, true);
        $("receiptSwitchTab2").onclick = () => window.openReceiptModal(reqId, false);
      }
    }
  }

  const invoiceNo = `REC-${reqId}${showPrevious ? '-V1' : (hasMultipleReceipts ? '-V2' : '')}`;
  if ($("receiptInvoiceNo")) $("receiptInvoiceNo").textContent = invoiceNo;
  if ($("receiptDate")) $("receiptDate").textContent = showPrevious ? date1 : date2;

  const isWarranty = Boolean(targetReq.is_under_warranty || (jc && jc.is_warranty_covered));
  const isPaid = targetReq.payment_status === "Paid" || targetReq.payment_status === "Paid (Warranty Covered)" || (jc && isWarranty);

  if ($("receiptPaidBadge")) {
    $("receiptPaidBadge").textContent = isWarranty ? "✓ COVERED UNDER BRAND WARRANTY" : (isPaid ? "✓ PAID IN FULL" : "PAYMENT PENDING");
    $("receiptPaidBadge").className = `mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
      isPaid ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200"
    }`;
  }

  if ($("receiptPaymentMeta")) {
    const pMethod = targetReq.payment_method ? targetReq.payment_method.toUpperCase() : "UPI / ONLINE";
    const pTxn = targetReq.payment_transaction_id || `PAY-${reqId}`;
    const visitSuffix = showPrevious ? " (Visit 1)" : (hasMultipleReceipts ? " (Visit 2)" : "");
    $("receiptPaymentMeta").textContent = isWarranty ? `OEM Brand Reimbursed · Customer Liability ₹0.00${visitSuffix}` : `${pMethod} · Ref: ${pTxn}${visitSuffix}`;
  }

  // Customer info
  if ($("receiptCustomerName")) $("receiptCustomerName").textContent = targetReq.customer_name || currentUser?.name || "Valued Customer";
  if ($("receiptCustomerPhone")) $("receiptCustomerPhone").textContent = targetReq.customer_phone || currentUser?.phone || "";
  if ($("receiptCustomerAddress")) $("receiptCustomerAddress").textContent = targetReq.customer_address || currentUser?.address || "Customer doorstep location";

  // Branch & Technician
  const techName = showPrevious
    ? (targetReq.previous_technician_name || "Original Technician")
    : (targetReq.technician?.name || targetReq.previous_technician_name || "Authorized Field Technician");
  if ($("receiptBranchName")) $("receiptBranchName").textContent = "Servora Authorized Franchise Partner";
  if ($("receiptTechName")) $("receiptTechName").textContent = `Technician: ${techName}${showPrevious ? " (Initial Visit)" : (hasMultipleReceipts ? " (Revisit Resolution)" : "")}`;
  if ($("receiptApplianceDetails")) $("receiptApplianceDetails").textContent = `${targetReq.brand || ''} ${targetReq.appliance_name || 'Home Appliance'} (${targetReq.model_no || 'Standard'})`;
  if ($("receiptIssueDescription")) $("receiptIssueDescription").textContent = `Service: ${targetReq.issue || 'Routine Service'}${showPrevious ? " [Initial Service]" : (hasMultipleReceipts ? " [Reopened Service]" : "")}`;

  // Itemized breakdown adhering to Phase 2 automated price engine
  const parts = (jc && Array.isArray(jc.parts_used)) ? jc.parts_used : [];
  const inspectFee = jc ? Number(jc.inspection_fee || 299) : 299;
  const laborCost = jc ? Number(jc.labor_cost || 0) : 350;
  const partsCost = jc ? Number(jc.parts_cost || 0) : 0;
  const discountAmount = jc ? Number(jc.discount_amount || 0) : 0;
  const cgst = jc ? Number(jc.cgst_amount || 0) : Number(((inspectFee + laborCost + partsCost - discountAmount) * 0.09).toFixed(2));
  const sgst = jc ? Number(jc.sgst_amount || 0) : Number(((inspectFee + laborCost + partsCost - discountAmount) * 0.09).toFixed(2));
  const totalAmount = isWarranty ? 0.0 : (jc ? Number(jc.total_amount || 0) : Number((inspectFee + laborCost + partsCost - discountAmount + cgst + sgst).toFixed(2)));

  if ($("receiptItemsBody")) {
    let rowsHtml = "";
    // Line 1: Inspection Fee (SAC 9987)
    rowsHtml += `
      <tr>
        <td class="py-2.5 px-3 text-slate-400 font-mono">1</td>
        <td class="py-2.5 px-3 font-medium text-slate-800">
          Standard Doorstep Inspection & Technical Diagnostics
          <span class="text-[10px] text-slate-400 block font-normal font-mono">SAC 9987 · GST 18%</span>
        </td>
        <td class="py-2.5 px-3 text-center text-slate-600 font-semibold">1</td>
        <td class="py-2.5 px-3 text-right text-slate-600">₹${inspectFee.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right font-bold text-slate-800">₹${inspectFee.toFixed(2)}</td>
      </tr>
    `;

    // Line 2: Labor & Service
    if (laborCost > 0) {
      rowsHtml += `
        <tr>
          <td class="py-2.5 px-3 text-slate-400 font-mono">2</td>
          <td class="py-2.5 px-3 font-medium text-slate-800">
            ${escapeHtml(jc?.work_summary || 'Appliance Repair & Overhaul Labor')}
            <span class="text-[10px] text-slate-400 block font-normal font-mono">SAC 9987 · GST 18%</span>
          </td>
          <td class="py-2.5 px-3 text-center text-slate-600 font-semibold">1</td>
          <td class="py-2.5 px-3 text-right text-slate-600">₹${laborCost.toFixed(2)}</td>
          <td class="py-2.5 px-3 text-right font-bold text-slate-800">₹${laborCost.toFixed(2)}</td>
        </tr>
      `;
    }

    // Line 3+: Spare parts
    if (parts.length > 0) {
      parts.forEach((p, idx) => {
        const pQty = p.quantity || 1;
        const pRate = Number(p.unit_price || 0);
        const pTotal = Number(p.total_price || (pQty * pRate));
        const hsn = p.hsn_code || "8418";
        rowsHtml += `
          <tr>
            <td class="py-2.5 px-3 text-slate-400 font-mono">${(laborCost > 0 ? 3 : 2) + idx}</td>
            <td class="py-2.5 px-3 font-medium text-slate-800">
              ${escapeHtml(p.part_name)} ${p.part_code ? `<span class="text-blue-600 font-mono text-[10px]">[${escapeHtml(p.part_code)}]</span>` : ''}
              <span class="text-[10px] text-slate-400 block font-normal font-mono">HSN ${escapeHtml(hsn)} · Genuine OEM Component</span>
            </td>
            <td class="py-2.5 px-3 text-center text-slate-600 font-semibold">${pQty}</td>
            <td class="py-2.5 px-3 text-right text-slate-600">₹${pRate.toFixed(2)}</td>
            <td class="py-2.5 px-3 text-right font-bold text-slate-800">₹${pTotal.toFixed(2)}</td>
          </tr>
        `;
      });
    }
    $("receiptItemsBody").innerHTML = rowsHtml;
  }

  if ($("receiptInspectionFee")) $("receiptInspectionFee").textContent = `₹${inspectFee.toFixed(2)}`;
  if ($("receiptLaborCost")) $("receiptLaborCost").textContent = `₹${laborCost.toFixed(2)}`;
  if ($("receiptPartsSubtotal")) $("receiptPartsSubtotal").textContent = `₹${partsCost.toFixed(2)}`;
  if ($("receiptDiscountRow")) {
    $("receiptDiscountRow").classList.toggle("hidden", discountAmount <= 0);
    if ($("receiptDiscountAmount")) $("receiptDiscountAmount").textContent = `-₹${discountAmount.toFixed(2)}`;
  }
  if ($("receiptCgstTax")) $("receiptCgstTax").textContent = `₹${cgst.toFixed(2)}`;
  if ($("receiptSgstTax")) $("receiptSgstTax").textContent = `₹${sgst.toFixed(2)}`;
  if ($("receiptGrandTotal")) $("receiptGrandTotal").textContent = isWarranty ? "₹0.00 (Warranty)" : `₹${totalAmount.toFixed(2)}`;

  // Signatures
  if ($("receiptTechSigImg") && jc && jc.technician_signature) {
    $("receiptTechSigImg").src = jc.technician_signature;
    $("receiptTechSigImg").classList.remove("hidden");
    if ($("receiptTechSigText")) $("receiptTechSigText").textContent = `Signed by ${techName}`;
  } else {
    if ($("receiptTechSigImg")) $("receiptTechSigImg").classList.add("hidden");
    if ($("receiptTechSigText")) $("receiptTechSigText").textContent = `Verified via Doorstep OTP (${techName})`;
  }

  if ($("receiptCustSigImg") && jc && jc.customer_signature) {
    $("receiptCustSigImg").src = jc.customer_signature;
    $("receiptCustSigImg").classList.remove("hidden");
    if ($("receiptCustSigText")) $("receiptCustSigText").textContent = "Digitally signed by Customer";
  } else {
    if ($("receiptCustSigImg")) $("receiptCustSigImg").classList.add("hidden");
    if ($("receiptCustSigText")) $("receiptCustSigText").textContent = "Settled & verified via Completion OTP";
  }
};

let currentPayingRequestId = null;
let currentPayingAmount = 0;

window.openPaymentModal = async function(requestId) {
  const reqId = requestId || selectedRequestId;
  if (!reqId) return;
  currentPayingRequestId = reqId;

  const targetReq = userRequests.find(r => r.id === reqId) || {};
  let jc = null;
  try {
    jc = await readApiJson(`/api/requests/${encodeURIComponent(reqId)}/job-card`);
  } catch (e) {
    jc = targetReq.job_card;
  }

  const isWarranty = Boolean(targetReq.is_under_warranty || (jc && jc.is_warranty_covered));
  const inspectFee = jc ? Number(jc.inspection_fee || 299) : 299;
  const laborCost = jc ? Number(jc.labor_cost || 0) : 0;
  const partsCost = jc ? Number(jc.parts_cost || 0) : 0;
  const discount = jc ? Number(jc.discount_amount || 0) : 0;
  const subtotal = inspectFee + laborCost + partsCost - discount;
  const gstAmount = jc ? Number(jc.tax_amount || 0) : Number((subtotal * 0.18).toFixed(2));
  const totalAmount = isWarranty ? 0.0 : (jc ? Number(jc.total_amount || 0) : Number((subtotal + gstAmount).toFixed(2)));

  currentPayingAmount = totalAmount;

  if ($("payModalReqId")) $("payModalReqId").textContent = reqId;
  if ($("payModalAppliance")) $("payModalAppliance").textContent = `${targetReq.brand || ''} ${targetReq.appliance_name || 'Home Appliance'}`;
  if ($("payModalAmount")) $("payModalAmount").textContent = `₹${totalAmount.toFixed(2)}`;
  if ($("payModalInspectFee")) $("payModalInspectFee").textContent = `₹${inspectFee.toFixed(2)}`;
  if ($("payModalLaborParts")) $("payModalLaborParts").textContent = `₹${(laborCost + partsCost).toFixed(2)}`;
  if ($("payModalGst")) $("payModalGst").textContent = `₹${gstAmount.toFixed(2)}`;

  if ($("payModalWarrantyNotice")) {
    $("payModalWarrantyNotice").classList.toggle("hidden", !isWarranty);
  }

  if ($("confirmPayBtn")) {
    $("confirmPayBtn").textContent = isWarranty ? "✓ Confirm ₹0.00 Warranty Settlement" : `🔒 Pay ₹${totalAmount.toFixed(2)} & Close Service`;
  }
  if ($("paymentFormMessage")) $("paymentFormMessage").textContent = "";

  openDialog("paymentModal");
};

window.submitServicePayment = async function() {
  if (!currentPayingRequestId) return;
  const btn = $("confirmPayBtn");
  const msg = $("paymentFormMessage");
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = "";

  const selectedMethod = document.querySelector('input[name="payMethod"]:checked')?.value || "upi";

  try {
    await writeApiJson(`/api/requests/${encodeURIComponent(currentPayingRequestId)}/payment`, {
      payment_method: selectedMethod,
      amount: currentPayingAmount,
      notes: `Customer online settlement via ${selectedMethod.toUpperCase()}`
    });

    closeDialog("paymentModal");
    showToast(`Payment of ₹${currentPayingAmount.toFixed(2)} successful! Official GST invoice generated.`, "success");

    // Refresh data and open receipt
    await loadDashboardData();
    window.openReceiptModal(currentPayingRequestId, false);
  } catch (err) {
    if (msg) msg.textContent = err.message || "Payment processing failed. Please try another method.";
  } finally {
    if (btn) btn.disabled = false;
  }
};

let currentAmcApplianceId = null;
let selectedAmcPlanId = null;

window.openAmcModal = async function(applianceId) {
  currentAmcApplianceId = applianceId;
  const app = userAppliances.find(a => a.id === applianceId);
  if ($("amcModalApplianceTitle")) {
    $("amcModalApplianceTitle").textContent = app ? `AMC Care: ${app.brand} ${app.category}` : "Annual Maintenance Contract";
  }
  if ($("amcModalApplianceSubtitle")) {
    $("amcModalApplianceSubtitle").textContent = app ? `Model: ${app.model_no || 'N/A'} · Standard Warranty Expiry: ${app.warranty_end_date || 'Standard'}` : "Select plan to extend your protection";
  }

  const container = $("amcPlansContainer");
  if (container) {
    container.innerHTML = '<div class="text-center py-6 text-xs text-slate-400">Loading authorized AMC packages...</div>';
  }
  if ($("amcFormMessage")) $("amcFormMessage").textContent = "";

  openDialog("amcModal");

  try {
    const plans = await readApiJson("/api/warranty-amc/amc/plans");
    if (!container) return;
    if (!plans.length) {
      container.innerHTML = '<div class="p-4 text-xs text-slate-500 text-center">No AMC plans active for this category right now.</div>';
      return;
    }

    selectedAmcPlanId = plans[0].id;
    container.innerHTML = plans.map((p, idx) => `
      <label class="p-3.5 rounded-2xl border ${idx === 0 ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'} flex items-start gap-3 cursor-pointer amc-plan-card transition">
        <input type="radio" name="amcPlanRadio" value="${escapeHtml(p.id)}" ${idx === 0 ? 'checked' : ''} class="mt-1 text-blue-600 focus:ring-0">
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <strong class="text-sm font-bold text-slate-900">${escapeHtml(p.name)}</strong>
            <span class="text-sm font-extrabold text-blue-600">₹${Number(p.price).toFixed(2)}<small class="text-slate-400 font-normal"> / ${p.duration_months} mo</small></span>
          </div>
          <p class="text-xs text-slate-500 mt-1">${escapeHtml(p.description || '')}</p>
          <div class="mt-2 flex items-center gap-2 text-[10px] text-slate-600 font-medium">
            <span class="px-2 py-0.5 rounded-md bg-white border border-slate-200">✓ ${p.free_services_count} Free Tune-ups</span>
            <span class="px-2 py-0.5 rounded-md bg-white border border-slate-200">✓ ${p.parts_discount_percent}% Spares Discount</span>
            <span class="px-2 py-0.5 rounded-md bg-white border border-slate-200">✓ 0 Labor Charges</span>
          </div>
        </div>
      </label>
    `).join("");

    container.querySelectorAll('input[name="amcPlanRadio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        selectedAmcPlanId = radio.value;
        container.querySelectorAll('.amc-plan-card').forEach(card => card.classList.remove('border-blue-500', 'bg-blue-50/40', 'ring-1', 'ring-blue-500/20'));
        radio.closest('.amc-plan-card')?.classList.add('border-blue-500', 'bg-blue-50/40', 'ring-1', 'ring-blue-500/20');
      });
    });
  } catch (err) {
    if (container) container.innerHTML = `<div class="p-4 text-xs text-rose-600">${escapeHtml(err.message || 'Could not load AMC plans.')}</div>`;
  }
};

window.confirmAmcSubscription = async function() {
  if (!currentAmcApplianceId || !selectedAmcPlanId) return;
  const btn = $("subscribeAmcBtn");
  const msg = $("amcFormMessage");
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = "";

  try {
    const sub = await writeApiJson("/api/warranty-amc/amc/subscribe", {
      appliance_id: currentAmcApplianceId,
      plan_id: selectedAmcPlanId,
      payment_method: "upi"
    });

    closeDialog("amcModal");
    showToast(`Successfully subscribed to ${sub.plan_name}! AMC active until ${sub.end_date}.`, "success");
    await loadDashboardData();
  } catch (err) {
    if (msg) msg.textContent = err.message || "Failed to process AMC subscription.";
  } finally {
    if (btn) btn.disabled = false;
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  // Mobile bottom bar tabs
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // Desktop sidebar navigation tabs
  document.querySelectorAll(".desktop-nav-link").forEach((link) => {
    link.addEventListener("click", () => switchTab(link.dataset.tabNav));
  });

  // Drawer navigation tabs
  document.querySelectorAll(".drawer-nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      switchTab(link.dataset.tabNav);
      closeDrawer();
    });
  });

  // Drawer toggles
  if ($("mobileMenuBtn")) {
    $("mobileMenuBtn").addEventListener("click", openDrawer);
  }
  if ($("closeMobileDrawer")) {
    $("closeMobileDrawer").addEventListener("click", closeDrawer);
  }
  const drawer = $("mobileDrawer");
  if (drawer) {
    drawer.addEventListener("click", (e) => {
      if (e.target === drawer) closeDrawer();
    });
  }
  if ($("drawerLogoutBtn")) {
    $("drawerLogoutBtn").addEventListener("click", logout);
  }

  // Header quick links
  if ($("viewAllAppliancesLink")) {
    $("viewAllAppliancesLink").addEventListener("click", () =>
      switchTab("appliances")
    );
  }
  if ($("viewAllRequestsLink")) {
    $("viewAllRequestsLink").addEventListener("click", () =>
      switchTab("requests")
    );
  }

  // Avatar clicks lead to profile tab
  if ($("userAvatar")) {
    $("userAvatar").addEventListener("click", () => switchTab("profile"));
  }
  if ($("userAvatarHeader")) {
    $("userAvatarHeader").addEventListener("click", () =>
      switchTab("profile")
    );
  }

  // Notification modal
  if ($("mobileNotificationBtn")) {
    $("mobileNotificationBtn").addEventListener("click", () =>
      openDialog("notificationDialog")
    );
  }
  if ($("desktopNotificationBtn")) {
    $("desktopNotificationBtn").addEventListener("click", () =>
      openDialog("notificationDialog")
    );
  }
  if ($("closeNotifications")) {
    $("closeNotifications").addEventListener("click", () =>
      closeDialog("notificationDialog")
    );
  }

  // Modal form submissions & dialogs
  if ($("bookingForm")) $("bookingForm").addEventListener("submit", submitBooking);
  if ($("applianceForm"))
    $("applianceForm").addEventListener("submit", submitAppliance);
  if ($("closeBooking"))
    $("closeBooking").addEventListener("click", () => closeDialog("bookingDialog"));
  if ($("cancelBooking"))
    $("cancelBooking").addEventListener("click", () => closeDialog("bookingDialog"));
  if ($("closeAppliance"))
    $("closeAppliance").addEventListener("click", () =>
      closeDialog("applianceDialog")
    );
  if ($("cancelAppliance"))
    $("cancelAppliance").addEventListener("click", () =>
      closeDialog("applianceDialog")
    );

  // Address modal form submissions & dialog
  if ($("editAddressBtn")) {
    $("editAddressBtn").addEventListener("click", window.openAddressModal);
  }
  if ($("addressForm")) {
    $("addressForm").addEventListener("submit", submitAddress);
  }
  if ($("closeAddress")) {
    $("closeAddress").addEventListener("click", () => closeDialog("addressDialog"));
  }
  // Setup 3 address selection modes
  setupAddressModes();

  // Edit profile dialog
  if ($("editProfileBtn")) {
    $("editProfileBtn").addEventListener("click", window.openEditProfileModal);
  }
  if ($("editProfileForm")) {
    $("editProfileForm").addEventListener("submit", submitProfileEdit);
  }
  if ($("closeEditProfile")) {
    $("closeEditProfile").addEventListener("click", () => closeDialog("editProfileDialog"));
  }
  if ($("cancelEditProfile")) {
    $("cancelEditProfile").addEventListener("click", () => closeDialog("editProfileDialog"));
  }

  // Live map dialog close
  if ($("closeLiveMap")) {
    $("closeLiveMap").addEventListener("click", () => closeDialog("liveTrackingMapDialog"));
  }

  // Phase 1 dialog close handlers
  if ($("closeJobCard")) {
    $("closeJobCard").addEventListener("click", () => closeDialog("jobCardDialog"));
  }
  if ($("closeFeedback")) {
    $("closeFeedback").addEventListener("click", () => closeDialog("feedbackDialog"));
  }
  if ($("cancelFeedback")) {
    $("cancelFeedback").addEventListener("click", () => closeDialog("feedbackDialog"));
  }
  if ($("closeReopen")) {
    $("closeReopen").addEventListener("click", () => closeDialog("reopenDialog"));
  }
  if ($("cancelReopen")) {
    $("cancelReopen").addEventListener("click", () => closeDialog("reopenDialog"));
  }

  // Setup Phase 1 helpers
  setupDefectPhotoUpload();
  setupStarRatings();

  // Logout buttons
  if ($("logoutBtn")) $("logoutBtn").addEventListener("click", logout);
  if ($("mobileLogoutBtn"))
    $("mobileLogoutBtn").addEventListener("click", logout);

  // Default booking date to today or later
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if ($("bookDate")) {
    $("bookDate").min = localToday;
    $("bookDate").value = localToday;
  }

  // Instantly hydrate user profile from localStorage cache to eliminate any flash during refresh
  const cachedUser = readStoredUser();
  if (cachedUser && cachedUser.role === "customer") {
    currentUser = cachedUser;
    setProfile(cachedUser);
  }

  // Confirm customer session with the API & load dashboard data
  if (await loadCurrentCustomer()) {
    setProfile(currentUser);
    await loadDashboardData();
  }
});

// ==========================================
// Pre-Repair Estimate & SLA Escalation Functions (SRS 6.10 & SRS 6.15)
// ==========================================
window.openCustomerEstimateModal = async function(requestId = selectedRequestId) {
  if (!requestId) return;
  const req = userRequests.find(r => r.id === requestId);
  if ($("estModalSubtitle")) $("estModalSubtitle").textContent = `Service Request #${requestId} · ${req?.appliance_name || 'Appliance'}`;
  
  try {
    const est = await readApiJson(`/api/requests/${encodeURIComponent(requestId)}/estimate`);
    const rowsEl = $("estModalPartsRows");
    if (rowsEl) {
      if (est.parts && est.parts.length > 0) {
        rowsEl.innerHTML = est.parts.map(p => `
          <tr class="hover:bg-slate-50">
            <td class="p-2.5">
              <strong class="text-slate-800 block">${escapeHtml(p.part_name)}</strong>
              <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(p.part_code || 'STANDARD')}</span>
            </td>
            <td class="p-2.5 text-center font-bold">${p.quantity}</td>
            <td class="p-2.5 text-right">₹${Number(p.unit_price).toFixed(2)}</td>
            <td class="p-2.5 text-right font-semibold text-slate-900">₹${Number(p.total_price || (p.quantity * p.unit_price)).toFixed(2)}</td>
          </tr>
        `).join("");
      } else {
        rowsEl.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-slate-400">No spare parts replacement estimated. Labor and inspection only.</td></tr>`;
      }
    }
    if ($("estModalInspectionFee")) $("estModalInspectionFee").textContent = `₹${Number(est.inspection_fee || 0).toFixed(2)}`;
    if ($("estModalLaborCost")) $("estModalLaborCost").textContent = `₹${Number(est.labor_estimate || 0).toFixed(2)}`;
    if ($("estModalTotalAmount")) $("estModalTotalAmount").textContent = `₹${Number(est.total_estimate || 0).toFixed(2)}`;
    if ($("estCustomerRemarks")) $("estCustomerRemarks").value = est.customer_remarks || "";

    openDialog("customerEstimateModal");
  } catch (err) {
    showToast("Could not load estimate: " + (err.message || "Not available yet"), "warning");
  }
};

window.respondToCustomerEstimate = async function(action) {
  if (!selectedRequestId) return;
  const remarks = $("estCustomerRemarks")?.value.trim() || "";
  try {
    const res = await apiFetch(`/api/requests/${encodeURIComponent(selectedRequestId)}/estimate/respond`, {
      method: "POST",
      body: JSON.stringify({ action, remarks })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to submit estimate response");
    }
    showToast(action === "approve" ? "✓ Estimate approved! Technician authorized to begin repair." : "Estimate declined. Franchise notified.", "info");
    closeDialog("customerEstimateModal");
    await loadTrackingDetails(selectedRequestId);
    await loadDashboardData();
  } catch (err) {
    showToast(err.message, "error");
  }
};

