import { API_BASE_URL } from "./config.js";

let currentUser = null;
let userAppliances = [];
let userRequests = [];
let activeTrackingRequestId = "SR-7845";

function apiFetch(path, options = {}) {
  let storedUser = currentUser;
  if (!storedUser) {
    try { storedUser = JSON.parse(localStorage.getItem("servora_user") || "null"); } catch { storedUser = null; }
  }
  const headers = { ...(options.headers || {}) };
  if (storedUser?.session_token) headers.Authorization = `Bearer ${storedUser.session_token}`;
  return fetch(`${API_BASE_URL}${path}`, { ...options, credentials: options.credentials || "include", headers });
}

// Global Toast helper
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 ${
    type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
    type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
    'bg-slate-900 text-white border-slate-800'
  }`;
  
  const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons();
  
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};

// View mode switcher: Mobile vs Desktop
window.setViewMode = function(mode) {
  const mobileContainer = document.getElementById("mobileModeContainer");
  const desktopContainer = document.getElementById("desktopModeContainer");
  const mobileBtn = document.getElementById("viewMobileBtn");
  const desktopBtn = document.getElementById("viewDesktopBtn");

  if (mode === "desktop") {
    mobileContainer.classList.add("hidden");
    desktopContainer.classList.remove("hidden");
    
    desktopBtn.classList.add("bg-white", "text-slate-900", "shadow-xs");
    desktopBtn.classList.remove("text-slate-500");
    
    mobileBtn.classList.remove("bg-white", "text-slate-900", "shadow-xs");
    mobileBtn.classList.add("text-slate-500");
  } else {
    desktopContainer.classList.add("hidden");
    mobileContainer.classList.remove("hidden");

    mobileBtn.classList.add("bg-white", "text-slate-900", "shadow-xs");
    mobileBtn.classList.remove("text-slate-500");

    desktopBtn.classList.remove("bg-white", "text-slate-900", "shadow-xs");
    desktopBtn.classList.add("text-slate-500");
  }
  lucide.createIcons();
};

// Fetch data from backend
async function loadDashboardData() {
  try {
    // 1. Current user
    const userRes = await apiFetch("/api/auth/me");
    if (userRes.ok) {
      const data = await userRes.json();
      currentUser = { ...data.user, session_token: currentUser?.session_token || JSON.parse(localStorage.getItem("servora_user") || "null")?.session_token };
      if (currentUser.role !== "customer") {
        const dashboards = { technician: "technician-dashboard.html", branch: "franchise-dashboard.html", franchise: "franchise-dashboard.html", company: "company-dashboard.html", admin: "admin-dashboard.html" };
        if (dashboards[currentUser.role]) {
          window.location.replace(`./${dashboards[currentUser.role]}`);
          return;
        }
      }
      updateUserUI(currentUser);
    } else {
      const cachedUser = localStorage.getItem("servora_user");
      if (!cachedUser) {
        showToast("Your session could not be confirmed. Please sign in again.", "error");
        return;
      }
      try {
        currentUser = JSON.parse(cachedUser);
      } catch {
        localStorage.removeItem("servora_user");
        showToast("Your saved sign-in has expired. Please sign in again.", "error");
        return;
      }
      if (currentUser.role !== "customer") {
        const dashboards = { technician: "technician-dashboard.html", branch: "franchise-dashboard.html", franchise: "franchise-dashboard.html", company: "company-dashboard.html", admin: "admin-dashboard.html" };
        if (dashboards[currentUser.role]) window.location.replace(`./${dashboards[currentUser.role]}`);
        return;
      }
      updateUserUI(currentUser);
    }

    // 2. Appliances
    const appRes = await apiFetch("/api/appliances");
    if (appRes.ok) {
      userAppliances = await appRes.json();
      renderAppliances(userAppliances);
    }

    // 3. Requests
    const reqRes = await apiFetch("/api/requests");
    if (reqRes.ok) {
      userRequests = await reqRes.json();
      renderRequests(userRequests);
    }

    // 4. Load tracking details
    loadTrackingDetails(activeTrackingRequestId);

  } catch (err) {
    console.error("Error loading dashboard data:", err);
    showToast(`Could not connect to backend at ${API_BASE_URL}`, "error");
  }
}

function updateUserUI(user) {
  if (!user) return;
  const badge = document.getElementById("navRoleBadge");
  const mobileName = document.getElementById("mobileGreetingName");
  const desktopName = document.getElementById("desktopGreetingName");
  
  if (badge) badge.textContent = `${user.name} (${user.role})`;
  if (mobileName) mobileName.textContent = user.name.split(" ")[0];
  if (desktopName) desktopName.textContent = `Hello ${user.name} 👋`;
}

function renderAppliances(appliances) {
  const mobileList = document.getElementById("mobileApplianceList");
  const desktopList = document.getElementById("desktopApplianceList");
  const selectDropdown = document.getElementById("bookApplianceSelect");
  const metricCount = document.getElementById("metricAppCount");

  if (metricCount) metricCount.textContent = appliances.length;

  if (selectDropdown) {
    selectDropdown.innerHTML = appliances.map(a => 
      `<option value="${a.id}">${a.brand} ${a.category} (${a.model_no})</option>`
    ).join("");
  }

  if (mobileList) {
    mobileList.innerHTML = appliances.map(a => `
      <div class="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-brand-300 hover:shadow-xs transition-all flex items-center justify-between cursor-pointer group" onclick="openBookingWithAppliance('${a.id}')">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-brand-600">
            <i data-lucide="${a.icon || 'box'}" class="w-6 h-6"></i>
          </div>
          <div>
            <h4 class="text-xs font-bold text-slate-900 group-hover:text-brand-600 transition-colors">${a.brand} ${a.category}</h4>
            <p class="text-[11px] text-slate-500">Model: ${a.model_no}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">Registered on: ${a.registered_on}</p>
          </div>
        </div>
        <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform"></i>
      </div>
    `).join("");
  }

  if (desktopList) {
    desktopList.innerHTML = appliances.map(a => `
      <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-brand-300 hover:shadow-sm transition-all flex items-start justify-between">
        <div class="flex items-start gap-3.5">
          <div class="w-12 h-12 rounded-xl bg-white border border-slate-200 text-brand-600 flex items-center justify-center shadow-2xs">
            <i data-lucide="${a.icon || 'box'}" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="text-sm font-bold text-slate-900">${a.brand} ${a.category}</div>
            <div class="text-xs text-slate-500">Model: <span class="font-medium text-slate-700">${a.model_no}</span></div>
            <div class="text-[11px] text-slate-400 mt-1">Serial: ${a.serial_no || 'N/A'}</div>
            <div class="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
              a.warranty_status.includes('Active') || a.warranty_status.includes('Covered') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
            }">
              <i data-lucide="shield-check" class="w-3 h-3"></i> ${a.warranty_status}
            </div>
          </div>
        </div>
        <button onclick="openBookingWithAppliance('${a.id}')" class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-brand-500 hover:text-brand-600 text-xs font-semibold text-slate-700 transition-colors shadow-2xs">
          Request Service
        </button>
      </div>
    `).join("");
  }

  lucide.createIcons();
}

function renderRequests(requests) {
  const desktopTable = document.getElementById("desktopRequestsTable");
  const metricReqCount = document.getElementById("metricReqCount");
  
  if (metricReqCount) {
    const activeCount = requests.filter(r => r.status_badge !== 'Completed').length;
    metricReqCount.textContent = `${activeCount} In-Progress`;
  }

  if (desktopTable) {
    desktopTable.innerHTML = requests.map(r => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 font-semibold text-brand-600 cursor-pointer" onclick="loadTrackingDetails('${r.id}')">${r.id}</td>
        <td class="py-3 font-medium text-slate-900">${r.appliance_name}</td>
        <td class="py-3 text-slate-600 max-w-xs truncate">${r.issue}</td>
        <td class="py-3 text-slate-700">${r.technician ? r.technician.name : 'Pending Assignment'}</td>
        <td class="py-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
            r.status_badge === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
            r.status_badge === 'In Progress' ? 'bg-blue-100 text-brand-800' : 'bg-amber-100 text-amber-800'
          }">
            ${r.status_badge}
          </span>
        </td>
        <td class="py-3 text-right">
          <button onclick="loadTrackingDetails('${r.id}')" class="text-xs font-bold text-brand-600 hover:text-brand-800">
            Track Live &gt;
          </button>
        </td>
      </tr>
    `).join("");
  }

  lucide.createIcons();
}

