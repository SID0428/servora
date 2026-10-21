import { API_BASE_URL } from "./config.js";

const dashboardRouteRole = Object.entries({
  admin: /(?:^|\/)admin-dashboard(?:\.html)?\/?$/i,
  company: /(?:^|\/)company-dashboard(?:\.html)?\/?$/i,
  franchise: /(?:^|\/)franchise-dashboard(?:\.html)?\/?$/i,
  technician: /(?:^|\/)technician-dashboard(?:\.html)?\/?$/i,
}).find(([, pattern]) => pattern.test(window.location.pathname))?.[0];

const portalLoginPaths = {
  admin: "./admin-login.html",
  company: "./company-login.html",
  franchise: "./franchise-login.html",
  technician: "./technician-login.html",
};

const roleDashboardPaths = {
  admin: "./admin-dashboard.html",
  company: "./company-dashboard.html",
  franchise: "./franchise-dashboard.html",
  branch: "./franchise-dashboard.html",
  technician: "./technician-dashboard.html",
  customer: "./customer-dashboard.html",
};

function roleMatches(userRole, routeRole) {
  if (!userRole || !routeRole) return true;
  if (userRole === routeRole) return true;
  if ((userRole === "branch" || userRole === "franchise") && (routeRole === "branch" || routeRole === "franchise")) return true;
  return false;
}

const targetRole = dashboardRouteRole || (typeof document !== "undefined" ? document.body?.dataset?.role : null) || "company";
const loginPath = portalLoginPaths[targetRole] || "./index.html";

function getStoredOpsUser(desiredRole) {
  try {
    const roleKey = (desiredRole === "branch" || desiredRole === "franchise") ? "franchise" : desiredRole;
    if (roleKey) {
      const specific = localStorage.getItem(`servora_user_${roleKey}`);
      if (specific) {
        const parsed = JSON.parse(specific);
        if (parsed && roleMatches(parsed.role, desiredRole)) return parsed;
      }
    }
    const generic = localStorage.getItem("servora_user");
    if (generic) {
      const parsed = JSON.parse(generic);
      if (parsed && roleMatches(parsed.role, desiredRole)) return parsed;
    }
  } catch (e) {}
  return null;
}

let initialUser = getStoredOpsUser(targetRole);

function checkInitialAuth() {
  if (!initialUser || !initialUser.role) {
    window.location.replace(loginPath);
    return false;
  }
  if (targetRole && !roleMatches(initialUser.role, targetRole)) {
    console.warn(`User role '${initialUser.role}' does not match target role '${targetRole}'. Redirecting to ${loginPath}.`);
    window.location.replace(loginPath);
    return false;
  }
  return true;
}

if (!checkInitialAuth()) {
  throw new Error(`Authentication required for ${targetRole} workspace.`);
}

