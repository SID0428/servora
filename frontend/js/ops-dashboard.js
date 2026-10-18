import { API_BASE_URL } from "./config.js";

let initialUser = null;
try { initialUser = JSON.parse(localStorage.getItem("servora_user") || "null"); } catch { initialUser = null; }
const dashboardRouteRole = Object.entries({
  admin: /(?:^|\/)admin-dashboard(?:\.html)?\/?$/i,
  company: /(?:^|\/)company-dashboard(?:\.html)?\/?$/i,
  franchise: /(?:^|\/)franchise-dashboard(?:\.html)?\/?$/i,
  technician: /(?:^|\/)technician-dashboard(?:\.html)?\/?$/i,
}).find(([, pattern]) => pattern.test(window.location.pathname))?.[0];
const portalLoginPaths = {
  admin: "/admin-login.html",
  company: "/company-login.html",
  franchise: "/franchise-login.html",
  technician: "/technician-login.html",
};
let role = dashboardRouteRole || initialUser?.role || document.body?.dataset?.role || "company";
const roleConfig = {
  technician: { title: "Technician workspace", kicker: "FIELD SERVICE", nav: ["My jobs", "Job history", "Route & schedule", "Earnings", "Help center"], columns: ["Ticket", "Customer", "Appliance", "Appointment", "Status", "Action"], tableTitle: "My assigned jobs", tableSubtitle: "Your service calls and the next step for each job.", bottomTitle: "Today's schedule", sideTitle: "My performance", resources: [["Assigned today", "Jobs on your schedule", "▤"], ["Completed", "Jobs closed this week", "✓"], ["Customer rating", "From recent service visits", "☆"], ["Service area", "Your assigned territory", "⌖"]] },
  franchise: { title: "Franchise workspace", kicker: "BRANCH OPERATIONS", nav: ["Dashboard", "Service requests", "Technicians", "Active jobs", "Customers", "Reports", "Settings"], columns: ["Request ID", "Customer", "Appliance", "Issue", "Technician", "Status", "Action"], tableTitle: "Incoming service requests", tableSubtitle: "Review requests and coordinate local service work.", bottomTitle: "Branch resources", sideTitle: "Branch performance", resources: [["Technicians", "Available in this branch", "♙"], ["Active jobs", "Assigned and in progress", "⚒"], ["Service area", "Local coverage", "⌖"], ["Response time", "Average first response", "◷"]] },
  company: { title: "Company workspace", kicker: "COMPANY OPERATIONS", nav: ["Dashboard", "Branches", "Technicians", "Customers", "Service requests", "Reports", "Settings"], columns: ["Request ID", "Customer", "Company", "Appliance", "Status", "Date", "Action"], tableTitle: "Recent service requests", tableSubtitle: "Monitor service activity across the company network.", bottomTitle: "Network resources", sideTitle: "Network health", resources: [["Branches", "Locations in your network", "▥"], ["Technicians", "Field service professionals", "♙"], ["Customers", "Customers served", "♧"], ["Service brands", "Connected product brands", "◈"]] },
  admin: { title: "Platform overview", kicker: "SERVORA PLATFORM", nav: ["Overview", "Companies", "Branches", "Technicians", "Customers", "Service requests", "Reports", "System settings"], columns: ["Request ID", "Customer", "Company", "Appliance", "Status", "Date", "Action"], tableTitle: "Platform service activity", tableSubtitle: "A view of requests moving across Servora.", bottomTitle: "Platform directory", sideTitle: "Platform health", resources: [["Companies", "Service partners", "▥"], ["Branches", "Operational locations", "⌖"], ["Technicians", "Verified professionals", "♙"], ["Customers", "Registered accounts", "♧"]] },
};
let config = roleConfig[role] || roleConfig.company;
const $ = (id) => document.getElementById(id);
const setHidden = (id, hidden) => { const el = $(id); if (el) el.hidden = Boolean(hidden); };
let requests = [];
let companies = [];
let branches = [];
let technicians = [];
let directoryRows = [];
let companyCustomers = [];
let user = initialUser;

try {
  requests = JSON.parse(localStorage.getItem(`servora_cache_requests_${role}`) || "[]");
  technicians = JSON.parse(localStorage.getItem("servora_cache_techs") || "[]");
  branches = JSON.parse(localStorage.getItem("servora_cache_branches") || "[]");
  companies = JSON.parse(localStorage.getItem("servora_cache_companies") || "[]");
  companyCustomers = JSON.parse(localStorage.getItem("servora_cache_customers") || "[]");
} catch {}

const icons = { Dashboard: "⌂", Overview: "⌂", "My jobs": "▤", "Job history": "◷", "Route & schedule": "⌖", Earnings: "$", "Help center": "?", "Service requests": "▣", "Incoming service requests": "▣", Technicians: "♙", "Active jobs": "⚒", Customers: "♧", Reports: "▥", Settings: "⚙", Companies: "▦", Branches: "⌖", "System settings": "⚙" };
function safe(value) { const node = document.createElement("span"); node.textContent = value ?? ""; return node.innerHTML; }
function authHeaders(extraHeaders = {}) {
  const token = user?.session_token || initialUser?.session_token;
  const uid = user?.id || initialUser?.id;
  const headers = { ...extraHeaders };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (uid) headers["X-Servora-User-Id"] = uid;
  return headers;
}
function jsonHeaders(extraHeaders = {}) {
  return authHeaders({ "Content-Type": "application/json", ...extraHeaders });
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
function showToast(message, type = "info") {
  const host = $("toast-container"); if (!host) return;
  const note = document.createElement("div");
  note.className = `pointer-events-auto rounded-lg px-4 py-3 shadow-lg text-xs text-white ${type === "error" ? "bg-rose-700" : "bg-slate-900"}`;
  note.textContent = message; host.append(note); setTimeout(() => note.remove(), 3200);
}
function setProfile() {
  const name = user?.name || "Servora user";
  const displayName = role === "admin" ? "Siddharth" : name;
  const portalPath = {
    admin: "./admin-dashboard.html",
    company: "./company-dashboard.html",
    franchise: "./franchise-dashboard.html",
    technician: "./technician-dashboard.html",
  }[role];
  const brandLink = document.querySelector(".ops-brand");
  if (brandLink && portalPath) brandLink.href = portalPath;
  if ($("userName")) $("userName").textContent = displayName;
  if ($("userRole")) $("userRole").textContent = role === "admin" ? "Platform administrator" : config.title;
  if ($("userAvatar")) $("userAvatar").textContent = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "U";
  const fn = displayName.split(/\s+/)[0];
  if (role === "technician") {
    if ($("welcomeTitle")) $("welcomeTitle").innerHTML = `${greeting()}, ${safe(fn)} <span class="inline-block">👏</span>`;
    if ($("welcomeSubtitle")) $("welcomeSubtitle").textContent = `Today, ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())} • ${safe(user?.title || "Field Service Specialist")}`;
  } else if (role === "franchise") {
    const branchName = user?.branch_name || user?.name || "Branch";
    const compName = user?.company_name || user?.name || "Authorized Service Partner";
    if ($("welcomeTitle")) $("welcomeTitle").innerHTML = `${safe(compName)} <span class="text-xs font-semibold text-slate-500 font-sans block mt-1">Branch / Franchise Dashboard</span>`;
    if ($("welcomeSubtitle")) $("welcomeSubtitle").innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-[#0066ff] font-bold text-xs border border-blue-100">${safe(branchName)} ▾</span> <span class="text-xs text-slate-400 ml-2">Regional dispatch & field service</span>`;
  } else if (role === "company") {
    const compName = user?.name || "Company";
    if ($("welcomeTitle")) $("welcomeTitle").innerHTML = `${safe(compName)} <span class="text-xs font-semibold text-slate-500 font-sans block mt-1">Company / Operations Dashboard</span>`;
    if ($("welcomeSubtitle")) $("welcomeSubtitle").textContent = `Unified enterprise operations across ${branches.length} authorized franchise branch${branches.length === 1 ? '' : 'es'} and field technician teams.`;
  } else {
    if ($("welcomeTitle")) $("welcomeTitle").textContent = `${greeting()}, ${fn}`;
    if ($("welcomeSubtitle")) $("welcomeSubtitle").textContent = "Here is your service operation at a glance.";
  }
  if ($("todayLabel")) $("todayLabel").textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date());
}
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function buildNav() {
  const opsNav = $("opsNav");
  if (!opsNav) return;
  const navItems = role === "technician" ? [...config.nav, "Route Map"] : config.nav;
  opsNav.innerHTML = navItems.map((item, index) => `<a href="#${item.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}" data-page="${safe(item)}" class="nav-link ${index === 0 ? "active" : ""}"><span class="nav-icon">${icons[item] || (item === "Route Map" ? "🗺️" : "•")}</span>${safe(item)}${item === "Service requests" || item === "My jobs" ? `<span class="nav-count">${requests.length}</span>` : ""}</a>`).join("");
  document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    if (link.dataset.page === "Route Map") {
      window.openTechRouteMap();
      return;
    }
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    loadWorkspacePageData(link.dataset.page);
    document.querySelector(".ops-sidebar").classList.remove("open");
  }));
}
function renderPage(page) {
  if ($("crumbTitle")) $("crumbTitle").textContent = page;
  const admin = role === "admin";
  setHidden("addCompanyButton", !admin);
  setHidden("addBranchButton", !(role === "company" && page === "Branches"));
  setHidden("addTechnicianButton", !(role === "franchise" && page === "Technicians"));
  setHidden("companyInlineAdd", !admin || page !== "Companies");
  setHidden("exportButton", page === "System settings" || page === "Companies" || page === "Settings");

  // Admin routes
  if (admin && page === "Companies") { renderCompanies(); return; }
  if (admin && ["Branches", "Technicians", "Customers"].includes(page)) { renderDirectory(page); return; }
  if (admin && page === "Service requests") { renderRequestDirectory(); return; }
  if (admin && page === "Reports") { renderReports(); return; }
  if (admin && page === "System settings") { renderSettings(); return; }

  // Company routes
  if (role === "company" && page === "Branches") { renderCompanyBranches(); return; }
  if (role === "company" && page === "Customers") { renderCompanyCustomers(); return; }

  // Franchise routes
  if (role === "franchise" && page === "Technicians") { renderFranchiseTechnicians(); return; }
  if (role === "franchise" && page === "Customers") { renderFranchiseCustomers(); return; }

  // Common or role-specific views
  if (["Dashboard", "Overview", "My jobs"].includes(page)) {
    renderMainDashboardView();
    return;
  }
  if (page === "Service requests" || page === "Incoming service requests") {
    renderAllServiceRequestsView();
    return;
  }
  if (page === "Active jobs") {
    renderActiveJobsView();
    return;
  }
  if (page === "Job history") {
    renderJobHistoryView();
    return;
  }
  if (page === "Route & schedule" || page === "Route Map") {
    window.openTechRouteMap();
    renderMainDashboardView();
    return;
  }
  if (page === "Earnings") {
    renderEarningsView();
    return;
  }
  if (page === "Help center") {
    renderHelpCenterView();
    return;
  }
  if (page === "Reports") {
    renderReports();
    return;
  }
  if (page === "Settings" || page === "System settings") {
    renderSettings();
    return;
  }

  renderMainDashboardView();
}

function renderMainDashboardView() {
  const tableEl = $("requestRows")?.closest("table");
  const techContainer = $("techJobCardsContainer");
  if (role === "technician") {
    if (tableEl) tableEl.style.display = "none";
    if (techContainer) techContainer.style.display = "block";
  } else {
    if (tableEl) tableEl.style.display = "";
    if (techContainer) techContainer.style.display = "none";
  }
  if ($("tableTitle")) $("tableTitle").textContent = config.tableTitle;
  if ($("tableSubtitle")) $("tableSubtitle").textContent = config.tableSubtitle;
  setHidden("pageContent", false);
  setHidden("metricGrid", false);
  if ($("statusFilter")) $("statusFilter").value = "all";
  setMetrics();
  renderRequests();
  renderInsights();
  renderResources();
}

function renderAllServiceRequestsView() {
  const tableEl = $("requestRows")?.closest("table");
  const techContainer = $("techJobCardsContainer");
  if (role === "technician") {
    if (tableEl) tableEl.style.display = "none";
    if (techContainer) techContainer.style.display = "block";
  } else {
    if (tableEl) tableEl.style.display = "";
    if (techContainer) techContainer.style.display = "none";
  }
  if ($("tableTitle")) $("tableTitle").textContent = role === "franchise" ? "All Incoming Service Requests" : "All Service Requests";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = role === "franchise" ? "Track, triage, and coordinate service calls across your territory." : "Complete record of customer service calls across your operations.";
  setHidden("pageContent", false);
  setHidden("metricGrid", false);
  if ($("statusFilter")) $("statusFilter").value = "all";
  setMetrics();
  renderRequests();
  renderInsights();
  renderResources();
}

