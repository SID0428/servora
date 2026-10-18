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
    return JSON.parse(localStorage.getItem("servora_user") || "null");
  } catch {
    localStorage.removeItem("servora_user");
    return null;
  }
}

function apiFetch(path, options = {}) {
  const storedUser = currentUser || readStoredUser();
  const headers = { ...(options.headers || {}) };
  if (storedUser?.session_token) {
    headers.Authorization = `Bearer ${storedUser.session_token}`;
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
      const token = currentUser?.session_token || cachedUser?.session_token;
      currentUser = { ...data.user, session_token: token };
      if (currentUser.role !== "customer") {
        redirectForRole(currentUser.role);
        return false;
      }
      localStorage.setItem("servora_user", JSON.stringify(currentUser));
      return true;
    } else if (response.status === 401) {
      localStorage.removeItem("servora_user");
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
    localStorage.removeItem("servora_user");
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
                <div class="mt-2 flex items-center gap-2">
                  <span class="rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    String(appliance.warranty_status || "")
                      .toLowerCase()
                      .includes("active") ||
                    String(appliance.warranty_status || "")
                      .toLowerCase()
                      .includes("covered")
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }">
                    ${escapeHtml(
                      appliance.warranty_status || "Warranty details unavailable"
                    )}
                  </span>
                  <span class="text-[11px] text-slate-400">Registered: ${escapeHtml(
                    appliance.registered_on ||
                      formatDate(appliance.created_at, "12 Jan 2024")
                  )}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 self-end sm:self-center">
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

  if ($("otpPanel")) {
    $("otpPanel").classList.toggle("hidden", !request.verification_otp);
  }
  if ($("trackingOtp")) {
    $("trackingOtp").textContent = request.verification_otp || "";
  }

  renderTimeline(request.timeline, request);
}

let trackingAnimationTimer = null;

function stopTrackingAnimation() {
  if (trackingAnimationTimer) {
    clearInterval(trackingAnimationTimer);
    trackingAnimationTimer = null;
  }
}

window.openLiveTrackingModal = function (requestId) {
  openDialog("liveTrackingMapDialog");
  const req = userRequests.find((r) => r.id === requestId) || userRequests[0] || {};
  const techName = req.technician?.name || "Assigned Technician";

  stopTrackingAnimation();

  const customerLat = req.latitude || 28.5355;
  const customerLng = req.longitude || 77.3910;
  // Starting origin point for technician (~2.5km distance)
  const techStartLat = customerLat + 0.016;
  const techStartLng = customerLng - 0.014;

  if ($("liveMapTechEta")) {
    $("liveMapTechEta").textContent = `${techName} is on the way · Calculating real-time route…`;
  }

  // Generate smooth street route waypoints
  const steps = 36;
  const waypoints = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Cubic bezier curve for natural road trajectory
    const p0 = [techStartLat, techStartLng];
    const p1 = [techStartLat - 0.005, techStartLng + 0.008];
    const p2 = [customerLat + 0.007, techStartLng + 0.004];
    const p3 = [customerLat, customerLng];

    const lat = Math.pow(1 - t, 3) * p0[0] + 3 * Math.pow(1 - t, 2) * t * p1[0] + 3 * (1 - t) * Math.pow(t, 2) * p2[0] + Math.pow(t, 3) * p3[0];
    const lng = Math.pow(1 - t, 3) * p0[1] + 3 * Math.pow(1 - t, 2) * t * p1[1] + 3 * (1 - t) * Math.pow(t, 2) * p2[1] + Math.pow(t, 3) * p3[1];
    waypoints.push([lat, lng]);
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

      // Technician Vehicle Marker (Blue Bike with Pulsing Radar Ring - Swiggy/Zomato style)
      const techIcon = window.L.divIcon({
        className: "custom-tech-pin",
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(0,102,255,0.22);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;background:#0066ff;color:white;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:16px;box-shadow:0 4px 14px rgba(0,102,255,0.45);border:2.5px solid white;">🛵</div>
        </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      let currentStep = 0;
      const techMarker = window.L.marker(waypoints[0], { icon: techIcon }).addTo(liveMapInstance);
      techMarker.bindPopup(`<b>${escapeHtml(techName)}</b><br><span id="livePopupEta">On the way · Moving</span>`).openPopup();

      // Background planned route (dashed light gray)
      window.L.polyline(waypoints, { color: "#cbd5e1", weight: 5, dashArray: "6, 8" }).addTo(liveMapInstance);

      // Remaining live active route (solid vibrant blue)
      const activeRouteLine = window.L.polyline(waypoints, { color: "#0066ff", weight: 5 }).addTo(liveMapInstance);

      liveMapInstance.fitBounds(window.L.latLngBounds([waypoints[0], [customerLat, customerLng]]), { padding: [50, 50] });

      // Animate technician movement incrementally
      trackingAnimationTimer = setInterval(() => {
        if (!liveMapInstance) {
          stopTrackingAnimation();
          return;
        }
        if (currentStep < waypoints.length - 1) {
          currentStep++;
          const nextPos = waypoints[currentStep];
          techMarker.setLatLng(nextPos);

          const remainingWaypoints = waypoints.slice(currentStep);
          activeRouteLine.setLatLngs(remainingWaypoints);

          const remainingSteps = waypoints.length - 1 - currentStep;
          const etaMins = Math.max(1, Math.ceil((remainingSteps / waypoints.length) * 11));
          const distKm = ((remainingSteps / waypoints.length) * 2.5).toFixed(1);

          const statusText = remainingSteps === 0
            ? `✓ ${techName} has arrived at your doorstep!`
            : `${techName} is on the way · Arriving in ~${etaMins} mins (${distKm} km · 28 km/h)`;

          if ($("liveMapTechEta")) $("liveMapTechEta").textContent = statusText;
          const popupSpan = document.getElementById("livePopupEta");
          if (popupSpan) popupSpan.textContent = `ETA ~${etaMins} mins (${distKm} km)`;
        } else {
          stopTrackingAnimation();
          if ($("liveMapTechEta")) $("liveMapTechEta").textContent = `✓ ${techName} has arrived at your doorstep! Share your safety OTP with the technician.`;
        }
      }, 1000);
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
      }),
    });
    closeDialog("bookingDialog");
    $("bookingForm").reset();
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
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers,
    credentials: "include",
    keepalive: true,
  }).catch(() => {});
  window.location.replace("./index.html");
}

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