let role = dashboardRouteRole || initialUser?.role || (typeof document !== "undefined" ? document.body?.dataset?.role : null) || "company";
const roleConfig = {
  technician: { title: "Technician workspace", kicker: "FIELD SERVICE", nav: ["My jobs", "Job history", "Route & schedule", "Earnings", "Help center"], columns: ["Ticket", "Customer", "Appliance", "Appointment", "Status", "Action"], tableTitle: "My assigned jobs", tableSubtitle: "Your service calls and the next step for each job.", bottomTitle: "Today's schedule", sideTitle: "My performance", resources: [["Assigned today", "Jobs on your schedule", "▤"], ["Completed", "Jobs closed this week", "✓"], ["Customer rating", "From recent service visits", "☆"], ["Service area", "Your assigned territory", "⌖"]] },
  franchise: { title: "Franchise workspace", kicker: "BRANCH OPERATIONS", nav: ["Dashboard", "Service requests", "Technicians", "Inventory & Spares", "Escalations", "Active jobs", "Customers", "Reports", "Settings"], columns: ["Request ID", "Customer", "Appliance", "Issue", "Technician", "Status", "Action"], tableTitle: "Incoming service requests", tableSubtitle: "Review requests and coordinate local service work.", bottomTitle: "Branch resources", sideTitle: "Branch performance", resources: [["Technicians", "Available in this branch", "♙"], ["Active jobs", "Assigned and in progress", "⚒"], ["Inventory items", "Parts in local warehouse", "📦"], ["Service area", "Local coverage", "⌖"]] },
  company: { title: "Company workspace", kicker: "COMPANY OPERATIONS", nav: ["Dashboard", "Branches", "Technicians", "Warranty Claims", "Spares Catalog", "Escalations", "Customers", "Service requests", "Reports", "Settings"], columns: ["Request ID", "Customer", "Company", "Appliance", "Status", "Date", "Action"], tableTitle: "Recent service requests", tableSubtitle: "Monitor service activity across the company network.", bottomTitle: "Network resources", sideTitle: "Network health", resources: [["Branches", "Locations in your network", "▥"], ["Warranty claims", "OEM reimbursement requests", "🛡️"], ["Technicians", "Field service professionals", "♙"], ["Customers", "Customers served", "♧"]] },
  admin: { title: "Platform overview", kicker: "SERVORA PLATFORM", nav: ["Overview", "Companies", "Branches", "Technicians", "Escalations", "Customers", "Service requests", "Reports", "System settings"], columns: ["Request ID", "Customer", "Company", "Appliance", "Status", "Date", "Action"], tableTitle: "Platform service activity", tableSubtitle: "A view of requests moving across Servora.", bottomTitle: "Platform directory", sideTitle: "Platform health", resources: [["Companies", "Service partners", "▥"], ["Branches", "Operational locations", "⌖"], ["Technicians", "Verified professionals", "♙"], ["Customers", "Registered accounts", "♧"]] },
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
let franchiseCustomers = [];
let franchiseInventory = [];
let companyWarrantyClaims = [];
let companySparesCatalog = [];
let user = initialUser;

try {
  requests = JSON.parse(localStorage.getItem(`servora_cache_requests_${role}`) || "[]");
  technicians = JSON.parse(localStorage.getItem("servora_cache_techs") || "[]");
  branches = JSON.parse(localStorage.getItem("servora_cache_branches") || "[]");
  companies = JSON.parse(localStorage.getItem("servora_cache_companies") || "[]");
  companyCustomers = JSON.parse(localStorage.getItem("servora_cache_customers") || "[]");
  franchiseCustomers = JSON.parse(localStorage.getItem("servora_cache_franchise_customers") || "[]");
  franchiseInventory = JSON.parse(localStorage.getItem("servora_cache_inventory") || "[]");
  companyWarrantyClaims = JSON.parse(localStorage.getItem("servora_cache_claims") || "[]");
  companySparesCatalog = JSON.parse(localStorage.getItem("servora_cache_catalog") || "[]");
} catch {}

const icons = { Dashboard: "⌂", Overview: "⌂", "My jobs": "▤", "Job history": "◷", "Route & schedule": "⌖", Earnings: "$", "Help center": "?", "Service requests": "▣", "Incoming service requests": "▣", Technicians: "♙", "Inventory & Spares": "📦", "Warranty Claims": "🛡️", "Spares Catalog": "🔧", Escalations: "🚨", "Active jobs": "⚒", Customers: "♧", Reports: "▥", Settings: "⚙", Companies: "▦", Branches: "⌖", "System settings": "⚙" };
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
  if (role === "company" && page === "Warranty Claims") { renderCompanyWarrantyClaims(); return; }
  if (role === "company" && page === "Spares Catalog") { renderCompanySparesCatalog(); return; }

  // Franchise routes
  if (role === "franchise" && page === "Technicians") { renderFranchiseTechnicians(); return; }
  if (role === "franchise" && page === "Customers") { renderFranchiseCustomers(); return; }
  if (role === "franchise" && page === "Inventory & Spares") { renderFranchiseInventory(); return; }

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
  if (page === "Escalations" || page === "SLA Escalations") {
    renderEscalationsView();
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

function compileFranchiseCustomersFromRequests() {
  const visibleReqs = requests.filter(requestForRole);
  const customerMap = new Map();
  visibleReqs.forEach((req) => {
    const key = (req.customer_id || req.customer_phone || req.customer_name || req.id || "").trim();
    if (!key) return;
    if (!customerMap.has(key)) {
      const addr = req.customer_address || "Address not provided";
      const addrParts = addr.split(",").map((p) => p.trim()).filter(Boolean);
      const shortLoc = addrParts.length >= 2 ? addrParts[addrParts.length - 2] : (addrParts[0] || "Location");
      const isWarranty = Boolean(req.is_under_warranty);
      const isOngoing = req.status !== "Completed" && req.status_badge !== "Completed";

      customerMap.set(key, {
        customer_id: req.customer_id || req.id,
        customer_name: req.customer_name || "Customer",
        customer_email: req.customer_email || "",
        customer_phone: req.customer_phone || "—",
        customer_address: addr,
        short_location: shortLoc,
        pincode: req.pincode || user?.pincode || "",
        avatar: (req.customer_name || "CU").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
        products: [
          {
            id: req.appliance_id || `app_${req.id}`,
            brand: req.brand || "Appliance",
            category: req.appliance_name || "Home Appliance",
            model_no: req.model_no || "—",
            serial_no: "Registered for service",
            warranty_status: isWarranty ? "Active" : "Standard",
            is_under_warranty: isWarranty,
            registered_on: req.appointment_date || req.created_at || "Recent"
          }
        ],
        active_warranties_count: isWarranty ? 1 : 0,
        ongoing_services_count: isOngoing ? 1 : 0,
        completed_services_count: isOngoing ? 0 : 1,
        total_services_count: 1,
        total_products_count: 1,
        products_summary: `${req.brand || ""} ${req.appliance_name || "Appliance"}`.trim(),
        warranty_status: isWarranty ? "Active (1)" : "Standard",
        brand: req.brand || "Appliance",
        category: req.appliance_name || "Appliance",
        model_no: req.model_no || "—",
        serial_no: "—"
      });
    } else {
      const existing = customerMap.get(key);
      existing.total_services_count += 1;
      const isOngoing = req.status !== "Completed" && req.status_badge !== "Completed";
      if (isOngoing) existing.ongoing_services_count += 1;
      else existing.completed_services_count += 1;
      if (req.is_under_warranty) existing.active_warranties_count += 1;

      const appName = `${req.brand || ""} ${req.appliance_name || ""}`.trim();
      if (appName && !existing.products_summary.includes(appName)) {
        existing.products_summary += `, ${appName}`;
        existing.total_products_count += 1;
        existing.products.push({
          id: req.appliance_id || `app_${req.id}`,
          brand: req.brand || "Appliance",
          category: req.appliance_name || "Home Appliance",
          model_no: req.model_no || "—",
          serial_no: "Registered for service",
          warranty_status: req.is_under_warranty ? "Active" : "Standard",
          is_under_warranty: Boolean(req.is_under_warranty),
          registered_on: req.appointment_date || req.created_at || "Recent"
        });
      }
    }
  });
  franchiseCustomers = Array.from(customerMap.values());
}

async function loadFranchiseCustomers() {
  try {
    franchiseCustomers = await franchiseApi("/customers");
    try { localStorage.setItem("servora_cache_franchise_customers", JSON.stringify(franchiseCustomers)); } catch {}
    renderFranchiseCustomers();
  } catch (error) {
    compileFranchiseCustomersFromRequests();
    renderFranchiseCustomers();
  }
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
  if ($("tableTitle")) $("tableTitle").textContent = "Registered customers & service history";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Customers, registered appliances, and service calls within your franchise service area.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Customer Directory";

  if (!franchiseCustomers || franchiseCustomers.length === 0) {
    compileFranchiseCustomersFromRequests();
  }

  if ($("healthContent")) $("healthContent").innerHTML = `<div class="section-empty"><strong>${franchiseCustomers.length}</strong> unique customer${franchiseCustomers.length === 1 ? "" : "s"} served by this branch.</div>`;
  if ($("activityContent")) $("activityContent").innerHTML = `<div class="section-empty">Click any customer or "View Details →" to inspect their registered appliances, warranty periods, and service records.</div>`;
  if ($("bottomTitle")) $("bottomTitle").textContent = "Branch customer directory";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Customer profiles, product warranties, and service records within your authorized PIN coverage.";

  if ($("requestHead")) $("requestHead").innerHTML = [
    "Customer",
    "Contact info",
    "Location",
    "Registered products",
    "Warranty",
    "Service activity",
    "Action"
  ].map((label) => `<th>${safe(label)}</th>`).join("");

  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  if ($("requestSearch")) $("requestSearch").placeholder = "Search customers, products, phone, or address";

  const filtered = franchiseCustomers.filter((item) =>
    [
      item.customer_name,
      item.customer_email,
      item.customer_phone,
      item.customer_address,
      item.products_summary,
      item.category,
      item.brand,
      item.model_no,
      item.serial_no,
      item.pincode
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
          const prodCount = item.total_products_count || (item.products ? item.products.length : 1);
          const activeWCount = item.active_warranties_count !== undefined ? item.active_warranties_count : (item.warranty_status === "Active" ? 1 : 0);
          const warrantyPill = activeWCount > 0
            ? `<span class="status-pill completed">Active (${activeWCount})</span>`
            : `<span class="status-pill pending">Standard</span>`;
          const servicePill = (item.ongoing_services_count || 0) > 0
            ? `<span class="status-pill in-progress">${item.ongoing_services_count} Ongoing</span>`
            : `<span class="text-xs text-slate-500 font-medium">${item.completed_services_count || 0} Resolved</span>`;

          return `
            <tr class="hover:bg-slate-50/80 cursor-pointer transition" data-customer-row="${safe(item.customer_id)}">
              <td>
                <div class="customer-cell flex items-center gap-3">
                  <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs flex-shrink-0">${initials}</span>
                  <span class="customer-name">
                    <button type="button" class="font-bold text-slate-900 hover:text-blue-600 text-left block text-sm" data-view-customer="${safe(item.customer_id)}">${safe(item.customer_name)}</button>
                    <small class="block text-slate-400 font-mono text-[10px]">ID: ${safe(item.customer_id)}</small>
                  </span>
                </div>
              </td>
              <td>
                <div class="text-xs font-semibold text-slate-800">📞 ${safe(item.customer_phone)}</div>
                ${item.customer_email ? `<small class="block text-slate-400 text-xs truncate max-w-[170px]" title="${safe(item.customer_email)}">✉️ ${safe(item.customer_email)}</small>` : `<small class="block text-slate-400 text-[10px]">Verified phone contact</small>`}
              </td>
              <td class="max-w-[180px]">
                <span class="block text-xs font-medium text-slate-700 truncate" title="${safe(item.customer_address)}">📍 ${safe(item.short_location || item.customer_address || "Location not set")}</span>
                <small class="block text-slate-400 text-[10px]">PIN: ${safe(item.pincode || "—")} · Territory</small>
              </td>
              <td>
                <div class="flex items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/70 whitespace-nowrap">${prodCount} Product${prodCount === 1 ? "" : "s"}</span>
                </div>
                <small class="block text-slate-500 font-medium truncate max-w-[160px] mt-0.5" title="${safe(item.products_summary || item.category || "")}">${safe(item.products_summary || item.category || "Appliance")}</small>
              </td>
              <td class="whitespace-nowrap">${warrantyPill}</td>
              <td class="whitespace-nowrap">${servicePill}</td>
              <td class="whitespace-nowrap text-right">
                <button type="button" class="table-action font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1" data-view-customer="${safe(item.customer_id)}">View Details →</button>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td class="empty-row" colspan="7">${query ? "No customers match your search." : "No customers found in this franchise service area yet."}</td></tr>`;

  $("requestCount").textContent = `${filtered.length} customer${filtered.length === 1 ? "" : "s"} shown`;
  $("resourceGrid").innerHTML = "";

  document.querySelectorAll("[data-view-customer]").forEach((button) =>
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      openCompanyCustomerDetail(button.dataset.viewCustomer);
    })
  );
  document.querySelectorAll("[data-customer-row]").forEach((row) =>
    row.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a")) return;
      openCompanyCustomerDetail(row.dataset.customerRow);
    })
  );
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
  if ($("requestHead")) $("requestHead").innerHTML = ["Branch", "Franchise owner or manager", "Email", "Mobile number", "Address", "Pincode", "Portal access", "Action"].map((name) => `<th>${safe(name)}</th>`).join("");
  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  const filtered = branches.filter((branch) => [branch.branch_name, branch.manager_name, branch.email, branch.mobile, branch.address, branch.pincode].join(" ").toLowerCase().includes(query));
  if ($("requestRows")) $("requestRows").innerHTML = filtered.length ? filtered.map((branch) => {
    const status = branch.password_set ? `Password set · ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(branch.password_set_at))}` : "Password not set";
    const access = branch.password_set ? `<span class="status-pill completed">Active</span>` : `<button class="table-action font-semibold text-amber-600" data-resend-franchise="${safe(branch.id)}">Resend setup link →</button>`;
    const action = `<button type="button" class="table-action font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1" data-view-branch="${safe(branch.id)}">View Details →</button>`;
    return `<tr class="hover:bg-slate-50/80 cursor-pointer" data-branch-row="${safe(branch.id)}">
      <td><button type="button" class="font-bold text-slate-900 hover:text-blue-600 text-left" data-view-branch="${safe(branch.id)}">${safe(branch.branch_name)}</button></td>
      <td>${safe(branch.manager_name)}<small class="company-password-state ${branch.password_set ? "is-set" : "is-pending"}">${safe(status)}</small></td>
      <td>${safe(branch.email)}</td>
      <td>${safe(branch.mobile)}</td>
      <td>${safe(branch.address)}<small class="block text-slate-400 font-mono">PIN: ${safe(branch.pincode)}</small></td>
      <td>${access}</td>
      <td>${action}</td>
    </tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="8">${query ? "No branches match your search." : "No branches yet. Add your first branch to get started."}</td></tr>`;
  if ($("requestCount")) $("requestCount").textContent = `${filtered.length} branch${filtered.length === 1 ? "" : "es"} shown`;
  if ($("resourceGrid")) $("resourceGrid").innerHTML = "";
  document.querySelectorAll("[data-resend-franchise]").forEach((button) => button.addEventListener("click", async (e) => {
    e.stopPropagation();
    const branch = branches.find((item) => item.id === button.dataset.resendFranchise);
    if (!branch) return;
    button.disabled = true; button.textContent = "Sending…";
    try { await companyApi("/branches/send-setup-link", { method: "POST", body: JSON.stringify({ branch_id: branch.id }) }); showToast(`Franchise setup link sent to ${branch.email}.`); }
    catch (error) { showToast(error.message, "error"); }
    finally { button.disabled = false; button.textContent = "Resend setup link →"; }
  }));
  document.querySelectorAll("[data-view-branch]").forEach((button) => button.addEventListener("click", (e) => {
    e.stopPropagation();
    openCompanyBranchDetail(button.dataset.viewBranch);
  }));
  document.querySelectorAll("[data-branch-row]").forEach((row) => row.addEventListener("click", (e) => {
    if (e.target.closest("button") || e.target.closest("a")) return;
    openCompanyBranchDetail(row.dataset.branchRow);
  }));
}

async function openCompanyBranchDetail(branchId) {
  const dialog = $("branchDetailModal");
  if (!dialog) return;

  switchBranchDetailTab("people");

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.hidden = false;
  }

  const existingBranch = branches.find((b) => b.id === branchId);
  if (existingBranch) {
    if ($("branchModalAvatar")) $("branchModalAvatar").textContent = (existingBranch.branch_name || "BR").slice(0, 2).toUpperCase();
    if ($("branchModalTitle")) $("branchModalTitle").textContent = existingBranch.branch_name || "Branch Details";
    if ($("branchModalManager")) $("branchModalManager").textContent = `👤 Manager: ${existingBranch.manager_name || "—"}`;
    if ($("branchModalEmail")) $("branchModalEmail").textContent = `✉️ ${existingBranch.email || "—"}`;
    if ($("branchModalMobile")) $("branchModalMobile").textContent = `📞 ${existingBranch.mobile || "—"}`;
    if ($("branchModalAddress")) $("branchModalAddress").textContent = `📍 ${existingBranch.address || "—"} (PIN: ${existingBranch.pincode || "—"})`;
    if ($("branchModalStatusBadge")) {
      $("branchModalStatusBadge").textContent = existingBranch.password_set ? "Active" : "Pending Setup";
      $("branchModalStatusBadge").className = `status-pill ${existingBranch.password_set ? "completed" : "pending"}`;
    }
  }

  if ($("branchPeopleList")) $("branchPeopleList").innerHTML = `<div class="p-8 text-center text-slate-400">Loading branch personnel...</div>`;
  if ($("branchStockRows")) $("branchStockRows").innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Loading stock inventory...</td></tr>`;
  if ($("branchLogisticsRows")) $("branchLogisticsRows").innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Loading logistics trail...</td></tr>`;
  if ($("branchOngoingRows")) $("branchOngoingRows").innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Loading ongoing requests...</td></tr>`;
  if ($("branchHistoryRows")) $("branchHistoryRows").innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Loading service history...</td></tr>`;

  try {
    const data = await companyApi(`/branches/${encodeURIComponent(branchId)}`);
    if (!data || !data.branch) throw new Error("Branch data not found");

    const b = data.branch;
    const s = data.stats || {};

    if ($("branchModalAvatar")) $("branchModalAvatar").textContent = b.avatar || (b.name || "BR").slice(0, 2).toUpperCase();
    if ($("branchModalTitle")) $("branchModalTitle").textContent = b.name;
    if ($("branchModalStatusBadge")) {
      $("branchModalStatusBadge").textContent = b.status || "Active";
      $("branchModalStatusBadge").className = `status-pill ${b.status === "Active" ? "completed" : "pending"}`;
    }
    if ($("branchModalManager")) $("branchModalManager").textContent = `👤 Manager: ${b.manager_name || "—"}`;
    if ($("branchModalEmail")) $("branchModalEmail").textContent = `✉️ ${b.email || "—"}`;
    if ($("branchModalMobile")) $("branchModalMobile").textContent = `📞 ${b.mobile || "—"}`;
    if ($("branchModalAddress")) $("branchModalAddress").textContent = `📍 ${b.address || "—"} (PIN: ${b.pincode || "—"})`;

    if ($("branchStatStaff")) $("branchStatStaff").textContent = s.total_people || 0;
    if ($("branchStatTechs")) $("branchStatTechs").textContent = s.total_technicians || 0;
    if ($("branchStatStockItems")) $("branchStatStockItems").textContent = s.total_stock_items || 0;
    if ($("branchStatLowStock")) $("branchStatLowStock").textContent = `${s.low_stock_count || 0} low stock`;
    if ($("branchStatStockQty")) $("branchStatStockQty").textContent = `${s.total_stock_quantity || 0} units`;
    if ($("branchStatStockVal")) $("branchStatStockVal").textContent = `₹${Number(s.total_stock_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    if ($("branchStatOngoing")) $("branchStatOngoing").textContent = s.ongoing_services || 0;
    if ($("branchStatCompleted")) $("branchStatCompleted").textContent = s.completed_services || 0;

    if ($("tabCountPeople")) $("tabCountPeople").textContent = (data.people || []).length;
    if ($("tabCountStock")) $("tabCountStock").textContent = (data.inventory || []).length;
    if ($("tabCountLogistics")) $("tabCountLogistics").textContent = (data.stock_movements || []).length;
    if ($("tabCountOngoing")) $("tabCountOngoing").textContent = (data.ongoing_services || []).length;
    if ($("tabCountHistory")) $("tabCountHistory").textContent = (data.completed_services || []).length;

    renderBranchPeople(data.people || []);
    renderBranchStock(data.inventory || []);
    renderBranchLogistics(data.stock_movements || []);
    renderBranchOngoing(data.ongoing_services || []);
    renderBranchHistory(data.completed_services || []);
  } catch (err) {
    showToast(extractErrorMessage(err.message, "Failed to load branch details"), "error");
  }
}
window.openCompanyBranchDetail = openCompanyBranchDetail;

function renderBranchPeople(people) {
  const container = $("branchPeopleList");
  if (!container) return;
  if (!people || people.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl">No personnel registered for this branch yet.</div>`;
    return;
  }

  container.innerHTML = people.map((p) => {
    const isManager = p.role === "manager" || p.role === "branch";
    const roleBadge = isManager
      ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 uppercase tracking-wider">Franchise Lead</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 uppercase tracking-wider">Field Engineer</span>`;

    const perfStats = isManager ? `
      <div class="flex items-center gap-3 text-xs text-slate-500">
        <span>🏢 <strong>${safe(p.department)}</strong></span>
        <span>📍 PIN: <strong>${safe(p.pincode)}</strong></span>
      </div>
    ` : `
      <div class="flex items-center gap-4 text-xs text-slate-600">
        <span class="flex items-center gap-1 font-bold text-amber-600">⭐ ${p.rating || "4.9"} rating</span>
        <span class="text-slate-500">💼 <strong>${p.total_jobs || 0}</strong> jobs done</span>
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">${safe(p.status || "Active")}</span>
      </div>
    `;

    return `
      <div class="p-4 rounded-2xl bg-white border border-slate-200 hover:border-blue-200 transition shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="flex items-start gap-3.5">
          <div class="w-11 h-11 rounded-2xl ${isManager ? "bg-purple-600" : "bg-blue-600"} text-white font-bold flex items-center justify-center text-sm shadow-xs flex-shrink-0">
            ${safe(p.avatar || p.name.slice(0, 2).toUpperCase())}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <strong class="text-sm font-bold text-slate-900">${safe(p.name)}</strong>
              ${roleBadge}
            </div>
            <p class="text-xs font-semibold text-slate-600 mt-0.5">${safe(p.designation)}</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
              <span>✉️ ${safe(p.email)}</span>
              <span>📞 ${safe(p.phone)}</span>
              ${p.address ? `<span>📍 ${safe(p.address)}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="flex-shrink-0 self-start md:self-center">
          ${perfStats}
        </div>
      </div>
    `;
  }).join("");
}

function renderBranchStock(items) {
  const tbody = $("branchStockRows");
  if (!tbody) return;
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No warehouse stock items found for this branch.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((item) => {
    const statusBadge = item.is_low_stock
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">⚠️ Low Stock</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">In Stock</span>`;

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-3">
          <strong class="text-slate-900 font-semibold block">${safe(item.name)}</strong>
          <small class="text-slate-400 font-mono block">${safe(item.part_code)} · ${safe(item.brand)}</small>
        </td>
        <td class="p-3 text-slate-600">${safe(item.category || "General")}</td>
        <td class="p-3 font-mono text-slate-500">${safe(item.hsn_code || "841890")}</td>
        <td class="p-3 text-right font-mono font-bold text-slate-800">₹${Number(item.unit_price).toFixed(2)}</td>
        <td class="p-3 text-center">
          <strong class="text-sm font-bold ${item.is_low_stock ? "text-rose-600" : "text-slate-900"}">${item.quantity_available}</strong>
        </td>
        <td class="p-3 text-center text-slate-500 font-mono">${item.reorder_level}</td>
        <td class="p-3">${statusBadge}</td>
      </tr>
    `;
  }).join("");
}

function renderBranchLogistics(movements) {
  const tbody = $("branchLogisticsRows");
  if (!tbody) return;
  if (!movements || movements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No logistics transactions recorded for this branch yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = movements.map((m) => {
    const isStockIn = m.movement_type === "STOCK_IN" || (m.transaction_type || "").toLowerCase() === "stock_in" || (m.transaction_type || "").toLowerCase() === "restock";
    let typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 whitespace-nowrap">📤 STOCK OUT (Dispatched)</span>`;
    if (isStockIn) {
      typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">📥 STOCK IN (Received)</span>`;
    } else if ((m.transaction_type || "").toLowerCase() === "job_consumption") {
      typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">🛠️ Job Card Usage (Out)</span>`;
    }
    const qtySign = isStockIn ? `+${m.quantity}` : `-${m.quantity}`;
    const qtyClass = isStockIn ? "text-emerald-700" : "text-slate-800";

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-3 text-slate-600 font-medium whitespace-nowrap">${safe(m.timestamp)}</td>
        <td class="p-3 whitespace-nowrap">${typeBadge}</td>
        <td class="p-3">
          <strong class="text-slate-900 font-semibold block">${safe(m.part_name)}</strong>
          <small class="text-slate-400 font-mono block">${safe(m.part_code)}</small>
        </td>
        <td class="p-3 text-center">
          <strong class="font-mono text-sm font-bold ${qtyClass}">${qtySign}</strong>
        </td>
        <td class="p-3 font-mono font-semibold text-slate-700 whitespace-nowrap">${safe(m.reference_id)}</td>
        <td class="p-3 text-slate-600 font-medium whitespace-nowrap">${safe(m.performed_by)}</td>
        <td class="p-3 text-slate-500 max-w-xs truncate" title="${safe(m.notes)}">${safe(m.notes || "—")}</td>
      </tr>
    `;
  }).join("");
}

function renderBranchOngoing(requests) {
  const tbody = $("branchOngoingRows");
  if (!tbody) return;
  if (!requests || requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No ongoing service requests in progress for this branch.</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map((r) => {
    const warrantyPill = r.is_under_warranty
      ? `<span class="ml-1.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800">Warranty</span>`
      : "";

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-3 font-mono font-bold text-blue-600 whitespace-nowrap">${safe(r.id)}</td>
        <td class="p-3">
          <strong class="text-slate-900 font-semibold block">${safe(r.customer_name)}</strong>
          <small class="text-slate-400 block">${safe(r.customer_phone)} · PIN: ${safe(r.pincode)}</small>
        </td>
        <td class="p-3">
          <strong class="text-slate-900 font-semibold flex items-center">${safe(r.appliance_name)}${warrantyPill}</strong>
          <small class="text-slate-500 block">${safe(r.issue)}</small>
        </td>
        <td class="p-3 text-slate-700 font-medium whitespace-nowrap">${safe(r.technician_name)}</td>
        <td class="p-3 text-slate-600 whitespace-nowrap">${safe(r.appointment_date)} · ${safe(r.appointment_slot)}</td>
        <td class="p-3 whitespace-nowrap"><span class="status-pill in-progress">${safe(r.status)}</span></td>
        <td class="p-3 text-right whitespace-nowrap">
          <button type="button" class="table-action font-bold text-blue-600 hover:text-blue-800" onclick="viewRequestDetails('${safe(r.id)}')">View Ticket →</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderBranchHistory(requests) {
  const tbody = $("branchHistoryRows");
  if (!tbody) return;
  if (!requests || requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No completed service requests found for this branch.</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map((r) => {
    const payBadge = r.payment_status === "Paid"
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Paid</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${safe(r.payment_status || "Pending")}</span>`;

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-3 font-mono font-bold text-blue-600 whitespace-nowrap">${safe(r.id)}</td>
        <td class="p-3">
          <strong class="text-slate-900 font-semibold block">${safe(r.customer_name)}</strong>
          <small class="text-slate-400 block truncate max-w-xs">${safe(r.customer_address)}</small>
        </td>
        <td class="p-3">
          <strong class="text-slate-900 font-semibold block">${safe(r.appliance_name)}</strong>
          <small class="text-slate-500 block">${safe(r.issue)}</small>
        </td>
        <td class="p-3 text-slate-700 font-medium whitespace-nowrap">${safe(r.technician_name)}</td>
        <td class="p-3 whitespace-nowrap">${payBadge}</td>
        <td class="p-3 text-slate-600 whitespace-nowrap">${safe(r.appointment_date || r.created_at)}</td>
        <td class="p-3 text-right whitespace-nowrap">
          <button type="button" class="table-action font-bold text-blue-600 hover:text-blue-800" onclick="viewRequestDetails('${safe(r.id)}')">View Ticket →</button>
        </td>
      </tr>
    `;
  }).join("");
}

function switchBranchDetailTab(targetTab) {
  const buttons = document.querySelectorAll(".branch-tab-btn");
  const panels = document.querySelectorAll(".branch-tab-panel");

  buttons.forEach((btn) => {
    if (btn.dataset.branchTab === targetTab) {
      btn.classList.add("border-blue-600", "text-blue-600");
      btn.classList.remove("border-transparent", "text-slate-500");
    } else {
      btn.classList.remove("border-blue-600", "text-blue-600");
      btn.classList.add("border-transparent", "text-slate-500");
    }
  });

  panels.forEach((p) => {
    p.classList.add("hidden");
  });

  const activePanelId = {
    people: "branchTabPeople",
    stock: "branchTabStock",
    logistics: "branchTabLogistics",
    ongoing: "branchTabOngoing",
    history: "branchTabHistory"
  }[targetTab] || "branchTabPeople";

  const activePanel = $(activePanelId);
  if (activePanel) activePanel.classList.remove("hidden");
}

function initBranchDetailModalEvents() {
  const modal = $("branchDetailModal");
  if (!modal) return;

  $("closeBranchDetailModalBtn")?.addEventListener("click", () => {
    if (typeof modal.close === "function") modal.close();
    else modal.hidden = true;
  });

  $("closeBranchDetailModalFooterBtn")?.addEventListener("click", () => {
    if (typeof modal.close === "function") modal.close();
    else modal.hidden = true;
  });

  document.querySelectorAll(".branch-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.branchTab;
      if (target) switchBranchDetailTab(target);
    });
  });
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
  if ($("requestHead")) $("requestHead").innerHTML = ["Technician", "Title or specialty", "Email", "Mobile number", "Address", "Pincode", "Portal access", "Actions"].map((label) => `<th>${safe(label)}</th>`).join("");
  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  const filtered = technicians.filter((technician) => [technician.name, technician.title, technician.email, technician.mobile, technician.address, technician.pincode].join(" ").toLowerCase().includes(query));
  if ($("requestRows")) $("requestRows").innerHTML = filtered.length ? filtered.map((technician) => {
    const date = technician.password_set_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(technician.password_set_at)) : "";
    const status = technician.password_set ? `Password set · ${date}` : "Password not set";
    const access = technician.password_set ? `<span class="status-pill completed">Active</span>` : `<button class="table-action" data-resend-technician="${safe(technician.id)}">Resend setup link →</button>`;
    const actions = `<button class="table-action font-semibold text-blue-600 hover:text-blue-800" data-edit-technician="${safe(technician.id)}">✏️ Edit Details</button>`;
    return `<tr><td><strong>${safe(technician.name)}</strong><small class="company-password-state ${technician.password_set ? "is-set" : "is-pending"}">${safe(status)}</small></td><td>${safe(technician.title)}</td><td>${safe(technician.email)}</td><td>${safe(technician.mobile)}</td><td>${safe(technician.address)}</td><td>${safe(technician.pincode)}</td><td>${access}</td><td>${actions}</td></tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="8">${query ? "No technicians match your search." : "No technicians yet. Add your first technician to get started."}</td></tr>`;
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
  document.querySelectorAll("[data-edit-technician]").forEach((button) => button.addEventListener("click", () => {
    const technician = technicians.find((item) => item.id === button.dataset.editTechnician);
    if (!technician) return;
    if ($("editTechId")) $("editTechId").value = technician.id;
    if ($("editTechName")) $("editTechName").value = technician.name || "";
    if ($("editTechTitle")) $("editTechTitle").value = technician.title || "";
    if ($("editTechEmail")) $("editTechEmail").value = technician.email || "";
    if ($("editTechMobile")) $("editTechMobile").value = technician.mobile || "";
    if ($("editTechAddress")) $("editTechAddress").value = technician.address || "";
    if ($("editTechPincode")) $("editTechPincode").value = technician.pincode || "";
    if ($("editTechnicianFormMessage")) $("editTechnicianFormMessage").textContent = "";
    $("editTechnicianDialog")?.showModal();
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
async function generalApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, credentials: "include", headers: jsonHeaders(options.headers) });
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
  if ($("healthContent")) $("healthContent").innerHTML = `<div class="section-empty"><strong>${companyCustomers.length}</strong> registered customers under your brand</div>`;
  if ($("activityContent")) $("activityContent").innerHTML = `<div class="section-empty">Click any customer to inspect their registered appliances, warranty periods, and service records.</div>`;
  if ($("bottomTitle")) $("bottomTitle").textContent = "Customer directory";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Customers with products under your warranty and service coverage.";

  if ($("requestHead")) $("requestHead").innerHTML = [
    "Customer",
    "Contact info",
    "Location",
    "Registered products",
    "Warranty",
    "Service activity",
    "Action"
  ].map((label) => `<th>${safe(label)}</th>`).join("");

  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  if ($("requestSearch")) $("requestSearch").placeholder = "Search customers, products, or phone";

  const filtered = companyCustomers.filter((item) =>
    [
      item.customer_name,
      item.customer_email,
      item.customer_phone,
      item.customer_address,
      item.products_summary,
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
          const prodCount = item.total_products_count || (item.products ? item.products.length : 1);
          const activeWCount = item.active_warranties_count !== undefined ? item.active_warranties_count : (item.warranty_status === "Active" ? 1 : 0);
          const warrantyPill = activeWCount > 0
            ? `<span class="status-pill completed">Active (${activeWCount})</span>`
            : `<span class="status-pill pending">Expired</span>`;
          const servicePill = (item.ongoing_services_count || 0) > 0
            ? `<span class="status-pill in-progress">${item.ongoing_services_count} Ongoing</span>`
            : `<span class="text-xs text-slate-500 font-medium">${item.completed_services_count || 0} Resolved</span>`;

          return `
            <tr class="hover:bg-slate-50/80 cursor-pointer transition" data-customer-row="${safe(item.customer_id)}">
              <td>
                <div class="customer-cell flex items-center gap-3">
                  <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs flex-shrink-0">${initials}</span>
                  <span class="customer-name">
                    <button type="button" class="font-bold text-slate-900 hover:text-blue-600 text-left block text-sm" data-view-customer="${safe(item.customer_id)}">${safe(item.customer_name)}</button>
                    <small class="block text-slate-400 font-mono text-[10px]">ID: ${safe(item.customer_id)}</small>
                  </span>
                </div>
              </td>
              <td>
                <div class="text-xs font-semibold text-slate-800">📞 ${safe(item.customer_phone)}</div>
                <small class="block text-slate-400 text-xs truncate max-w-[170px]" title="${safe(item.customer_email)}">✉️ ${safe(item.customer_email)}</small>
              </td>
              <td class="max-w-[180px]">
                <span class="block text-xs font-medium text-slate-700 truncate" title="${safe(item.customer_address)}">📍 ${safe(item.short_location || item.customer_address || "Location not set")}</span>
                <small class="block text-slate-400 text-[10px]">Coverage Area</small>
              </td>
              <td>
                <div class="flex items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/70 whitespace-nowrap">${prodCount} Product${prodCount === 1 ? "" : "s"}</span>
                </div>
                <small class="block text-slate-500 font-medium truncate max-w-[160px] mt-0.5" title="${safe(item.products_summary || item.category || "")}">${safe(item.products_summary || item.category || "Appliance")}</small>
              </td>
              <td class="whitespace-nowrap">${warrantyPill}</td>
              <td class="whitespace-nowrap">${servicePill}</td>
              <td class="whitespace-nowrap text-right">
                <button type="button" class="table-action font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1" data-view-customer="${safe(item.customer_id)}">View Details →</button>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td class="empty-row" colspan="7">${
        query
          ? "No customers match your search."
          : "No customer products registered yet. When customers add appliances under your brand, they will appear here automatically."
      }</td></tr>`;

  $("requestCount").textContent = `${filtered.length} customer${
    filtered.length === 1 ? "" : "s"
  } shown`;
  $("resourceGrid").innerHTML = "";

  document.querySelectorAll("[data-view-customer]").forEach((button) =>
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      openCompanyCustomerDetail(button.dataset.viewCustomer);
    })
  );
  document.querySelectorAll("[data-customer-row]").forEach((row) =>
    row.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a")) return;
      openCompanyCustomerDetail(row.dataset.customerRow);
    })
  );
}

async function openCompanyCustomerDetail(customerId) {
  const dialog = $("customerDetailModal");
  if (!dialog) return;

  switchCustomerDetailTab("products");

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.hidden = false;
  }

  const existing = (role === "franchise" ? franchiseCustomers : companyCustomers).find(
    (c) => c.customer_id === customerId || c.id === customerId
  );
  if (existing) {
    if ($("custModalAvatar")) $("custModalAvatar").textContent = safe(existing.avatar || (existing.customer_name || "CU").slice(0, 2).toUpperCase());
    if ($("custModalName")) $("custModalName").textContent = existing.customer_name || "Customer";
    if ($("custModalId")) $("custModalId").textContent = `ID: ${existing.customer_id || existing.id}`;
    if ($("custModalPhone")) $("custModalPhone").textContent = `📞 ${existing.customer_phone || "—"}`;
    if ($("custModalEmail")) $("custModalEmail").textContent = existing.customer_email ? `✉️ ${existing.customer_email}` : "✉️ No email registered";
    if ($("custModalAddress")) $("custModalAddress").textContent = `📍 ${existing.customer_address || "—"}`;
  }

  if ($("custProductsList")) $("custProductsList").innerHTML = `<div class="p-8 text-center text-slate-400">Loading registered products & warranty details...</div>`;
  if ($("custOngoingRows")) $("custOngoingRows").innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">Loading ongoing services...</td></tr>`;
  if ($("custHistoryRows")) $("custHistoryRows").innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">Loading service history...</td></tr>`;

  try {
    const data = role === "franchise"
      ? await franchiseApi(`/customers/${encodeURIComponent(customerId)}`)
      : await companyApi(`/customers/${encodeURIComponent(customerId)}`);
    if (!data || !data.customer) throw new Error("Customer details not found");

    const c = data.customer;
    const s = data.stats || {};

    if ($("custModalAvatar")) $("custModalAvatar").textContent = safe(c.avatar || (c.name || "CU").slice(0, 2).toUpperCase());
    if ($("custModalName")) $("custModalName").textContent = c.name;
    if ($("custModalId")) $("custModalId").textContent = `ID: ${c.id}`;
    if ($("custModalPhone")) $("custModalPhone").textContent = `📞 ${c.phone || "—"}`;
    if ($("custModalEmail")) $("custModalEmail").textContent = c.email ? `✉️ ${c.email}` : "✉️ No email registered";
    if ($("custModalAddress")) $("custModalAddress").textContent = `📍 ${c.address || "—"}`;

    if ($("custStatProducts")) $("custStatProducts").textContent = s.total_products || 0;
    if ($("custStatWarranties")) $("custStatWarranties").textContent = s.active_warranties || 0;
    if ($("custStatOngoing")) $("custStatOngoing").textContent = s.ongoing_services || 0;
    if ($("custStatHistory")) $("custStatHistory").textContent = s.completed_services || 0;

    if ($("tabCountCustProducts")) $("tabCountCustProducts").textContent = (data.products || []).length;
    if ($("tabCountCustOngoing")) $("tabCountCustOngoing").textContent = (data.ongoing_services || []).length;
    if ($("tabCountCustHistory")) $("tabCountCustHistory").textContent = (data.completed_services || []).length;

    renderCustomerProducts(data.products || []);
    renderCustomerOngoing(data.ongoing_services || []);
    renderCustomerHistory(data.completed_services || []);
  } catch (err) {
    if (existing && requests && requests.length) {
      const custReqs = requests.filter((r) =>
        (r.customer_id && (r.customer_id === customerId || r.customer_id === existing.customer_id)) ||
        (r.customer_phone && r.customer_phone === existing.customer_phone) ||
        (r.customer_name && r.customer_name === existing.customer_name)
      );
      const ongoing = custReqs.filter((r) => r.status !== "Completed" && r.status_badge !== "Completed");
      const completed = custReqs.filter((r) => r.status === "Completed" || r.status_badge === "Completed");
      const prods = existing.products && existing.products.length ? existing.products : custReqs.map((r) => ({
        id: r.appliance_id || `app_${r.id}`,
        category: r.appliance_name || "Appliance",
        brand: r.brand || "Brand",
        model_no: r.model_no || "—",
        serial_no: "Registered for service",
        warranty_status: r.is_under_warranty ? "Active" : "Standard",
        is_under_warranty: Boolean(r.is_under_warranty),
        registered_on: r.appointment_date || r.created_at || "Recent"
      }));

      if ($("custStatProducts")) $("custStatProducts").textContent = prods.length;
      if ($("custStatWarranties")) $("custStatWarranties").textContent = prods.filter((p) => p.is_under_warranty).length;
      if ($("custStatOngoing")) $("custStatOngoing").textContent = ongoing.length;
      if ($("custStatHistory")) $("custStatHistory").textContent = completed.length;

      if ($("tabCountCustProducts")) $("tabCountCustProducts").textContent = prods.length;
      if ($("tabCountCustOngoing")) $("tabCountCustOngoing").textContent = ongoing.length;
      if ($("tabCountCustHistory")) $("tabCountCustHistory").textContent = completed.length;

      renderCustomerProducts(prods);
      renderCustomerOngoing(ongoing.map((r) => ({
        id: r.id,
        appliance_name: r.appliance_name,
        issue: r.issue,
        branch_name: user?.branch_name || "Your Branch",
        technician_name: r.technician?.name || "Unassigned",
        appointment_date: r.appointment_date,
        appointment_slot: r.appointment_slot,
        status: r.status,
        is_under_warranty: Boolean(r.is_under_warranty)
      })));
      renderCustomerHistory(completed.map((r) => ({
        id: r.id,
        appliance_name: r.appliance_name,
        issue: r.issue,
        technician_name: r.technician?.name || "Service Technician",
        branch_name: user?.branch_name || "Your Branch",
        payment_status: r.payment_status || "Completed",
        total_amount: r.job_card?.total_amount || 0,
        appointment_date: r.appointment_date || r.created_at
      })));
    } else {
      showToast(extractErrorMessage(err.message, "Failed to load customer details"), "error");
    }
  }
}
window.openCompanyCustomerDetail = openCompanyCustomerDetail;
window.openCustomerDetail = openCompanyCustomerDetail;

function renderCustomerProducts(products) {
  const container = $("custProductsList");
  if (!container) return;
  if (!products || products.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl">No appliances registered by this customer under your brand.</div>`;
    return;
  }

  container.innerHTML = products.map((p) => {
    const isUnderW = p.is_under_warranty;
    const warrantyBadge = isUnderW
      ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">✓ Active Warranty</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">⚠️ Warranty Expired</span>`;

    const amcBadge = p.amc_active
      ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">🛡️ AMC Active: ${safe(p.amc_plan_name)} (Exp: ${safe(p.amc_end_date)})</span>`
      : `<span class="text-xs text-slate-400 font-medium">Standard OEM Coverage</span>`;

    return `
      <div class="p-4 rounded-2xl bg-white border border-slate-200 hover:border-blue-200 transition shadow-xs space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 font-bold flex items-center justify-center text-lg flex-shrink-0">
              ⚡
            </div>
            <div>
              <h5 class="text-sm font-bold text-slate-900">${safe(p.brand)} ${safe(p.category)}</h5>
              <p class="text-xs text-slate-500">Registered on <span class="font-medium text-slate-700">${safe(p.registered_on)}</span></p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${warrantyBadge}
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Model Number</span>
            <strong class="font-mono text-slate-800 font-semibold block mt-0.5 truncate" title="${safe(p.model_no)}">${safe(p.model_no)}</strong>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Serial Number</span>
            <strong class="font-mono text-slate-800 font-semibold block mt-0.5 truncate" title="${safe(p.serial_no)}">${safe(p.serial_no)}</strong>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Warranty Period</span>
            <span class="text-slate-700 font-medium block mt-0.5 text-[11px]">${safe(p.warranty_start_date)} → ${safe(p.warranty_end_date || "Ongoing")}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">AMC Subscription</span>
            <div class="mt-0.5">${amcBadge}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderCustomerOngoing(requests) {
  const tbody = $("custOngoingRows");
  if (!tbody) return;
  if (!requests || requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No active service requests in progress for this customer.</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map((r) => {
    const warrantyPill = r.is_under_warranty
      ? `<span class="ml-1.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800">Warranty</span>`
      : "";

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-3 font-mono font-bold text-blue-600 whitespace-nowrap">${safe(r.id)}</td>
        <td class="p-3">
          <strong class="text-slate-900 font-semibold flex items-center">${safe(r.appliance_name)}${warrantyPill}</strong>
          <small class="text-slate-500 block truncate max-w-xs">${safe(r.issue)}</small>
        </td>
        <td class="p-3">
          <span class="text-slate-800 font-medium block">${safe(r.branch_name)}</span>
          <small class="text-slate-400 block">Tech: ${safe(r.technician_name)}</small>
        </td>
        <td class="p-3 text-slate-600 whitespace-nowrap">${safe(r.appointment_date)} · ${safe(r.appointment_slot)}</td>
        <td class="p-3 whitespace-nowrap"><span class="status-pill in-progress">${safe(r.status)}</span></td>
        <td class="p-3 text-right whitespace-nowrap">
          <button type="button" class="table-action font-bold text-blue-600 hover:text-blue-800" onclick="viewRequestDetails('${safe(r.id)}')">View Ticket →</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderCustomerHistory(requests) {
  const tbody = $("custHistoryRows");
  if (!tbody) return;
  if (!requests || requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No completed service records found for this customer.</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map((r) => {
    const payBadge = r.payment_status === "Paid"
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Paid (₹${Number(r.total_amount || 0).toFixed(2)})</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${safe(r.payment_status || "Pending")}</span>`;

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-3 font-mono font-bold text-blue-600 whitespace-nowrap">${safe(r.id)}</td>
        <td class="p-3">
          <strong class="text-slate-900 font-semibold block">${safe(r.appliance_name)}</strong>
          <small class="text-slate-500 block truncate max-w-xs">${safe(r.issue)}</small>
        </td>
        <td class="p-3">
          <span class="text-slate-800 font-medium block">${safe(r.technician_name)}</span>
          <small class="text-slate-400 block">${safe(r.branch_name)}</small>
        </td>
        <td class="p-3 whitespace-nowrap">${payBadge}</td>
        <td class="p-3 text-slate-600 whitespace-nowrap">${safe(r.appointment_date || r.created_at)}</td>
        <td class="p-3 text-right whitespace-nowrap">
          <button type="button" class="table-action font-bold text-blue-600 hover:text-blue-800" onclick="viewRequestDetails('${safe(r.id)}')">View Ticket →</button>
        </td>
      </tr>
    `;
  }).join("");
}

function switchCustomerDetailTab(targetTab) {
  const buttons = document.querySelectorAll(".cust-tab-btn");
  const panels = document.querySelectorAll(".cust-tab-panel");

  buttons.forEach((btn) => {
    if (btn.dataset.custTab === targetTab) {
      btn.classList.add("border-blue-600", "text-blue-600");
      btn.classList.remove("border-transparent", "text-slate-500");
    } else {
      btn.classList.remove("border-blue-600", "text-blue-600");
      btn.classList.add("border-transparent", "text-slate-500");
    }
  });

  panels.forEach((p) => {
    p.classList.add("hidden");
  });

  const activePanelId = {
    products: "custTabProducts",
    ongoing: "custTabOngoing",
    history: "custTabHistory"
  }[targetTab] || "custTabProducts";

  const activePanel = $(activePanelId);
  if (activePanel) activePanel.classList.remove("hidden");
}

function initCustomerDetailModalEvents() {
  const modal = $("customerDetailModal");
  if (!modal) return;

  $("closeCustDetailModalBtn")?.addEventListener("click", () => {
    if (typeof modal.close === "function") modal.close();
    else modal.hidden = true;
  });

  $("closeCustDetailModalFooterBtn")?.addEventListener("click", () => {
    if (typeof modal.close === "function") modal.close();
    else modal.hidden = true;
  });

  document.querySelectorAll(".cust-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.custTab;
      if (target) switchCustomerDetailTab(target);
    });
  });
}

// ==========================================
// Phase 2: Franchise Warehouse & Spares Inventory
// ==========================================
async function loadFranchiseInventory() {
  try {
    const branchId = user?.branch_id || user?.id || "me";
    franchiseInventory = await generalApi(`/api/inventory/branch/${encodeURIComponent(branchId)}`);
    try { localStorage.setItem("servora_cache_inventory", JSON.stringify(franchiseInventory)); } catch {}
    renderFranchiseInventory();
  } catch (error) {
    franchiseInventory = [];
    renderFranchiseInventory();
    if ($("requestRows")) {
      $("requestRows").innerHTML = `<tr><td class="empty-row" colspan="7">${safe(error.message)}. Check your connection and try again.</td></tr>`;
    }
    if ($("requestCount")) $("requestCount").textContent = "Could not load warehouse inventory";
    showToast(`Inventory could not load: ${error.message}`, "error");
  }
}

function renderFranchiseInventory() {
  if ($("crumbTitle")) $("crumbTitle").textContent = "Inventory & Spares";
  setHidden("addCompanyButton", true);
  setHidden("addBranchButton", true);
  setHidden("addTechnicianButton", true);
  setHidden("companyInlineAdd", true);
  setHidden("exportButton", false);
  setHidden("pageContent", false);
  setHidden("metricGrid", true);

  if ($("tableTitle")) $("tableTitle").textContent = "Franchise warehouse inventory";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Track spare parts, current stock on hand, and record incoming OEM shipments.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Warehouse status";

  const lowStockItems = franchiseInventory.filter((item) => item.is_low_stock || item.quantity_available <= item.reorder_level);
  if ($("healthContent")) {
    $("healthContent").innerHTML = `
      <div class="space-y-2.5">
        <div class="p-3 bg-white rounded-xl border border-slate-100 flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium">Catalog parts tracked:</span>
          <strong class="text-sm font-bold text-slate-800">${franchiseInventory.length}</strong>
        </div>
        <div class="p-3 ${lowStockItems.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} rounded-xl border flex items-center justify-between">
          <span class="text-xs ${lowStockItems.length > 0 ? 'text-amber-800' : 'text-emerald-800'} font-semibold">Low stock warnings:</span>
          <strong class="text-sm font-bold ${lowStockItems.length > 0 ? 'text-amber-700' : 'text-emerald-700'}">${lowStockItems.length} item${lowStockItems.length === 1 ? '' : 's'}</strong>
        </div>
      </div>
    `;
  }
  if ($("activityContent")) {
    $("activityContent").innerHTML = `<div class="section-empty text-xs leading-relaxed">Automatic inventory deduction is performed whenever a digital job card is closed with replaced spare parts.</div>`;
  }
  if ($("bottomTitle")) $("bottomTitle").textContent = "Inventory logistics";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Replenish stock directly from authorized OEM parts distribution.";

  if ($("requestHead")) {
    $("requestHead").innerHTML = [
      "Part name & code",
      "Brand / Category",
      "HSN code",
      "Unit price (₹)",
      "Stock on hand",
      "Status",
      "Logistics action"
    ].map((label) => `<th>${safe(label)}</th>`).join("");
  }

  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  if ($("requestSearch")) $("requestSearch").placeholder = "Search parts by name, code, brand, or HSN";

  const filtered = franchiseInventory.filter((item) =>
    [item.name, item.part_code, item.brand, item.category, item.hsn_code]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );

  if ($("requestRows")) {
    $("requestRows").innerHTML = filtered.length
      ? filtered
          .map((item) => {
            const isLow = item.is_low_stock || item.quantity_available <= item.reorder_level;
            const statusBadge = isLow
              ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">⚠️ Low stock (${item.quantity_available})</span>`
              : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">✓ In stock (${item.quantity_available})</span>`;
            
            return `
              <tr>
                <td>
                  <strong class="text-slate-900 block font-semibold">${safe(item.name)}</strong>
                  <span class="font-mono text-[11px] text-blue-600 font-bold block">${safe(item.part_code)}</span>
                </td>
                <td>
                  <span class="font-medium text-slate-800">${safe(item.brand)}</span>
                  <small class="text-slate-400 block">${safe(item.category)}</small>
                </td>
                <td><span class="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">${safe(item.hsn_code || "841890")}</span></td>
                <td><strong class="font-display text-slate-900 text-sm">₹${Number(item.unit_price || 0).toFixed(2)}</strong></td>
                <td>
                  <strong class="text-sm ${isLow ? 'text-amber-700' : 'text-slate-800'}">${item.quantity_available} units</strong>
                  <small class="text-slate-400 block">Min threshold: ${item.reorder_level}</small>
                </td>
                <td>${statusBadge}</td>
                <td>
                  <button type="button" class="table-action font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1" data-restock-btn="${safe(item.part_id)}" data-part-name="${safe(item.name)}" data-branch-id="${safe(item.branch_id || user?.branch_id || user?.id || 'me')}">
                    <span>📦</span> Stock In →
                  </button>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td class="empty-row" colspan="7">${query ? "No parts match your search." : "No spare parts found in warehouse inventory."}</td></tr>`;
  }

  if ($("requestCount")) {
    $("requestCount").textContent = `${filtered.length} part${filtered.length === 1 ? "" : "s"} shown`;
  }
  if ($("resourceGrid")) $("resourceGrid").innerHTML = "";

  document.querySelectorAll("[data-restock-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openRestockModal(btn.dataset.restockBtn, btn.dataset.partName, btn.dataset.branchId);
    });
  });
}

function openRestockModal(partId, partName, branchId) {
  const modal = $("restockModal");
  if (!modal) return;
  if ($("restockPartId")) $("restockPartId").value = partId;
  if ($("restockBranchId")) $("restockBranchId").value = branchId || user?.branch_id || user?.id || "me";
  if ($("restockPartTitle")) $("restockPartTitle").textContent = `Restock: ${partName}`;
  if ($("restockPartSubtitle")) $("restockPartSubtitle").textContent = `Replenish warehouse stock for ${partName}`;
  if ($("restockQty")) $("restockQty").value = "10";
  if ($("restockNotes")) $("restockNotes").value = "Shipment received from central OEM depot";
  if ($("restockFormMsg")) $("restockFormMsg").textContent = "";

  if (typeof modal.showModal === "function") modal.showModal();
  else modal.hidden = false;
}
window.openRestockModal = openRestockModal;

function initRestockModalEvents() {
  const modal = $("restockModal");
  if (!modal) return;

  $("closeRestockModalBtn")?.addEventListener("click", () => {
    if (typeof modal.close === "function") modal.close();
    else modal.hidden = true;
  });

  $("cancelRestockBtn")?.addEventListener("click", () => {
    if (typeof modal.close === "function") modal.close();
    else modal.hidden = true;
  });

  $("restockForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const partId = $("restockPartId")?.value;
    const branchId = $("restockBranchId")?.value || user?.branch_id || user?.id || "me";
    const qty = parseInt($("restockQty")?.value || "0", 10);
    const notes = $("restockNotes")?.value || "";

    if (!partId || qty <= 0) {
      if ($("restockFormMsg")) $("restockFormMsg").textContent = "Please specify a valid quantity greater than 0.";
      return;
    }

    const submitBtn = $("submitRestockBtn");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Updating stock…"; }

    try {
      await generalApi("/api/inventory/stock-movement", {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          part_id: partId,
          movement_type: "IN",
          quantity: qty,
          notes: notes
        })
      });

      showToast(`Stock replenished: +${qty} units added to local warehouse.`);
      if (typeof modal.close === "function") modal.close();
      else modal.hidden = true;
      await loadFranchiseInventory();
    } catch (err) {
      if ($("restockFormMsg")) $("restockFormMsg").textContent = err.message || "Failed to update stock.";
      showToast(err.message || "Failed to update stock", "error");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Confirm Stock-In"; }
    }
  });
}

