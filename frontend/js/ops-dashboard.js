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
let role = dashboardRouteRole || initialUser?.role || document.body.dataset.role || "company";
const roleConfig = {
  technician: { title: "Technician workspace", kicker: "FIELD SERVICE", nav: ["My jobs", "Job history", "Route & schedule", "Earnings", "Help center"], columns: ["Ticket", "Customer", "Appliance", "Appointment", "Status", "Action"], tableTitle: "My assigned jobs", tableSubtitle: "Your service calls and the next step for each job.", bottomTitle: "Today's schedule", sideTitle: "My performance", resources: [["Assigned today", "Jobs on your schedule", "▤"], ["Completed", "Jobs closed this week", "✓"], ["Customer rating", "From recent service visits", "☆"], ["Service area", "Your assigned territory", "⌖"]] },
  franchise: { title: "Franchise workspace", kicker: "BRANCH OPERATIONS", nav: ["Dashboard", "Service requests", "Technicians", "Active jobs", "Customers", "Reports", "Settings"], columns: ["Request ID", "Customer", "Appliance", "Issue", "Technician", "Status", "Action"], tableTitle: "Incoming service requests", tableSubtitle: "Review requests and coordinate local service work.", bottomTitle: "Branch resources", sideTitle: "Branch performance", resources: [["Technicians", "Available in this branch", "♙"], ["Active jobs", "Assigned and in progress", "⚒"], ["Service area", "Local coverage", "⌖"], ["Response time", "Average first response", "◷"]] },
  company: { title: "Company workspace", kicker: "COMPANY OPERATIONS", nav: ["Dashboard", "Branches", "Technicians", "Customers", "Service requests", "Reports", "Settings"], columns: ["Request ID", "Customer", "Company", "Appliance", "Status", "Date", "Action"], tableTitle: "Recent service requests", tableSubtitle: "Monitor service activity across the company network.", bottomTitle: "Network resources", sideTitle: "Network health", resources: [["Branches", "Locations in your network", "▥"], ["Technicians", "Field service professionals", "♙"], ["Customers", "Customers served", "♧"], ["Service brands", "Connected product brands", "◈"]] },
  admin: { title: "Platform overview", kicker: "SERVORA PLATFORM", nav: ["Overview", "Companies", "Branches", "Technicians", "Customers", "Service requests", "Reports", "System settings"], columns: ["Request ID", "Customer", "Company", "Appliance", "Status", "Date", "Action"], tableTitle: "Platform service activity", tableSubtitle: "A view of requests moving across Servora.", bottomTitle: "Platform directory", sideTitle: "Platform health", resources: [["Companies", "Service partners", "▥"], ["Branches", "Operational locations", "⌖"], ["Technicians", "Verified professionals", "♙"], ["Customers", "Registered accounts", "♧"]] },
};
let config = roleConfig[role] || roleConfig.company;
const $ = (id) => document.getElementById(id);
let requests = [];
let companies = [];
let branches = [];
let technicians = [];
let directoryRows = [];
let companyCustomers = [];
let user = null;