window.loadTrackingDetails = async function(requestId) {
  try {
    const res = await apiFetch(`/api/requests/${requestId}`);
    if (!res.ok) return;
    const req = await res.json();
    activeTrackingRequestId = req.id;

    // Update Mobile Tracking elements
    const trackApp = document.getElementById("trackApplianceName");
    const trackMeta = document.getElementById("trackMetaText");
    const badge = document.getElementById("trackingBadge");
    const otp = document.getElementById("doorstepOtpCode");
    const slot = document.getElementById("appointmentSlotText");
    const deskBadge = document.getElementById("desktopTicketBadge");
    const deskOtp = document.getElementById("desktopOtpCode");

    if (trackApp) trackApp.textContent = req.appliance_name;
    if (trackMeta) trackMeta.textContent = `${req.id} • ${req.appointment_date}`;
    if (badge) badge.textContent = req.status_badge;
    if (otp) otp.textContent = req.verification_otp;
    if (slot) slot.textContent = `${req.appointment_date} • ${req.appointment_slot}`;
    if (deskBadge) deskBadge.textContent = req.id;
    if (deskOtp) deskOtp.textContent = req.verification_otp;

    // Render Timeline on both Mobile and Desktop
    renderTimelineHTML("serviceTimelineList", req.timeline);
    renderTimelineHTML("desktopTimelineList", req.timeline);

  } catch (err) {
    console.error("Error loading tracking details:", err);
  }
};