// ==========================================
// Phase 2: OEM Warranty Claims Management
// ==========================================
async function loadCompanyWarrantyClaims() {
  try {
    companyWarrantyClaims = await generalApi("/api/warranty-amc/claims");
    try { localStorage.setItem("servora_cache_claims", JSON.stringify(companyWarrantyClaims)); } catch {}
    renderCompanyWarrantyClaims();
  } catch (error) {
    companyWarrantyClaims = [];
    renderCompanyWarrantyClaims();
    if ($("requestRows")) {
      $("requestRows").innerHTML = `<tr><td class="empty-row" colspan="7">${safe(error.message)}. Check your company session and try again.</td></tr>`;
    }
    if ($("requestCount")) $("requestCount").textContent = "Could not load warranty claims";
    showToast(`Warranty claims could not load: ${error.message}`, "error");
  }
}

function renderCompanyWarrantyClaims() {
  if ($("crumbTitle")) $("crumbTitle").textContent = "Warranty Claims";
  setHidden("addCompanyButton", true);
  setHidden("addBranchButton", true);
  setHidden("addTechnicianButton", true);
  setHidden("companyInlineAdd", true);
  setHidden("exportButton", false);
  setHidden("pageContent", false);
  setHidden("metricGrid", true);

  if ($("tableTitle")) $("tableTitle").textContent = "OEM Warranty Reimbursement Claims";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Audit and settle warranty claims raised by franchise branches for in-warranty repairs.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Claims audit";

  const pendingCount = companyWarrantyClaims.filter((c) => c.status === "Pending Review").length;
  const totalClaimAmount = companyWarrantyClaims.reduce((acc, c) => acc + (c.claim_amount || 0), 0);

  if ($("healthContent")) {
    $("healthContent").innerHTML = `
      <div class="space-y-2.5">
        <div class="p-3 bg-white rounded-xl border border-slate-100 flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium">Total claims received:</span>
          <strong class="text-sm font-bold text-slate-800">${companyWarrantyClaims.length}</strong>
        </div>
        <div class="p-3 ${pendingCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} rounded-xl border flex items-center justify-between">
          <span class="text-xs ${pendingCount > 0 ? 'text-amber-800' : 'text-emerald-800'} font-semibold">Pending review:</span>
          <strong class="text-sm font-bold ${pendingCount > 0 ? 'text-amber-700' : 'text-emerald-700'}">${pendingCount} claims</strong>
        </div>
        <div class="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
          <span class="text-xs text-blue-800 font-semibold">Total claims value:</span>
          <strong class="text-sm font-bold text-blue-700 font-display">₹${totalClaimAmount.toFixed(2)}</strong>
        </div>
      </div>
    `;
  }
  if ($("activityContent")) {
    $("activityContent").innerHTML = `<div class="section-empty text-xs leading-relaxed">Under SRS §6.9 (FR-WAR-003), consumer pays ₹0.00 for repairs during warranty. Parts reimbursement is approved and credited to the servicing franchise here.</div>`;
  }
  if ($("bottomTitle")) $("bottomTitle").textContent = "OEM Reimbursement";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Warranty policy & parts settlement";

  if ($("requestHead")) {
    $("requestHead").innerHTML = [
      "Claim ID",
      "Service request",
      "Franchise branch",
      "Appliance",
      "Claim amount",
      "Audit status",
      "Action"
    ].map((label) => `<th>${safe(label)}</th>`).join("");
  }

  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  if ($("requestSearch")) $("requestSearch").placeholder = "Search claims by ID, branch, appliance, or status";

  const filtered = companyWarrantyClaims.filter((item) =>
    [item.id, item.request_id, item.branch_name, item.appliance_name, item.status]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );

  if ($("requestRows")) {
    $("requestRows").innerHTML = filtered.length
      ? filtered
          .map((item) => {
            let statusBadge = "";
            if (item.status === "Approved") {
              statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">✓ Approved</span>`;
            } else if (item.status === "Rejected") {
              statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">✕ Rejected</span>`;
            } else {
              statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">⏳ Pending Review</span>`;
            }

            const canReview = item.status === "Pending Review";
            const actionBtn = canReview
              ? `<button type="button" class="table-action font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1" data-review-claim-id="${safe(item.id)}"><span>🛡️</span> Review Claim →</button>`
              : `<span class="text-xs text-slate-400 font-medium">${safe(item.settled_at || 'Settled')}</span>`;

            return `
              <tr>
                <td><strong class="font-mono text-blue-600 block">${safe(item.id)}</strong><small class="text-slate-400">${safe(item.submitted_at || '—')}</small></td>
                <td><span class="font-mono font-semibold text-slate-800">${safe(item.request_id)}</span></td>
                <td><span class="font-medium text-slate-800 block">${safe(item.branch_name || 'Franchise Branch')}</span></td>
                <td><span class="font-bold text-slate-800">${safe(item.appliance_name || 'Appliance')}</span></td>
                <td><strong class="font-display text-slate-900 text-sm">₹${Number(item.claim_amount || 0).toFixed(2)}</strong></td>
                <td>${statusBadge}</td>
                <td>${actionBtn}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td class="empty-row" colspan="7">${query ? "No warranty claims match your search." : "No warranty reimbursement claims submitted yet."}</td></tr>`;
  }

  if ($("requestCount")) {
    $("requestCount").textContent = `${filtered.length} claim${filtered.length === 1 ? "" : "s"} shown`;
  }
  if ($("resourceGrid")) $("resourceGrid").innerHTML = "";

  document.querySelectorAll("[data-review-claim-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const claim = companyWarrantyClaims.find((c) => c.id === btn.dataset.reviewClaimId);
      if (claim) openClaimReviewModal(claim);
    });
  });
}