function renderActiveJobsView() {
  const tableEl = $("requestRows")?.closest("table");
  const techContainer = $("techJobCardsContainer");
  if (role === "technician") {
    if (tableEl) tableEl.style.display = "none";
    if (techContainer) techContainer.style.display = "block";
  } else {
    if (tableEl) tableEl.style.display = "";
    if (techContainer) techContainer.style.display = "none";
  }
  if ($("tableTitle")) $("tableTitle").textContent = "Active Field Jobs";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Service requests currently assigned, dispatched, or under active resolution.";
  setHidden("pageContent", false);
  setHidden("metricGrid", false);
  if ($("statusFilter")) $("statusFilter").value = "In Progress";
  setMetrics();
  renderRequests();
  renderInsights();
  renderResources();
}

function renderFranchiseCustomers() {
  if ($("crumbTitle")) $("crumbTitle").textContent = "Customers";
  setHidden("addCompanyButton", true);
  setHidden("addBranchButton", true);
  setHidden("addTechnicianButton", true);
  setHidden("companyInlineAdd", true);
  setHidden("exportButton", false);
  setHidden("pageContent", false);
  setHidden("metricGrid", true);
  if ($("tableTitle")) $("tableTitle").textContent = "Branch Customers";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Customer profiles and service history within your franchise service area.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Customer Directory";

  const visibleReqs = requests.filter(requestForRole);
  const customerMap = new Map();
  visibleReqs.forEach((req) => {
    const key = (req.customer_phone || req.customer_name || req.id).trim();
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        id: req.customer_id || req.id,
        name: req.customer_name || "Customer",
        phone: req.customer_phone || "—",
        address: req.customer_address || "Customer doorstep address",
        pincode: req.pincode || user?.pincode || "—",
        appliance: req.appliance_name || req.brand || "Appliance",
        count: 1,
        last_date: req.appointment_date || "Recent"
      });
    } else {
      customerMap.get(key).count += 1;
    }
  });

  const custList = Array.from(customerMap.values());
  $("healthContent").innerHTML = `<div class="section-empty"><strong>${custList.length}</strong> unique customers served by this branch.</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">Customers booking service in your PIN area appear here automatically with their contact and address.</div>`;
  $("bottomTitle").textContent = "Branch customer reach";
  $("bottomSubtitle").textContent = "Customers served in your authorized territory.";

  $("requestHead").innerHTML = [
    "Customer",
    "Contact number",
    "Service address",
    "PIN code",
    "Primary appliance",
    "Total requests",
    "Last service"
  ].map((l) => `<th>${safe(l)}</th>`).join("");

  const query = $("requestSearch").value.trim().toLowerCase();
  $("requestSearch").placeholder = "Search customers by name, phone, or address";

  const filtered = custList.filter((c) =>
    [c.name, c.phone, c.address, c.pincode, c.appliance].join(" ").toLowerCase().includes(query)
  );

  $("requestRows").innerHTML = filtered.length
    ? filtered.map((c) => {
        const initials = safe((c.name || "CU").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase());
        return `
          <tr>
            <td>
              <div class="customer-cell">
                <span class="customer-avatar">${initials}</span>
                <span class="customer-name"><strong>${safe(c.name)}</strong><small>ID: ${safe(c.id)}</small></span>
              </div>
            </td>
            <td><strong>${safe(c.phone)}</strong></td>
            <td class="max-w-[240px] text-xs text-slate-700">${safe(c.address)}</td>
            <td><span class="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">${safe(c.pincode)}</span></td>
            <td>${safe(c.appliance)}</td>
            <td><span class="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-xs">${c.count} call${c.count === 1 ? '' : 's'}</span></td>
            <td>${safe(c.last_date)}</td>
          </tr>
        `;
      }).join("")
    : `<tr><td class="empty-row" colspan="7">${query ? "No customers match your search." : "No customers recorded in this branch yet."}</td></tr>`;

  $("requestCount").textContent = `${filtered.length} customer${filtered.length === 1 ? "" : "s"} shown`;
  $("resourceGrid").innerHTML = "";
}

function renderJobHistoryView() {
  $("crumbTitle").textContent = "Job history";
  const tableEl = $("requestRows").closest("table");
  let techContainer = $("techJobCardsContainer");
  tableEl.style.display = "none";
  if (techContainer) techContainer.style.display = "block";

  $("tableTitle").textContent = "Job History";
  $("tableSubtitle").textContent = "Completed field service visits and resolved tickets.";
  $("pageContent").hidden = false;
  $("metricGrid").hidden = false;
  $("statusFilter").value = "Completed";

  const list = requests.filter(requestForRole);
  const completed = list.filter((r) => r.status_badge === "Completed");

  if (techContainer) {
    techContainer.innerHTML = completed.length ? completed.map((item) => `
      <article class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 font-mono">${safe(item.id)}</span>
            <h3 class="text-base font-bold text-slate-800 mt-0.5">${safe(item.appliance_name || item.brand)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Issue: <span class="font-medium text-slate-700">${safe(item.issue)}</span></p>
          </div>
          <span class="status-pill completed">✓ Completed</span>
        </div>
        <div class="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
          <div>👤 Customer: <strong>${safe(item.customer_name)}</strong> (${safe(item.customer_phone || '')})</div>
          <div>📍 ${safe(item.customer_address || 'Customer doorstep')} (PIN: ${safe(item.pincode || '')})</div>
          <div>🕒 Closed on: ${safe(item.appointment_date)}</div>
        </div>
      </article>
    `).join("") : `<div class="p-8 text-center text-slate-400 text-sm">No completed jobs yet. When you mark service calls complete, they will appear here.</div>`;
  }
  $("requestCount").textContent = `${completed.length} completed job${completed.length === 1 ? '' : 's'}`;
}

function renderEarningsView() {
  $("crumbTitle").textContent = "Earnings";
  const tableEl = $("requestRows").closest("table");
  let techContainer = $("techJobCardsContainer");
  if (techContainer) techContainer.style.display = "none";
  tableEl.style.display = "";

  $("pageContent").hidden = false;
  $("metricGrid").hidden = false;
  const completed = requests.filter(requestForRole).filter((r) => r.status_badge === "Completed").length;
  const baseRate = 450;
  const totalEarned = completed * baseRate;

  $("metricGrid").className = "metric-grid grid-cols-1 sm:grid-cols-3";
  $("metricGrid").innerHTML = `
    <article class="metric-card"><span class="metric-icon green">₹</span><div class="metric-label">Estimated Earnings</div><div class="metric-value">₹${totalEarned.toLocaleString('en-IN')}</div><div class="metric-bottom">From ${completed} completed visits</div></article>
    <article class="metric-card"><span class="metric-icon blue">✓</span><div class="metric-label">Completed Jobs</div><div class="metric-value">${completed}</div><div class="metric-bottom">Verified by branch</div></article>
    <article class="metric-card"><span class="metric-icon amber">⏱</span><div class="metric-label">Payout Status</div><div class="metric-value text-base font-bold text-emerald-600">Weekly Cycle</div><div class="metric-bottom">Direct to bank account</div></article>
  `;

  $("tableTitle").textContent = "Earnings & Settlements";
  $("tableSubtitle").textContent = "Service visit payouts and compensation statement.";
  $("requestHead").innerHTML = ["Payout item", "Rate per visit", "Completed units", "Total", "Status"].map((l) => `<th>${safe(l)}</th>`).join("");
  $("requestRows").innerHTML = `
    <tr><td>Standard Doorstep Diagnosis & Repair</td><td>₹450.00</td><td>${completed}</td><td><strong>₹${totalEarned.toLocaleString('en-IN')}</strong></td><td><span class="status-pill completed">Accruing</span></td></tr>
    <tr><td>Travel / Conveyance Allowance</td><td>Included</td><td>${completed}</td><td>—</td><td><span class="status-pill completed">Active</span></td></tr>
  `;
  $("requestCount").textContent = "Statement updated today";
  $("sidePanelTitle").textContent = "Payout Details";
  $("healthContent").innerHTML = `<div class="section-empty">Bank payouts are settled weekly by your authorized branch. Contact branch manager for bank detail updates.</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">All service jobs completed and confirmed with customer OTP qualify for payout.</div>`;
  $("resourceGrid").innerHTML = "";
}