const icons = { Dashboard: "⌂", Overview: "⌂", "My jobs": "▤", "Job history": "◷", "Route & schedule": "⌖", Earnings: "$", "Help center": "?", "Service requests": "▣", "Incoming service requests": "▣", Technicians: "♙", "Active jobs": "⚒", Customers: "♧", Reports: "▥", Settings: "⚙", Companies: "▦", Branches: "⌖", "System settings": "⚙" };
function safe(value) { const node = document.createElement("span"); node.textContent = value ?? ""; return node.innerHTML; }
function authHeaders() {
  const token = user?.session_token || initialUser?.session_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  $("userName").textContent = displayName; $("userRole").textContent = role === "admin" ? "Platform administrator" : config.title;
  $("userAvatar").textContent = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const fn = displayName.split(/\s+/)[0];
  if (role === "technician") {
    $("welcomeTitle").innerHTML = `${greeting()}, ${safe(fn)} <span class="inline-block">👏</span>`;
    $("welcomeSubtitle").textContent = `Today, ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())} • Crompton Authorized Technician`;
  } else if (role === "franchise") {
    $("welcomeTitle").innerHTML = `Crompton Home Appliances <span class="text-xs font-semibold text-slate-500 font-sans block mt-1">Branch / Franchise Dashboard</span>`;
    $("welcomeSubtitle").innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-[#0066ff] font-bold text-xs border border-blue-100">Noida Branch ⌄</span> <span class="text-xs text-slate-400 ml-2">Regional dispatch & coordination</span>`;
  } else if (role === "company") {
    $("welcomeTitle").innerHTML = `Crompton <span class="text-xs font-semibold text-slate-500 font-sans block mt-1">Company / Admin Dashboard</span>`;
    $("welcomeSubtitle").textContent = `Unified enterprise operations across 24 authorized franchise branches and field technician teams.`;
  } else {
    $("welcomeTitle").textContent = `${greeting()}, ${fn}`;
    $("welcomeSubtitle").textContent = "Here is your service operation at a glance.";
  }
  $("todayLabel").textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date());
}
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function buildNav() {
  const navItems = role === "technician" ? [...config.nav, "Route Map"] : config.nav;
  $("opsNav").innerHTML = navItems.map((item, index) => `<a href="#${item.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}" data-page="${safe(item)}" class="nav-link ${index === 0 ? "active" : ""}"><span class="nav-icon">${icons[item] || (item === "Route Map" ? "🗺️" : "•")}</span>${safe(item)}${item === "Service requests" || item === "My jobs" ? `<span class="nav-count">${requests.length}</span>` : ""}</a>`).join("");
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
  $("crumbTitle").textContent = page;
  const admin = role === "admin";
  $("addCompanyButton").hidden = !admin;
  $("addBranchButton").hidden = !(role === "company" && page === "Branches");
  $("addTechnicianButton").hidden = !(role === "franchise" && page === "Technicians");
  $("companyInlineAdd").hidden = !admin || page !== "Companies";
  $("exportButton").hidden = page === "System settings" || page === "Companies";
  if (admin && page === "Companies") { renderCompanies(); return; }
  if (role === "franchise" && page === "Technicians") { renderFranchiseTechnicians(); return; }
  if (admin && ["Branches", "Technicians", "Customers"].includes(page)) { renderDirectory(page); return; }
  if (admin && page === "Service requests") { renderRequestDirectory(); return; }
  if (admin && page === "Reports") { renderReports(); return; }
  if (admin && page === "System settings") { renderSettings(); return; }
  const titles = { Overview: "Platform service activity", Branches: "Branches", Technicians: "Technicians", Customers: "Customers", "Service requests": "Service requests", Reports: "Platform reports", "System settings": "System settings" };
  $("pageContent").hidden = false;
  $("metricGrid").hidden = false;
  $("metricGrid").innerHTML = "";
  $("requestHead").innerHTML = "";
  $("requestRows").innerHTML = `<tr><td class="empty-row" colspan="7">${page === "Overview" ? "Platform overview is ready. Use the navigation to explore Servora records." : `${safe(page)} data is not available through the current API yet.`}</td></tr>`;
  $("tableTitle").textContent = titles[page] || page;
  $("tableSubtitle").textContent = page === "Overview" ? "A snapshot of service activity across Servora." : `Browse ${page.toLowerCase()} across the Servora platform.`;
  $("sidePanelTitle").textContent = page === "Reports" ? "Report summary" : "Platform health";
  $("healthContent").innerHTML = `<div class="section-empty">${safe(page)} workspace</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">${safe(page)} insights will appear here as platform records are connected.</div>`;
  $("resourceGrid").innerHTML = "";
  $("bottomTitle").textContent = `${page} workspace`;
  $("bottomSubtitle").textContent = "Platform administration tools";
}
function renderCompanyBranches() {
  $("crumbTitle").textContent = "Branches";
  $("addCompanyButton").hidden = true;
  $("addBranchButton").hidden = false;
  $("companyInlineAdd").hidden = true;
  $("exportButton").hidden = true;
  $("pageContent").hidden = false;
  $("metricGrid").hidden = true;
  $("tableTitle").textContent = "Company branches";
  $("tableSubtitle").textContent = "Branches added to your company, with their owner or manager contact details.";
  $("sidePanelTitle").textContent = "Branch directory";
  $("healthContent").innerHTML = `<div class="section-empty"><strong>${branches.length}</strong> branches in your company</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">Branch records are visible only to your company account.</div>`;
  $("bottomTitle").textContent = "Company branches";
  $("bottomSubtitle").textContent = "Branch contacts registered by your company.";
  $("requestHead").innerHTML = ["Branch", "Franchise owner or manager", "Email", "Mobile number", "Address", "Pincode", "Portal access"].map((name) => `<th>${safe(name)}</th>`).join("");
  const query = $("requestSearch").value.trim().toLowerCase();
  const filtered = branches.filter((branch) => [branch.branch_name, branch.manager_name, branch.email, branch.mobile, branch.address, branch.pincode].join(" ").toLowerCase().includes(query));
  $("requestRows").innerHTML = filtered.length ? filtered.map((branch) => {
    const status = branch.password_set ? `Password set · ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(branch.password_set_at))}` : "Password not set";
    const access = branch.password_set ? `<span class="status-pill completed">Active</span>` : `<button class="table-action" data-resend-franchise="${safe(branch.id)}">Resend setup link →</button>`;
    return `<tr><td><strong>${safe(branch.branch_name)}</strong></td><td>${safe(branch.manager_name)}<small class="company-password-state ${branch.password_set ? "is-set" : "is-pending"}">${safe(status)}</small></td><td>${safe(branch.email)}</td><td>${safe(branch.mobile)}</td><td>${safe(branch.address)}</td><td>${safe(branch.pincode)}</td><td>${access}</td></tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="7">${query ? "No branches match your search." : "No branches yet. Add your first branch to get started."}</td></tr>`;
  $("requestCount").textContent = `${filtered.length} branch${filtered.length === 1 ? "" : "es"} shown`;
  $("resourceGrid").innerHTML = "";
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
  $("crumbTitle").textContent = "Technicians";
  $("addCompanyButton").hidden = true;
  $("addBranchButton").hidden = true;
  $("addTechnicianButton").hidden = false;
  $("companyInlineAdd").hidden = true;
  $("exportButton").hidden = true;
  $("pageContent").hidden = false;
  $("metricGrid").hidden = true;
  $("tableTitle").textContent = "Franchise technicians";
  $("tableSubtitle").textContent = "Technicians managed by your franchise and their portal access.";
  $("sidePanelTitle").textContent = "Technician directory";
  $("healthContent").innerHTML = `<div class="section-empty"><strong>${technicians.length}</strong> technicians in your franchise</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">Technicians and their contact details are visible only to your franchise.</div>`;
  $("bottomTitle").textContent = "Franchise technicians";
  $("bottomSubtitle").textContent = "Technician accounts registered by this franchise.";
  $("requestHead").innerHTML = ["Technician", "Title or specialty", "Email", "Mobile number", "Address", "Pincode", "Portal access"].map((label) => `<th>${safe(label)}</th>`).join("");
  const query = $("requestSearch").value.trim().toLowerCase();
  const filtered = technicians.filter((technician) => [technician.name, technician.title, technician.email, technician.mobile, technician.address, technician.pincode].join(" ").toLowerCase().includes(query));
  $("requestRows").innerHTML = filtered.length ? filtered.map((technician) => {
    const date = technician.password_set_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(technician.password_set_at)) : "";
    const status = technician.password_set ? `Password set · ${date}` : "Password not set";
    const access = technician.password_set ? `<span class="status-pill completed">Active</span>` : `<button class="table-action" data-resend-technician="${safe(technician.id)}">Resend setup link →</button>`;
    return `<tr><td><strong>${safe(technician.name)}</strong><small class="company-password-state ${technician.password_set ? "is-set" : "is-pending"}">${safe(status)}</small></td><td>${safe(technician.title)}</td><td>${safe(technician.email)}</td><td>${safe(technician.mobile)}</td><td>${safe(technician.address)}</td><td>${safe(technician.pincode)}</td><td>${access}</td></tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="7">${query ? "No technicians match your search." : "No technicians yet. Add your first technician to get started."}</td></tr>`;
  $("requestCount").textContent = `${filtered.length} technician${filtered.length === 1 ? "" : "s"} shown`;
  $("requestSearch").placeholder = "Search technicians";
  $("resourceGrid").innerHTML = "";
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
  $("addCompanyButton").hidden = false;
  $("companyInlineAdd").hidden = false;
  $("addCompanyButton").innerHTML = "<span>＋</span> Add company";
  $("pageContent").hidden = false;
  $("metricGrid").hidden = true;
  $("tableTitle").textContent = "Companies on Servora";
  $("tableSubtitle").textContent = "Manage platform partners and their company portal access.";
  $("sidePanelTitle").textContent = "Company access";
  $("healthContent").innerHTML = `<div class="section-empty"><strong>${companies.length}</strong> partner companies are listed on Servora.</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">Create a company account, then send its portal credentials to the administrator email.</div>`;
  $("bottomTitle").textContent = "Company directory";
  $("bottomSubtitle").textContent = "Company portal accounts registered on Servora.";
  $("requestHead").innerHTML = ["Company", "Administrator email", "Phone", "Portal", "Action"].map((name) => `<th>${name}</th>`).join("");
  $("requestRows").innerHTML = companies.length ? companies.map((company) => {
    const passwordDate = company.password_set_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(company.password_set_at)) : "Not set yet";
    const setupStatus = company.password_set ? `Password set · ${passwordDate}` : "Password not set";
    return `<tr><td><div class="customer-cell"><span class="customer-avatar">${safe(company.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span><span class="customer-name">${safe(company.name)}<small>${safe(company.id)}</small><small class="company-password-state ${company.password_set ? "is-set" : "is-pending"}">${safe(setupStatus)}</small></span></div></td><td>${safe(company.email)}</td><td>${safe(company.phone)}</td><td><span class="status-pill completed">Company portal</span></td><td>${company.password_set ? `<span class="status-pill completed">Active</span>` : `<button class="table-action" data-send-credentials="${safe(company.id)}">Resend setup link →</button>`}</td></tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="5">No companies yet. Add your first company to get started.</td></tr>`;
  document.querySelectorAll("[data-send-credentials]").forEach((button) => button.addEventListener("click", async () => {
    const company = companies.find((item) => item.id === button.dataset.sendCredentials);
    if (!company || !window.confirm(`Resend the password setup link to ${company.email}?`)) return;
    button.disabled = true; button.textContent = "Sending…";
    try { await adminApi("/companies/send-credentials", { method: "POST", body: JSON.stringify({ company_id: company.id }) }); showToast(`Password setup link sent to ${company.email}.`); }
    catch (error) { showToast(error.message, "error"); }
    finally { button.disabled = false; button.textContent = "Resend setup link →"; }
  }));
}
async function adminApi(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/api/admin${path}`, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Could not complete the request.");
  return data;
}
async function companyApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/company${path}`, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers } });
  } catch (error) {
    if (error instanceof TypeError) throw new Error("The Servora API did not return a response. Check that the backend is running and allows this frontend origin in CORS settings.");
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Could not complete the request.");
  return data;
}
async function franchiseApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/franchise${path}`, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers } });
  } catch (error) {
    if (error instanceof TypeError) throw new Error("The Servora API did not return a response. Check that the backend is running and allows this frontend origin in CORS settings.");
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Could not complete the request.");
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
  $("crumbTitle").textContent = "Customers";
  $("addCompanyButton").hidden = true;
  $("addBranchButton").hidden = true;
  $("addTechnicianButton").hidden = true;
  $("companyInlineAdd").hidden = true;
  $("exportButton").hidden = false;
  $("pageContent").hidden = false;
  $("metricGrid").hidden = true;
  $("tableTitle").textContent = "Registered customers & products";
  $("tableSubtitle").textContent = "Customers who have registered your company's appliances for service.";
  $("sidePanelTitle").textContent = "Customer reach";
  $("healthContent").innerHTML = `<div class="section-empty"><strong>${companyCustomers.length}</strong> registered products under your brand</div>`;
  $("activityContent").innerHTML = `<div class="section-empty">When customers add appliances under your company, their contact details, address, and device model appear here.</div>`;
  $("bottomTitle").textContent = "Customer directory";
  $("bottomSubtitle").textContent = "Customers with products under your warranty and service coverage.";

  $("requestHead").innerHTML = [
    "Customer",
    "Contact info",
    "Service address",
    "Registered product",
    "Model & serial",
    "Warranty",
    "Registered date"
  ].map((label) => `<th>${safe(label)}</th>`).join("");

  const query = $("requestSearch").value.trim().toLowerCase();
  $("requestSearch").placeholder = "Search customers or products";

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
  const total = requests.length;
  const active = requests.filter((item) => !["Completed", "Cancelled"].includes(item.status_badge)).length;
  const completed = requests.filter((item) => item.status_badge === "Completed").length;
  const pending = requests.filter((item) => ["Request Created", "Scheduled", "Assigned"].includes(item.status_badge)).length;

  if (role === "technician") {
    const values = [
      ["Total Jobs", String(total || 8), "Current assigned workload", "📋", ""],
      ["In Progress", String(active || 3), "Active on-site visits", "⚡", "amber"],
      ["Pending", String(pending || 5), "Waiting for visit", "⏳", "purple"],
    ];
    $("metricGrid").className = "metric-grid grid-cols-1 sm:grid-cols-3";
    $("metricGrid").innerHTML = values.map(([label, value, note, icon, tone]) => `<article class="metric-card"><span class="metric-icon ${tone}">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-bottom"><span class="metric-change">●</span>${note}</div></article>`).join("");
    return;
  }

  if (role === "franchise") {
    const techCount = technicians.length || 5;
    const values = [
      ["New Requests", String(pending || 12), "Direct customer bookings", "📥", "amber"],
      ["Active Jobs", String(active || 8), "Under field resolution", "⚙️", "blue"],
      ["Technicians", String(techCount), "Assigned to this branch", "👷", "purple"],
      ["Avg. Resolution Time", "4.2 hrs", "SLA compliance 96%", "⏱️", "green"],
    ];
    $("metricGrid").className = "metric-grid grid-cols-2 md:grid-cols-4";
    $("metricGrid").innerHTML = values.map(([label, value, note, icon, tone]) => `<article class="metric-card"><span class="metric-icon ${tone}">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-bottom"><span class="metric-change">●</span>${note}</div></article>`).join("");
    return;
  }

  // Company and Admin
  const totalDisplay = total ? total.toLocaleString() : "1,248";
  const branchCount = branches.length || 24;
  const values = [
    ["Total Requests", totalDisplay, "Across authorized network", "📦", ""],
    ["Active Service Jobs", String(active || 312), "Open across branches", "⚡", "amber"],
    ["Agencies / Branches", String(branchCount), "Active franchise hubs", "🏢", "purple"],
    ["Technicians", "186", "Certified service workforce", "👷", ""],
    ["Resolution Rate", "92%", "First-time-fix benchmark", "📈", "green"],
  ];
  $("metricGrid").className = "metric-grid grid-cols-2 lg:grid-cols-5";
  $("metricGrid").innerHTML = values.map(([label, value, note, icon, tone]) => `<article class="metric-card"><span class="metric-icon ${tone}">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-bottom"><span class="metric-change">●</span>${note}</div></article>`).join("");
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
  const query = $("requestSearch").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const filtered = list.filter((item) => {
    const text = [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge, item.pincode].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (status === "all" || item.status_badge === status);
  });

  const tableEl = $("requestRows").closest("table");
  let techContainer = $("techJobCardsContainer");
  if (!techContainer) {
    techContainer = document.createElement("div");
    techContainer.id = "techJobCardsContainer";
    techContainer.className = "p-4 sm:p-5 space-y-4";
    tableEl.parentNode.insertBefore(techContainer, tableEl);
  }

  if (role === "technician") {
    tableEl.style.display = "none";
    techContainer.style.display = "block";
    $("tableTitle").textContent = "Today's Jobs";
    $("tableSubtitle").textContent = "Service visits scheduled for your field route today.";

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
        <button onclick="document.getElementById('logoutBtn')?.click()" class="flex flex-col items-center gap-1 hover:text-rose-600">
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
          ${item.status_badge !== 'Completed' && item.status !== 'Technician on the Way' && item.status !== 'Service In Progress' ? `
            <button type="button" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5" onclick="techAction('${safe(item.id)}', 'accept')">
              ✓ Accept Job
            </button>
          ` : ''}
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
    $("requestCount").textContent = `${filtered.length} job${filtered.length === 1 ? "" : "s"} shown`;
    return;
  }

  // Table views for franchise, company, and admin
  tableEl.style.display = "";
  techContainer.style.display = "none";

  let head = config.columns;
  if (role === "franchise") {
    head = ["Request ID", "Customer", "Appliance", "Issue", "Priority", "Action"];
  } else if (role === "company") {
    head = ["Request ID", "Customer", "PIN Code", "Routed Branch", "Status", "Action"];
  }

  $("requestHead").innerHTML = head.map((name) => `<th>${safe(name)}</th>`).join("");
  $("requestRows").innerHTML = filtered.length ? filtered.map((item) => {
    const customer = `<div class="customer-cell"><span class="customer-avatar">${safe((item.customer_name || "U").split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span><span class="customer-name">${safe(item.customer_name)}<small>${safe(item.customer_phone || "Servora customer")}</small></span></div>`;

    if (role === "franchise") {
      const priorityBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${priorityClass(item.priority || 'Medium')}">${safe(item.priority || 'Medium')}</span>`;
      const assignBtn = `<button class="table-action px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs" onclick="selectRequestForAssignment('${safe(item.id)}')">Assign →</button>`;
      const cells = [safe(item.id), customer, safe(item.appliance_name), safe(item.issue), priorityBadge, assignBtn];
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }

    if (role === "company") {
      const pinCode = safe(item.pincode || "201310");
      const routedBranch = safe(item.branch_id ? (branches.find(b => b.id === item.branch_id)?.branch_name || "Noida Branch") : "Noida Branch");
      const statusPill = `<span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span>`;
      const actionBtn = `<button class="table-action font-semibold text-xs text-blue-600 hover:text-blue-800" onclick="showToast('Viewing ticket ${safe(item.id)}')">View Details →</button>`;
      const cells = [safe(item.id), customer, pinCode, routedBranch, statusPill, actionBtn];
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }

    // Default admin
    const action = `<button class="table-action" data-request="${safe(item.id)}">View details →</button>`;
    const cells = [safe(item.id), customer, safe(item.brand), safe(item.appliance_name), `<span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span>`, safe(item.appointment_date), action];
    return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="${head.length}">No service requests match this view.</td></tr>`;

  $("requestCount").textContent = `${filtered.length} request${filtered.length === 1 ? "" : "s"} shown`;
  document.querySelectorAll("[data-request]").forEach((button) => button.addEventListener("click", () => showToast(`${button.dataset.request} · ${requests.find((r) => r.id === button.dataset.request)?.issue || "Service request"}`)));
}

function renderInsights() {
  const total = requests.length || 1;
  const active = requests.filter((item) => item.status_badge !== "Completed").length;
  const completed = requests.filter((item) => item.status_badge === "Completed").length;

  if (role === "franchise") {
    // Image 3 Left: Side Panel 1 = Assign Technician, Side Panel 2 = Active Jobs
    $("sidePanelTitle").textContent = "Assign Technician";
    const pendingReqs = requests.filter((r) => r.status_badge !== "Completed");
    const techOptions = (technicians.length ? technicians : [
      { id: "tech_1", name: "Rahul Sharma", title: "HVAC Specialist" },
      { id: "tech_2", name: "Amit Verma", title: "Refrigeration Expert" },
      { id: "tech_3", name: "Sunil Kumar", title: "Washing Machine Tech" }
    ]);

    $("healthContent").innerHTML = `
      <div class="p-4 space-y-3">
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Select Service Request</label>
          <select id="assignReqSelect" class="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white text-slate-800 focus:outline-blue-500">
            ${pendingReqs.map(r => `<option value="${safe(r.id)}">${safe(r.id)} - ${safe(r.customer_name)} (${safe(r.appliance_name)})</option>`).join('') || '<option value="">No pending requests</option>'}
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Available Technician</label>
          <select id="assignTechSelect" class="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white text-slate-800 focus:outline-blue-500">
            ${techOptions.map(t => `<option value="${safe(t.id)}">${safe(t.name)} (${safe(t.title || 'Technician')})</option>`).join('')}
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
        <button type="button" onclick="confirmTechnicianAssignment()" class="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5">
          <span>⚡</span> Assign Technician
        </button>
      </div>
    `;

    const ongoingJobs = requests.filter((r) => r.status_badge === "In Progress" || r.status === "Technician on the Way" || r.status === "Service In Progress");
    $("activityContent").innerHTML = `
      <div class="p-3.5 space-y-2.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Live Ongoing Field Visits</div>
        ${(ongoingJobs.length ? ongoingJobs : requests.slice(0, 3)).map(r => `
          <div class="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 text-xs space-y-1">
            <div class="flex items-center justify-between font-semibold text-slate-800">
              <span>${safe(r.id)}</span>
              <span class="status-pill scheduled text-[10px]">${safe(r.status_badge)}</span>
            </div>
            <div class="text-slate-500 text-[11px]">Tech: <strong class="text-slate-700">${safe(r.technician?.name || 'Rahul Sharma')}</strong></div>
            <div class="text-slate-400 text-[10px] flex items-center justify-between">
              <span>${safe(r.customer_name)}</span>
              <span>${safe(r.appointment_slot || 'Today')}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  if (role === "company") {
    // Image 3 Right: Side Panel 1 = 30-day SVG trend chart, Side Panel 2 = Top Performing Branches
    $("sidePanelTitle").textContent = "Service Request Analytics";
    $("healthContent").innerHTML = `
      <div class="p-4 space-y-3">
        <div class="flex items-baseline justify-between">
          <div>
            <div class="text-2xl font-extrabold text-slate-800 tracking-tight">1,248</div>
            <div class="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
              <span>↑ 18.4%</span> <span class="text-slate-400 font-normal">vs last 30 days</span>
            </div>
          </div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monthly Volume</span>
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

    $("activityContent").innerHTML = `
      <div class="p-3.5 space-y-2.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Top Performing Branches</div>
        ${[
          { name: "Noida Sector 18 Branch", rate: "96%", score: "4.9", jobs: "342 resolved" },
          { name: "Gurugram Cyber Hub", rate: "94%", score: "4.8", jobs: "288 resolved" },
          { name: "Delhi South Center", rate: "91%", score: "4.7", jobs: "245 resolved" },
          { name: "Bengaluru Indiranagar", rate: "89%", score: "4.7", jobs: "196 resolved" }
        ].map((b, i) => `
          <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50/70 border border-slate-100 text-xs">
            <div class="flex items-center gap-2">
              <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center justify-center flex-none">#${i + 1}</span>
              <div>
                <strong class="text-slate-800 block text-[11px] leading-tight">${b.name}</strong>
                <span class="text-[10px] text-slate-400">${b.jobs}</span>
              </div>
            </div>
            <div class="text-right flex-none">
              <div class="font-bold text-slate-700 text-[11px]">${b.rate}</div>
              <div class="text-[10px] text-amber-500 font-semibold">★ ${b.score}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  // Default admin / technician
  $("healthContent").innerHTML = `<div class="health-score"><div class="score-ring">${Math.round((completed / total) * 100) || 92}%</div><div class="score-copy"><strong>${role === "technician" ? "Service rating" : "Service completion"}</strong><span>${role === "technician" ? "Positive recent performance" : "Completion across visible requests"}</span></div></div><div class="health-list"><div><div class="health-item"><span>Active requests</span><strong>${active}</strong></div><div class="health-bar"><i class="amber-bar" style="width:${Math.max(10, active / total * 100)}%"></i></div></div><div><div class="health-item"><span>Completed requests</span><strong>${completed}</strong></div><div class="health-bar"><i class="green-bar" style="width:${Math.max(10, completed / total * 100)}%"></i></div></div><div><div class="health-item"><span>Service records</span><strong>${requests.length}</strong></div><div class="health-bar"><i style="width:78%"></i></div></div></div>`;
  const latest = [...requests].slice(-4).reverse();
  $("activityContent").innerHTML = latest.length ? `<div class="activity-list">${latest.map((item, index) => `<div class="activity-row"><i class="activity-dot ${item.status_badge === "Completed" ? "green-dot" : ""}"></i><div class="activity-copy"><strong>${safe(item.id)}</strong> · ${safe(item.status)}<small>${safe(item.customer_name)} · ${safe(item.appliance_name)}</small></div></div>`).join("")}</div>` : `<div class="activity-list"><div class="activity-copy">No service activity yet.</div></div>`;
}

// Global actions for Technician and Franchise operations
window.techAction = async function(requestId, action) {
  try {
    showToast(`Updating status to ${action}…`);
    const res = await fetch(`${API_BASE_URL}/api/requests/${requestId}/action`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: JSON.stringify({ action })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Action failed");
    }
    const updated = await res.json();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx !== -1) requests[idx] = updated;
    showToast(`Job updated: ${updated.status_badge}`);
    setMetrics();
    renderRequests();
    renderInsights();
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.techDiagnosisModal = function(requestId) {
  const note = prompt("Enter diagnosis findings / required spare parts (e.g. PCB inspected, condenser coils cleaned):", "Initial inspection completed. Appliance tested.");
  if (note !== null) {
    window.techAction(requestId, 'diagnose');
  }
};

window.openTechRouteMap = function(requestId) {
  const dialog = $("techMapDialog");
  if (!dialog) return;
  dialog.showModal();
  setTimeout(() => {
    if (!window.L) return;
    if (window._techMapInstance) {
      window._techMapInstance.remove();
      window._techMapInstance = null;
    }
    const map = L.map("techOsmMap").setView([28.5355, 77.3910], 12);
    window._techMapInstance = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const targetReq = requestId ? requests.find(r => r.id === requestId) : null;
    const points = [];

    requests.forEach((req, idx) => {
      const lat = req.latitude || (28.5355 + (idx * 0.015 - 0.03));
      const lng = req.longitude || (77.3910 + (idx * 0.018 - 0.02));
      points.push([lat, lng]);

      const isCurrent = targetReq && targetReq.id === req.id;
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
      if (isCurrent) marker.openPopup();
    });

    if (points.length) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, 250);
};

window.selectRequestForAssignment = function(requestId) {
  const reqSel = document.getElementById("assignReqSelect");
  if (reqSel) {
    reqSel.value = requestId;
    reqSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`Selected request ${requestId} for assignment.`);
  }
};

window.confirmTechnicianAssignment = async function() {
  const reqId = document.getElementById("assignReqSelect")?.value;
  const techId = document.getElementById("assignTechSelect")?.value;
  if (!reqId || !techId) {
    showToast("Please select both a request and a technician.", "error");
    return;
  }
  try {
    showToast("Assigning technician…");
    const res = await fetch(`${API_BASE_URL}/api/requests/${reqId}/assign`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: JSON.stringify({ technician_id: techId })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to assign technician");
    }
    const updated = await res.json();
    const idx = requests.findIndex(r => r.id === reqId);
    if (idx !== -1) requests[idx] = updated;
    showToast(`Technician assigned to ${reqId}!`);
    setMetrics();
    renderRequests();
    renderInsights();
  } catch (err) {
    showToast(err.message, "error");
  }
};
function renderResources() {
  $("resourceGrid").innerHTML = config.resources.map(([name, detail, icon], index) => {
    let note = detail;
    if (role === "technician" && index === 0) note = requests.length + " jobs on your schedule";
    if (role === "company" && name === "Customers") note = companyCustomers.length + " registered product" + (companyCustomers.length === 1 ? "" : "s");
    return `<div class="resource-card"><span class="resource-icon">${icon}</span><span><strong>${name}</strong><small>${note}</small></span></div>`;
  }).join("");
}
async function loadDashboard() {
  const stored = localStorage.getItem("servora_user");
  if (stored) { try { user = JSON.parse(stored); } catch { user = null; } }
  try {
    const userResponse = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include", headers: authHeaders() });
    if (userResponse.ok) {
      const authenticated = (await userResponse.json()).user;
      if (dashboardRouteRole && authenticated.role !== dashboardRouteRole) {
        localStorage.removeItem("servora_user");
        window.location.replace(portalLoginPaths[dashboardRouteRole]);
        return;
      }
      user = { ...authenticated, session_token: user?.session_token || initialUser?.session_token };
      localStorage.setItem("servora_user", JSON.stringify(user));
    }
    else if (stored) user = JSON.parse(stored);
    if (dashboardRouteRole && user?.role && user.role !== dashboardRouteRole) {
      localStorage.removeItem("servora_user");
      window.location.replace(portalLoginPaths[dashboardRouteRole]);
      return;
    }
    if (dashboardRouteRole) role = dashboardRouteRole;
    else if (user?.role && roleConfig[user.role]) role = user.role;
    config = roleConfig[role] || roleConfig.company;
    document.body.dataset.role = role;
    document.title = `${config.title} — Servora`;
    $("workspaceKicker").textContent = config.kicker;
    $("tableTitle").textContent = config.tableTitle;
    $("tableSubtitle").textContent = config.tableSubtitle;
    $("sidePanelTitle").textContent = config.sideTitle;
    $("bottomTitle").textContent = config.bottomTitle;
    const response = await fetch(`${API_BASE_URL}/api/requests`, { credentials: "include", headers: authHeaders() });
    if (response.status === 401) throw new Error("Your admin session was not accepted. Sign out and sign in again.");
    if (response.ok) requests = await response.json();
    if (role === "admin") companies = await adminApi("/companies");
    if (role === "company") {
      try { companyCustomers = await companyApi("/customers"); } catch { companyCustomers = []; }
      try { branches = await companyApi("/branches"); } catch { branches = []; }
    }
    if (role === "franchise") {
      try { technicians = await franchiseApi("/technicians"); } catch { technicians = []; }
    }
  } catch (error) {
    const detail = error instanceof TypeError ? "Could not connect to the Servora API." : error.message;
    showToast(`${detail} Showing available workspace data.`, "error");
  }
  setProfile(); buildNav(); setMetrics(); renderRequests(); renderInsights(); renderResources();
  if (role !== "admin") { $("addCompanyButton").hidden = true; }
  if (role === "admin") { $("crumbTitle").textContent = "Overview"; renderPage("Overview"); }
  if (user?.role && user.role !== role) showToast(`Signed in as ${user.role}; this is the ${role} workspace.`, "error");
}
$("requestSearch").addEventListener("input", () => {
  const page = $("crumbTitle").textContent;
  if (role === "admin" && page === "Companies") renderCompanies();
  else if (role === "company" && page === "Branches") renderCompanyBranches();
  else if (role === "company" && page === "Customers") renderCompanyCustomers();
  else if (role === "franchise" && page === "Technicians") renderFranchiseTechnicians();
  else if (role === "admin" && ["Branches", "Technicians", "Customers"].includes(page)) renderDirectory(page);
  else if (role === "admin" && page === "Service requests") renderRequestDirectory();
  else renderRequests();
});
$("statusFilter").addEventListener("change", () => { if (role === "admin" && $("crumbTitle").textContent === "Service requests") renderRequestDirectory(); else renderRequests(); });
$("exportButton").addEventListener("click", () => {
  const page = $("crumbTitle").textContent;
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
  const rows = [["Request ID", "Customer", "Appliance", "Issue", "Status", "Date"], ...requests.map((item) => [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge, item.appointment_date])];
  downloadCsv(`servora-${role}-requests.csv`, rows);
});
$("logoutBtn").addEventListener("click", () => {
  const logoutRole = dashboardRouteRole || role;
  const headers = authHeaders();
  // Clear the browser-side session immediately; a slow/unavailable API must not
  // leave the user appearing signed in or prevent the login-page redirect.
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
$("menuToggle").addEventListener("click", () => $("opsNav").closest(".ops-sidebar").classList.toggle("open"));
document.addEventListener("DOMContentLoaded", () => { document.title = `${config.title} — Servora`; $("crumbTitle").textContent = config.title; $("workspaceKicker").textContent = config.kicker; $("tableTitle").textContent = config.tableTitle; $("tableSubtitle").textContent = config.tableSubtitle; $("sidePanelTitle").textContent = config.sideTitle; $("bottomTitle").textContent = config.bottomTitle; loadDashboard(); });
$("addCompanyButton").addEventListener("click", () => { $("companyFormMessage").textContent = ""; $("companyDialog").showModal(); });
$("companyInlineAdd").addEventListener("click", () => { $("companyFormMessage").textContent = ""; $("companyDialog").showModal(); });
$("addBranchButton").addEventListener("click", () => { $("branchFormMessage").textContent = ""; $("branchDialog").showModal(); });
$("addTechnicianButton").addEventListener("click", () => { $("technicianFormMessage").textContent = ""; $("technicianDialog").showModal(); });
$("closeCompanyDialog").addEventListener("click", () => $("companyDialog").close());
$("cancelCompany").addEventListener("click", () => $("companyDialog").close());
$("closeBranchDialog").addEventListener("click", () => $("branchDialog").close());
$("cancelBranch").addEventListener("click", () => $("branchDialog").close());
$("closeTechnicianDialog").addEventListener("click", () => $("technicianDialog").close());
$("cancelTechnician").addEventListener("click", () => $("technicianDialog").close());
$("closeTechMap")?.addEventListener("click", () => $("techMapDialog")?.close());
$("companyForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]');
  submit.disabled = true; $("companyFormMessage").textContent = "Creating company…";
  const payload = Object.fromEntries(new FormData(form).entries());
  try { const created = await adminApi("/companies", { method: "POST", body: JSON.stringify(payload) }); companies.push(created); form.reset(); $("companyDialog").close(); renderPage("Companies"); showToast(`Company added. Password setup link sent to ${created.email}.`); }
  catch (error) { $("companyFormMessage").textContent = error.message; }
  finally { submit.disabled = false; }
});
$("branchForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]');
  submit.disabled = true; $("branchFormMessage").textContent = "Saving branch…";
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const created = await companyApi("/branches", { method: "POST", body: JSON.stringify(payload) });
    branches.push(created); form.reset(); $("branchDialog").close(); renderCompanyBranches(); showToast(`${created.branch_name} added. Franchise setup link sent to ${created.email}.`);
  } catch (error) { $("branchFormMessage").textContent = error.message; }
  finally { submit.disabled = false; }
});
$("technicianForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]');
  submit.disabled = true; $("technicianFormMessage").textContent = "Saving technician and sending setup email…";
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const created = await franchiseApi("/technicians", { method: "POST", body: JSON.stringify(payload) });
    technicians.push(created); form.reset(); $("technicianDialog").close(); renderFranchiseTechnicians();
    showToast(`Technician added. Password setup link sent to ${created.email}.`);
  } catch (error) { $("technicianFormMessage").textContent = error.message; }
  finally { submit.disabled = false; }
});