function openClaimReviewModal(claim) {
  const modal = $("claimReviewModal");
  if (!modal) return;
  if ($("reviewClaimHiddenId")) $("reviewClaimHiddenId").value = claim.id;
  if ($("reviewClaimId")) $("reviewClaimId").textContent = claim.id;
  if ($("reviewClaimReqId")) $("reviewClaimReqId").textContent = claim.request_id;
  if ($("reviewClaimBranch")) $("reviewClaimBranch").textContent = claim.branch_name || "Franchise Branch";
  if ($("reviewClaimAmount")) $("reviewClaimAmount").textContent = `₹${Number(claim.claim_amount || 0).toFixed(2)}`;
  if ($("reviewClaimNotes")) $("reviewClaimNotes").value = "Valid manufacturing warranty claim verified against replacement parts.";
  if ($("claimReviewMsg")) $("claimReviewMsg").textContent = "";

  if (typeof modal.showModal === "function") modal.showModal();
  else modal.hidden = false;
}
window.openClaimReviewModal = openClaimReviewModal;

function initClaimReviewModalEvents() {
  const modal = $("claimReviewModal");
  if (!modal) return;

  $("closeClaimReviewModalBtn")?.addEventListener("click", () => {
    if (typeof modal.close === "function") modal.close();
    else modal.hidden = true;
  });

  $("cancelClaimReviewBtn")?.addEventListener("click", () => {
    if (typeof modal.close === "function") modal.close();
    else modal.hidden = true;
  });

  const handleVerify = async (action) => {
    const claimId = $("reviewClaimHiddenId")?.value;
    const notes = $("reviewClaimNotes")?.value || "";
    if (!claimId) return;

    const approveBtn = $("approveClaimBtn");
    const rejectBtn = $("rejectClaimBtn");
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    try {
      await generalApi(`/api/warranty-amc/claims/${encodeURIComponent(claimId)}/verify`, {
        method: "POST",
        body: JSON.stringify({
          action: action,
          notes: notes
        })
      });

      showToast(`Claim ${claimId} marked as ${action === "approve" ? "Approved" : "Rejected"}.`);
      if (typeof modal.close === "function") modal.close();
      else modal.hidden = true;
      await loadCompanyWarrantyClaims();
    } catch (err) {
      if ($("claimReviewMsg")) $("claimReviewMsg").textContent = err.message || "Failed to verify claim.";
      showToast(err.message || "Failed to verify claim", "error");
    } finally {
      if (approveBtn) approveBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
    }
  };

  $("approveClaimBtn")?.addEventListener("click", () => handleVerify("approve"));
  $("rejectClaimBtn")?.addEventListener("click", () => handleVerify("reject"));
}

// ==========================================
// Phase 2: Central Spares Catalog Master
// ==========================================
async function loadCompanySparesCatalog() {
  try {
    companySparesCatalog = await generalApi("/api/inventory/parts");
    try { localStorage.setItem("servora_cache_catalog", JSON.stringify(companySparesCatalog)); } catch {}
    renderCompanySparesCatalog();
  } catch (error) {
    companySparesCatalog = [];
    renderCompanySparesCatalog();
    if ($("requestRows")) {
      $("requestRows").innerHTML = `<tr><td class="empty-row" colspan="6">${safe(error.message)}. Check your connection and try again.</td></tr>`;
    }
    if ($("requestCount")) $("requestCount").textContent = "Could not load spares catalog";
    showToast(`Spare parts catalog could not load: ${error.message}`, "error");
  }
}

function renderCompanySparesCatalog() {
  if ($("crumbTitle")) $("crumbTitle").textContent = "Spares Catalog";
  setHidden("addCompanyButton", true);
  setHidden("addBranchButton", true);
  setHidden("addTechnicianButton", true);
  setHidden("companyInlineAdd", true);
  setHidden("exportButton", false);
  setHidden("pageContent", false);
  setHidden("metricGrid", true);

  if ($("tableTitle")) $("tableTitle").textContent = "Master Spare Parts Catalog";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Standardized components catalog with brand compatibility, unit pricing, and GST HSN codes.";
  if ($("sidePanelTitle")) $("sidePanelTitle").textContent = "Catalog master";

  if ($("healthContent")) {
    $("healthContent").innerHTML = `
      <div class="space-y-2.5">
        <div class="p-3 bg-white rounded-xl border border-slate-100 flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium">Standard catalog parts:</span>
          <strong class="text-sm font-bold text-slate-800">${companySparesCatalog.length}</strong>
        </div>
      </div>
    `;
  }
  if ($("activityContent")) {
    $("activityContent").innerHTML = `<div class="section-empty text-xs leading-relaxed">HSN codes (e.g. 841890, 845090) are required under GST Act §31 for standard 18% tax invoicing on consumer job cards.</div>`;
  }
  if ($("bottomTitle")) $("bottomTitle").textContent = "Spare parts inventory";
  if ($("bottomSubtitle")) $("bottomSubtitle").textContent = "Centralized component master data";

  if ($("requestHead")) {
    $("requestHead").innerHTML = [
      "Part code",
      "Part name",
      "Brand & category",
      "HSN code",
      "Standard unit price",
      "Status"
    ].map((label) => `<th>${safe(label)}</th>`).join("");
  }

  const query = $("requestSearch") ? $("requestSearch").value.trim().toLowerCase() : "";
  if ($("requestSearch")) $("requestSearch").placeholder = "Search catalog by name, code, brand, or HSN";

  const filtered = companySparesCatalog.filter((item) =>
    [item.name, item.part_code, item.brand, item.category, item.hsn_code]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );

  if ($("requestRows")) {
    $("requestRows").innerHTML = filtered.length
      ? filtered
          .map((item) => `
            <tr>
              <td><span class="font-mono font-bold text-blue-600">${safe(item.part_code)}</span></td>
              <td><strong class="text-slate-900 block font-semibold">${safe(item.name)}</strong><small class="text-slate-400">${safe(item.description || '')}</small></td>
              <td><strong class="text-slate-800 block">${safe(item.brand)}</strong><small class="text-slate-500">${safe(item.category)}</small></td>
              <td><span class="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">${safe(item.hsn_code || '841890')}</span></td>
              <td><strong class="font-display text-slate-900 text-sm">₹${Number(item.unit_price || 0).toFixed(2)}</strong></td>
              <td><span class="status-pill completed">Active</span></td>
            </tr>
          `)
          .join("")
      : `<tr><td class="empty-row" colspan="6">${query ? "No parts match your search." : "No spare parts in central catalog."}</td></tr>`;
  }

  if ($("requestCount")) {
    $("requestCount").textContent = `${filtered.length} part${filtered.length === 1 ? "" : "s"} shown`;
  }
  if ($("resourceGrid")) $("resourceGrid").innerHTML = "";
}

async function loadWorkspacePageData(page) {
  if (page === "Escalations" || page === "SLA Escalations") { await loadEscalationsData(); return; }
  if (role === "admin") { await loadAdminPageData(page); return; }
  if (role === "company" && page === "Branches") { await loadCompanyBranches(); return; }
  if (role === "company" && page === "Customers") { await loadCompanyCustomers(); return; }
  if (role === "company" && page === "Warranty Claims") { await loadCompanyWarrantyClaims(); return; }
  if (role === "company" && page === "Spares Catalog") { await loadCompanySparesCatalog(); return; }
  if (role === "franchise" && page === "Technicians") { await loadFranchiseTechnicians(); return; }
  if (role === "franchise" && page === "Customers") { await loadFranchiseCustomers(); return; }
  if (role === "franchise" && page === "Inventory & Spares") { await loadFranchiseInventory(); return; }
  renderPage(page);
}
async function loadAdminPageData(page) {
  if (role !== "admin") return;
  if (page === "Escalations") { await loadEscalationsData(); return; }
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
  const query = ($("requestSearch")?.value || "").trim().toLowerCase(); const filtered = directoryRows.filter((item) => [item.name, item.email, item.phone, item.address].join(" ").toLowerCase().includes(query));
  $("requestRows").innerHTML = filtered.length ? filtered.map((item) => `<tr><td>${safe(item.name)}</td><td>${safe(item.email)}</td><td>${safe(item.phone)}</td><td>${safe(item.address || "—")}</td><td><span class="status-pill">${safe(item.role)}</span></td></tr>`).join("") : `<tr><td class="empty-row" colspan="5">No ${page.toLowerCase()} accounts found.</td></tr>`;
  $("requestCount").textContent = `${filtered.length} ${page.toLowerCase()} shown`; $("resourceGrid").innerHTML = "";
  $("bottomTitle").textContent = `${page} directory`; $("bottomSubtitle").textContent = "Registered platform accounts";
}
function renderRequestDirectory() {
  $("metricGrid").hidden = true; $("requestSearch").placeholder = "Search service requests";
  $("tableTitle").textContent = "Service requests"; $("tableSubtitle").textContent = "Service activity across all Servora accounts.";
  $("requestHead").innerHTML = ["Request ID", "Customer", "Appliance", "Issue", "Status", "Date"].map((label) => `<th>${label}</th>`).join("");
  const query = ($("requestSearch")?.value || "").trim().toLowerCase(); const filtered = requests.filter((item) => [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge].join(" ").toLowerCase().includes(query));
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
  if (!item) return false;
  if (role === "admin") return true;
  if (role === "technician") {
    if (item.technician?.id && user?.id && item.technician.id === user.id) return true;
    if (item.technician?.name && user?.name && item.technician.name.toLowerCase() === user.name.toLowerCase()) return true;
    if (!item.technician?.id && item.branch_id && user?.branch_id && item.branch_id === user.branch_id) return true;
    return true;
  }
  if (role === "franchise") {
    const bId = user?.branch_id || user?.id;
    if (bId && item.branch_id && item.branch_id === bId) return true;
    if (user?.pincode && item.pincode && item.pincode === user.pincode) return true;
    return true;
  }
  if (role === "company") {
    const cId = user?.company_id || user?.id;
    if (cId && item.company_id && item.company_id === cId) return true;
    if (user?.name && item.brand && item.brand.toLowerCase() === user.name.toLowerCase()) return true;
    return true;
  }
  return true;
}

function statusClass(status) {
  if (status === "Completed") return "completed";
  if (status === "Disputed" || status === "Reopened" || status === "Reopened / Under Review") return "disputed";
  if (["Scheduled", "Request Created", "Technician Assigned", "Pending"].includes(status)) return "scheduled";
  if (status === "Assigned") return "assigned";
  if (["In Progress", "Service In Progress", "Technician on the Way"].includes(status)) return "in-progress";
  return "";
}