function renderHelpCenterView() {
  $("crumbTitle").textContent = "Help center";
  const tableEl = $("requestRows").closest("table");
  let techContainer = $("techJobCardsContainer");
  if (techContainer) techContainer.style.display = "none";
  tableEl.style.display = "";

  $("pageContent").hidden = false;
  $("metricGrid").hidden = true;
  $("tableTitle").textContent = "Help Center & Field Support";
  $("tableSubtitle").textContent = "Emergency helpline, safety SOPs, and franchise supervisor contacts.";
  $("requestHead").innerHTML = ["Support resource", "Contact / Details", "Hours", "Action"].map((l) => `<th>${safe(l)}</th>`).join("");
  $("requestRows").innerHTML = `
    <tr><td>Franchise Branch Supervisor</td><td>${safe(user?.branch_name || 'Assigned Branch')}</td><td>8:00 AM – 8:00 PM</td><td><a href="tel:+919876543210" class="table-action font-semibold text-blue-600">📞 Call branch →</a></td></tr>
    <tr><td>Technical Parts & Spare Support</td><td>Spares Desk · Crompton / LG / Whirlpool</td><td>9:00 AM – 6:00 PM</td><td><a href="mailto:spares@servora.com" class="table-action font-semibold text-blue-600">✉ Email desk →</a></td></tr>
    <tr><td>Emergency Field Hotline</td><td>Safety & roadside assistance</td><td>24x7 Available</td><td><a href="tel:112" class="table-action font-semibold text-rose-600">🚨 112 / Emergency</a></td></tr>
  `;
  $("requestCount").textContent = "3 support channels active";
  $("sidePanelTitle").textContent = "Field Guidelines";
  $("healthContent").innerHTML = `<div class="section-empty">Always carry your Servora digital ID card, verified tool kit, and wear shoe covers during customer doorstep visits.</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">Confirm diagnosis and price estimate with the customer prior to replacing any spare parts.</div>`;
  $("resourceGrid").innerHTML = "";
}
  $("resourceGrid").innerHTML = "";
  $("bottomTitle").textContent = `${page} workspace`;
  $("bottomSubtitle").textContent = "Platform administration tools";
}
function renderCompanyBranches() {
  if ($("crumbTitle")) $("crumbTitle").textContent = "Branches";
  setHidden("addCompanyButton", true);
  setHidden("addBranchButton", false);
  setHidden("companyInlineAdd", true);
  setHidden("exportButton", true);
  setHidden("pageContent", false);
  setHidden("metricGrid", true);
  if ($("tableTitle")) $("tableTitle").textContent = "Company branches";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Branches added to your company, with their owner or manager contact details.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Branch directory";
  if ($("healthContent")) $("healthContent").innerHTML = `<div class="section-empty"><strong>${branches.length}</strong> branches in your company</div>`;
  if ($("activityContent")) $("activityContent").innerHTML = `<div class="section-empty">Branch records are visible only to your company account.</div>`;
  if ($("bottomTitle")) $("bottomTitle").textContent = "Company branches";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Branch contacts registered by your company.";
  if ($("requestHead")) $("requestHead").innerHTML = ["Branch", "Franchise owner or manager", "Email", "Mobile number", "Address", "Pincode", "Portal access"].map((name) => `<th>${safe(name)}</th>`).join("");
  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  const filtered = branches.filter((branch) => [branch.branch_name, branch.manager_name, branch.email, branch.mobile, branch.address, branch.pincode].join(" ").toLowerCase().includes(query));
  if ($("requestRows")) $("requestRows").innerHTML = filtered.length ? filtered.map((branch) => {
    const status = branch.password_set ? `Password set · ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(branch.password_set_at))}` : "Password not set";
    const access = branch.password_set ? `<span class="status-pill completed">Active</span>` : `<button class="table-action" data-resend-franchise="${safe(branch.id)}">Resend setup link →</button>`;
    return `<tr><td><strong>${safe(branch.branch_name)}</strong></td><td>${safe(branch.manager_name)}<small class="company-password-state ${branch.password_set ? "is-set" : "is-pending"}">${safe(status)}</small></td><td>${safe(branch.email)}</td><td>${safe(branch.mobile)}</td><td>${safe(branch.address)}</td><td>${safe(branch.pincode)}</td><td>${access}</td></tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="7">${query ? "No branches match your search." : "No branches yet. Add your first branch to get started."}</td></tr>`;
  if ($("requestCount")) $("requestCount").textContent = `${filtered.length} branch${filtered.length === 1 ? "" : "es"} shown`;
  if ($("resourceGrid")) $("resourceGrid").innerHTML = "";
  document.querySelectorAll("[data-resend-franchise]").forEach((button) => button.addEventListener("click", async () => {
    const branch = branches.find((item) => item.id === button.dataset.resendFranchise);
    if (!branch) return;
    button.disabled = true; button.textContent = "Sending…";
    try { await companyApi("/branches/send-setup-link", { method: "POST", body: JSON.stringify({ branch_id: branch.id }) }); showToast(`Franchise setup link sent to ${branch.email}.`); }
    catch (error) { showToast(error.message, "error"); }
    finally { button.disabled = false; button.textContent = "Resend setup link →"; }
  }));
}
function renderFranchiseTechnicians() {
  if ($("crumbTitle")) $("crumbTitle").textContent = "Technicians";
  setHidden("addCompanyButton", true);
  setHidden("addBranchButton", true);
  setHidden("addTechnicianButton", false);
  setHidden("companyInlineAdd", true);
  setHidden("exportButton", true);
  setHidden("pageContent", false);
  setHidden("metricGrid", true);
  if ($("tableTitle")) $("tableTitle").textContent = "Franchise technicians";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Technicians managed by your franchise and their portal access.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Technician directory";
  if ($("healthContent")) $("healthContent").innerHTML = `<div class="section-empty"><strong>${technicians.length}</strong> technicians in your franchise</div>`;
  if ($("activityContent")) $("activityContent").innerHTML = `<div class="section-empty">Technicians and their contact details are visible only to your franchise.</div>`;
  if ($("bottomTitle")) $("bottomTitle").textContent = "Franchise technicians";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Technician accounts registered by this franchise.";
  if ($("requestHead")) $("requestHead").innerHTML = ["Technician", "Title or specialty", "Email", "Mobile number", "Address", "Pincode", "Portal access"].map((label) => `<th>${safe(label)}</th>`).join("");
  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  const filtered = technicians.filter((technician) => [technician.name, technician.title, technician.email, technician.mobile, technician.address, technician.pincode].join(" ").toLowerCase().includes(query));
  if ($("requestRows")) $("requestRows").innerHTML = filtered.length ? filtered.map((technician) => {
    const date = technician.password_set_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(technician.password_set_at)) : "";
    const status = technician.password_set ? `Password set · ${date}` : "Password not set";
    const access = technician.password_set ? `<span class="status-pill completed">Active</span>` : `<button class="table-action" data-resend-technician="${safe(technician.id)}">Resend setup link →</button>`;
    return `<tr><td><strong>${safe(technician.name)}</strong><small class="company-password-state ${technician.password_set ? "is-set" : "is-pending"}">${safe(status)}</small></td><td>${safe(technician.title)}</td><td>${safe(technician.email)}</td><td>${safe(technician.mobile)}</td><td>${safe(technician.address)}</td><td>${safe(technician.pincode)}</td><td>${access}</td></tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="7">${query ? "No technicians match your search." : "No technicians yet. Add your first technician to get started."}</td></tr>`;
  if ($("requestCount")) $("requestCount").textContent = `${filtered.length} technician${filtered.length === 1 ? "" : "s"} shown`;
  if ($("requestSearch")) $("requestSearch").placeholder = "Search technicians";
  if ($("resourceGrid")) $("resourceGrid").innerHTML = "";
  document.querySelectorAll("[data-resend-technician]").forEach((button) => button.addEventListener("click", async () => {
    const technician = technicians.find((item) => item.id === button.dataset.resendTechnician);
    if (!technician) return;
    button.disabled = true; button.textContent = "Sending…";
    try {
      await franchiseApi("/technicians/send-setup-link", { method: "POST", body: JSON.stringify({ technician_id: technician.id }) });
      showToast(`Technician setup link sent to ${technician.email}.`);
    } catch (error) { showToast(error.message, "error"); }
    finally { button.disabled = false; button.textContent = "Resend setup link →"; }
  }));
}
function renderCompanies() {
  setHidden("addCompanyButton", false);
  setHidden("companyInlineAdd", false);
  if ($("addCompanyButton")) $("addCompanyButton").innerHTML = "<span>＋</span> Add company";
  setHidden("pageContent", false);
  setHidden("metricGrid", true);
  if ($("tableTitle")) $("tableTitle").textContent = "Companies on Servora";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Click any company to view its branches, technicians, products, and services.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Company access";
  if ($("healthContent")) $("healthContent").innerHTML = `<div class="section-empty"><strong>${companies.length}</strong> partner companies are listed on Servora.</div>`;
  if ($("activityContent")) $("activityContent").innerHTML = `<div class="section-empty">Click on any company row or "View Details →" to inspect its branches, technicians, registered appliances, and active tickets.</div>`;
  if ($("bottomTitle")) $("bottomTitle").textContent = "Company directory";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Company portal accounts registered on Servora.";
  if ($("requestHead")) $("requestHead").innerHTML = ["Company", "Administrator email", "Phone", "Portal", "Details", "Action"].map((name) => `<th>${name}</th>`).join("");
  $("requestRows").innerHTML = companies.length ? companies.map((company) => {
    const passwordDate = company.password_set_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(company.password_set_at)) : "Not set yet";
    const setupStatus = company.password_set ? `Password set · ${passwordDate}` : "Password not set";
    return `<tr class="cursor-pointer hover:bg-blue-50/40 transition" onclick="viewCompanyDetails('${safe(company.id)}')">
      <td><div class="customer-cell"><span class="customer-avatar">${safe(company.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span><span class="customer-name">${safe(company.name)}<small>${safe(company.id)}</small><small class="company-password-state ${company.password_set ? "is-set" : "is-pending"}">${safe(setupStatus)}</small></span></div></td>
      <td>${safe(company.email)}</td>
      <td>${safe(company.phone)}</td>
      <td><span class="status-pill completed">Company portal</span></td>
      <td><button class="table-action px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs" onclick="event.stopPropagation(); viewCompanyDetails('${safe(company.id)}')">View Details →</button></td>
      <td>${company.password_set ? `<span class="status-pill completed">Active</span>` : `<button class="table-action" onclick="event.stopPropagation();" data-send-credentials="${safe(company.id)}">Resend setup link →</button>`}</td>
    </tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="6">No companies yet. Add your first company to get started.</td></tr>`;

  document.querySelectorAll("[data-send-credentials]").forEach((button) => button.addEventListener("click", async () => {
    const company = companies.find((item) => item.id === button.dataset.sendCredentials);
    if (!company || !window.confirm(`Resend the password setup link to ${company.email}?`)) return;
    button.disabled = true; button.textContent = "Sending…";
    try { await adminApi("/companies/send-credentials", { method: "POST", body: JSON.stringify({ company_id: company.id }) }); showToast(`Password setup link sent to ${company.email}.`); }
    catch (error) { showToast(error.message, "error"); }
    finally { button.disabled = false; button.textContent = "Resend setup link →"; }
  }));
}

window.viewCompanyDetails = async function(companyId) {
  const modal = $("companyDetailModal");
  if (!modal) return;
  modal.showModal();

  if ($("companyDetailName")) $("companyDetailName").textContent = "Loading company…";
  if ($("companyDetailAvatar")) $("companyDetailAvatar").textContent = "…";
  if ($("companyDetailEmail")) $("companyDetailEmail").textContent = "…";
  if ($("companyDetailPhone")) $("companyDetailPhone").textContent = "…";
  if ($("companyDetailAddress")) $("companyDetailAddress").textContent = "…";
  ["companyStatBranches", "companyStatTechs", "companyStatProducts", "companyStatTotalServices", "companyStatOngoing", "companyStatCompleted"].forEach(id => {
    if ($(id)) $(id).textContent = "…";
  });
  ["companyTabBranches", "companyTabTechnicians", "companyTabProducts", "companyTabServices"].forEach(id => {
    if ($(id)) $(id).innerHTML = `<div class="p-8 text-center text-slate-400 text-xs">Loading operational records…</div>`;
  });

  try {
    const res = await adminApi(`/companies/${companyId}`);
    const company = res.company;
    const stats = res.stats;
    const branches = res.branches || [];
    const technicians = res.technicians || [];
    const products = res.products || [];
    const services = res.services || [];

    if ($("companyDetailName")) $("companyDetailName").textContent = company.name;
    if ($("companyDetailAvatar")) $("companyDetailAvatar").textContent = company.name.split(/\s+/).map(p => p[0]).slice(0, 2).join("");
    if ($("companyDetailEmail")) $("companyDetailEmail").textContent = company.email;
    if ($("companyDetailPhone")) $("companyDetailPhone").textContent = company.phone;
    if ($("companyDetailAddress")) $("companyDetailAddress").textContent = company.address || "Registered Corporate Office";

    if ($("companyStatBranches")) $("companyStatBranches").textContent = stats.total_branches;
    if ($("companyStatTechs")) $("companyStatTechs").textContent = stats.total_technicians;
    if ($("companyStatProducts")) $("companyStatProducts").textContent = stats.total_products;
    if ($("companyStatTotalServices")) $("companyStatTotalServices").textContent = stats.total_services;
    if ($("companyStatOngoing")) $("companyStatOngoing").textContent = stats.ongoing_services;
    if ($("companyStatCompleted")) $("companyStatCompleted").textContent = stats.completed_services;

    if ($("tabCountBranches")) $("tabCountBranches").textContent = branches.length;
    if ($("tabCountTechs")) $("tabCountTechs").textContent = technicians.length;
    if ($("tabCountProducts")) $("tabCountProducts").textContent = products.length;
    if ($("tabCountServices")) $("tabCountServices").textContent = services.length;

    // 1. Branches Tab
    if ($("companyTabBranches")) {
      $("companyTabBranches").innerHTML = branches.length ? `
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr><th class="p-2.5">Branch Name</th><th class="p-2.5">Manager</th><th class="p-2.5">Contact</th><th class="p-2.5">PIN Code</th><th class="p-2.5">Address</th><th class="p-2.5">Techs</th></tr>
            </thead>
            <tbody>
              ${branches.map(b => `
                <tr class="border-t border-slate-100">
                  <td class="p-2.5 font-bold text-slate-800">${safe(b.branch_name)}</td>
                  <td class="p-2.5 font-medium">${safe(b.manager_name)}</td>
                  <td class="p-2.5 text-slate-600">${safe(b.mobile)}<br><small class="text-slate-400">${safe(b.email)}</small></td>
                  <td class="p-2.5 font-mono font-semibold text-blue-600">${safe(b.pincode)}</td>
                  <td class="p-2.5 text-slate-500 max-w-xs truncate">${safe(b.address)}</td>
                  <td class="p-2.5"><span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">${b.technicians_count || 0} active</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<div class="p-8 text-center text-slate-400 text-xs">No franchise branches registered under this company yet.</div>`;
    }

    // 2. Technicians Tab
    if ($("companyTabTechnicians")) {
      $("companyTabTechnicians").innerHTML = technicians.length ? `
        <div class="grid sm:grid-cols-2 gap-3">
          ${technicians.map(t => `
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                  ${t.avatar ? `<img src="${safe(t.avatar)}" class="w-full h-full rounded-full object-cover">` : safe(t.name[0])}
                </div>
                <div>
                  <strong class="text-xs font-bold text-slate-900 block">${safe(t.name)}</strong>
                  <span class="text-[11px] text-slate-500 block">${safe(t.title)}</span>
                  <span class="text-[10px] text-blue-600 font-semibold mt-0.5 block">📍 ${safe(t.company_branch)}</span>
                </div>
              </div>
              <div class="text-right">
                <span class="text-xs font-bold text-amber-600">★ ${t.rating || '5.0'}</span>
                <span class="text-[10px] text-slate-400 block">${t.total_jobs || 0} jobs</span>
                <a href="tel:${safe(t.phone)}" class="text-[10px] text-blue-600 font-semibold hover:underline mt-1 block">📞 ${safe(t.phone)}</a>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="p-8 text-center text-slate-400 text-xs">No technicians assigned under this company's branches yet.</div>`;
    }

    // 3. Products Tab
    if ($("companyTabProducts")) {
      $("companyTabProducts").innerHTML = products.length ? `
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr><th class="p-2.5">Appliance / Category</th><th class="p-2.5">Brand</th><th class="p-2.5">Model No</th><th class="p-2.5">Serial No</th><th class="p-2.5">Warranty</th><th class="p-2.5">Registered On</th></tr>
            </thead>
            <tbody>
              ${products.map(p => `
                <tr class="border-t border-slate-100">
                  <td class="p-2.5 font-bold text-slate-800">${safe(p.category)}</td>
                  <td class="p-2.5 text-slate-600">${safe(p.brand)}</td>
                  <td class="p-2.5 font-mono text-slate-700">${safe(p.model_no)}</td>
                  <td class="p-2.5 font-mono text-slate-400">${safe(p.serial_no)}</td>
                  <td class="p-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.warranty_status === 'Expired' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}">${safe(p.warranty_status)}</span></td>
                  <td class="p-2.5 text-slate-500">${safe(p.registered_on)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<div class="p-8 text-center text-slate-400 text-xs">No customer appliances registered under this company yet.</div>`;
    }

    // 4. Services Tab
    if ($("companyTabServices")) {
      $("companyTabServices").innerHTML = services.length ? `
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr><th class="p-2.5">Ticket ID</th><th class="p-2.5">Customer</th><th class="p-2.5">Issue</th><th class="p-2.5">Technician</th><th class="p-2.5">Scheduled Date</th><th class="p-2.5">Status</th></tr>
            </thead>
            <tbody>
              ${services.map(s => `
                <tr class="border-t border-slate-100">
                  <td class="p-2.5 font-bold font-mono text-blue-600">${safe(s.id)}</td>
                  <td class="p-2.5"><strong class="text-slate-800 block">${safe(s.customer_name)}</strong><small class="text-slate-400">${safe(s.customer_phone)}</small></td>
                  <td class="p-2.5 text-slate-700 max-w-xs truncate">${safe(s.appliance_name)}: ${safe(s.issue)}</td>
                  <td class="p-2.5 font-medium text-slate-600">${safe(s.technician_name || 'Unassigned')}</td>
                  <td class="p-2.5 text-slate-500">${safe(s.appointment_date)} · ${safe(s.appointment_slot || 'Regular')}</td>
                  <td class="p-2.5"><span class="status-pill ${statusClass(s.status_badge)}">${safe(s.status_badge)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<div class="p-8 text-center text-slate-400 text-xs">No service requests recorded for this company yet.</div>`;
    }

  } catch (err) {
    showToast(err.message || "Failed to load company details", "error");
  }
};

document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".company-tab");
  if (!tabBtn) return;
  const targetTab = tabBtn.dataset.companyTab;
  document.querySelectorAll(".company-tab").forEach(btn => {
    btn.classList.remove("active", "border-b-2", "border-blue-600", "text-blue-600");
    btn.classList.add("text-slate-500");
  });
  tabBtn.classList.add("active", "border-b-2", "border-blue-600", "text-blue-600");
  tabBtn.classList.remove("text-slate-500");

  document.querySelectorAll(".company-tab-panel").forEach(p => p.classList.add("hidden"));
  if (targetTab === "branches" && $("companyTabBranches")) $("companyTabBranches").classList.remove("hidden");
  if (targetTab === "technicians" && $("companyTabTechnicians")) $("companyTabTechnicians").classList.remove("hidden");
  if (targetTab === "products" && $("companyTabProducts")) $("companyTabProducts").classList.remove("hidden");
  if (targetTab === "services" && $("companyTabServices")) $("companyTabServices").classList.remove("hidden");
});
async function adminApi(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/api/admin${path}`, { ...options, credentials: "include", headers: jsonHeaders(options.headers) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractErrorMessage(data, "Could not complete the request."));
  return data;
}
async function companyApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/company${path}`, { ...options, credentials: "include", headers: jsonHeaders(options.headers) });
  } catch (error) {
    if (error instanceof TypeError) throw new Error("The Servora API did not return a response. Check that the backend is running and allows this frontend origin in CORS settings.");
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractErrorMessage(data, "Could not complete the request."));
  return data;
}
async function franchiseApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/franchise${path}`, { ...options, credentials: "include", headers: jsonHeaders(options.headers) });
  } catch (error) {
    if (error instanceof TypeError) throw new Error("The Servora API did not return a response. Check that the backend is running and allows this frontend origin in CORS settings.");
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractErrorMessage(data, "Could not complete the request."));
  return data;
}
async function loadFranchiseTechnicians() {
  try {
    technicians = await franchiseApi("/technicians");
  } catch (error) {
    technicians = [];
    showToast(`Technicians could not load: ${error.message}`, "error");
  }
  renderFranchiseTechnicians();
}
async function loadCompanyBranches() {
  try {
    branches = await companyApi("/branches");
    renderCompanyBranches();
  } catch (error) {
    renderCompanyBranches();
    $("requestRows").innerHTML = `<tr><td class="empty-row" colspan="6">${safe(error.message)}. Try again after confirming your company session.</td></tr>`;
    $("requestCount").textContent = "Could not load branches";
    showToast(`Branches could not load: ${error.message}`, "error");
  }
}
async function loadCompanyCustomers() {
  try {
    companyCustomers = await companyApi("/customers");
    renderCompanyCustomers();
  } catch (error) {
    companyCustomers = [];
    renderCompanyCustomers();
    $("requestRows").innerHTML = `<tr><td class="empty-row" colspan="7">${safe(error.message)}. Try again after confirming your company session.</td></tr>`;
    $("requestCount").textContent = "Could not load customers";
    showToast(`Customers could not load: ${error.message}`, "error");
  }
}
function renderCompanyCustomers() {
  if ($("crumbTitle")) $("crumbTitle").textContent = "Customers";
  setHidden("addCompanyButton", true);
  setHidden("addBranchButton", true);
  setHidden("addTechnicianButton", true);
  setHidden("companyInlineAdd", true);
  setHidden("exportButton", false);
  setHidden("pageContent", false);
  setHidden("metricGrid", true);
  if ($("tableTitle")) $("tableTitle").textContent = "Registered customers & products";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Customers who have registered your company's appliances for service.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Customer reach";
  if ($("healthContent")) $("healthContent").innerHTML = `<div class="section-empty"><strong>${companyCustomers.length}</strong> registered products under your brand</div>`;
  if ($("activityContent")) $("activityContent").innerHTML = `<div class="section-empty">When customers add appliances under your company, their contact details, address, and device model appear here.</div>`;
  if ($("bottomTitle")) $("bottomTitle").textContent = "Customer directory";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Customers with products under your warranty and service coverage.";

  if ($("requestHead")) $("requestHead").innerHTML = [
    "Customer",
    "Contact info",
    "Service address",
    "Registered product",
    "Model & serial",
    "Warranty",
    "Registered date"
  ].map((label) => `<th>${safe(label)}</th>`).join("");

  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  if ($("requestSearch")) $("requestSearch").placeholder = "Search customers or products";

  const filtered = companyCustomers.filter((item) =>
    [
      item.customer_name,
      item.customer_email,
      item.customer_phone,
      item.customer_address,
      item.category,
      item.brand,
      item.model_no,
      item.serial_no
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );

  $("requestRows").innerHTML = filtered.length
    ? filtered
        .map((item) => {
          const initials = safe(
            (item.customer_name || "CU")
              .split(/\s+/)
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()
          );
          return `<tr><td><div class="customer-cell"><span class="customer-avatar">${initials}</span><span class="customer-name"><strong>${safe(item.customer_name)}</strong><small>ID: ${safe(item.customer_id)}</small></span></div></td><td><div>${safe(item.customer_email)}</div><small class="text-slate-400 font-mono">${safe(item.customer_phone)}</small></td><td class="max-w-[220px]"><span class="block text-xs leading-relaxed text-slate-700">${safe(item.customer_address || "Address not provided")}</span></td><td><strong>${safe(item.brand)} ${safe(item.category)}</strong></td><td><div>Model: <strong>${safe(item.model_no)}</strong></div><small class="text-slate-400">SN: ${safe(item.serial_no || "N/A")}</small></td><td><span class="status-pill completed">${safe(item.warranty_status || "Active")}</span></td><td>${safe(item.registered_on || "—")}</td></tr>`;
        })
        .join("")
    : `<tr><td class="empty-row" colspan="7">${
        query
          ? "No customers or products match your search."
          : "No customer products registered yet. When customers add appliances under your brand, they will appear here automatically."
      }</td></tr>`;

  $("requestCount").textContent = `${filtered.length} customer product${
    filtered.length === 1 ? "" : "s"
  } shown`;
  $("resourceGrid").innerHTML = "";
}
async function loadWorkspacePageData(page) {
  if (role === "admin") { await loadAdminPageData(page); return; }
  if (role === "company" && page === "Branches") { await loadCompanyBranches(); return; }
  if (role === "company" && page === "Customers") { await loadCompanyCustomers(); return; }
  if (role === "franchise" && page === "Technicians") { await loadFranchiseTechnicians(); return; }
  if (role === "franchise" && page === "Customers") { renderFranchiseCustomers(); return; }
  renderPage(page);
}
async function loadAdminPageData(page) {
  if (role !== "admin") return;
  const roles = { Branches: "branch", Technicians: "technician", Customers: "customer" };
  try {
    if (roles[page]) directoryRows = await adminApi(`/directory/${roles[page]}`);
    if (page === "Companies") companies = await adminApi("/companies");
  } catch (error) {
    directoryRows = [];
    if (page === "Companies") {
      companies = [];
      renderCompanies();
      $("requestRows").innerHTML = `<tr><td class="empty-row" colspan="6">${safe(error.message)}. Check the Servora API connection and try again.</td></tr>`;
      $("requestCount").textContent = "Could not load company records";
      showToast(`Companies could not load: ${error.message}`, "error");
      return;
    }
    showToast(error.message, "error");
  }
  renderPage(page);
}
function renderDirectory(page) {
  $("metricGrid").hidden = true; $("requestSearch").placeholder = `Search ${page.toLowerCase()}`;
  $("tableTitle").textContent = page; $("tableSubtitle").textContent = `All ${page.toLowerCase()} accounts registered on Servora.`;
  $("sidePanelTitle").textContent = `${page} directory`;
  $("healthContent").innerHTML = `<div class="section-empty"><strong>${directoryRows.length}</strong> ${page.toLowerCase()} accounts</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">Directory records are loaded from the Servora account database.</div>`;
  $("requestHead").innerHTML = ["Name", "Email", "Phone", "Address", "Account type"].map((label) => `<th>${label}</th>`).join("");
  const query = $("requestSearch").value.trim().toLowerCase(); const filtered = directoryRows.filter((item) => [item.name, item.email, item.phone, item.address].join(" ").toLowerCase().includes(query));
  $("requestRows").innerHTML = filtered.length ? filtered.map((item) => `<tr><td>${safe(item.name)}</td><td>${safe(item.email)}</td><td>${safe(item.phone)}</td><td>${safe(item.address || "—")}</td><td><span class="status-pill">${safe(item.role)}</span></td></tr>`).join("") : `<tr><td class="empty-row" colspan="5">No ${page.toLowerCase()} accounts found.</td></tr>`;
  $("requestCount").textContent = `${filtered.length} ${page.toLowerCase()} shown`; $("resourceGrid").innerHTML = "";
  $("bottomTitle").textContent = `${page} directory`; $("bottomSubtitle").textContent = "Registered platform accounts";
}
function renderRequestDirectory() {
  $("metricGrid").hidden = true; $("requestSearch").placeholder = "Search service requests";
  $("tableTitle").textContent = "Service requests"; $("tableSubtitle").textContent = "Service activity across all Servora accounts.";
  $("requestHead").innerHTML = ["Request ID", "Customer", "Appliance", "Issue", "Status", "Date"].map((label) => `<th>${label}</th>`).join("");
  const query = $("requestSearch").value.trim().toLowerCase(); const filtered = requests.filter((item) => [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge].join(" ").toLowerCase().includes(query));
  $("requestRows").innerHTML = filtered.length ? filtered.map((item) => `<tr><td>${safe(item.id)}</td><td>${safe(item.customer_name)}</td><td>${safe(item.appliance_name)}</td><td>${safe(item.issue)}</td><td><span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span></td><td>${safe(item.appointment_date)}</td></tr>`).join("") : `<tr><td class="empty-row" colspan="6">No service requests found.</td></tr>`;
  $("requestCount").textContent = `${filtered.length} service requests shown`; $("sidePanelTitle").textContent = "Request status";
  $("healthContent").innerHTML = `<div class="section-empty"><strong>${requests.length}</strong> total service requests</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">${requests.filter((item) => item.status_badge !== "Completed").length} requests are currently active.</div>`;
  $("resourceGrid").innerHTML = ""; $("bottomTitle").textContent = "Service request directory"; $("bottomSubtitle").textContent = "Current request records";
}
function renderReports() {
  $("metricGrid").hidden = false; $("metricGrid").innerHTML = `<article class="metric-card"><div class="metric-label">Service requests</div><div class="metric-value">${requests.length}</div><div class="metric-bottom">All recorded requests</div></article><article class="metric-card"><div class="metric-label">Completed</div><div class="metric-value">${requests.filter((item) => item.status_badge === "Completed").length}</div><div class="metric-bottom">Requests marked complete</div></article><article class="metric-card"><div class="metric-label">Active</div><div class="metric-value">${requests.filter((item) => !["Completed", "Cancelled"].includes(item.status_badge)).length}</div><div class="metric-bottom">Open requests</div></article><article class="metric-card"><div class="metric-label">Companies</div><div class="metric-value">${companies.length}</div><div class="metric-bottom">Partner accounts</div></article>`;
  $("tableTitle").textContent = "Reports"; $("tableSubtitle").textContent = "Export current Servora platform service data.";
  $("requestHead").innerHTML = ["Report", "Coverage", "Records", "Action"].map((label) => `<th>${label}</th>`).join("");
  $("requestRows").innerHTML = `<tr><td>Service requests</td><td>All platform activity</td><td>${requests.length}</td><td><button class="table-action" id="downloadRequests">Download CSV →</button></td></tr><tr><td>Company directory</td><td>Registered partner accounts</td><td>${companies.length}</td><td><button class="table-action" id="downloadCompanies">Download CSV →</button></td></tr>`;
  $("requestCount").textContent = "2 reports available"; $("sidePanelTitle").textContent = "Report coverage";
  $("healthContent").innerHTML = `<div class="section-empty">Reports include current service request and company account records.</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">Use the Download CSV actions to export a snapshot.</div>`;
  $("resourceGrid").innerHTML = ""; $("bottomTitle").textContent = "Available reports"; $("bottomSubtitle").textContent = "Download a CSV snapshot";
  $("downloadRequests").addEventListener("click", () => downloadCsv("servora-service-requests.csv", [["Request ID", "Customer", "Appliance", "Issue", "Status", "Date"], ...requests.map((item) => [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge, item.appointment_date])]));
  $("downloadCompanies").addEventListener("click", () => downloadCsv("servora-companies.csv", [["Company", "Email", "Phone", "Address"], ...companies.map((item) => [item.name, item.email, item.phone, item.address || ""]) ]));
}
function renderSettings() {
  $("metricGrid").hidden = true; $("tableTitle").textContent = "System settings";
  $("tableSubtitle").textContent = "Platform connection and email delivery configuration.";
  $("requestHead").innerHTML = ["Setting", "Configuration", "Status"].map((label) => `<th>${label}</th>`).join("");
  $("requestRows").innerHTML = `<tr><td>Servora API</td><td>${safe(API_BASE_URL)}</td><td><span class="status-pill completed">Connected when API is reachable</span></td></tr><tr><td>Company credential email</td><td>Brevo SMTP API</td><td><span class="status-pill">Configured on backend</span></td></tr><tr><td>Administrator access</td><td>Signed-in admin account</td><td><span class="status-pill completed">Protected</span></td></tr>`;
  $("requestCount").textContent = "3 platform settings"; $("sidePanelTitle").textContent = "Email delivery";
  $("healthContent").innerHTML = `<div class="section-empty">Company invitation emails are sent through Brevo. API keys and sender identity are stored on the backend.</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">Set BREVO_API_KEY and BREVO_SENDER_EMAIL in the backend environment to enable delivery.</div>`;
  $("resourceGrid").innerHTML = ""; $("bottomTitle").textContent = "Platform configuration"; $("bottomSubtitle").textContent = "Runtime settings are managed through the backend environment.";
}
function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}
function setMetrics() {
  const grid = $("metricGrid");
  if (!grid) return;
  const visible = requests.filter(requestForRole);
  const total = visible.length;
  const active = visible.filter((item) => ["In Progress", "Technician on the Way", "Service In Progress"].includes(item.status) || item.status_badge === "In Progress").length;
  const completed = visible.filter((item) => item.status_badge === "Completed").length;
  const pending = visible.filter((item) => ["Request Created", "Scheduled", "Assigned"].includes(item.status_badge) || item.status === "Request Created" || item.status === "Technician Assigned").length;

  if (role === "technician") {
    const values = [
      ["Total Jobs", String(total), "Current assigned workload", "📋", ""],
      ["In Progress", String(active), "Active on-site visits", "⚡", "amber"],
      ["Pending", String(pending), "Waiting for visit", "⏳", "purple"],
    ];
    grid.className = "metric-grid grid-cols-1 sm:grid-cols-3";
    grid.innerHTML = values.map(([label, value, note, icon, tone]) => `<article class="metric-card"><span class="metric-icon ${tone}">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-bottom"><span class="metric-change">●</span>${note}</div></article>`).join("");
    return;
  }

  if (role === "franchise") {
    const techCount = technicians.length;
    const avgTime = completed > 0 ? "3.8 hrs" : "--";
    const values = [
      ["New Requests", String(pending), "Direct customer bookings", "📥", "amber"],
      ["Active Jobs", String(active), "Under field resolution", "⚙️", "blue"],
      ["Technicians", String(techCount), "Assigned to this branch", "👷", "purple"],
      ["Avg. Resolution Time", avgTime, completed > 0 ? `${completed} completed calls` : "No completed jobs yet", "⏱️", "green"],
    ];
    grid.className = "metric-grid grid-cols-2 md:grid-cols-4";
    grid.innerHTML = values.map(([label, value, note, icon, tone]) => `<article class="metric-card"><span class="metric-icon ${tone}">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-bottom"><span class="metric-change">●</span>${note}</div></article>`).join("");
    return;
  }

  // Company and Admin
  const branchCount = branches.length;
  const uniqueTechs = new Set(visible.map((r) => r.technician?.id).filter(Boolean));
  const resRate = total > 0 ? Math.round((completed / total) * 100) + "%" : "0%";
  const values = [
    ["Total Requests", String(total), "Across authorized network", "📦", ""],
    ["Active Service Jobs", String(active), "Open across branches", "⚡", "amber"],
    ["Agencies / Branches", String(branchCount), "Active franchise hubs", "🏢", "purple"],
    ["Technicians", String(uniqueTechs.size || (role === "admin" ? technicians.length : 0)), "Field service personnel", "👷", ""],
    ["Resolution Rate", resRate, `${completed} of ${total} resolved`, "📈", "green"],
  ];
  grid.className = "metric-grid grid-cols-2 lg:grid-cols-5";
  grid.innerHTML = values.map(([label, value, note, icon, tone]) => `<article class="metric-card"><span class="metric-icon ${tone}">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-bottom"><span class="metric-change">●</span>${note}</div></article>`).join("");
}

