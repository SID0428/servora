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
let directoryRows = [];
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
  $("userName").textContent = displayName; $("userRole").textContent = role === "admin" ? "Platform administrator" : config.title;
  $("userAvatar").textContent = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  $("welcomeTitle").textContent = `${greeting()}, ${displayName.split(/\s+/)[0]}`;
  $("welcomeSubtitle").textContent = role === "technician" ? "Here are your service calls and today's priorities." : "Here is your service operation at a glance.";
  $("todayLabel").textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date());
}
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function buildNav() {
  $("opsNav").innerHTML = config.nav.map((item, index) => `<a href="#${item.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}" data-page="${safe(item)}" class="nav-link ${index === 0 ? "active" : ""}"><span class="nav-icon">${icons[item] || "•"}</span>${safe(item)}${item === "Service requests" ? `<span class="nav-count">${requests.length}</span>` : ""}</a>`).join("");
  document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active")); link.classList.add("active"); loadWorkspacePageData(link.dataset.page); document.querySelector(".ops-sidebar").classList.remove("open"); }));
}
function renderPage(page) {
  $("crumbTitle").textContent = page;
  const admin = role === "admin";
  $("addCompanyButton").hidden = !admin;
  $("addBranchButton").hidden = !(role === "company" && page === "Branches");
  $("companyInlineAdd").hidden = !admin || page !== "Companies";
  $("exportButton").hidden = page === "System settings" || page === "Companies";
  if (admin && page === "Companies") { renderCompanies(); return; }
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
async function loadWorkspacePageData(page) {
  if (role === "admin") { await loadAdminPageData(page); return; }
  if (role === "company" && page === "Branches") { await loadCompanyBranches(); return; }
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
  const values = role === "technician" ? [
    ["Assigned jobs", String(total), "Current workload", "▤", ""], ["In progress", String(active), "Jobs needing attention", "◷", "amber"], ["Completed", String(completed), "Closed service calls", "✓", "green"], ["Customer rating", "4.9", "Average recent feedback", "☆", "purple"],
  ] : [
    ["Total requests", String(total), "Across visible service activity", "▣", ""], ["Active service jobs", String(active), "Open requests to follow up", "◷", "amber"], ["Completed", String(completed), "Requests marked complete", "✓", "green"], ["Service activity", role === "franchise" ? "Branch" : role === "company" ? "Company" : "Platform", "Live request operations view", role === "franchise" ? "♙" : "▦", "purple"],
  ];
  $("metricGrid").innerHTML = values.map(([label, value, note, icon, tone]) => `<article class="metric-card"><span class="metric-icon ${tone}">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-bottom"><span class="metric-change">●</span>${note}</div></article>`).join("");
}
function requestForRole(item) {
  if (role === "technician") return item.technician?.id === user?.id || item.technician?.name === user?.name;
  return true;
}
function statusClass(status) {
  if (status === "Completed") return "completed";
  if (["Scheduled", "Request Created", "Technician Assigned"].includes(status)) return "scheduled";
  if (status === "Assigned") return "assigned";
  return "";
}
function renderRequests() {
  const list = requests.filter(requestForRole);
  const query = $("requestSearch").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const filtered = list.filter((item) => {
    const text = [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (status === "all" || item.status_badge === status);
  });
  const head = config.columns;
  $("requestHead").innerHTML = head.map((name) => `<th>${safe(name)}</th>`).join("");
  $("requestRows").innerHTML = filtered.length ? filtered.map((item) => {
    const customer = `<div class="customer-cell"><span class="customer-avatar">${safe((item.customer_name || "U").split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</span><span class="customer-name">${safe(item.customer_name)}<small>${safe(item.customer_phone || "Servora customer")}</small></span></div>`;
    const action = `<button class="table-action" data-request="${safe(item.id)}">${role === "technician" ? "Open job →" : "View details →"}</button>`;
    const cells = role === "technician" ? [safe(item.id), customer, safe(item.appliance_name), `${safe(item.appointment_date)}<small class="block text-slate-400 mt-1">${safe(item.appointment_slot)}</small>`, `<span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span>`, action]
      : role === "franchise" ? [safe(item.id), customer, safe(item.appliance_name), safe(item.issue), safe(item.technician?.name || "Unassigned"), `<span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span>`, action]
      : [safe(item.id), customer, safe(item.brand), safe(item.appliance_name), `<span class="status-pill ${statusClass(item.status_badge)}">${safe(item.status_badge)}</span>`, safe(item.appointment_date), action];
    return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="${head.length}">${role === "technician" ? "No jobs are assigned to this technician yet." : role === "company" ? "No service requests are assigned to this company yet." : "No service requests match this view."}</td></tr>`;
  $("requestCount").textContent = `${filtered.length} request${filtered.length === 1 ? "" : "s"} shown`;
  document.querySelectorAll("[data-request]").forEach((button) => button.addEventListener("click", () => showToast(`${button.dataset.request} · ${requests.find((r) => r.id === button.dataset.request)?.issue || "Service request"}`)));
}
function renderInsights() {
  const total = requests.length || 1;
  const active = requests.filter((item) => item.status_badge !== "Completed").length;
  const completed = requests.filter((item) => item.status_badge === "Completed").length;
  $("healthContent").innerHTML = `<div class="health-score"><div class="score-ring">${Math.round((completed / total) * 100) || 92}%</div><div class="score-copy"><strong>${role === "technician" ? "Service rating" : "Service completion"}</strong><span>${role === "technician" ? "Positive recent performance" : "Completion across visible requests"}</span></div></div><div class="health-list"><div><div class="health-item"><span>Active requests</span><strong>${active}</strong></div><div class="health-bar"><i class="amber-bar" style="width:${Math.max(10, active / total * 100)}%"></i></div></div><div><div class="health-item"><span>Completed requests</span><strong>${completed}</strong></div><div class="health-bar"><i class="green-bar" style="width:${Math.max(10, completed / total * 100)}%"></i></div></div><div><div class="health-item"><span>Service records</span><strong>${requests.length}</strong></div><div class="health-bar"><i style="width:78%"></i></div></div></div>`;
  const latest = [...requests].slice(-4).reverse();
  $("activityContent").innerHTML = latest.length ? `<div class="activity-list">${latest.map((item, index) => `<div class="activity-row"><i class="activity-dot ${item.status_badge === "Completed" ? "green-dot" : ""}"></i><div class="activity-copy"><strong>${safe(item.id)}</strong> · ${safe(item.status)}<small>${safe(item.customer_name)} · ${safe(item.appliance_name)}</small></div></div>`).join("")}</div>` : `<div class="activity-list"><div class="activity-copy">No service activity yet.</div></div>`;
}
function renderResources() {
  $("resourceGrid").innerHTML = config.resources.map(([name, detail, icon], index) => `<div class="resource-card"><span class="resource-icon">${icon}</span><span><strong>${name}</strong><small>${role === "technician" && index === 0 ? requests.length + " jobs on your schedule" : detail}</small></span></div>`).join("");
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
  } catch (error) {
    const detail = error instanceof TypeError ? "Could not connect to the Servora API." : error.message;
    showToast(`${detail} Showing available workspace data.`, "error");
  }
  setProfile(); buildNav(); setMetrics(); renderRequests(); renderInsights(); renderResources();
  if (role !== "admin") { $("addCompanyButton").hidden = true; }
  if (role === "admin") { $("crumbTitle").textContent = "Overview"; renderPage("Overview"); }
  if (user?.role && user.role !== role) showToast(`Signed in as ${user.role}; this is the ${role} workspace.`, "error");
}
$("requestSearch").addEventListener("input", () => { const page = $("crumbTitle").textContent; if (role === "admin" && page === "Companies") renderCompanies(); else if (role === "company" && page === "Branches") renderCompanyBranches(); else if (role === "admin" && ["Branches", "Technicians", "Customers"].includes(page)) renderDirectory(page); else if (role === "admin" && page === "Service requests") renderRequestDirectory(); else renderRequests(); });
$("statusFilter").addEventListener("change", () => { if (role === "admin" && $("crumbTitle").textContent === "Service requests") renderRequestDirectory(); else renderRequests(); });
$("exportButton").addEventListener("click", () => {
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
$("closeCompanyDialog").addEventListener("click", () => $("companyDialog").close());
$("cancelCompany").addEventListener("click", () => $("companyDialog").close());
$("closeBranchDialog").addEventListener("click", () => $("branchDialog").close());
$("cancelBranch").addEventListener("click", () => $("branchDialog").close());
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