function renderStatusBadge(item) {
  if (!item) return `<span class="status-pill">Pending</span>`;

  let badgeHtml = "";
  if (item.status === "Completed" || item.status_badge === "Completed") {
    if (item.is_reopened) {
      badgeHtml = `<div class="flex items-center gap-1.5"><span class="status-pill completed">✓ Completed</span><span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Completed under warranty revisit">Revisit</span></div>`;
    } else {
      badgeHtml = `<span class="status-pill completed">✓ Completed</span>`;
    }
  } else if (item.status === "Estimate Pending Approval" || item.status_badge === "Estimate Pending") {
    badgeHtml = `<span class="status-pill bg-amber-100 text-amber-800 border border-amber-300">⏳ Estimate Pending</span>`;
  } else if (item.status === "Estimate Rejected" || item.status_badge === "Estimate Rejected") {
    badgeHtml = `<span class="status-pill disputed">✕ Estimate Rejected</span>`;
  } else if (item.status === "Repair in Progress") {
    badgeHtml = `<span class="status-pill in-progress">Repair in Progress</span>`;
  } else if (item.status === "Reopened / Under Review" || item.status_badge === "Reopened" || (Boolean(item.is_reopened) && item.status !== "Completed")) {
    badgeHtml = `<span class="status-pill disputed" title="${safe(item.reopened_reason || 'Reopened by customer for repeat issue')}">⚠️ Reopened</span>`;
  } else if (item.status === "Disputed" || item.status_badge === "Disputed") {
    badgeHtml = `<span class="status-pill disputed" title="${safe(item.reopened_reason || 'Job card charges disputed by customer')}">⚠️ Disputed</span>`;
  } else if (item.status === "Service In Progress" || item.status_badge === "In Progress") {
    badgeHtml = `<span class="status-pill in-progress">In Progress</span>`;
  } else if (item.status === "Technician on the Way") {
    badgeHtml = `<span class="status-pill in-progress">On the Way 🛵</span>`;
  } else if (item.status === "Technician Assigned" || item.status_badge === "Scheduled" || item.status_badge === "Assigned") {
    badgeHtml = `<span class="status-pill assigned">Assigned</span>`;
  } else {
    badgeHtml = `<span class="status-pill ${statusClass(item.status_badge || item.status)}">${safe(item.status_badge || item.status || "Pending")}</span>`;
  }

  if (item.is_escalated) {
    const escBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 ml-1 inline-flex items-center gap-0.5" title="Ticket Escalated to Level ${item.escalation_level || 1}">🚨 L${item.escalation_level || 1}</span>`;
    return `<div class="inline-flex items-center">${badgeHtml}${escBadge}</div>`;
  }
  return badgeHtml;
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
            ${(item.status === 'Completed' || item.status_badge === 'Completed') ? `
              <div class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                <span>✓ Work Completed & Settled</span>
              </div>
            ` : `
              <div class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                <span>📌 You have been assigned this work</span>
              </div>
            `}
          </div>
          ${renderStatusBadge(item)}
        </div>

        ${item.defect_photo ? `
          <div class="flex items-center gap-3 p-2.5 bg-blue-50/60 rounded-xl border border-blue-100">
            <img src="${safe(item.defect_photo)}" alt="Defect" class="w-12 h-12 rounded-lg object-cover border border-slate-200 cursor-pointer shadow-xs hover:opacity-90" onclick="window.open(this.src, '_blank')">
            <div class="text-[11px] text-slate-600">
              <strong class="text-blue-900 block font-bold">Appliance Defect Photo Attached</strong>
              <span class="text-slate-400">Click photo to view full resolution</span>
            </div>
          </div>
        ` : ''}

        ${(item.is_reopened && item.status !== 'Completed' && item.status_badge !== 'Completed') ? `
          <div class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-950 space-y-1.5">
            <div class="flex items-center gap-2 font-bold">
              <span class="text-sm">⚠️</span>
              <span class="text-rose-900">Warranty Revisit · Repeat Issue</span>
              <span class="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-rose-200 text-rose-800">Priority Revisit</span>
            </div>
            <p class="text-rose-800 font-medium">${safe(item.reopened_reason || 'Customer reported issue recurred.')}</p>
            ${item.previous_job_card ? `
              <div class="p-2.5 bg-white rounded-lg border border-rose-100 space-y-1 text-[11px] text-slate-700">
                <div class="font-bold text-slate-900">Previous Diagnosis (by ${safe(item.previous_technician_name || 'Previous Tech')}):</div>
                <div class="text-slate-600">${safe(item.previous_job_card.work_summary)}</div>
                ${Array.isArray(item.previous_job_card.parts_used) && item.previous_job_card.parts_used.length ? `
                  <div class="text-slate-500 font-medium text-[10px]">Parts Replaced: ${item.previous_job_card.parts_used.map(p => `${safe(p.part_name)} (×${p.quantity})`).join(', ')}</div>
                ` : ''}
                <div class="text-[10px] text-emerald-700 font-bold">Previous Settlement: ₹${Number(item.previous_job_card.total_amount).toFixed(2)} (PAID)</div>
              </div>
            ` : ''}
          </div>
        ` : ''}

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
          ${item.status_badge !== 'Completed' && item.status !== 'Completed' ? `
            ${item.status === 'Technician on the Way' ? `
              <button type="button" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="techStartServiceWithOtp('${safe(item.id)}')">
                ▶ Start Service (OTP)
              </button>
            ` : item.status === 'Estimate Pending Approval' ? `
              <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs animate-pulse">
                ⏳ Customer Estimate Approval Pending
              </span>
              <button type="button" class="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition" onclick="openTechEstimateModal('${safe(item.id)}')">
                📝 View Estimate
              </button>
            ` : item.status === 'Repair in Progress' ? `
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                ✓ Customer Authorized Repair
              </span>
              <button type="button" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="openOpsJobCardModal('${safe(item.id)}')">
                📋 Job Card & Complete
              </button>
            ` : item.status === 'Service In Progress' ? `
              <button type="button" class="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="openTechEstimateModal('${safe(item.id)}')">
                📝 Pre-Repair Estimate
              </button>
              <button type="button" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="openOpsJobCardModal('${safe(item.id)}')">
                📋 Job Card & Complete
              </button>
            ` : `
              <button type="button" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="techAction('${safe(item.id)}', 'start_visit')">
                📍 Start Visit
              </button>
              <button type="button" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="openOpsJobCardModal('${safe(item.id)}')">
                📋 Digital Job Card
              </button>
            `}
          ` : `
            <button type="button" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition flex items-center gap-1.5" onclick="openOpsJobCardModal('${safe(item.id)}')">
              📄 View Job Card
            </button>
            <button type="button" class="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs transition flex items-center gap-1.5" onclick="openOpsReceiptModal('${safe(item.id)}')">
              🧾 Receipt
            </button>
            ${item.previous_job_card ? `
              <button type="button" class="px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-xs transition flex items-center gap-1.5" onclick="openOpsReceiptModal('${safe(item.id)}', true)">
                🧾 Prev Receipt
              </button>
            ` : ''}
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
      const isCurrentlyReopened = (item.status === "Reopened / Under Review" || item.status_badge === "Reopened" || Boolean(item.is_reopened)) && item.status !== "Completed";
      const isCompleted = item.status === "Completed" || item.status_badge === "Completed";
      const statusPill = renderStatusBadge(item);

      const isDispatched = item.status === "Technician on the Way" || (isAssigned && !isCompleted);
      const trackBtn = isDispatched ? `<button class="table-action px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-semibold text-xs ml-1" onclick="openTechRouteMap('${safe(item.id)}')">Track 📍</button>` : '';

      const assignBtn = isCurrentlyReopened
        ? `<button class="table-action px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-300 font-semibold text-xs flex items-center gap-1" onclick="openFranchiseReassignModal('${safe(item.id)}')"><span>↺</span> Reassign</button>`
        : (isCompleted
          ? ''
          : (isAssigned
            ? `<button class="table-action px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 font-semibold text-xs flex items-center gap-1" onclick="selectRequestForAssignment('${safe(item.id)}')"><span>↺</span> Reassign</button>`
            : `<button class="table-action px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm flex items-center gap-1" onclick="selectRequestForAssignment('${safe(item.id)}')"><span>⚡</span> Assign →</button>`));

      const detailBtn = `<button class="table-action px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs ml-1" onclick="viewRequestDetails('${safe(item.id)}')">Details 👁️</button>`;
      const jcBtn = `<button class="table-action px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs ml-1" onclick="openOpsJobCardModal('${safe(item.id)}')">Job Card 📄</button>`;
      const receiptBtn = (isCompleted || item.previous_job_card)
        ? `<button class="table-action px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-semibold text-xs ml-1" onclick="openOpsReceiptModal('${safe(item.id)}')">Receipt 🧾</button>`
        : '';

      const actionCell = `<div class="flex items-center gap-1">${assignBtn}${trackBtn}${detailBtn}${jcBtn}${receiptBtn}</div>`;
      const reqIdCell = `<span class="cursor-pointer text-blue-600 hover:underline font-mono font-bold" onclick="viewRequestDetails('${safe(item.id)}')">${safe(item.id)}</span>`;
      const cells = [reqIdCell, customer, safe(item.appliance_name), safe(item.issue), techCell, priorityBadge, statusPill, actionCell];
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }

    if (role === "company") {
      const pinCode = safe(item.pincode || "—");
      const branchObj = branches.find((b) => b.id === item.branch_id);
      const routedBranch = safe(branchObj ? branchObj.branch_name : (item.branch_id || "Unassigned"));
      const statusPill = renderStatusBadge(item);
      const isDispatched = item.status === "Technician on the Way" || item.technician_id;
      const trackBtn = isDispatched ? `<button class="table-action font-semibold text-xs text-indigo-600 hover:text-indigo-800 ml-2" onclick="event.stopPropagation(); openTechRouteMap('${safe(item.id)}')">Track 📍</button>` : '';
      const actionBtn = `<button class="table-action font-semibold text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1" onclick="event.stopPropagation(); viewRequestDetails('${safe(item.id)}')"><span>👁️</span> View Details →</button>`;
      const reqIdCell = `<span class="font-mono font-bold text-blue-600">${safe(item.id)}</span>`;
      const cells = [reqIdCell, customer, pinCode, routedBranch, statusPill, `<div class="flex items-center gap-1">${actionBtn}${trackBtn}</div>`];
      return `<tr class="cursor-pointer hover:bg-blue-50/40 transition" onclick="viewRequestDetails('${safe(item.id)}')">${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }

    // Default admin
    const action = `<button class="table-action font-semibold text-xs text-blue-600 hover:text-blue-800" onclick="event.stopPropagation(); viewRequestDetails('${safe(item.id)}')">View details →</button>`;
    const cells = [safe(item.id), customer, safe(item.brand), safe(item.appliance_name), renderStatusBadge(item), safe(item.appointment_date), action];
    return `<tr class="cursor-pointer hover:bg-blue-50/40 transition" onclick="viewRequestDetails('${safe(item.id)}')">${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
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
window.techStartServiceWithOtp = async function(requestId) {
  const otp = prompt("Customer Doorstep Verification:\nPlease enter the 4-digit Service Start OTP provided by the customer to start the repair:");
  if (!otp) return;
  if (otp.trim().length < 4) {
    showToast("Please enter a valid 4-digit OTP provided by customer.", "error");
    return;
  }
  await window.techAction(requestId, "start_service", otp.trim());
};

// Technician Live Location Tracking Service
let activeTechWatchId = null;
let activeTechInterval = null;
let activeTechVisitId = null;

async function sendTechLocationUpdate(requestId, latitude, longitude) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/requests/${encodeURIComponent(requestId)}/location`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders(),
      body: JSON.stringify({ latitude, longitude })
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        const idx = requests.findIndex((r) => r.id === requestId);
        if (idx !== -1) requests[idx] = { ...requests[idx], ...data };
      }
    }
  } catch (err) {
    console.warn("Could not send tech location update:", err);
  }
}

function startTechLiveTracking(requestId) {
  stopTechLiveTracking();
  activeTechVisitId = requestId;
  if ("geolocation" in navigator) {
    activeTechWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        sendTechLocationUpdate(requestId, pos.coords.latitude, pos.coords.longitude);
      },
      (err) => console.warn("Tech watchPosition error:", err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }
  activeTechInterval = setInterval(() => {
    if (!activeTechVisitId) {
      stopTechLiveTracking();
      return;
    }
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendTechLocationUpdate(activeTechVisitId, pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    }
  }, 15000);
}

function stopTechLiveTracking() {
  if (activeTechWatchId != null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(activeTechWatchId);
    activeTechWatchId = null;
  }
  if (activeTechInterval) {
    clearInterval(activeTechInterval);
    activeTechInterval = null;
  }
  activeTechVisitId = null;
}