function requestForRole(item) {
  if (role === "technician") {
    return item.technician?.id === user?.id || item.technician?.name === user?.name || (!item.technician?.id && item.branch_id === user?.branch_id);
  }
  if (role === "franchise") {
    return !user?.branch_id || !item.branch_id || item.branch_id === user.branch_id || item.pincode === user.pincode;
  }
  if (role === "company") {
    return !user?.company_id || !item.company_id || item.company_id === user.company_id;
  }
  return true;
}

function statusClass(status) {
  if (status === "Completed") return "completed";
  if (["Scheduled", "Request Created", "Technician Assigned"].includes(status)) return "scheduled";
  if (status === "Assigned") return "assigned";
  return "";
}

function priorityClass(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "bg-rose-50 text-rose-700 border border-rose-200";
  if (p === "medium") return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-slate-50 text-slate-700 border border-slate-200";
}

function renderRequests() {
  const list = requests.filter(requestForRole);
  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  const status = $("statusFilter") ? $("statusFilter").value : "all";
  const filtered = list.filter((item) => {
    const text = [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge, item.pincode].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (status === "all" || item.status_badge === status);
  });

  const tableEl = $("requestRows")?.closest("table");
  let techContainer = $("techJobCardsContainer");
  if (!techContainer && tableEl?.parentNode) {
    techContainer = document.createElement("div");
    techContainer.id = "techJobCardsContainer";
    techContainer.className = "p-4 sm:p-5 space-y-4";
    tableEl.parentNode.insertBefore(techContainer, tableEl);
  }

  if (role === "technician") {
    if (tableEl) tableEl.style.display = "none";
    if (techContainer) techContainer.style.display = "block";
    if ($("tableTitle")) $("tableTitle").textContent = "Today's Jobs";
    if ($("tableSubtitle")) $("tableSubtitle").textContent = "Service visits scheduled for your field route today.";

    // Render technician mobile bottom nav if not exists
    if (!$("techMobileNav")) {
      const bNav = document.createElement("nav");
      bNav.id = "techMobileNav";
      bNav.className = "fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-6 py-2.5 flex justify-between items-center text-xs font-semibold text-slate-500 shadow-lg md:hidden";
      bNav.innerHTML = `
        <button onclick="window.scrollTo({top:0, behavior:'smooth'})" class="flex flex-col items-center gap-1 text-blue-600">
          <span class="text-base leading-none">🏠</span>
          <span class="text-[10px]">Home</span>
        </button>
        <button onclick="document.getElementById('tableTitle')?.scrollIntoView({behavior:'smooth'})" class="flex flex-col items-center gap-1 hover:text-blue-600">
          <span class="text-base leading-none">📋</span>
          <span class="text-[10px]">Jobs</span>
        </button>
        <button onclick="openTechRouteMap()" class="flex flex-col items-center gap-1 hover:text-blue-600">
          <span class="text-base leading-none">🗺️</span>
          <span class="text-[10px]">Map</span>
        </button>
        <button onclick="window.openOpsProfileModal()" class="flex flex-col items-center gap-1 hover:text-blue-600">
          <span class="text-base leading-none">👤</span>
          <span class="text-[10px]">Profile</span>
        </button>
      `;
      document.body.appendChild(bNav);
    }

    techContainer.innerHTML = filtered.length ? filtered.map((item) => `
      <article class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm hover:shadow-md transition space-y-3.5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-blue-600 font-mono">${safe(item.id)}</span>
            <h3 class="text-base font-bold text-slate-800 mt-0.5">${safe(item.appliance_name || item.brand)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">Issue: <span class="font-medium text-slate-700">${safe(item.issue)}</span></p>
            <div class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
              <span>📌 You have been assigned this work</span>
            </div>
          </div>
          <span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span>
        </div>

        <div class="rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-xs text-slate-600 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-800">👤 Customer: ${safe(item.customer_name)}</span>
            <a href="tel:${safe(item.customer_phone || '')}" class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">📞 Call</a>
          </div>
          <div class="flex items-start gap-1.5 text-slate-500">
            <span class="flex-none">📍 Address:</span>
            <span class="text-slate-700 font-medium">${safe(item.customer_address || 'Customer doorstep address')} ${item.pincode ? `<strong class="text-slate-800">(PIN: ${safe(item.pincode)})</strong>` : ''}</span>
          </div>
          <div class="flex items-center gap-2 text-slate-500 pt-0.5">
            <span>🕒 Scheduled:</span>
            <span class="font-semibold text-slate-700">${safe(item.appointment_date)} · ${safe(item.appointment_slot || 'Regular Slot')}</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          ${item.status_badge !== 'Completed' ? `
            <button type="button" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="techAction('${safe(item.id)}', 'start_visit')">
              📍 Start Visit
            </button>
            <button type="button" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="techDiagnosisModal('${safe(item.id)}')">
              ⊕ Diagnosis
            </button>
            <button type="button" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="techAction('${safe(item.id)}', 'complete')">
              ✓ Complete Job
            </button>
          ` : `
            <span class="text-xs font-semibold text-emerald-600 flex items-center gap-1">✓ Service Completed</span>
          `}
          <button type="button" class="ml-auto text-xs font-semibold text-blue-600 hover:underline" onclick="openTechRouteMap('${safe(item.id)}')">
            🗺️ Open Map Route →
          </button>
        </div>
      </article>
    `).join("") : `<div class="p-8 text-center text-slate-400 text-sm">No service jobs assigned for today.</div>`;
    if ($("requestCount")) $("requestCount").textContent = `${filtered.length} job${filtered.length === 1 ? "" : "s"} shown`;
    return;
  }

  // Table views for franchise, company, and admin
  if (tableEl) tableEl.style.display = "";
  if (techContainer) techContainer.style.display = "none";

  let head = config.columns;
  if (role === "franchise") {
    head = ["Request ID", "Customer", "Appliance", "Issue", "Assigned Technician", "Priority", "Status", "Action"];
  } else if (role === "company") {
    head = ["Request ID", "Customer", "PIN Code", "Routed Branch", "Status", "Action"];
  }

  if ($("requestHead")) $("requestHead").innerHTML = head.map((name) => `<th>${safe(name)}</th>`).join("");
  if ($("requestRows")) $("requestRows").innerHTML = filtered.length ? filtered.map((item) => {
    const customer = `<div class="customer-cell"><span class="customer-avatar">${safe((item.customer_name || "U").split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span><span class="customer-name">${safe(item.customer_name)}<small>${safe(item.customer_phone || "Servora customer")}</small></span></div>`;

    if (role === "franchise") {
      const assignedTech = technicians.find(t => t.id === item.technician_id || t.name === item.technician_name) || item.technician;
      const techName = assignedTech?.name || item.technician_name;
      const techTitle = assignedTech?.title || "Field Technician";
      const isAssigned = Boolean(techName);

      let techCell = "";
      if (isAssigned) {
        techCell = `
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-none">👷</span>
            <div class="min-w-0">
              <strong class="text-xs text-slate-800 block truncate">${safe(techName)}</strong>
              <small class="text-[10px] text-slate-400 block truncate">${safe(techTitle)}</small>
            </div>
          </div>
        `;
      } else {
        techCell = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">⏳ Unassigned</span>`;
      }

      const priorityBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${priorityClass(item.priority || 'Medium')}">${safe(item.priority || 'Medium')}</span>`;
      const statusPill = `<span class="status-pill ${statusClass(item.status_badge || item.status)}">${safe(item.status_badge || item.status || "Pending")}</span>`;

      const isDispatched = item.status === "Technician on the Way" || (isAssigned && item.status !== "Completed");
      const trackBtn = isDispatched ? `<button class="table-action px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-semibold text-xs ml-1" onclick="openTechRouteMap('${safe(item.id)}')">Track 📍</button>` : '';

      const assignBtn = isAssigned
        ? `<button class="table-action px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 font-semibold text-xs flex items-center gap-1" onclick="selectRequestForAssignment('${safe(item.id)}')"><span>↺</span> Reassign</button>`
        : `<button class="table-action px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm flex items-center gap-1" onclick="selectRequestForAssignment('${safe(item.id)}')"><span>⚡</span> Assign →</button>`;

      const actionCell = `<div class="flex items-center gap-1.5">${assignBtn}${trackBtn}</div>`;
      const cells = [safe(item.id), customer, safe(item.appliance_name), safe(item.issue), techCell, priorityBadge, statusPill, actionCell];
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }

    if (role === "company") {
      const pinCode = safe(item.pincode || "—");
      const branchObj = branches.find((b) => b.id === item.branch_id);
      const routedBranch = safe(branchObj ? branchObj.branch_name : (item.branch_id || "Unassigned"));
      const statusPill = `<span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span>`;
      const isDispatched = item.status === "Technician on the Way" || item.technician_id;
      const trackBtn = isDispatched ? `<button class="table-action font-semibold text-xs text-indigo-600 hover:text-indigo-800 ml-2" onclick="openTechRouteMap('${safe(item.id)}')">Track 📍</button>` : '';
      const actionBtn = `<button class="table-action font-semibold text-xs text-blue-600 hover:text-blue-800" onclick="showToast('Viewing ticket ${safe(item.id)}')">View Details →</button>`;
      const cells = [safe(item.id), customer, pinCode, routedBranch, statusPill, `<div class="flex items-center gap-1">${actionBtn}${trackBtn}</div>`];
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }

    // Default admin
    const action = `<button class="table-action" data-request="${safe(item.id)}">View details →</button>`;
    const cells = [safe(item.id), customer, safe(item.brand), safe(item.appliance_name), `<span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span>`, safe(item.appointment_date), action];
    return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="${head.length}">No service requests match this view.</td></tr>`;

  if ($("requestCount")) $("requestCount").textContent = `${filtered.length} request${filtered.length === 1 ? "" : "s"} shown`;
  document.querySelectorAll("[data-request]").forEach((button) => button.addEventListener("click", () => showToast(`${button.dataset.request} · ${requests.find((r) => r.id === button.dataset.request)?.issue || "Service request"}`)));
}

function renderInsights() {
  const visible = requests.filter(requestForRole);
  const total = visible.length || 1;
  const active = visible.filter((item) => item.status_badge !== "Completed").length;
  const completed = visible.filter((item) => item.status_badge === "Completed").length;

  if (role === "franchise") {
    if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Technician Dispatch & Assignment";
    const pendingReqs = visible.filter((r) => r.status_badge !== "Completed");

    if ($("healthContent")) $("healthContent").innerHTML = `
      <div class="p-4 space-y-3">
        <div id="reassignInfoBanner" class="hidden p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-snug">
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Select Service Request</label>
          <select id="assignReqSelect" onchange="window.updateAssignmentPanelState()" class="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white text-slate-800 focus:outline-blue-500">
            ${pendingReqs.map(r => {
              const assignedName = r.technician?.name || r.technician_name;
              const labelSuffix = assignedName ? `[Assigned: ${safe(assignedName)}]` : `[Unassigned]`;
              return `<option value="${safe(r.id)}">${safe(r.id)} - ${safe(r.customer_name)} (${labelSuffix})</option>`;
            }).join('') || '<option value="">No pending requests</option>'}
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Select Technician</label>
          <select id="assignTechSelect" class="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white text-slate-800 focus:outline-blue-500">
            ${technicians.length ? technicians.map((t) => `<option value="${safe(t.id)}">${safe(t.name)} (${safe(t.title || 'Technician')})</option>`).join('') : '<option value="" disabled selected>No technicians registered yet (Add technician)</option>'}
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Priority</label>
          <select id="assignPrioritySelect" class="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white text-slate-800 focus:outline-blue-500">
            <option value="High">🔴 High Priority</option>
            <option value="Medium" selected>🟡 Medium Priority</option>
            <option value="Normal">🔵 Normal Priority</option>
          </select>
        </div>
        <button id="confirmAssignBtn" type="button" onclick="confirmTechnicianAssignment()" class="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5" ${technicians.length === 0 ? "disabled" : ""}>
          <span>⚡</span> Assign Technician
        </button>
      </div>
    `;
    setTimeout(() => { if (typeof window.updateAssignmentPanelState === "function") window.updateAssignmentPanelState(); }, 0);

    const ongoingJobs = visible.filter((r) => r.status_badge === "In Progress" || r.status === "Technician on the Way" || r.status === "Service In Progress");
    if ($("activityContent")) $("activityContent").innerHTML = `
      <div class="p-3.5 space-y-2.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Live Ongoing Field Visits</div>
        ${ongoingJobs.length ? ongoingJobs.map(r => `
          <div class="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 text-xs space-y-1">
            <div class="flex items-center justify-between font-semibold text-slate-800">
              <span>${safe(r.id)}</span>
              <span class="status-pill scheduled text-[10px]">${safe(r.status_badge)}</span>
            </div>
            <div class="text-slate-500 text-[11px]">Tech: <strong class="text-slate-700">${safe(r.technician?.name || 'Assigned Tech')}</strong></div>
            <div class="text-slate-400 text-[10px] flex items-center justify-between">
              <span>${safe(r.customer_name)}</span>
              <span>${safe(r.appointment_slot || 'Today')}</span>
            </div>
          </div>
        `).join('') : '<div class="text-xs text-slate-400 p-2">No active jobs in field right now.</div>'}
      </div>
    `;
    return;
  }

  if (role === "company") {
    if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Service Request Analytics";
    const compReqs = requests.filter(requestForRole);
    if ($("healthContent")) $("healthContent").innerHTML = `
      <div class="p-4 space-y-3">
        <div class="flex items-baseline justify-between">
          <div>
            <div class="text-2xl font-extrabold text-slate-800 tracking-tight">${compReqs.length}</div>
            <div class="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
              <span>● Live</span> <span class="text-slate-400 font-normal">registered service requests</span>
            </div>
          </div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Volume</span>
        </div>
        <div class="w-full h-24 pt-2">
          <svg class="w-full h-full overflow-visible" viewBox="0 0 240 80">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <path d="M 0,65 Q 40,55 80,48 T 160,25 T 240,15 L 240,80 L 0,80 Z" fill="url(#chartGrad)"/>
            <path d="M 0,65 Q 40,55 80,48 T 160,25 T 240,15" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="80" cy="48" r="3.5" fill="#2563eb" stroke="#fff" stroke-width="1.5"/>
            <circle cx="160" cy="25" r="3.5" fill="#2563eb" stroke="#fff" stroke-width="1.5"/>
            <circle cx="240" cy="15" r="4" fill="#2563eb" stroke="#fff" stroke-width="2"/>
          </svg>
          <div class="flex justify-between text-[9px] text-slate-400 font-medium pt-1">
            <span>Day 1</span>
            <span>Day 10</span>
            <span>Day 20</span>
            <span>Day 30</span>
          </div>
        </div>
      </div>
    `;

    if (!branches.length) {
      if ($("activityContent")) $("activityContent").innerHTML = `<div class="p-4 text-xs text-slate-400">No branches registered yet. Add branches to monitor branch resolution rankings.</div>`;
    } else {
      const branchStats = branches.map(b => {
        const bReqs = requests.filter(r => r.branch_id === b.id || r.pincode === b.pincode);
        const bComp = bReqs.filter(r => r.status_badge === "Completed").length;
        const rate = bReqs.length > 0 ? Math.round((bComp / bReqs.length) * 100) + "%" : "100%";
        return {
          name: b.branch_name,
          jobs: `${bReqs.length} request${bReqs.length === 1 ? '' : 's'}`,
          rate,
          score: bReqs.length > 0 ? "4.9" : "—"
        };
      });
      if ($("activityContent")) $("activityContent").innerHTML = `
        <div class="p-3.5 space-y-2.5">
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Top Performing Branches</div>
          ${branchStats.map((b, i) => `
            <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50/70 border border-slate-100 text-xs">
              <div class="flex items-center gap-2">
                <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center justify-center flex-none">#${i + 1}</span>
                <div>
                  <strong class="text-slate-800 block text-[11px] leading-tight">${safe(b.name)}</strong>
                  <span class="text-[10px] text-slate-400">${safe(b.jobs)}</span>
                </div>
              </div>
              <div class="text-right flex-none">
                <div class="font-bold text-slate-700 text-[11px]">${safe(b.rate)}</div>
                <div class="text-[10px] text-amber-500 font-semibold">★ ${safe(b.score)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
    return;
  }

  // Default admin / technician
  if ($("healthContent")) $("healthContent").innerHTML = `<div class="health-score"><div class="score-ring">${Math.round((completed / total) * 100) || 92}%</div><div class="score-copy"><strong>${role === "technician" ? "Service rating" : "Service completion"}</strong><span>${role === "technician" ? "Positive recent performance" : "Completion across visible requests"}</span></div></div><div class="health-list"><div><div class="health-item"><span>Active requests</span><strong>${active}</strong></div><div class="health-bar"><i class="amber-bar" style="width:${Math.max(10, active / total * 100)}%"></i></div></div><div><div class="health-item"><span>Completed requests</span><strong>${completed}</strong></div><div class="health-bar"><i class="green-bar" style="width:${Math.max(10, completed / total * 100)}%"></i></div></div><div><div class="health-item"><span>Service records</span><strong>${requests.length}</strong></div><div class="health-bar"><i style="width:78%"></i></div></div></div>`;
  const latest = [...requests].slice(-4).reverse();
  if ($("activityContent")) $("activityContent").innerHTML = latest.length ? `<div class="activity-list">${latest.map((item, index) => `<div class="activity-row"><i class="activity-dot ${item.status_badge === "Completed" ? "green-dot" : ""}"></i><div class="activity-copy"><strong>${safe(item.id)}</strong> · ${safe(item.status)}<small>${safe(item.customer_name)} · ${safe(item.appliance_name)}</small></div></div>`).join("")}</div>` : `<div class="activity-list"><div class="activity-copy">No service activity yet.</div></div>`;
}

// Global actions for Technician and Franchise operations
window.techAction = async function(requestId, action) {
  try {
    const label = action === "start_visit" ? "Starting visit" : action === "diagnose" ? "Recording diagnosis" : "Completing job";
    showToast(`${label}…`);
    const res = await fetch(`${API_BASE_URL}/api/requests/${requestId}/action`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders(),
      body: JSON.stringify({ action })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(extractErrorMessage(data, "Action failed"));
    }
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx !== -1) requests[idx] = data;

    setMetrics();
    renderRequests();
    renderInsights();

    if (action === "start_visit") {
      showToast("Visit started! You are en route to customer doorstep.");
      // Automatically open live animated route tracking modal
      window.openTechRouteMap(requestId);
      return;
    }

    showToast(`Job updated: ${data.status_badge || data.status || "Updated"}`);
  } catch (err) {
    showToast(extractErrorMessage(err.message, "Action failed"), "error");
  }
};

window.techDiagnosisModal = function(requestId) {
  const note = prompt("Enter diagnosis findings / required spare parts (e.g. PCB inspected, condenser coils cleaned):", "Initial inspection completed. Appliance tested.");
  if (note !== null) {
    window.techAction(requestId, 'diagnose');
  }
};

let techMapAnimationTimer = null;
function stopTechMapAnimation() {
  if (techMapAnimationTimer) {
    clearInterval(techMapAnimationTimer);
    techMapAnimationTimer = null;
  }
}

window.openTechRouteMap = function(requestId) {
  const dialog = $("techMapDialog");
  if (!dialog) return;
  stopTechMapAnimation();
  dialog.showModal();

  const liveBanner = $("techMapLiveBanner");
  const mapTitle = $("techMapTitle");
  const mapSubtitle = $("techMapSubtitle");
  const targetReq = requestId ? requests.find((r) => r.id === requestId) : null;

  if (targetReq) {
    if (liveBanner) liveBanner.classList.remove("hidden");
    if (mapTitle) mapTitle.textContent = `Live Field Tracking · ${targetReq.id}`;
    if (mapSubtitle) mapSubtitle.textContent = `Tracking field technician movement to ${targetReq.customer_name || 'Customer'}`;
  } else {
    if (liveBanner) liveBanner.classList.add("hidden");
    if (mapTitle) mapTitle.textContent = "Today's Route & Field Jobs";
    if (mapSubtitle) mapSubtitle.textContent = "Assigned customer service visits on OpenStreetMap";
  }

  setTimeout(() => {
    if (!window.L) return;
    if (window._techMapInstance) {
      window._techMapInstance.remove();
      window._techMapInstance = null;
    }

    if (targetReq) {
      // Swiggy / Zomato live animated tracking
      const customerLat = targetReq.latitude || 28.5355;
      const customerLng = targetReq.longitude || 77.3910;
      // Start origin ~2.3km away
      const techStartLat = customerLat + 0.015;
      const techStartLng = customerLng - 0.013;

      const map = L.map("techOsmMap").setView([customerLat, customerLng], 14);
      window._techMapInstance = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      // Customer Doorstep Marker (Green Home Pin)
      const homeIcon = L.divIcon({
        className: "custom-doorstep-pin",
        html: `<div style="background:#10b981;color:white;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:16px;box-shadow:0 4px 12px rgba(16,185,129,0.45);border:2.5px solid white;">🏠</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      L.marker([customerLat, customerLng], { icon: homeIcon }).addTo(map)
        .bindPopup(`<b>Customer Doorstep</b><br><b>${safe(targetReq.customer_name)}</b><br>${safe(targetReq.customer_address || 'Service Location')}<br><small>PIN: ${safe(targetReq.pincode || '201310')}</small>`);

      // 36 bezier curve waypoints for realistic road trajectory
      const steps = 36;
      const waypoints = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p0 = [techStartLat, techStartLng];
        const p1 = [techStartLat - 0.005, techStartLng + 0.007];
        const p2 = [customerLat + 0.006, techStartLng + 0.003];
        const p3 = [customerLat, customerLng];

        const lat = Math.pow(1 - t, 3) * p0[0] + 3 * Math.pow(1 - t, 2) * t * p1[0] + 3 * (1 - t) * Math.pow(t, 2) * p2[0] + Math.pow(t, 3) * p3[0];
        const lng = Math.pow(1 - t, 3) * p0[1] + 3 * Math.pow(1 - t, 2) * t * p1[1] + 3 * (1 - t) * Math.pow(t, 2) * p2[1] + Math.pow(t, 3) * p3[1];
        waypoints.push([lat, lng]);
      }

      // Background route (dashed)
      L.polyline(waypoints, { color: "#cbd5e1", weight: 5, dashArray: "6, 8" }).addTo(map);

      // Active vibrant route
      const activeRouteLine = L.polyline(waypoints, { color: "#2563eb", weight: 5 }).addTo(map);

      // Technician Marker (Blue Bike with expanding pulse radar ring)
      const techIcon = L.divIcon({
        className: "custom-tech-pin",
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(37,99,235,0.25);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;background:#2563eb;color:white;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:16px;box-shadow:0 4px 14px rgba(37,99,235,0.45);border:2.5px solid white;">🛵</div>
        </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const techName = targetReq.technician?.name || user?.name || "Field Technician";
      let currentStep = 0;
      const techMarker = L.marker(waypoints[0], { icon: techIcon }).addTo(map);
      techMarker.bindPopup(`<b>${safe(techName)}</b><br><span id="opsLivePopupEta">En route · Moving to doorstep</span>`).openPopup();

      map.fitBounds(L.latLngBounds([waypoints[0], [customerLat, customerLng]]), { padding: [50, 50] });

      techMapAnimationTimer = setInterval(() => {
        if (!window._techMapInstance) {
          stopTechMapAnimation();
          return;
        }
        currentStep++;
        if (currentStep >= waypoints.length) {
          stopTechMapAnimation();
          techMarker.setLatLng([customerLat, customerLng]);
          techMarker.getPopup()?.setContent(`<b>${safe(techName)}</b><br><span style="color:#10b981;font-weight:bold;">✓ Arrived at Customer Doorstep</span>`).openPopup();
          if ($("techMapEtaText")) $("techMapEtaText").textContent = `${techName} has arrived at the customer doorstep!`;
          if ($("techMapDistText")) $("techMapDistText").textContent = "Arrived · 0 meters away · Service starting";
          showToast(`Technician ${techName} has arrived at ${targetReq.customer_name}'s location!`);
          return;
        }

        const currentPos = waypoints[currentStep];
        techMarker.setLatLng(currentPos);
        activeRouteLine.setLatLngs(waypoints.slice(currentStep));

        const remainingSteps = waypoints.length - currentStep;
        const etaMinutes = Math.max(1, Math.ceil((remainingSteps / waypoints.length) * 14));
        const remainingKm = ((remainingSteps / waypoints.length) * 2.4).toFixed(1);
        const speed = Math.floor(25 + Math.sin(currentStep) * 6);

        if ($("techMapEtaText")) $("techMapEtaText").textContent = `${techName} is en route · ${etaMinutes} mins away`;
        if ($("techMapDistText")) $("techMapDistText").textContent = `Remaining distance: ${remainingKm} km · Speed: ${speed} km/h`;
        const popupEta = document.getElementById("opsLivePopupEta");
        if (popupEta) popupEta.textContent = `En route · ${etaMinutes} mins away (${remainingKm} km)`;
      }, 1200);

    } else {
      // General map with all jobs
      const map = L.map("techOsmMap").setView([28.5355, 77.3910], 12);
      window._techMapInstance = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      const points = [];
      requests.forEach((req, idx) => {
        const lat = req.latitude || (28.5355 + (idx * 0.015 - 0.03));
        const lng = req.longitude || (77.3910 + (idx * 0.018 - 0.02));
        points.push([lat, lng]);

        const marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup(`
          <div style="font-family:sans-serif;font-size:12px;line-height:1.4">
            <strong style="color:#1d4ed8">${safe(req.id)}</strong><br>
            <b>${safe(req.customer_name)}</b><br>
            ${safe(req.appliance_name || 'Appliance')}<br>
            <span style="color:#64748b">${safe(req.customer_address || '')} (PIN: ${safe(req.pincode || '201310')})</span><br>
            <span style="display:inline-block;margin-top:4px;padding:2px 6px;border-radius:4px;background:#e0f2fe;color:#0369a1;font-weight:600">${safe(req.status_badge)}</span>
          </div>
        `);
      });

      if (points.length) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    }
  }, 250);
};

window.updateAssignmentPanelState = function() {
  const reqSel = document.getElementById("assignReqSelect");
  const techSel = document.getElementById("assignTechSelect");
  const prioSel = document.getElementById("assignPrioritySelect");
  const btn = document.getElementById("confirmAssignBtn");
  const banner = document.getElementById("reassignInfoBanner");
  if (!reqSel || !btn) return;

  const reqId = reqSel.value;
  const req = requests.find((r) => r.id === reqId);
  if (!req) return;

  const assignedTechId = req.technician?.id || req.technician_id;
  const assignedTechName = req.technician?.name || req.technician_name;

  if (prioSel && req.priority) {
    prioSel.value = req.priority;
  }

  if (assignedTechName) {
    if (techSel && assignedTechId) {
      techSel.value = assignedTechId;
    }
    btn.innerHTML = `<span>↺</span> Reassign Technician`;
    btn.className = "w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5";
    if (banner) {
      banner.classList.remove("hidden");
      banner.innerHTML = `<span>🔄 Currently assigned to <strong>${safe(assignedTechName)}</strong>. Select a different technician below to reassign.</span>`;
    }
  } else {
    btn.innerHTML = `<span>⚡</span> Assign Technician`;
    btn.className = "w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5";
    if (banner) {
      banner.classList.add("hidden");
    }
  }
};

window.selectRequestForAssignment = function(requestId) {
  const reqSel = document.getElementById("assignReqSelect");
  if (reqSel) {
    reqSel.value = requestId;
    window.updateAssignmentPanelState();
    reqSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const req = requests.find(r => r.id === requestId);
    const techName = req?.technician?.name || req?.technician_name;
    if (techName) {
      showToast(`Selected ${requestId} (Assigned to ${techName}). Choose a new technician to reassign.`);
    } else {
      showToast(`Selected request ${requestId} for assignment.`);
    }
  }
};

window.confirmTechnicianAssignment = async function() {
  const reqId = document.getElementById("assignReqSelect")?.value;
  const techId = document.getElementById("assignTechSelect")?.value;
  if (!reqId || !techId) {
    showToast("Please select both a request and a technician.", "error");
    return;
  }
  const req = requests.find((r) => r.id === reqId);
  const isReassign = Boolean(req?.technician?.name || req?.technician_name);
  const priority = document.getElementById("assignPrioritySelect")?.value || "Medium";

  try {
    showToast(isReassign ? "Reassigning technician…" : "Assigning technician…");
    const res = await fetch(`${API_BASE_URL}/api/requests/${reqId}/assign`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders(),
      body: JSON.stringify({
        request_id: reqId,
        technician_id: techId,
        priority
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(extractErrorMessage(data, "Failed to assign technician"));
    }
    const idx = requests.findIndex((r) => r.id === reqId);
    if (idx !== -1) requests[idx] = data;

    try { localStorage.setItem(`servora_cache_requests_${role}`, JSON.stringify(requests)); } catch {}

    const assignedTechObj = technicians.find(t => t.id === techId) || data.technician;
    const techName = assignedTechObj?.name || "Technician";

    showToast(isReassign ? `Successfully reassigned ${reqId} to ${techName}!` : `Technician ${techName} assigned to ${reqId}!`);
    setMetrics();
    renderRequests();
    renderInsights();
  } catch (err) {
    showToast(extractErrorMessage(err.message, "Failed to assign technician"), "error");
  }
};
function renderResources() {
  if (!$("resourceGrid")) return;
  $("resourceGrid").innerHTML = config.resources.map(([name, detail, icon], index) => {
    let note = detail;
    if (role === "technician" && index === 0) note = requests.length + " jobs on your schedule";
    if (role === "company" && name === "Customers") note = companyCustomers.length + " registered product" + (companyCustomers.length === 1 ? "" : "s");
    return `<div class="resource-card"><span class="resource-icon">${icon}</span><span><strong>${name}</strong><small>${note}</small></span></div>`;
  }).join("");
}
function roleMatches(userRole, routeRole) {
  if (!userRole || !routeRole) return true;
  if (userRole === routeRole) return true;
  if ((userRole === "branch" || userRole === "franchise") && (routeRole === "branch" || routeRole === "franchise")) return true;
  return false;
}

async function loadDashboard() {
  const stored = localStorage.getItem("servora_user");
  if (stored) { try { user = JSON.parse(stored); } catch { user = null; } }
  try {
    const userResponse = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include", headers: authHeaders() });
    if (userResponse.ok) {
      const resData = await userResponse.json();
      const authenticated = resData.user;
      if (dashboardRouteRole && !roleMatches(authenticated.role, dashboardRouteRole)) {
        localStorage.removeItem("servora_user");
        window.location.replace(portalLoginPaths[dashboardRouteRole]);
        return;
      }
      const token = resData.session_token || user?.session_token || initialUser?.session_token;
      user = { ...authenticated, session_token: token };
      localStorage.setItem("servora_user", JSON.stringify(user));
    } else if (userResponse.status === 401) {
      if (stored && user?.id) {
        console.warn("Transient 401 on /api/auth/me; retaining stored ops session.");
      } else {
        localStorage.removeItem("servora_user");
        window.location.replace(portalLoginPaths[dashboardRouteRole || role] || "/index.html");
        return;
      }
    } else if (stored) {
      user = JSON.parse(stored);
    }
    if (dashboardRouteRole && user?.role && !roleMatches(user.role, dashboardRouteRole)) {
      localStorage.removeItem("servora_user");
      window.location.replace(portalLoginPaths[dashboardRouteRole]);
      return;
    }
    if (dashboardRouteRole) role = dashboardRouteRole;
    else if (user?.role && roleConfig[user.role]) role = user.role;
    config = roleConfig[role] || roleConfig.company;
    if (document.body) document.body.dataset.role = role;
    document.title = `${config.title} — Servora`;
    if ($("workspaceKicker")) $("workspaceKicker").textContent = config.kicker;
    if ($("tableTitle")) $("tableTitle").textContent = config.tableTitle;
    if ($("tableSubtitle")) $("tableSubtitle").textContent = config.tableSubtitle;
    if ($("sidePanelTitle")) $("sidePanelTitle").textContent = config.sideTitle;
    if ($("bottomTitle")) $("bottomTitle").textContent = config.bottomTitle;
    const response = await fetch(`${API_BASE_URL}/api/requests`, { credentials: "include", headers: authHeaders() });
    if (response.status === 401 && !stored) throw new Error("Your session was not accepted. Sign out and sign in again.");
    if (response.ok) {
      requests = await response.json();
      try { localStorage.setItem(`servora_cache_requests_${role}`, JSON.stringify(requests)); } catch {}
    }
    if (role === "admin") {
      companies = await adminApi("/companies");
      try { localStorage.setItem("servora_cache_companies", JSON.stringify(companies)); } catch {}
    }
    if (role === "company") {
      try {
        companyCustomers = await companyApi("/customers");
        localStorage.setItem("servora_cache_customers", JSON.stringify(companyCustomers));
      } catch { companyCustomers = []; }
      try {
        branches = await companyApi("/branches");
        localStorage.setItem("servora_cache_branches", JSON.stringify(branches));
      } catch { branches = []; }
    }
    if (role === "franchise") {
      try {
        technicians = await franchiseApi("/technicians");
        localStorage.setItem("servora_cache_techs", JSON.stringify(technicians));
      } catch { technicians = []; }
    }
  } catch (error) {
    const detail = error instanceof TypeError ? "Connecting to Servora API…" : error.message;
    console.warn("API notice:", detail);
  }
  setProfile(); buildNav(); setMetrics(); renderRequests(); renderInsights(); renderResources();
  if (role !== "admin") { setHidden("addCompanyButton", true); }
  if (role === "admin") { if ($("crumbTitle")) $("crumbTitle").textContent = "Overview"; renderPage("Overview"); }
  if (user?.role && user.role !== role) showToast(`Signed in as ${user.role}; this is the ${role} workspace.`, "error");
}

function initEvents() {
  $("requestSearch")?.addEventListener("input", () => {
    const page = $("crumbTitle")?.textContent;
    if (role === "admin" && page === "Companies") renderCompanies();
    else if (role === "company" && page === "Branches") renderCompanyBranches();
    else if (role === "company" && page === "Customers") renderCompanyCustomers();
    else if (role === "franchise" && page === "Technicians") renderFranchiseTechnicians();
    else if (role === "franchise" && page === "Customers") renderFranchiseCustomers();
    else if (role === "admin" && ["Branches", "Technicians", "Customers"].includes(page)) renderDirectory(page);
    else if (role === "admin" && page === "Service requests") renderRequestDirectory();
    else renderRequests();
  });

  $("statusFilter")?.addEventListener("change", () => {
    if (role === "admin" && $("crumbTitle")?.textContent === "Service requests") renderRequestDirectory();
    else renderRequests();
  });

  $("exportButton")?.addEventListener("click", () => {
    const page = $("crumbTitle")?.textContent;
    if (role === "company" && page === "Customers") {
      const rows = [
        ["Customer Name", "Customer Email", "Customer Phone", "Service Address", "Category", "Brand", "Model No", "Serial No", "Warranty", "Registered Date"],
        ...companyCustomers.map((item) => [
          item.customer_name, item.customer_email, item.customer_phone, item.customer_address || "",
          item.category, item.brand, item.model_no, item.serial_no || "", item.warranty_status || "", item.registered_on || ""
        ])
      ];
      downloadCsv(`servora-company-customers.csv`, rows);
      return;
    }
    if (role === "franchise" && page === "Customers") {
      const visibleReqs = requests.filter(requestForRole);
      const rows = [
        ["Customer Name", "Contact Phone", "Service Address", "PIN Code", "Appliance", "Appointment Date"],
        ...visibleReqs.map((r) => [r.customer_name, r.customer_phone || "", r.customer_address || "", r.pincode || "", r.appliance_name || "", r.appointment_date || ""])
      ];
      downloadCsv(`servora-franchise-customers.csv`, rows);
      return;
    }
    const rows = [["Request ID", "Customer", "Appliance", "Issue", "Status", "Date"], ...requests.map((item) => [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge, item.appointment_date])];
    downloadCsv(`servora-${role}-requests.csv`, rows);
  });

  $("logoutBtn")?.addEventListener("click", () => {
    const logoutRole = dashboardRouteRole || role;
    const headers = authHeaders();
    localStorage.removeItem("servora_user");
    const loginPath = {
      admin: "/admin-login.html",
      company: "/company-login.html",
      franchise: "/franchise-login.html",
      technician: "/technician-login.html",
    }[logoutRole] || "/index.html";
    const logoutController = new AbortController();
    const timeout = window.setTimeout(() => logoutController.abort(), 3000);
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers,
      signal: logoutController.signal,
      keepalive: true,
    }).catch(() => {}).finally(() => window.clearTimeout(timeout));
    window.location.replace(loginPath);
  });

  $("menuToggle")?.addEventListener("click", () => $("opsNav")?.closest(".ops-sidebar")?.classList.toggle("open"));

  $("addCompanyButton")?.addEventListener("click", () => { if ($("companyFormMessage")) $("companyFormMessage").textContent = ""; $("companyDialog")?.showModal(); });
  $("companyInlineAdd")?.addEventListener("click", () => { if ($("companyFormMessage")) $("companyFormMessage").textContent = ""; $("companyDialog")?.showModal(); });
  $("addBranchButton")?.addEventListener("click", () => { if ($("branchFormMessage")) $("branchFormMessage").textContent = ""; $("branchDialog")?.showModal(); });
  $("addTechnicianButton")?.addEventListener("click", () => { if ($("technicianFormMessage")) $("technicianFormMessage").textContent = ""; $("technicianDialog")?.showModal(); });

  $("closeCompanyDialog")?.addEventListener("click", () => $("companyDialog")?.close());
  $("cancelCompany")?.addEventListener("click", () => $("companyDialog")?.close());
  $("closeBranchDialog")?.addEventListener("click", () => $("branchDialog")?.close());
  $("cancelBranch")?.addEventListener("click", () => $("branchDialog")?.close());
  $("closeTechnicianDialog")?.addEventListener("click", () => $("technicianDialog")?.close());
  $("cancelTechnician")?.addEventListener("click", () => $("technicianDialog")?.close());
  $("closeTechMap")?.addEventListener("click", () => { stopTechMapAnimation(); $("techMapDialog")?.close(); });
  $("techMapDialog")?.addEventListener("close", () => stopTechMapAnimation());
  $("closeCompanyDetail")?.addEventListener("click", () => $("companyDetailModal")?.close());

  $("profileButton")?.addEventListener("click", () => window.openOpsProfileModal());
  $("closeOpsProfile")?.addEventListener("click", () => $("opsProfileDialog")?.close());
  $("openEditOpsProfileBtn")?.addEventListener("click", () => {
    $("opsProfileViewMode")?.classList.add("hidden");
    $("opsProfileEditForm")?.classList.remove("hidden");
  });
  $("cancelOpsEditBtn")?.addEventListener("click", () => {
    $("opsProfileViewMode")?.classList.remove("hidden");
    $("opsProfileEditForm")?.classList.add("hidden");
  });
  $("opsModalSignOutBtn")?.addEventListener("click", () => {
    $("opsProfileDialog")?.close();
    $("logoutBtn")?.click();
  });

  $("opsProfileEditForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("saveOpsEditBtn");
    const msg = $("editOpsMessage");
    if (btn) btn.disabled = true;
    if (msg) {
      msg.className = "min-h-4 text-xs text-blue-600 font-semibold";
      msg.textContent = "Saving profile changes…";
    }
    const name = $("editOpsName")?.value.trim();
    const phone = $("editOpsPhone")?.value.trim();
    const address = $("editOpsAddress")?.value.trim();
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: "PUT",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ name, phone, address })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, "Failed to update profile"));
      }
      user = { ...user, name: data.name, phone: data.phone, address: data.address };
      localStorage.setItem("servora_user", JSON.stringify(user));
      setProfile();

      if ($("opsProfileNameText")) $("opsProfileNameText").textContent = user.name;
      if ($("opsProfilePhoneText")) $("opsProfilePhoneText").textContent = user.phone;
      if ($("opsProfileAddressText")) $("opsProfileAddressText").textContent = user.address || "Not provided";
      if ($("opsProfileAvatar")) $("opsProfileAvatar").textContent = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

      if (msg) {
        msg.className = "min-h-4 text-xs text-emerald-600 font-semibold";
        msg.textContent = "Profile updated successfully!";
      }
      showToast("Profile details updated successfully!");
      setTimeout(() => {
        $("opsProfileViewMode")?.classList.remove("hidden");
        $("opsProfileEditForm")?.classList.add("hidden");
        if (msg) msg.textContent = "";
      }, 700);
    } catch (err) {
      if (msg) {
        msg.className = "min-h-4 text-xs text-rose-600 font-semibold";
        msg.textContent = extractErrorMessage(err.message, "Failed to update profile");
      }
      showToast(extractErrorMessage(err.message, "Failed to update profile"), "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $("companyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true; if ($("companyFormMessage")) $("companyFormMessage").textContent = "Creating company…";
    const payload = Object.fromEntries(new FormData(form).entries());
    try { const created = await adminApi("/companies", { method: "POST", body: JSON.stringify(payload) }); companies.push(created); form.reset(); $("companyDialog")?.close(); renderPage("Companies"); showToast(`Company added. Password setup link sent to ${created.email}.`); }
    catch (error) { if ($("companyFormMessage")) $("companyFormMessage").textContent = error.message; }
    finally { if (submit) submit.disabled = false; }
  });

  $("branchForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true; if ($("branchFormMessage")) $("branchFormMessage").textContent = "Saving branch…";
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const created = await companyApi("/branches", { method: "POST", body: JSON.stringify(payload) });
      branches.push(created); form.reset(); $("branchDialog")?.close(); renderCompanyBranches(); showToast(`${created.branch_name} added. Franchise setup link sent to ${created.email}.`);
    } catch (error) { if ($("branchFormMessage")) $("branchFormMessage").textContent = error.message; }
    finally { if (submit) submit.disabled = false; }
  });

  $("technicianForm")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true; if ($("technicianFormMessage")) $("technicianFormMessage").textContent = "Saving technician and sending setup email…";
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const created = await franchiseApi("/technicians", { method: "POST", body: JSON.stringify(payload) });
      technicians.push(created); form.reset(); $("technicianDialog")?.close(); renderFranchiseTechnicians();
      showToast(`Technician added. Password setup link sent to ${created.email}.`);
    } catch (error) { if ($("technicianFormMessage")) $("technicianFormMessage").textContent = error.message; }
    finally { if (submit) submit.disabled = false; }
  });
}