function renderTimelineHTML(containerId, steps) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = steps.map(s => {
    if (s.state === "completed") {
      return `
        <div class="relative">
          <div class="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center">
            <i data-lucide="check" class="w-3 h-3"></i>
          </div>
          <div>
            <h5 class="text-xs font-bold text-slate-900">${s.title}</h5>
            <p class="text-[10px] text-slate-400">${s.timestamp || ''}</p>
          </div>
        </div>
      `;
    } else if (s.state === "current") {
      return `
        <div class="relative">
          <div class="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-brand-500 ring-4 ring-blue-100 flex items-center justify-center text-white">
            <div class="w-2 h-2 rounded-full bg-white animate-ping"></div>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <h5 class="text-xs font-bold text-brand-600">${s.title}</h5>
              <p class="text-[10px] text-emerald-600 font-semibold">${s.description || 'Active step'}</p>
              ${s.timestamp ? `<p class="text-[9px] text-slate-400">${s.timestamp}</p>` : ''}
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-brand-600"></i>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="relative">
          <div class="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center">
            <div class="w-2 h-2 rounded-full bg-slate-400"></div>
          </div>
          <div>
            <h5 class="text-xs font-medium text-slate-400">${s.title}</h5>
            ${s.description ? `<p class="text-[10px] text-slate-400">${s.description}</p>` : ''}
          </div>
        </div>
      `;
    }
  }).join("");

  lucide.createIcons();
}

window.advanceDemoStatus = async function() {
  try {
    const res = await apiFetch(`/api/requests/${activeTrackingRequestId}/advance-status`, {
      method: "POST",
      credentials: "include"
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Status updated: ${data.new_status}`, "success");
      loadTrackingDetails(activeTrackingRequestId);
      const reqRes = await apiFetch("/api/requests");
      if (reqRes.ok) {
        userRequests = await reqRes.json();
        renderRequests(userRequests);
      }
    }
  } catch (err) {
    showToast("Failed to advance status", "error");
  }
};

window.openBookingModal = function() {
  document.getElementById("bookingModal").classList.remove("hidden");
};

window.closeBookingModal = function() {
  document.getElementById("bookingModal").classList.add("hidden");
};

window.openBookingWithAppliance = function(appId) {
  const select = document.getElementById("bookApplianceSelect");
  if (select) select.value = appId;
  openBookingModal();
};

window.submitBooking = async function(e) {
  e.preventDefault();
  const appliance_id = document.getElementById("bookApplianceSelect").value;
  const issue = document.getElementById("bookIssue").value.trim();
  const preferred_date = document.getElementById("bookDate").value;
  const preferred_slot = document.getElementById("bookSlot").value;
  const address = document.getElementById("bookAddress").value;

  try {
    const res = await apiFetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        appliance_id,
        issue,
        preferred_date,
        preferred_slot,
        address
      })
    });
    const newReq = await res.json();
    if (res.ok) {
      showToast(`Service ticket created! ID: ${newReq.id}`, "success");
      closeBookingModal();
      document.getElementById("bookingForm").reset();
      loadDashboardData();
      activeTrackingRequestId = newReq.id;
      loadTrackingDetails(newReq.id);
    } else {
      showToast("Failed to book service", "error");
    }
  } catch (err) {
    showToast("Error connecting to server", "error");
  }
};

window.openAddApplianceModal = function() {
  document.getElementById("applianceModal").classList.remove("hidden");
};

window.closeAddApplianceModal = function() {
  document.getElementById("applianceModal").classList.add("hidden");
};

window.submitNewAppliance = async function(e) {
  e.preventDefault();
  const category = document.getElementById("newAppCategory").value;
  const brand = document.getElementById("newAppBrand").value.trim();
  const model_no = document.getElementById("newAppModel").value.trim();
  const serial_no = document.getElementById("newAppSerial").value.trim();

  try {
    const res = await apiFetch("/api/appliances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ category, brand, model_no, serial_no })
    });
    if (res.ok) {
      showToast(`Registered ${brand} ${category} successfully!`, "success");
      closeAddApplianceModal();
      document.getElementById("applianceForm").reset();
      loadDashboardData();
    } else {
      showToast("Failed to register appliance", "error");
    }
  } catch (err) {
    showToast("Server connection error", "error");
  }
};

window.toggleRoleDropdown = function() {
  const dd = document.getElementById("roleDropdown");
  dd.classList.toggle("hidden");
};

window.switchRole = async function(role) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: "include",
      body: JSON.stringify({ identifier: role, role: role })
    });
    if (res.ok) {
      window.location.reload();
    }
  } catch (err) {
    console.error(err);
  }
};

window.logout = function() {
  const logoutController = new AbortController();
  const timeout = window.setTimeout(() => logoutController.abort(), 3000);
  localStorage.removeItem("servora_user");
  currentUser = null;
  apiFetch("/api/auth/logout", {
    method: "POST",
    signal: logoutController.signal,
    keepalive: true,
  }).catch(() => {}).finally(() => window.clearTimeout(timeout));
  window.location.replace("/index.html");
};

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("bookDate");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
    dateInput.min = today;
  }
  loadDashboardData();
});