function requestAndShareTechLocation(requestId) {
  if (!("geolocation" in navigator)) {
    showToast("Geolocation is not supported by your browser.", "warning");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      await sendTechLocationUpdate(requestId, latitude, longitude);
      showToast("Live GPS active! Real-time location shared with customer and franchise.", "success");
      startTechLiveTracking(requestId);
    },
    (err) => {
      console.warn("Geolocation permission error:", err);
      showToast("Please allow browser location access to share your live route with the customer.", "warning");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

window.techAction = async function(requestId, action, otp = null) {
  try {
    const label = action === "start_visit" ? "Starting visit" : action === "start_service" ? "Verifying doorstep Start OTP" : action === "diagnose" ? "Recording diagnosis" : "Completing job";
    showToast(`${label}…`);
    const payload = { action };
    if (otp) payload.verification_otp = otp;
    const res = await fetch(`${API_BASE_URL}/api/requests/${requestId}/action`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders(),
      body: JSON.stringify(payload)
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
      showToast("Visit started! Customer has been notified by email that you are on the way.", "success");
      requestAndShareTechLocation(requestId);
      return;
    }
    if (action === "start_service") {
      stopTechLiveTracking();
      showToast("Doorstep OTP verified! Service is now in progress.", "success");
      return;
    }
    if (action === "complete") {
      stopTechLiveTracking();
    }

    showToast(`Job updated: ${data.status_badge || data.status || "Updated"}`);
  } catch (err) {
    showToast(extractErrorMessage(err.message, "Action failed"), "error");
  }
};

window.openOpsReceiptModal = async function(requestId, showPrevious = false) {
  const req = requests.find(r => r.id === requestId);
  if (!req) return;
  const dialog = $("opsReceiptDialog");
  if (!dialog) return;

  let jc = null;
  if (showPrevious && req.previous_job_card) {
    jc = req.previous_job_card;
  } else {
    try {
      const res = await fetch(`${API_BASE_URL}/api/requests/${requestId}/job-card`, { headers: jsonHeaders() });
      if (res.ok) jc = await res.json();
    } catch (e) {}
    if (!jc && req.previous_job_card) {
      jc = req.previous_job_card;
    }
  }

  const invoiceNo = `REC-${req.id}${showPrevious ? '-PREV' : ''}`;
  if ($("opsReceiptInvoiceNo")) $("opsReceiptInvoiceNo").textContent = invoiceNo;
  if ($("opsReceiptDate")) $("opsReceiptDate").textContent = (jc && jc.completed_at) || req.appointment_date || new Date().toLocaleDateString('en-IN');
  if ($("opsReceiptPaidBadge")) {
    const isPaid = req.payment_status === "Paid" || jc;
    $("opsReceiptPaidBadge").textContent = isPaid ? "✓ PAID IN FULL" : "PAYMENT PENDING";
    $("opsReceiptPaidBadge").className = `mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
      isPaid ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200"
    }`;
  }

  if ($("opsReceiptCustomerName")) $("opsReceiptCustomerName").textContent = req.customer_name || "Customer";
  if ($("opsReceiptCustomerPhone")) $("opsReceiptCustomerPhone").textContent = req.customer_phone || "";
  if ($("opsReceiptCustomerAddress")) $("opsReceiptCustomerAddress").textContent = req.customer_address || "Customer doorstep location";

  const techName = showPrevious
    ? (req.previous_technician_name || "Original Technician")
    : (req.technician?.name || req.previous_technician_name || "Authorized Field Technician");
  if ($("opsReceiptBranchName")) $("opsReceiptBranchName").textContent = "Servora Authorized Franchise Partner";
  if ($("opsReceiptTechName")) $("opsReceiptTechName").textContent = `Technician: ${techName}`;
  if ($("opsReceiptApplianceDetails")) $("opsReceiptApplianceDetails").textContent = `${req.brand || ''} ${req.appliance_name || 'Appliance'} (${req.model_no || 'Standard'})`;
  if ($("opsReceiptIssueDescription")) $("opsReceiptIssueDescription").textContent = `Service: ${req.issue || 'Repair inspection'}`;

  const isWarranty = Boolean(req.is_under_warranty);
  const parts = (jc && Array.isArray(jc.parts_used)) ? jc.parts_used : [];
  const partsCost = jc ? Number(jc.parts_cost || 0) : 0;
  const laborCost = jc ? Number(jc.labor_cost || 350) : 350;
  const inspectionFee = jc ? Number(jc.inspection_fee || 299) : 299;
  const discount = jc ? Number(jc.discount_amount || jc.discount || 0) : 0;
  const taxAmount = isWarranty ? 0.0 : (jc ? Number(jc.tax_amount || ((inspectionFee + laborCost + partsCost - discount) * 0.18)) : ((inspectionFee + laborCost + partsCost - discount) * 0.18));
  const totalAmount = isWarranty ? 0.0 : (jc ? Number(jc.total_amount || (inspectionFee + laborCost + partsCost - discount + taxAmount)) : (inspectionFee + laborCost + partsCost - discount + taxAmount));

  if ($("opsReceiptPaidBadge")) {
    const isPaid = req.payment_status === "Paid" || isWarranty || jc;
    if (isWarranty) {
      $("opsReceiptPaidBadge").textContent = "✓ OEM WARRANTY COVERED";
      $("opsReceiptPaidBadge").className = "mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-blue-100 text-blue-800 border-blue-200";
    } else {
      $("opsReceiptPaidBadge").textContent = isPaid ? "✓ PAID IN FULL" : "PAYMENT PENDING";
      $("opsReceiptPaidBadge").className = `mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
        isPaid ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200"
      }`;
    }
  }

  if ($("opsReceiptItemsBody")) {
    let rowsHtml = `
      <tr>
        <td class="py-2.5 px-3 text-slate-400 font-mono">1</td>
        <td class="py-2.5 px-3 font-medium text-slate-800">
          Doorstep Inspection & Diagnostic Evaluation
          <span class="text-[10px] text-slate-400 block font-mono">SAC: 9987 · Standard Diagnostic Visit</span>
        </td>
        <td class="py-2.5 px-3 text-center text-slate-600 font-semibold">1</td>
        <td class="py-2.5 px-3 text-right text-slate-600">${isWarranty ? '<s class="text-slate-400">₹' + inspectionFee.toFixed(2) + '</s>' : '₹' + inspectionFee.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right font-bold text-slate-800">${isWarranty ? '₹0.00' : '₹' + inspectionFee.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="py-2.5 px-3 text-slate-400 font-mono">2</td>
        <td class="py-2.5 px-3 font-medium text-slate-800">
          Labor & Technical Repair Charges
          <span class="text-[10px] text-slate-400 block font-mono">SAC: 9987 · Certified Field Service</span>
        </td>
        <td class="py-2.5 px-3 text-center text-slate-600 font-semibold">1</td>
        <td class="py-2.5 px-3 text-right text-slate-600">${isWarranty ? '<s class="text-slate-400">₹' + laborCost.toFixed(2) + '</s>' : '₹' + laborCost.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right font-bold text-slate-800">${isWarranty ? '₹0.00' : '₹' + laborCost.toFixed(2)}</td>
      </tr>
    `;

    if (parts.length > 0) {
      parts.forEach((p, idx) => {
        const pQty = p.quantity || 1;
        const pRate = Number(p.unit_price || 0);
        const pTotal = Number(p.total_price || (pQty * pRate));
        rowsHtml += `
          <tr>
            <td class="py-2.5 px-3 text-slate-400 font-mono">${idx + 3}</td>
            <td class="py-2.5 px-3 font-medium text-slate-800">
              ${safe(p.part_name)}
              <span class="text-[10px] text-slate-400 block font-mono">HSN: ${safe(p.hsn_code || '841890')} · Genuine OEM Part</span>
            </td>
            <td class="py-2.5 px-3 text-center text-slate-600 font-semibold">${pQty}</td>
            <td class="py-2.5 px-3 text-right text-slate-600">${isWarranty ? '<s class="text-slate-400">₹' + pRate.toFixed(2) + '</s>' : '₹' + pRate.toFixed(2)}</td>
            <td class="py-2.5 px-3 text-right font-bold text-slate-800">${isWarranty ? '₹0.00' : '₹' + pTotal.toFixed(2)}</td>
          </tr>
        `;
      });
    }

    if (isWarranty) {
      rowsHtml += `
        <tr class="bg-blue-50/60 font-semibold text-blue-900">
          <td colspan="4" class="py-2 px-3 text-right text-[11px]">🛡️ 100% Brand Manufacturer Warranty Coverage:</td>
          <td class="py-2 px-3 text-right text-emerald-600 text-xs">-₹${(inspectionFee + laborCost + partsCost).toFixed(2)}</td>
        </tr>
      `;
    }

    $("opsReceiptItemsBody").innerHTML = rowsHtml;
  }

  if ($("opsReceiptPartsSubtotal")) $("opsReceiptPartsSubtotal").textContent = isWarranty ? "₹0.00 (Covered)" : `₹${partsCost.toFixed(2)}`;
  if ($("opsReceiptLaborCost")) $("opsReceiptLaborCost").textContent = isWarranty ? "₹0.00 (Covered)" : `₹${(inspectionFee + laborCost).toFixed(2)}`;
  if ($("opsReceiptGstTax")) $("opsReceiptGstTax").textContent = isWarranty ? "₹0.00" : `₹${taxAmount.toFixed(2)} (CGST 9% + SGST 9%)`;
  if ($("opsReceiptGrandTotal")) $("opsReceiptGrandTotal").textContent = `₹${totalAmount.toFixed(2)}`;

  if ($("opsReceiptTechSigImg") && jc && jc.technician_signature) {
    $("opsReceiptTechSigImg").src = jc.technician_signature;
    $("opsReceiptTechSigImg").classList.remove("hidden");
    if ($("opsReceiptTechSigText")) $("opsReceiptTechSigText").textContent = `Signed by ${techName}`;
  } else {
    if ($("opsReceiptTechSigImg")) $("opsReceiptTechSigImg").classList.add("hidden");
    if ($("opsReceiptTechSigText")) $("opsReceiptTechSigText").textContent = `Verified via Doorstep OTP (${techName})`;
  }

  if ($("opsReceiptCustSigImg") && jc && jc.customer_signature) {
    $("opsReceiptCustSigImg").src = jc.customer_signature;
    $("opsReceiptCustSigImg").classList.remove("hidden");
    if ($("opsReceiptCustSigText")) $("opsReceiptCustSigText").textContent = "Digitally signed by Customer";
  } else {
    if ($("opsReceiptCustSigImg")) $("opsReceiptCustSigImg").classList.add("hidden");
    if ($("opsReceiptCustSigText")) $("opsReceiptCustSigText").textContent = "Settled & verified via Completion OTP";
  }

  dialog.showModal();
};

window.openFranchiseReassignModal = function(requestId) {
  const req = requests.find(r => r.id === requestId);
  if (!req) return;
  const dialog = $("franchiseReassignDialog");
  if (!dialog) return;

  if ($("reassignReqId")) $("reassignReqId").textContent = req.id;
  if ($("reassignReopenedAt")) $("reassignReopenedAt").textContent = req.reopened_at || "Recently";
  if ($("reassignReasonText")) $("reassignReasonText").textContent = req.reopened_reason || "Customer reported recurring issue.";

  const prevTech = req.previous_technician_name || "Original Technician";
  if ($("reassignPrevTechName")) $("reassignPrevTechName").textContent = prevTech;
  if ($("reassignPrevTotal")) {
    $("reassignPrevTotal").textContent = req.previous_job_card ? `₹${Number(req.previous_job_card.total_amount).toFixed(2)} (PAID)` : "PAID IN FULL";
  }
  if ($("reassignPrevWorkSummary")) {
    $("reassignPrevWorkSummary").textContent = req.previous_job_card?.work_summary || "Prior technical repair performed.";
  }
  if ($("reassignOriginalTechDesc")) {
    $("reassignOriginalTechDesc").textContent = `Send ${prevTech} back for free revisit under guarantee.`;
  }

  if ($("reassignViewPrevReceiptBtn")) {
    $("reassignViewPrevReceiptBtn").onclick = () => window.openOpsReceiptModal(req.id, true);
  }

  if ($("confirmAssignOriginalBtn")) {
    $("confirmAssignOriginalBtn").onclick = () => window.executeReassign(req.id, req.previous_technician_id || req.technician_id, "same_technician");
  }

  const select = $("reassignDifferentTechSelect");
  if (select) {
    const options = technicians.filter(t => t.id !== req.previous_technician_id);
    if (options.length > 0) {
      select.innerHTML = options.map(t => `<option value="${safe(t.id)}">${safe(t.name)} (${safe(t.title || 'Specialist')})</option>`).join("");
    } else {
      select.innerHTML = technicians.map(t => `<option value="${safe(t.id)}">${safe(t.name)} (${safe(t.title || 'Technician')})</option>`).join("");
    }
  }

  if ($("confirmAssignDifferentBtn")) {
    $("confirmAssignDifferentBtn").onclick = () => {
      const selectedId = $("reassignDifferentTechSelect")?.value;
      if (!selectedId) {
        showToast("Please select a technician to reassign.", "error");
        return;
      }
      window.executeReassign(req.id, selectedId, "new_technician");
    };
  }

  if ($("closeFranchiseReassign")) {
    $("closeFranchiseReassign").onclick = () => dialog.close();
  }

  dialog.showModal();
};

window.executeReassign = async function(requestId, technicianId, mode) {
  try {
    showToast("Reassigning technician for revisit…");
    const res = await fetch(`${API_BASE_URL}/api/requests/${requestId}/assign`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders(),
      body: JSON.stringify({
        technician_id: technicianId,
        reassign_mode: mode,
        priority: "High"
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(extractErrorMessage(data, "Failed to reassign technician"));

    const idx = requests.findIndex(r => r.id === requestId);
    if (idx !== -1) requests[idx] = data;

    $("franchiseReassignDialog")?.close();
    showToast(`Reassigned to ${data.technician?.name || 'Technician'} successfully!`, "success");
    setMetrics();
    renderRequests();
    renderInsights();
  } catch (err) {
    showToast(extractErrorMessage(err.message, "Reassignment failed"), "error");
  }
};

window.viewRequestDetails = async function(requestId) {
  const dialog = $("ticketDetailModal");
  if (!dialog) {
    showToast(`Viewing request ${requestId}`, "info");
    return;
  }

  let req = requests.find((r) => r.id === requestId);
  if (!req || !req.timeline || req.timeline.length === 0) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/requests/${requestId}`, {
        credentials: "include",
        headers: authHeaders()
      });
      if (res.ok) {
        const fullReq = await res.json();
        if (fullReq && fullReq.id) req = fullReq;
      }
    } catch (e) {}
  }
  if (!req) {
    showToast("Service request record not found", "error");
    return;
  }

  // Header
  if ($("ticketModalReqId")) $("ticketModalReqId").textContent = req.id;
  if ($("ticketModalPriority")) {
    $("ticketModalPriority").textContent = req.priority || "Medium";
    $("ticketModalPriority").className = `px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${priorityClass(req.priority)}`;
  }
  if ($("ticketModalStatusWrap")) $("ticketModalStatusWrap").innerHTML = renderStatusBadge(req);
  if ($("ticketModalCreatedAt")) $("ticketModalCreatedAt").textContent = req.created_at || "—";

  // Reopen Notice Banner
  const reopenBanner = $("ticketModalReopenBanner");
  if (reopenBanner) {
    const isCurrentlyReopened = (req.status === "Reopened / Under Review" || req.status_badge === "Reopened" || Boolean(req.is_reopened)) && req.status !== "Completed";
    const isCompletedRevisit = (req.status === "Completed" || req.status_badge === "Completed") && Boolean(req.is_reopened || req.previous_job_card);

    if (isCurrentlyReopened) {
      reopenBanner.classList.remove("hidden");
      reopenBanner.className = "rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-2 text-amber-950";
      if ($("ticketModalReopenIcon")) $("ticketModalReopenIcon").textContent = "⚠️";
      if ($("ticketModalReopenTitle")) {
        $("ticketModalReopenTitle").textContent = "Warranty Revisit Ticket (Active)";
        $("ticketModalReopenTitle").className = "text-xs font-bold uppercase tracking-wider text-amber-900";
      }
      if ($("ticketModalReopenDate")) {
        $("ticketModalReopenDate").textContent = req.reopened_at ? `Reopened on ${req.reopened_at}` : "Reopened recently";
        $("ticketModalReopenDate").className = "text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full";
      }
      if ($("ticketModalReopenReason")) $("ticketModalReopenReason").textContent = req.reopened_reason || "Customer reported repeat issue under 7-day guarantee.";
      if ($("ticketModalPrevTech")) {
        $("ticketModalPrevTech").textContent = req.previous_technician_name ? `Previous Technician: ${req.previous_technician_name}` : "Original technician record preserved";
      }
      const prevReceiptBtn = $("ticketModalPrevReceiptBtn");
      if (prevReceiptBtn) {
        if (req.previous_job_card) {
          prevReceiptBtn.classList.remove("hidden");
          prevReceiptBtn.onclick = () => window.openOpsReceiptModal(req.id, true);
        } else {
          prevReceiptBtn.classList.add("hidden");
        }
      }
    } else if (isCompletedRevisit) {
      reopenBanner.classList.remove("hidden");
      reopenBanner.className = "rounded-2xl bg-emerald-50/80 border border-emerald-200 p-4 space-y-2 text-emerald-950";
      if ($("ticketModalReopenIcon")) $("ticketModalReopenIcon").textContent = "✓";
      if ($("ticketModalReopenTitle")) {
        $("ticketModalReopenTitle").textContent = "Warranty Revisit (Resolved & Completed)";
        $("ticketModalReopenTitle").className = "text-xs font-bold uppercase tracking-wider text-emerald-900";
      }
      if ($("ticketModalReopenDate")) {
        $("ticketModalReopenDate").textContent = req.reopened_at ? `Reopened on ${req.reopened_at} · Resolved` : "Resolved Revisit";
        $("ticketModalReopenDate").className = "text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full";
      }
      if ($("ticketModalReopenReason")) $("ticketModalReopenReason").textContent = req.reopened_reason || "Customer reported repeat issue under 7-day guarantee (Resolved & Settled).";
      if ($("ticketModalPrevTech")) {
        $("ticketModalPrevTech").textContent = req.previous_technician_name ? `Original Technician: ${req.previous_technician_name}` : "Original technician record preserved";
      }
      const prevReceiptBtn = $("ticketModalPrevReceiptBtn");
      if (prevReceiptBtn) {
        if (req.previous_job_card) {
          prevReceiptBtn.classList.remove("hidden");
          prevReceiptBtn.onclick = () => window.openOpsReceiptModal(req.id, true);
        } else {
          prevReceiptBtn.classList.add("hidden");
        }
      }
    } else {
      reopenBanner.classList.add("hidden");
    }
  }

  // Customer Information Card
  if ($("ticketModalCustomerName")) $("ticketModalCustomerName").textContent = req.customer_name || "Customer";
  if ($("ticketModalCustomerPhone")) {
    $("ticketModalCustomerPhone").textContent = req.customer_phone ? `📞 ${req.customer_phone}` : "No phone provided";
    $("ticketModalCustomerPhone").href = req.customer_phone ? `tel:${req.customer_phone}` : "#";
  }
  if ($("ticketModalCustomerAddress")) $("ticketModalCustomerAddress").textContent = req.customer_address || "Customer address not specified";
  if ($("ticketModalPincode")) $("ticketModalPincode").textContent = req.pincode ? `PIN: ${req.pincode}` : "PIN: —";
  if ($("ticketModalGps")) {
    if (req.latitude && req.longitude) {
      $("ticketModalGps").textContent = `GPS: ${Number(req.latitude).toFixed(4)}, ${Number(req.longitude).toFixed(4)}`;
      $("ticketModalGps").classList.remove("hidden");
    } else {
      $("ticketModalGps").classList.add("hidden");
    }
  }

  // Appliance & Complaint Card
  if ($("ticketModalAppliance")) $("ticketModalAppliance").textContent = `${req.brand || ''} ${req.appliance_name || 'Home Appliance'}`.trim();
  if ($("ticketModalModelSerial")) {
    const details = [req.model_no ? `Model: ${req.model_no}` : '', req.serial_no ? `Serial: ${req.serial_no}` : ''].filter(Boolean).join(" · ");
    $("ticketModalModelSerial").textContent = details || "Model: Standard OEM";
  }
  if ($("ticketModalIssue")) $("ticketModalIssue").textContent = req.issue || "Diagnostic repair requested";
  if ($("ticketModalDesc")) $("ticketModalDesc").textContent = req.description || "No additional customer description provided.";

  // Defect Photo Thumbnail
  const defectWrap = $("ticketModalDefectWrap");
  if (defectWrap) {
    if (req.defect_photo) {
      defectWrap.classList.remove("hidden");
      const img = $("ticketModalDefectImg");
      if (img) {
        img.src = (req.defect_photo.startsWith("data:") || req.defect_photo.startsWith("http")) ? req.defect_photo : `${API_BASE_URL}${req.defect_photo}`;
        img.onclick = () => window.open(img.src, "_blank");
      }
    } else {
      defectWrap.classList.add("hidden");
    }
  }

  // Operations & Assignment
  const branchObj = branches.find((b) => b.id === req.branch_id);
  if ($("ticketModalBranchName")) $("ticketModalBranchName").textContent = branchObj ? branchObj.branch_name : (req.branch_id || "Unassigned");
  if ($("ticketModalBranchPhone")) $("ticketModalBranchPhone").textContent = branchObj ? `Manager: ${branchObj.manager_name || ''} · ${branchObj.mobile || branchObj.email || ''}` : "Local Franchise Branch";
  if ($("ticketModalAppointment")) $("ticketModalAppointment").textContent = `${req.appointment_date || 'Scheduled'} · ${req.appointment_slot || 'Regular Slot'}`;

  const tech = req.technician;
  if ($("ticketModalTechName")) $("ticketModalTechName").textContent = tech ? tech.name : (req.technician_name || "Awaiting Assignment");
  if ($("ticketModalTechTitle")) $("ticketModalTechTitle").textContent = tech ? (tech.title || "Authorized Field Technician") : "Pending dispatch by franchise supervisor";
  if ($("ticketModalTechRating")) {
    if (tech && tech.rating) {
      $("ticketModalTechRating").textContent = `★ ${tech.rating}`;
      $("ticketModalTechRating").classList.remove("hidden");
    } else {
      $("ticketModalTechRating").classList.add("hidden");
    }
  }
  if ($("ticketModalTechPhone")) {
    if (tech && tech.phone) {
      $("ticketModalTechPhone").textContent = `📞 ${tech.phone}`;
      $("ticketModalTechPhone").href = `tel:${tech.phone}`;
      $("ticketModalTechPhone").classList.remove("hidden");
    } else {
      $("ticketModalTechPhone").classList.add("hidden");
    }
  }

  // Security OTP Handshake
  if ($("ticketModalStartOtp")) $("ticketModalStartOtp").textContent = req.start_otp || req.verification_otp || "••••";
  if ($("ticketModalCompOtp")) $("ticketModalCompOtp").textContent = req.completion_otp || "••••";

  // Digital Job Card & Financial Settlement Card
  const jc = req.job_card || req.previous_job_card;
  const jcWrap = $("ticketModalJobCardWrap");
  if (jcWrap) {
    if (jc || req.status === "Completed") {
      jcWrap.classList.remove("hidden");
      if ($("ticketModalJcId")) $("ticketModalJcId").textContent = jc?.id || `JC-${req.id.replace('SR-', '')}`;
      if ($("ticketModalJcWork")) $("ticketModalJcWork").textContent = jc?.work_summary || "Technical inspection and standard service performed.";
      
      const partsBody = $("ticketModalPartsBody");
      if (partsBody) {
        const parts = (jc && Array.isArray(jc.parts_used)) ? jc.parts_used : [];
        if (parts.length > 0) {
          partsBody.innerHTML = parts.map((p, idx) => `
            <tr>
              <td class="p-2 text-slate-400 font-mono">${idx + 1}</td>
              <td class="p-2 font-medium text-slate-800">${safe(p.part_name)}</td>
              <td class="p-2 text-center text-slate-600">${p.quantity || 1}</td>
              <td class="p-2 text-right text-slate-600">₹${Number(p.unit_price || 0).toFixed(2)}</td>
              <td class="p-2 text-right font-semibold text-slate-800">₹${Number(p.total_price || (p.quantity * p.unit_price) || 0).toFixed(2)}</td>
            </tr>
          `).join("");
        } else {
          partsBody.innerHTML = `<tr><td colspan="5" class="p-2 text-center text-slate-400 text-[11px]">No spare parts replaced (Standard Doorstep Diagnosis & Labor only)</td></tr>`;
        }
      }

      const labor = jc ? Number(jc.labor_cost || 350) : 350;
      const tax = jc ? Number(jc.tax_amount || 0) : labor * 0.18;
      const total = jc ? Number(jc.total_amount || 0) : labor + tax;
      if ($("ticketModalLaborCost")) $("ticketModalLaborCost").textContent = `₹${labor.toFixed(2)}`;
      if ($("ticketModalTaxCost")) $("ticketModalTaxCost").textContent = `₹${tax.toFixed(2)}`;
      if ($("ticketModalGrandTotal")) $("ticketModalGrandTotal").textContent = `₹${total.toFixed(2)}`;

      const printReceiptBtn = $("ticketModalPrintReceiptBtn");
      if (printReceiptBtn) {
        printReceiptBtn.onclick = () => window.openOpsReceiptModal(req.id, false);
      }
    } else {
      jcWrap.classList.add("hidden");
    }
  }

  // Lifecycle Timeline
  const timelineEl = $("ticketModalTimeline");
  if (timelineEl) {
    const steps = req.timeline || [];
    timelineEl.innerHTML = steps.map((s, idx) => {
      const isDone = s.state === "completed";
      const isCurr = s.state === "current";
      const dotColor = isDone ? "bg-emerald-500" : isCurr ? "bg-blue-600 ring-4 ring-blue-100" : "bg-slate-300";
      return `
        <div class="flex items-start gap-3 relative pb-4 last:pb-0">
          ${idx < steps.length - 1 ? '<div class="absolute left-2.5 top-5 bottom-0 w-0.5 bg-slate-200"></div>' : ''}
          <div class="w-5 h-5 rounded-full ${dotColor} shrink-0 mt-0.5 flex items-center justify-center text-[10px] text-white font-bold">
            ${isDone ? '✓' : idx + 1}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2">
              <strong class="text-xs ${isCurr ? 'text-blue-600 font-bold' : isDone ? 'text-slate-800 font-bold' : 'text-slate-400 font-medium'}">${safe(s.title)}</strong>
              <span class="text-[10px] text-slate-400 whitespace-nowrap">${safe(s.timestamp || "Pending")}</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-0.5">${safe(s.description || "")}</p>
          </div>
        </div>
      `;
    }).join("");
  }

  // Map Tracking Button
  const trackBtn = $("ticketModalTrackBtn");
  if (trackBtn) {
    if (req.status === "Technician on the Way" || (req.technician_id && req.status !== "Completed")) {
      trackBtn.classList.remove("hidden");
      trackBtn.onclick = () => {
        dialog.close();
        openTechRouteMap(req.id);
      };
    } else {
      trackBtn.classList.add("hidden");
    }
  }

  dialog.showModal();
};

window.techDiagnosisModal = function(requestId) {
  const note = prompt("Enter diagnosis findings / required spare parts (e.g. PCB inspected, condenser coils cleaned):", "Initial inspection completed. Appliance tested.");
  if (note !== null) {
    window.techAction(requestId, 'diagnose');
  }
};

let opsTechSigCtx = null;
let isDrawingOpsTechSig = false;
let hasDrawnOpsTechSig = false;
let currentOpsJcRequestId = null;

function setupOpsTechSignaturePad() {
  const canvas = $("opsTechSigCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  opsTechSigCtx = ctx;
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
    isDrawingOpsTechSig = true;
    hasDrawnOpsTechSig = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!isDrawingOpsTechSig) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw() {
    isDrawingOpsTechSig = false;
  }

  canvas.addEventListener("pointerdown", startDraw);
  canvas.addEventListener("pointermove", draw);
  window.addEventListener("pointerup", endDraw);

  if ($("opsClearTechSigBtn")) {
    $("opsClearTechSigBtn").onclick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawnOpsTechSig = false;
    };
  }
}

function recalculateOpsJobCardTotals() {
  const container = $("opsPartsContainer");
  let partsTotal = 0;
  if (container) {
    container.querySelectorAll(".ops-part-row").forEach(row => {
      const qty = parseInt(row.querySelector(".part-qty")?.value || "1", 10);
      const price = parseFloat(row.querySelector(".part-price")?.value || "0");
      const lineTotal = (qty || 0) * (price || 0);
      partsTotal += lineTotal;
      const totalDisplay = row.querySelector(".part-line-total");
      if (totalDisplay) totalDisplay.textContent = `₹${lineTotal.toFixed(2)}`;
    });
  }

  const labor = parseFloat($("opsJcLaborCost")?.value || "0");
  const tax = Math.round((partsTotal + labor) * 0.18 * 100) / 100;
  const grandTotal = Math.round((partsTotal + labor + tax) * 100) / 100;

  if ($("opsCalcPartsSubtotal")) $("opsCalcPartsSubtotal").textContent = `₹${partsTotal.toFixed(2)}`;
  if ($("opsCalcLabor")) $("opsCalcLabor").textContent = `₹${labor.toFixed(2)}`;
  if ($("opsCalcTax")) $("opsCalcTax").textContent = `₹${tax.toFixed(2)}`;
  if ($("opsCalcTotal")) $("opsCalcTotal").textContent = `₹${grandTotal.toFixed(2)}`;
}

function addOpsPartRow(name = "", qty = 1, price = 0) {
  const container = $("opsPartsContainer");
  if (!container) return;
  const rowId = `part_row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const lineTotal = (qty || 1) * (price || 0);
  const rowHtml = `
    <div id="${rowId}" class="ops-part-row flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
      <input type="text" placeholder="Part description (e.g. Capacitor 45uF)" value="${safe(name)}" required class="part-name flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white">
      <input type="number" min="1" max="50" value="${qty}" class="part-qty w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center bg-white">
      <input type="number" min="0" step="10" placeholder="₹ Price" value="${price}" class="part-price w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-right bg-white">
      <span class="part-line-total text-xs font-bold text-slate-800 w-16 text-right">₹${lineTotal.toFixed(2)}</span>
      <button type="button" class="text-rose-500 hover:text-rose-700 p-1 font-bold" onclick="document.getElementById('${rowId}').remove(); recalculateOpsJobCardTotals();">✕</button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", rowHtml);
  const newRow = document.getElementById(rowId);
  if (newRow) {
    newRow.querySelectorAll(".part-qty, .part-price").forEach(inp => {
      inp.addEventListener("input", recalculateOpsJobCardTotals);
    });
  }
  recalculateOpsJobCardTotals();
}

window.openOpsJobCardModal = async function(requestId) {
  const req = requests.find(r => r.id === requestId);
  if (!req) return;
  currentOpsJcRequestId = requestId;

  const dialog = $("opsJobCardDialog");
  if (!dialog) return;
  dialog.showModal();

  if ($("opsJcMessage")) $("opsJcMessage").textContent = "";
  if ($("opsJcReqId")) $("opsJcReqId").textContent = req.id;
  if ($("opsJcCustomerName")) $("opsJcCustomerName").textContent = `${req.customer_name} (${req.customer_phone || ''})`;
  if ($("opsJcApplianceIssue")) $("opsJcApplianceIssue").textContent = `${req.appliance_name} · Issue: ${req.issue}`;
  if ($("opsPartsContainer")) $("opsPartsContainer").innerHTML = "";

  setupOpsTechSignaturePad();

  let existingJc = null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/requests/${requestId}/job-card`, {
      headers: jsonHeaders(),
      credentials: "include"
    });
    if (res.ok) {
      existingJc = await res.json();
    }
  } catch (e) {}

  if (existingJc) {
    if ($("opsJcStatusBadge")) {
      $("opsJcStatusBadge").textContent = existingJc.customer_status === "accepted" ? "✓ Customer Accepted" : existingJc.customer_status === "disputed" ? "⚠️ Customer Disputed" : "Awaiting Customer Sign-off";
      $("opsJcStatusBadge").className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${existingJc.customer_status === "accepted" ? "bg-emerald-100 text-emerald-800" : existingJc.customer_status === "disputed" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`;
    }
    if ($("opsJcWorkSummary")) $("opsJcWorkSummary").value = existingJc.work_summary || "";
    if ($("opsJcLaborCost")) $("opsJcLaborCost").value = existingJc.labor_cost;
    if (Array.isArray(existingJc.parts_used)) {
      existingJc.parts_used.forEach(p => addOpsPartRow(p.part_name, p.quantity, p.unit_price));
    }
    recalculateOpsJobCardTotals();

    if ($("opsCustomerSigReadout")) {
      $("opsCustomerSigReadout").classList.remove("hidden");
      if (existingJc.customer_signature && $("opsCustomerSigImg")) {
        $("opsCustomerSigImg").src = existingJc.customer_signature;
        $("opsCustomerSigImg").classList.remove("hidden");
      }
      if ($("opsCustomerStatusText")) {
        $("opsCustomerStatusText").textContent = existingJc.customer_status === "accepted" ? "Customer approved & signed" : existingJc.customer_status === "disputed" ? "Customer disputed job card" : "Awaiting customer sign-off";
      }
      if ($("opsCustomerRemarksText")) {
        $("opsCustomerRemarksText").textContent = existingJc.customer_remarks || "";
      }
    }
    if (req.status_badge === "Completed") {
      if ($("opsOtpSection")) $("opsOtpSection").classList.add("hidden");
      if ($("saveOpsJcBtn")) $("saveOpsJcBtn").textContent = "Update Job Card";
    }
  } else {
    if ($("opsJcStatusBadge")) {
      $("opsJcStatusBadge").textContent = "Drafting";
      $("opsJcStatusBadge").className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700";
    }
    if ($("opsJcWorkSummary")) $("opsJcWorkSummary").value = `Inspected ${req.appliance_name}. Completed diagnosis and testing.`;
    if ($("opsJcLaborCost")) $("opsJcLaborCost").value = "350";
    if ($("opsCustomerSigReadout")) $("opsCustomerSigReadout").classList.add("hidden");
    if ($("opsOtpSection")) $("opsOtpSection").classList.remove("hidden");
    if ($("saveOpsJcBtn")) $("saveOpsJcBtn").textContent = "Generate & Complete Job";
    recalculateOpsJobCardTotals();
  }
};

async function submitOpsJobCard(e) {
  e.preventDefault();
  const requestId = currentOpsJcRequestId;
  if (!requestId) return;

  const targetReq = requests.find(r => r.id === requestId);
  const isAlreadyCompleted = targetReq?.status_badge === "Completed";
  const btn = $("saveOpsJcBtn");
  btn.disabled = true;
  btn.textContent = "Processing…";
  if ($("opsJcMessage")) $("opsJcMessage").textContent = "";

  const work_summary = $("opsJcWorkSummary")?.value.trim();
  const labor_cost = parseFloat($("opsJcLaborCost")?.value || "0");
  const otp = $("opsJcOtpInput")?.value.trim();

  if (!isAlreadyCompleted && (!otp || otp.length < 4)) {
    if ($("opsJcMessage")) $("opsJcMessage").textContent = "Please enter the 4-digit verification OTP provided by the customer.";
    btn.disabled = false;
    btn.textContent = "Generate & Complete Job";
    return;
  }

  const parts_used = [];
  const container = $("opsPartsContainer");
  if (container) {
    container.querySelectorAll(".ops-part-row").forEach(row => {
      const name = row.querySelector(".part-name")?.value.trim();
      const qty = parseInt(row.querySelector(".part-qty")?.value || "1", 10);
      const price = parseFloat(row.querySelector(".part-price")?.value || "0");
      if (name) {
        parts_used.push({
          part_name: name,
          quantity: qty || 1,
          unit_price: price || 0,
          total_price: (qty || 1) * (price || 0)
        });
      }
    });
  }

  const canvas = $("opsTechSigCanvas");
  const techSig = (hasDrawnOpsTechSig && canvas) ? canvas.toDataURL("image/png") : null;

  try {
    // 1. Post Job Card
    const jcRes = await fetch(`${API_BASE_URL}/api/requests/${requestId}/job-card`, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({
        work_summary,
        parts_used,
        labor_cost,
        technician_signature: techSig
      })
    });
    const jcData = await jcRes.json().catch(() => ({}));
    if (!jcRes.ok) throw new Error(extractErrorMessage(jcData, "Failed to save job card"));

    // 2. If not already completed, complete the job with OTP
    if (!isAlreadyCompleted) {
      const actionRes = await fetch(`${API_BASE_URL}/api/requests/${requestId}/action`, {
        method: "POST",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({ action: "complete", verification_otp: otp })
      });
      const actionData = await actionRes.json().catch(() => ({}));
      if (!actionRes.ok) throw new Error(extractErrorMessage(actionData, "Failed to complete service"));
      const idx = requests.findIndex(r => r.id === requestId);
      if (idx !== -1) requests[idx] = actionData;
    }

    showToast("Job Card generated & service completed successfully!", "success");
    $("opsJobCardDialog")?.close();
    setMetrics();
    renderRequests();
    renderInsights();
  } catch (err) {
    if ($("opsJcMessage")) $("opsJcMessage").textContent = err.message || "An error occurred.";
  } finally {
    btn.disabled = false;
    btn.textContent = isAlreadyCompleted ? "Update Job Card" : "Generate & Complete Job";
  }
}

let techMapPollTimer = null;
function stopTechMapAnimation() {
  if (techMapPollTimer) {
    clearInterval(techMapPollTimer);
    techMapPollTimer = null;
  }
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
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
      const customerLat = targetReq.latitude || 28.5355;
      const customerLng = targetReq.longitude || 77.3910;
      const hasLiveGps = (targetReq.tech_latitude != null && targetReq.tech_longitude != null);
      let techLat = hasLiveGps ? targetReq.tech_latitude : (customerLat + 0.015);
      let techLng = hasLiveGps ? targetReq.tech_longitude : (customerLng - 0.013);

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
      const techMarker = L.marker([techLat, techLng], { icon: techIcon }).addTo(map);

      // Route line
      const activeRouteLine = L.polyline([[techLat, techLng], [customerLat, customerLng]], {
        color: "#2563eb",
        weight: 5,
        dashArray: hasLiveGps ? null : "6, 8"
      }).addTo(map);

      function updateRouteDetails(lat, lng, isLive, lastUpdated) {
        const distKm = calculateDistanceKm(lat, lng, customerLat, customerLng);
        const etaMinutes = Math.max(1, Math.round((distKm / 25) * 60));

        if (distKm < 0.05) {
          if ($("techMapEtaText")) $("techMapEtaText").textContent = `✓ ${techName} has arrived at customer doorstep!`;
          if ($("techMapDistText")) $("techMapDistText").textContent = "Arrived · 0 meters away · Service starting";
          techMarker.getPopup()?.setContent(`<b>${safe(techName)}</b><br><span style="color:#10b981;font-weight:bold;">✓ Arrived at Customer Doorstep</span>`);
        } else if (isLive) {
          if ($("techMapEtaText")) $("techMapEtaText").textContent = `${techName} is en route · ~${etaMinutes} mins away`;
          if ($("techMapDistText")) $("techMapDistText").textContent = `Live GPS: ~${distKm.toFixed(1)} km away · Last ping: ${lastUpdated || 'Just now'}`;
          techMarker.getPopup()?.setContent(`<b>${safe(techName)}</b><br><span>Live GPS: ~${distKm.toFixed(1)} km away (${etaMinutes} mins)</span>`);
        } else {
          if ($("techMapEtaText")) $("techMapEtaText").textContent = `${techName} is dispatched · En route to doorstep`;
          if ($("techMapDistText")) $("techMapDistText").textContent = "Awaiting technician live GPS signal…";
          techMarker.getPopup()?.setContent(`<b>${safe(techName)}</b><br><span>Dispatched · Waiting for live GPS signal</span>`);
        }
      }

      techMarker.bindPopup(`<b>${safe(techName)}</b><br><span id="opsLivePopupEta">Technician Location</span>`).openPopup();
      updateRouteDetails(techLat, techLng, hasLiveGps, targetReq.tech_location_updated_at);
      map.fitBounds(L.latLngBounds([[techLat, techLng], [customerLat, customerLng]]), { padding: [50, 50] });

      // Poll every 8s for live coordinate updates from the field
      techMapPollTimer = setInterval(async () => {
        if (!window._techMapInstance) {
          stopTechMapAnimation();
          return;
        }
        try {
          const pollRes = await fetch(`${API_BASE_URL}/api/requests/${encodeURIComponent(targetReq.id)}`, {
            headers: authHeaders()
          });
          if (pollRes.ok) {
            const updated = await pollRes.json();
            if (updated.tech_latitude != null && updated.tech_longitude != null) {
              const newLat = updated.tech_latitude;
              const newLng = updated.tech_longitude;
              techMarker.setLatLng([newLat, newLng]);
              activeRouteLine.setLatLngs([[newLat, newLng], [customerLat, customerLng]]);
              activeRouteLine.setStyle({ dashArray: null });
              updateRouteDetails(newLat, newLng, true, updated.tech_location_updated_at);
            }
          }
        } catch (e) {}
      }, 8000);

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
    if (role === "franchise" && name === "Customers") note = franchiseCustomers.length + " customer" + (franchiseCustomers.length === 1 ? "" : "s");
    if (role === "franchise" && name === "Inventory items") note = franchiseInventory.length + " parts in warehouse";
    if (role === "company" && name === "Warranty claims") note = companyWarrantyClaims.length + " reimbursement claims";
    return `<div class="resource-card"><span class="resource-icon">${icon}</span><span><strong>${name}</strong><small>${note}</small></span></div>`;
  }).join("");
}

async function loadDashboard() {
  const currentRole = dashboardRouteRole || targetRole;
  const storedUser = getStoredOpsUser(currentRole);
  if (storedUser) user = storedUser;
  else {
    const rawStored = localStorage.getItem("servora_user");
    if (rawStored) { try { user = JSON.parse(rawStored); } catch { user = null; } }
  }
  try {
    const userResponse = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include", headers: authHeaders() });
    if (userResponse.ok) {
      const resData = await userResponse.json();
      const authenticated = resData.user;
      if (dashboardRouteRole && !roleMatches(authenticated.role, dashboardRouteRole)) {
        window.location.replace(loginPath);
        return;
      }
      const token = resData.session_token || user?.session_token || initialUser?.session_token;
      user = { ...user, ...authenticated, session_token: token };
      localStorage.setItem("servora_user", JSON.stringify(user));
      const roleKey = (user.role === "branch" || user.role === "franchise") ? "franchise" : user.role;
      localStorage.setItem(`servora_user_${roleKey}`, JSON.stringify(user));
      setProfile();
    } else if (userResponse.status === 401) {
      if (user?.id) {
        console.warn("Transient 401 on /api/auth/me; retaining stored ops session.");
      } else {
        window.location.replace(loginPath);
        return;
      }
    }
    if (dashboardRouteRole && user?.role && !roleMatches(user.role, dashboardRouteRole)) {
      window.location.replace(loginPath);
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
      try {
        companyWarrantyClaims = await generalApi("/api/warranty-amc/claims");
        localStorage.setItem("servora_cache_claims", JSON.stringify(companyWarrantyClaims));
      } catch { companyWarrantyClaims = []; }
      try {
        companySparesCatalog = await generalApi("/api/inventory/parts");
        localStorage.setItem("servora_cache_catalog", JSON.stringify(companySparesCatalog));
      } catch { companySparesCatalog = []; }
    }
    if (role === "franchise") {
      try {
        technicians = await franchiseApi("/technicians");
        localStorage.setItem("servora_cache_techs", JSON.stringify(technicians));
      } catch { technicians = []; }
      try {
        const branchId = user?.branch_id || user?.id || "me";
        franchiseInventory = await generalApi(`/api/inventory/branch/${encodeURIComponent(branchId)}`);
        localStorage.setItem("servora_cache_inventory", JSON.stringify(franchiseInventory));
      } catch { franchiseInventory = []; }
      try {
        franchiseCustomers = await franchiseApi("/customers");
        localStorage.setItem("servora_cache_franchise_customers", JSON.stringify(franchiseCustomers));
      } catch {
        compileFranchiseCustomersFromRequests();
      }
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
    else if (role === "company" && page === "Warranty Claims") renderCompanyWarrantyClaims();
    else if (role === "company" && page === "Spares Catalog") renderCompanySparesCatalog();
    else if (role === "franchise" && page === "Technicians") renderFranchiseTechnicians();
    else if (role === "franchise" && page === "Customers") renderFranchiseCustomers();
    else if (role === "franchise" && page === "Inventory & Spares") renderFranchiseInventory();
    else if (role === "admin" && ["Branches", "Technicians", "Customers"].includes(page)) renderDirectory(page);
    else if (role === "admin" && page === "Service requests") renderRequestDirectory();
    else renderRequests();
  });

  $("statusFilter")?.addEventListener("change", () => {
    if (role === "admin" && $("crumbTitle")?.textContent === "Service requests") renderRequestDirectory();
    else if ($("crumbTitle")?.textContent === "Customers") {
      if (role === "company") renderCompanyCustomers();
      else if (role === "franchise") renderFranchiseCustomers();
    }
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
      const rows = [
        ["Customer Name", "Customer Email", "Customer Phone", "Service Address", "PIN Code", "Registered Products", "Warranty Status", "Ongoing Jobs", "Completed Jobs"],
        ...franchiseCustomers.map((c) => [
          c.customer_name, c.customer_email || "", c.customer_phone, c.customer_address || "", c.pincode || "",
          c.products_summary || "", c.warranty_status || "", c.ongoing_services_count || 0, c.completed_services_count || 0
        ])
      ];
      downloadCsv(`servora-franchise-customers.csv`, rows);
      return;
    }
    if (role === "franchise" && page === "Inventory & Spares") {
      const rows = [
        ["Part Code", "Part Name", "Brand", "Category", "HSN Code", "Unit Price", "Stock Available", "Reorder Level", "Low Stock"],
        ...franchiseInventory.map((item) => [
          item.part_code, item.name, item.brand, item.category, item.hsn_code || "841890",
          item.unit_price, item.quantity_available, item.reorder_level, item.is_low_stock ? "YES" : "NO"
        ])
      ];
      downloadCsv("servora-franchise-inventory.csv", rows);
      return;
    }
    if (role === "company" && page === "Warranty Claims") {
      const rows = [
        ["Claim ID", "Request ID", "Branch Name", "Appliance", "Claim Amount", "Status", "Submitted At", "Settled At"],
        ...companyWarrantyClaims.map((item) => [
          item.id, item.request_id, item.branch_name, item.appliance_name,
          item.claim_amount, item.status, item.submitted_at || "", item.settled_at || ""
        ])
      ];
      downloadCsv("servora-warranty-claims.csv", rows);
      return;
    }
    if (role === "company" && page === "Spares Catalog") {
      const rows = [
        ["Part Code", "Part Name", "Brand", "Category", "HSN Code", "Unit Price"],
        ...companySparesCatalog.map((item) => [
          item.part_code, item.name, item.brand, item.category, item.hsn_code || "841890", item.unit_price
        ])
      ];
      downloadCsv("servora-spares-catalog.csv", rows);
      return;
    }
    const rows = [["Request ID", "Customer", "Appliance", "Issue", "Status", "Date"], ...requests.map((item) => [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge, item.appointment_date])];
    downloadCsv(`servora-${role}-requests.csv`, rows);
  });

  $("logoutBtn")?.addEventListener("click", () => {
    const logoutRole = dashboardRouteRole || role;
    const headers = authHeaders();
    localStorage.removeItem("servora_user");
    const rKey = (logoutRole === "branch" || logoutRole === "franchise") ? "franchise" : logoutRole;
    localStorage.removeItem(`servora_user_${rKey}`);
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
  $("closeEditTechnicianDialog")?.addEventListener("click", () => $("editTechnicianDialog")?.close());
  $("cancelEditTechnician")?.addEventListener("click", () => $("editTechnicianDialog")?.close());
  $("closeTechMap")?.addEventListener("click", () => { stopTechMapAnimation(); $("techMapDialog")?.close(); });
  $("techMapDialog")?.addEventListener("close", () => stopTechMapAnimation());
  $("closeCompanyDetail")?.addEventListener("click", () => $("companyDetailModal")?.close());
  $("closeTicketDetailModal")?.addEventListener("click", () => $("ticketDetailModal")?.close());
  $("closeTicketDetailModalBtn")?.addEventListener("click", () => $("ticketDetailModal")?.close());
  $("closeOpsReceiptDialog")?.addEventListener("click", () => $("opsReceiptDialog")?.close());
  $("printOpsReceiptBtn")?.addEventListener("click", () => window.print());

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

  $("editTechnicianForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const msg = $("editTechnicianFormMessage");
    const techId = $("editTechId")?.value;
    if (!techId) return;

    if (submit) submit.disabled = true;
    if (msg) msg.textContent = "Saving technician details…";

    const payload = {
      name: $("editTechName")?.value.trim(),
      title: $("editTechTitle")?.value.trim(),
      mobile: $("editTechMobile")?.value.trim(),
      address: $("editTechAddress")?.value.trim(),
      pincode: $("editTechPincode")?.value.trim(),
    };

    try {
      const updated = await franchiseApi(`/technicians/${encodeURIComponent(techId)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const idx = technicians.findIndex((t) => t.id === techId);
      if (idx !== -1) {
        technicians[idx] = { ...technicians[idx], ...updated };
      }
      localStorage.setItem("servora_cache_techs", JSON.stringify(technicians));

      // Synchronize technician stored user in localStorage
      try {
        const storedTech = localStorage.getItem("servora_user_technician");
        if (storedTech) {
          const parsed = JSON.parse(storedTech);
          if (parsed && (parsed.id === techId || parsed.email === updated.email)) {
            const synced = {
              ...parsed,
              name: updated.name,
              title: updated.title,
              phone: updated.mobile,
              address: updated.address ? `${updated.address}${updated.pincode ? `, ${updated.pincode}` : ''}` : parsed.address,
              pincode: updated.pincode || parsed.pincode,
            };
            localStorage.setItem("servora_user_technician", JSON.stringify(synced));
            const gen = localStorage.getItem("servora_user");
            if (gen) {
              const genParsed = JSON.parse(gen);
              if (genParsed && (genParsed.id === techId || genParsed.email === updated.email)) {
                localStorage.setItem("servora_user", JSON.stringify(synced));
              }
            }
          }
        }
      } catch (err) {}

      // Broadcast update event to any open tabs
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("servora_technician_sync");
          bc.postMessage({ type: "TECHNICIAN_UPDATED", technician: updated });
          bc.close();
        }
        localStorage.setItem("servora_tech_updated_at", Date.now().toString());
      } catch (err) {}

      $("editTechnicianDialog")?.close();
      renderFranchiseTechnicians();
      showToast(`Technician ${updated.name || "details"} updated successfully.`);
    } catch (error) {
      if (msg) msg.textContent = error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  // Digital Job Card Modal Events (Phase 1)
  $("closeOpsJobCard")?.addEventListener("click", () => $("opsJobCardDialog")?.close());
  $("cancelOpsJcBtn")?.addEventListener("click", () => $("opsJobCardDialog")?.close());
  $("opsAddPartRowBtn")?.addEventListener("click", () => addOpsPartRow("", 1, 0));
  $("opsJcLaborCost")?.addEventListener("input", recalculateOpsJobCardTotals);
  $("opsJobCardForm")?.addEventListener("submit", submitOpsJobCard);

  // Phase 2 Modals (Warehouse Restock, Warranty Claim Review, Branch Deep-Dive & Customer Deep-Dive)
  initRestockModalEvents();
  initClaimReviewModalEvents();
  initBranchDetailModalEvents();
  initCustomerDetailModalEvents();
}

function populateOpsProfileModal() {
  const displayName = user?.name || "Servora User";
  const displayRole = user?.role || role || "technician";
  const displayEmail = user?.email || "user@servora.in";
  const displayPhone = user?.phone || user?.mobile || "+91 98765 43210";
  const displayTitle = user?.title || "Field Service Specialist";
  const displayBranch = user?.branch_name || user?.company_branch || (user?.branch_id ? `Branch #${user?.branch_id}` : "");

  let displayAddr = user?.address || "Not provided";
  if (user?.pincode && !displayAddr.includes(user.pincode)) {
    displayAddr = `${displayAddr}, ${user.pincode}`;
  }

  if ($("opsProfileNameText")) $("opsProfileNameText").textContent = displayName;
  if ($("opsProfileRoleBadge")) $("opsProfileRoleBadge").textContent = (role === "technician" ? "AUTHORIZED TECHNICIAN" : displayRole.toUpperCase());
  if ($("opsProfileAvatar")) $("opsProfileAvatar").textContent = displayName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U";
  if ($("opsProfileEmailText")) $("opsProfileEmailText").textContent = displayEmail;
  if ($("opsProfilePhoneText")) $("opsProfilePhoneText").textContent = displayPhone;
  if ($("opsProfileTitleText")) $("opsProfileTitleText").textContent = displayTitle;
  if ($("opsProfileAddressText")) $("opsProfileAddressText").textContent = displayAddr;

  if (displayBranch) {
    if ($("opsProfileBranchRow")) $("opsProfileBranchRow").classList.remove("hidden");
    if ($("opsProfileBranchText")) $("opsProfileBranchText").textContent = displayBranch;
  } else if ($("opsProfileBranchRow")) {
    $("opsProfileBranchRow").classList.add("hidden");
  }

  if ($("editOpsName")) $("editOpsName").value = displayName;
  if ($("editOpsPhone")) $("editOpsPhone").value = (displayPhone === "+91 98765 43210" && !user?.phone) ? "" : displayPhone;
  if ($("editOpsAddress")) $("editOpsAddress").value = user?.address || "";
  if ($("editOpsMessage")) $("editOpsMessage").textContent = "";

  const isTechnician = displayRole === "technician" || role === "technician";
  if ($("openEditOpsProfileBtn")) $("openEditOpsProfileBtn").style.display = isTechnician ? "none" : "";
  if ($("opsProfileEditForm")) $("opsProfileEditForm").style.display = isTechnician ? "none" : "";

  if ($("opsProfileViewMode")) $("opsProfileViewMode").classList.remove("hidden");
  if ($("opsProfileEditForm")) $("opsProfileEditForm").classList.add("hidden");
}

window.openOpsProfileModal = async function() {
  const dialog = $("opsProfileDialog");
  if (!dialog) return;

  populateOpsProfileModal();
  dialog.showModal();

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include", headers: authHeaders() });
    if (res.ok) {
      const resData = await res.json();
      if (resData?.user) {
        user = { ...user, ...resData.user };
        const roleKey = (user.role === "branch" || user.role === "franchise") ? "franchise" : user.role;
        localStorage.setItem(`servora_user_${roleKey}`, JSON.stringify(user));
        localStorage.setItem("servora_user", JSON.stringify(user));
        setProfile();
        populateOpsProfileModal();
      }
    }
  } catch (e) {}
};

// ==========================================
// Multi-Tier SLA Escalations (SRS 6.15)
// ==========================================
async function loadEscalationsData() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/escalations`, {
      headers: jsonHeaders(),
      credentials: "include"
    });
    if (res.ok) {
      escalationsList = await res.json();
    } else {
      escalationsList = [];
    }
  } catch (err) {
    escalationsList = [];
  }
  renderEscalationsView();
}

function renderEscalationsView() {
  if ($("crumbTitle")) $("crumbTitle").textContent = "Escalations";
  setHidden("addCompanyButton", true);
  setHidden("addBranchButton", true);
  setHidden("addTechnicianButton", true);
  setHidden("companyInlineAdd", true);
  setHidden("exportButton", false);
  setHidden("pageContent", false);
  setHidden("metricGrid", true);

  if ($("tableTitle")) $("tableTitle").textContent = "Multi-Tier SLA Escalations (SRS 6.15)";
  if ($("tableSubtitle")) $("tableSubtitle").textContent = "Real-time escalation queue for SLA breaches (Franchise L1 → Brand Manager L2 → Platform Admin L3).";

  const tableEl = $("requestRows")?.closest("table");
  const techContainer = $("techJobCardsContainer");
  if (tableEl) tableEl.style.display = "";
  if (techContainer) techContainer.style.display = "none";

  $("healthContent").innerHTML = `
    <div class="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-2">
      <div class="font-bold flex items-center justify-between">
        <span>SLA Breach Rules</span>
        <button type="button" onclick="window.runManualSlaScan()" class="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-[10px] transition shadow-xs">
          🔄 Run SLA Scan
        </button>
      </div>
      <p class="text-[11px] text-purple-800 leading-relaxed">
        • Unassigned &gt; 4h: L1 (Franchise)<br>
        • Unassigned &gt; 8h: L2 (Brand Manager)<br>
        • Unresolved &gt; 48h: L1 (Franchise)<br>
        • Unresolved &gt; 72h: L2 (Brand Manager)<br>
        • Unresolved &gt; 96h: L3 (Platform Admin)
      </p>
    </div>
  `;
  $("activityContent").innerHTML = `<div class="section-empty text-xs">Mandatory resolution notes are required by the Servora governance engine to resolve any escalation.</div>`;

  $("requestHead").innerHTML = [
    "Escalation ID",
    "Ticket ID",
    "Customer / Appliance",
    "SLA Tier & Target",
    "Breach Reason",
    "Due Date",
    "Status",
    "Action"
  ].map((l) => `<th>${safe(l)}</th>`).join("");

  const query = ($("requestSearch")?.value || "").trim().toLowerCase();
  const filtered = escalationsList.filter((e) =>
    [e.id, e.request_id, e.reason, e.status, e.target_role].join(" ").toLowerCase().includes(query)
  );

  const levelBadges = {
    1: `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">L1 · Franchise</span>`,
    2: `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">L2 · Brand Mgr</span>`,
    3: `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">L3 · Platform Admin</span>`
  };

  $("requestRows").innerHTML = filtered.length
    ? filtered.map((e) => {
        const req = requests.find(r => r.id === e.request_id);
        const isOpen = e.status === "Open" || e.status === "In Progress";
        return `
          <tr>
            <td><strong class="font-mono text-purple-700 text-xs">${safe(e.id)}</strong></td>
            <td><span class="font-mono font-bold text-slate-800 text-xs">${safe(e.request_id)}</span></td>
            <td>
              <div>
                <strong class="text-xs text-slate-800 block">${safe(req?.customer_name || 'Customer')}</strong>
                <span class="text-[11px] text-slate-500">${safe(req?.appliance_name || 'Home Appliance')}</span>
              </div>
            </td>
            <td>
              <div class="space-y-1">
                ${levelBadges[e.level] || `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Tier ${e.level}</span>`}
                <span class="text-[10px] text-slate-400 block">${safe(e.target_role ? e.target_role.toUpperCase() : 'OPS')}</span>
              </div>
            </td>
            <td class="max-w-[280px]">
              <p class="text-xs text-slate-700 font-medium">${safe(e.reason)}</p>
              ${e.resolution_note ? `<p class="text-[11px] text-emerald-700 mt-1 font-semibold">✓ ${safe(e.resolution_note)}</p>` : ''}
            </td>
            <td class="text-xs text-slate-600 whitespace-nowrap">${safe(e.due_date || 'Immediate')}</td>
            <td>
              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${isOpen ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}">
                ${isOpen ? '● Open SLA' : '✓ Resolved'}
              </span>
            </td>
            <td>
              <div class="flex items-center gap-1.5 whitespace-nowrap">
                ${isOpen ? `
                  <button type="button" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition" onclick="window.openResolveEscalationModal('${safe(e.id)}')">
                    Resolve
                  </button>
                  ${e.level < 3 ? `
                    <button type="button" class="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs transition" onclick="window.escalateToNextTier('${safe(e.id)}')">
                      ⬆ Tier ${e.level + 1}
                    </button>
                  ` : ''}
                ` : `
                  <span class="text-[11px] text-slate-400 font-semibold">Closed</span>
                `}
              </div>
            </td>
          </tr>
        `;
      }).join("")
    : `<tr><td class="empty-row" colspan="8">${query ? "No escalations match your filter." : "✓ Excellent! No active SLA escalations in your queue."}</td></tr>`;

  if ($("requestCount")) $("requestCount").textContent = `${filtered.length} escalation${filtered.length === 1 ? '' : 's'}`;
}

let activeEscalationIdToResolve = null;
window.openResolveEscalationModal = function(escId) {
  activeEscalationIdToResolve = escId;
  let dialog = $("resolveEscDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "resolveEscDialog";
    dialog.className = "w-[min(94vw,480px)] rounded-3xl border-0 p-0 shadow-2xl overflow-hidden bg-white";
    document.body.appendChild(dialog);
  }
  dialog.innerHTML = `
    <div class="p-6 space-y-4">
      <div class="flex items-start justify-between border-b border-slate-200 pb-3">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">SRS 6.15 Resolution Gate</span>
          <h3 class="text-lg font-bold text-slate-900 mt-1">Resolve Escalation #${safe(escId)}</h3>
        </div>
        <button type="button" onclick="document.getElementById('resolveEscDialog').close()" class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm">✕</button>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Mandatory Resolution Note (FR-ESC-008):</label>
        <textarea id="escResolutionNoteInput" rows="3" class="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Explain corrective action taken to settle this SLA breach..."></textarea>
      </div>
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="document.getElementById('resolveEscDialog').close()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
        <button type="button" onclick="window.submitEscalationResolution()" class="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition">
          ✓ Confirm Resolution
        </button>
      </div>
    </div>
  `;
  dialog.showModal();
};

window.submitEscalationResolution = async function() {
  if (!activeEscalationIdToResolve) return;
  const note = $("escResolutionNoteInput")?.value.trim();
  if (!note || note.length < 5) {
    showToast("Mandatory resolution note required (min 5 chars).", "warning");
    return;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/escalations/${activeEscalationIdToResolve}/resolve`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ resolution_note: note }),
      credentials: "include"
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to resolve escalation");
    }
    showToast("✓ Escalation resolved successfully!", "info");
    $("resolveEscDialog")?.close();
    await loadEscalationsData();
    await loadDashboard();
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.escalateToNextTier = async function(escId) {
  if (!confirm(`Push escalation #${escId} to next management tier?`)) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/escalations/${escId}/escalate-next`, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include"
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to escalate tier");
    }
    showToast(`⬆ Escalation pushed to next tier. Management notified.`, "info");
    await loadEscalationsData();
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.runManualSlaScan = async function() {
  showToast("Running automated SLA scanner...", "info");
  try {
    const res = await fetch(`${API_BASE_URL}/api/escalations/check-sla`, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include"
    });
    if (res.ok) {
      const breaches = await res.json();
      showToast(`SLA scan completed. ${breaches.length} breaches evaluated.`, "info");
      await loadEscalationsData();
    }
  } catch (err) {
    showToast("SLA scan failed: " + err.message, "error");
  }
};

// ==========================================
// Pre-Repair Technician Estimate Gate (SRS 6.10)
// ==========================================
let currentEstimateRequestId = null;

window.openTechEstimateModal = async function(requestId) {
  const req = requests.find(r => r.id === requestId);
  if (!req) return;
  currentEstimateRequestId = requestId;

  let existingEst = null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/requests/${requestId}/estimate`, {
      headers: jsonHeaders(),
      credentials: "include"
    });
    if (res.ok) existingEst = await res.json();
  } catch (e) {}

  let modal = $("techEstimateModal");
  if (!modal) {
    modal = document.createElement("dialog");
    modal.id = "techEstimateModal";
    modal.className = "w-[min(94vw,620px)] rounded-3xl border-0 p-0 shadow-2xl overflow-hidden bg-white";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="p-6 sm:p-7 space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-start justify-between border-b border-slate-200 pb-3">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Pre-Repair Gate (SRS 6.10)</span>
          <h3 class="text-lg font-bold text-slate-900 mt-1">Submit Customer Estimate</h3>
          <p class="text-xs text-slate-500">Service Request #${safe(req.id)} · ${safe(req.customer_name)}</p>
        </div>
        <button type="button" onclick="document.getElementById('techEstimateModal').close()" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm">✕</button>
      </div>

      <p class="text-xs text-slate-600">
        Before replacing parts or starting repairs, submit an itemized estimate. The customer must approve the cost on their phone before repair commences.
      </p>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-700 uppercase">Estimated Replacement Parts</span>
          <button type="button" onclick="window.addTechEstimatePartRow()" class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100">
            + Add Spare Part
          </button>
        </div>
        <div id="techEstPartsContainer" class="space-y-2"></div>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-2">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Diagnostic / Inspection Fee (₹)</label>
          <input type="number" id="techEstInspectionFee" class="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" value="${existingEst?.inspection_fee ?? 299.0}" oninput="window.calcTechEstimateTotal()">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Labor / Service Charges (₹)</label>
          <input type="number" id="techEstLaborCost" class="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" value="${existingEst?.labor_estimate ?? 350.0}" oninput="window.calcTechEstimateTotal()">
        </div>
      </div>

      <div class="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 flex items-center justify-between">
        <span class="text-xs font-bold text-amber-950">Total Customer Estimate:</span>
        <span id="techEstTotalDisplay" class="text-lg font-mono font-extrabold text-amber-900">₹0.00</span>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Diagnosis Notes</label>
        <textarea id="techEstNotes" rows="2" class="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Summary of diagnosed fault and required repairs...">${safe(existingEst?.customer_remarks || '')}</textarea>
      </div>

      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
        <button type="button" onclick="document.getElementById('techEstimateModal').close()" class="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold">Cancel</button>
        <button type="button" onclick="window.submitTechEstimate()" class="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition">
          🚀 Send Estimate to Customer
        </button>
      </div>
    </div>
  `;

  modal.showModal();

  if (existingEst?.parts && existingEst.parts.length > 0) {
    existingEst.parts.forEach(p => window.addTechEstimatePartRow(p.part_name, p.part_code, p.quantity, p.unit_price));
  } else {
    window.addTechEstimatePartRow("Thermostat / Sensor", "PART-STD-01", 1, 450);
  }
  window.calcTechEstimateTotal();
};

window.addTechEstimatePartRow = function(name = "", code = "", qty = 1, price = 0) {
  const container = $("techEstPartsContainer");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs part-row";
  row.innerHTML = `
    <input type="text" placeholder="Part name" class="flex-1 rounded-lg border border-slate-200 p-1.5 text-xs text-slate-800 est-part-name" value="${safe(name)}">
    <input type="text" placeholder="Code" class="w-24 rounded-lg border border-slate-200 p-1.5 text-xs text-slate-800 est-part-code" value="${safe(code)}">
    <input type="number" min="1" placeholder="Qty" class="w-14 rounded-lg border border-slate-200 p-1.5 text-xs text-center est-part-qty" value="${qty}" oninput="window.calcTechEstimateTotal()">
    <input type="number" min="0" placeholder="Price" class="w-20 rounded-lg border border-slate-200 p-1.5 text-xs text-right est-part-price" value="${price}" oninput="window.calcTechEstimateTotal()">
    <button type="button" onclick="this.closest('.part-row').remove(); window.calcTechEstimateTotal();" class="text-rose-500 hover:text-rose-700 font-bold px-2 py-1">✕</button>
  `;
  container.appendChild(row);
  window.calcTechEstimateTotal();
};

window.calcTechEstimateTotal = function() {
  let partsTotal = 0;
  document.querySelectorAll("#techEstPartsContainer .part-row").forEach(row => {
    const qty = parseFloat(row.querySelector(".est-part-qty")?.value || 0);
    const price = parseFloat(row.querySelector(".est-part-price")?.value || 0);
    partsTotal += (qty * price);
  });
  const insp = parseFloat($("techEstInspectionFee")?.value || 0);
  const labor = parseFloat($("techEstLaborCost")?.value || 0);
  const total = partsTotal + insp + labor;
  if ($("techEstTotalDisplay")) {
    $("techEstTotalDisplay").textContent = `₹${total.toFixed(2)}`;
  }
};

window.submitTechEstimate = async function() {
  if (!currentEstimateRequestId) return;
  const parts = [];
  document.querySelectorAll("#techEstPartsContainer .part-row").forEach(row => {
    const name = row.querySelector(".est-part-name")?.value.trim();
    const code = row.querySelector(".est-part-code")?.value.trim() || "STD";
    const qty = parseInt(row.querySelector(".est-part-qty")?.value || 1, 10);
    const price = parseFloat(row.querySelector(".est-part-price")?.value || 0);
    if (name) {
      parts.push({
        part_name: name,
        part_code: code,
        quantity: qty,
        unit_price: price,
        total_price: qty * price
      });
    }
  });

  const inspectionFee = parseFloat($("techEstInspectionFee")?.value || 299.0);
  const laborEstimate = parseFloat($("techEstLaborCost")?.value || 0.0);
  const notes = $("techEstNotes")?.value.trim() || "";

  try {
    const res = await fetch(`${API_BASE_URL}/api/requests/${currentEstimateRequestId}/estimate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        parts: parts,
        inspection_fee: inspectionFee,
        labor_estimate: laborEstimate,
        notes: notes
      }),
      credentials: "include"
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to submit estimate");
    }
    showToast("✓ Pre-repair estimate sent to customer! Awaiting phone approval.", "info");
    $("techEstimateModal")?.close();
    await loadDashboard();
  } catch (err) {
    showToast(err.message, "error");
  }
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

  // Real-time technician sync across tabs / windows
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("servora_technician_sync");
      bc.onmessage = (event) => {
        if (event.data?.type === "TECHNICIAN_UPDATED" && role === "technician") {
          const updated = event.data.technician;
          if (user && (user.id === updated.id || user.email === updated.email)) {
            user.name = updated.name || user.name;
            user.title = updated.title || user.title;
            user.phone = updated.mobile || user.phone;
            user.address = updated.address ? `${updated.address}${updated.pincode ? `, ${updated.pincode}` : ''}` : user.address;
            user.pincode = updated.pincode || user.pincode;
            localStorage.setItem("servora_user_technician", JSON.stringify(user));
            localStorage.setItem("servora_user", JSON.stringify(user));
            setProfile();
            if ($("opsProfileDialog")?.open) {
              populateOpsProfileModal();
            }
          }
        }
      };
    }
    window.addEventListener("storage", (e) => {
      if (e.key === "servora_user_technician" && role === "technician" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && (!user || user.id === parsed.id)) {
            user = { ...user, ...parsed };
            setProfile();
            if ($("opsProfileDialog")?.open) {
              populateOpsProfileModal();
            }
          }
        } catch {}
      }
    });
  } catch (e) {}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOpsApp);
} else {
  initOpsApp();
}