// Profile Modal & Edit Details for Ops Portals (Technician, Franchise, Company, Admin)
window.openOpsProfileModal = function() {
  const dialog = $("opsProfileDialog");
  if (!dialog) return;

  const displayName = user?.name || "Servora User";
  const displayRole = user?.role || role || "technician";
  const displayEmail = user?.email || "user@servora.in";
  const displayPhone = user?.phone || "+91 98765 43210";
  const displayAddr = user?.address || "Not provided";

  if ($("opsProfileNameText")) $("opsProfileNameText").textContent = displayName;
  if ($("opsProfileRoleBadge")) $("opsProfileRoleBadge").textContent = displayRole.toUpperCase();
  if ($("opsProfileAvatar")) $("opsProfileAvatar").textContent = displayName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U";
  if ($("opsProfileEmailText")) $("opsProfileEmailText").textContent = displayEmail;
  if ($("opsProfilePhoneText")) $("opsProfilePhoneText").textContent = displayPhone;
  if ($("opsProfileAddressText")) $("opsProfileAddressText").textContent = displayAddr;

  if (user?.branch_name || user?.branch_id) {
    if ($("opsProfileBranchRow")) $("opsProfileBranchRow").classList.remove("hidden");
    if ($("opsProfileBranchText")) $("opsProfileBranchText").textContent = user?.branch_name || `Branch #${user?.branch_id}`;
  } else if ($("opsProfileBranchRow")) {
    $("opsProfileBranchRow").classList.add("hidden");
  }

  if ($("editOpsName")) $("editOpsName").value = displayName;
  if ($("editOpsPhone")) $("editOpsPhone").value = (displayPhone === "+91 98765 43210" && !user?.phone) ? "" : displayPhone;
  if ($("editOpsAddress")) $("editOpsAddress").value = user?.address || "";
  if ($("editOpsMessage")) $("editOpsMessage").textContent = "";

  if ($("opsProfileViewMode")) $("opsProfileViewMode").classList.remove("hidden");
  if ($("opsProfileEditForm")) $("opsProfileEditForm").classList.add("hidden");

  dialog.showModal();
};

