// Servora Dashboard Controller

let currentUser = null;
let userAppliances = [];
let userRequests = [];
let activeTrackingRequestId = "SR-7845";

// Default today's date for date picker
document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("bookDate");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
    dateInput.min = today;
  }
  loadDashboardData();
});

// View mode switcher: Mobile vs Desktop
function setViewMode(mode) {
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
}

// Fetch user profile, appliances and requests
async function loadDashboardData() {
  try {
    // Current user
    const userRes = await fetch("/api/auth/me");
    if (userRes.ok) {
      const data = await userRes.json();
      currentUser = data.user;
      updateUserUI(currentUser);
    }

    // Appliances
    const appRes = await fetch("/api/appliances");
    if (appRes.ok) {
      userAppliances = await appRes.json();
      renderAppliances(userAppliances);
    }

    // Requests
    const reqRes = await fetch("/api/requests");
    if (reqRes.ok) {
      userRequests = await reqRes.json();
      renderRequests(userRequests);
    }

    // Load active tracking
    loadTrackingDetails(activeTrackingRequestId);

  } catch (err) {
    console.error("Error loading dashboard data:", err);
  }
}

function updateUserUI(user) {
  if (!user) return;
  const badge = document.getElementById("navRoleBadge");
  if (badge) {
    badge.textContent = `Role: ${user.role.toUpperCase()} (${user.name})`;
  }
}

// Render Registered Appliances in both Mobile & Desktop view
function renderAppliances(appliances) {
  const mobileList = document.getElementById("mobileApplianceList");
  const desktopList = document.getElementById("desktopApplianceList");
  const selectDropdown = document.getElementById("bookApplianceSelect");

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

// Render Service Requests
function renderRequests(requests) {
  const desktopTable = document.getElementById("desktopRequestsTable");
  if (!desktopTable) return;

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

  lucide.createIcons();
}

// Load and render tracking details (Screen #2)
async function loadTrackingDetails(requestId) {
  try {
    const res = await fetch(`/api/requests/${requestId}`);
    if (!res.ok) return;
    const req = await res.json();
    activeTrackingRequestId = req.id;

    // Update Mobile Tracking Badge
    const badge = document.getElementById("trackingBadge");
    if (badge) {
      badge.textContent = req.status_badge;
    }

    // Render Timeline on both Mobile and Desktop
    renderTimelineHTML("serviceTimelineList", req.timeline);
    renderTimelineHTML("desktopTimelineList", req.timeline);

  } catch (err) {
    console.error("Error loading tracking details:", err);
  }
}

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

// Advance status for live demo simulation
async function advanceDemoStatus(requestId) {
  try {
    const res = await fetch(`/api/requests/${requestId}/advance-status`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      showToast(`Status updated: ${data.new_status}`, "success");
      loadTrackingDetails(requestId);
      // reload requests table
      const reqRes = await fetch("/api/requests");
      if (reqRes.ok) {
        userRequests = await reqRes.json();
        renderRequests(userRequests);
      }
    }
  } catch (err) {
    showToast("Failed to advance status", "error");
  }
}

// Modal controls
function openBookingModal() {
  document.getElementById("bookingModal").classList.remove("hidden");
}

function closeBookingModal() {
  document.getElementById("bookingModal").classList.add("hidden");
}

function openBookingWithAppliance(appId) {
  const select = document.getElementById("bookApplianceSelect");
  if (select) select.value = appId;
  openBookingModal();
}

async function submitBooking(e) {
  e.preventDefault();
  const appliance_id = document.getElementById("bookApplianceSelect").value;
  const issue = document.getElementById("bookIssue").value.trim();
  const preferred_date = document.getElementById("bookDate").value;
  const preferred_slot = document.getElementById("bookSlot").value;
  const address = document.getElementById("bookAddress").value;

  try {
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
}

function openAddApplianceModal() {
  document.getElementById("applianceModal").classList.remove("hidden");
}

function closeAddApplianceModal() {
  document.getElementById("applianceModal").classList.add("hidden");
}

async function submitNewAppliance(e) {
  e.preventDefault();
  const category = document.getElementById("newAppCategory").value;
  const brand = document.getElementById("newAppBrand").value.trim();
  const model_no = document.getElementById("newAppModel").value.trim();
  const serial_no = document.getElementById("newAppSerial").value.trim();

  try {
    const res = await fetch("/api/appliances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
}

// Role Dropdown Switcher
function toggleRoleDropdown() {
  const dd = document.getElementById("roleDropdown");
  dd.classList.toggle("hidden");
}

async function switchRole(role) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: role, role: role })
    });
    if (res.ok) {
      window.location.reload();
    }
  } catch (err) {
    console.error(err);
  }
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}