// Mobile Sidebar Tap-outside Auto-Close
document.addEventListener("click", (e) => {
  const sidebar = $("opsNav")?.closest(".ops-sidebar");
  if (!sidebar || !sidebar.classList.contains("open")) return;
  if (!sidebar.contains(e.target) && !$("menuToggle")?.contains(e.target)) {
    sidebar.classList.remove("open");
  }
});

let isAppInitialized = false;
function initOpsApp() {
  if (isAppInitialized) return;
  isAppInitialized = true;

  if (dashboardRouteRole) role = dashboardRouteRole;
  else if (user?.role && roleConfig[user.role]) role = user.role;
  else if (document.body?.dataset?.role && roleConfig[document.body.dataset.role]) role = document.body.dataset.role;
  config = roleConfig[role] || roleConfig.company;

  document.title = `${config.title} — Servora`;
  if (document.body) document.body.dataset.role = role;
  if ($("crumbTitle")) $("crumbTitle").textContent = config.title;
  if ($("workspaceKicker")) $("workspaceKicker").textContent = config.kicker;
  if ($("tableTitle")) $("tableTitle").textContent = config.tableTitle;
  if ($("tableSubtitle")) $("tableSubtitle").textContent = config.tableSubtitle;
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = config.sideTitle;
  if ($("bottomTitle")) $("bottomTitle").textContent = config.bottomTitle;

  initEvents();
  setProfile();
  buildNav();
  setMetrics();
  renderRequests();
  renderInsights();
  renderResources();
  loadDashboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOpsApp);
} else {
  initOpsApp();
}
