import { API_BASE_URL } from "./config.js";

const role = document.body.dataset.role || "company";
const roleConfig = {
  technician: { title: "Technician workspace", kicker: "FIELD SERVICE", nav: ["My jobs", "Job history", "Route & schedule", "Earnings", "Help center"], columns: ["Ticket", "Customer", "Appliance", "Appointment", "Status", "Action"], tableTitle: "My assigned jobs", tableSubtitle: "Your service calls and the next step for each job.", bottomTitle: "Today's schedule", sideTitle: "My performance", resources: [["Assigned today", "Jobs on your schedule", "▤"], ["Completed", "Jobs closed this week", "✓"], ["Customer rating", "From recent service visits", "☆"], ["Service area", "Your assigned territory", "⌖"]] },
  franchise: { title: "Franchise workspace", kicker: "BRANCH OPERATIONS", nav: ["Dashboard", "Service requests", "Technicians", "Active jobs", "Customers", "Reports", "Settings"], columns: ["Request ID", "Customer", "Appliance", "Issue", "Technician", "Status", "Action"], tableTitle: "Incoming service requests", tableSubtitle: "Review requests and coordinate local service work.", bottomTitle: "Branch resources", sideTitle: "Branch performance", resources: [["Technicians", "Available in this branch", "♙"], ["Active jobs", "Assigned and in progress", "⚒"], ["Service area", "Local coverage", "⌖"], ["Response time", "Average first response", "◷"]] },
  company: { title: "Company workspace", kicker: "COMPANY OPERATIONS", nav: ["Dashboard", "Companies", "Branches", "Technicians", "Customers", "Service requests", "Reports", "Settings"], columns: ["Request ID", "Customer", "Company", "Appliance", "Status", "Date", "Action"], tableTitle: "Recent service requests", tableSubtitle: "Monitor service activity across the company network.", bottomTitle: "Network resources", sideTitle: "Network health", resources: [["Branches", "Locations in your network", "▥"], ["Technicians", "Field service professionals", "♙"], ["Customers", "Customers served", "♧"], ["Service brands", "Connected product brands", "◈"]] },
  admin: { title: "Platform overview", kicker: "SERVORA PLATFORM", nav: ["Overview", "Companies", "Branches", "Technicians", "Customers", "Service requests", "Reports", "System settings"], columns: ["Request ID", "Customer", "Company", "Appliance", "Status", "Date", "Action"], tableTitle: "Platform service activity", tableSubtitle: "A view of requests moving across Servora.", bottomTitle: "Platform directory", sideTitle: "Platform health", resources: [["Companies", "Service partners", "▥"], ["Branches", "Operational locations", "⌖"], ["Technicians", "Verified professionals", "♙"], ["Customers", "Registered accounts", "♧"]] },
};
const config = roleConfig[role] || roleConfig.company;
const $ = (id) => document.getElementById(id);
let requests = [];
let user = null;

const icons = { Dashboard: "⌂", Overview: "⌂", "My jobs": "▤", "Job history": "◷", "Route & schedule": "⌖", Earnings: "$", "Help center": "?", "Service requests": "▣", "Incoming service requests": "▣", Technicians: "♙", "Active jobs": "⚒", Customers: "♧", Reports: "▥", Settings: "⚙", Companies: "▦", Branches: "⌖", "System settings": "⚙" };
function safe(value) { const node = document.createElement("span"); node.textContent = value ?? ""; return node.innerHTML; }
function showToast(message, type = "info") {
  const host = $("toast-container"); if (!host) return;
  const note = document.createElement("div");
  note.className = `pointer-events-auto rounded-lg px-4 py-3 shadow-lg text-xs text-white ${type === "error" ? "bg-rose-700" : "bg-slate-900"}`;
  note.textContent = message; host.append(note); setTimeout(() => note.remove(), 3200);
}
function setProfile() {
  const name = user?.name || "Servora user";
  $("userName").textContent = name; $("userRole").textContent = role === "admin" ? "Platform administrator" : config.title;
  $("userAvatar").textContent = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  $("welcomeTitle").textContent = `${greeting()}, ${name.split(/\s+/)[0]}`;
  $("welcomeSubtitle").textContent = role === "technician" ? "Here are your service calls and today's priorities." : "Here is your service operation at a glance.";
  $("todayLabel").textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date());
}
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function buildNav() {
  $("opsNav").innerHTML = config.nav.map((item, index) => `<a href="#${item.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}" class="nav-link ${index === 0 ? "active" : ""}"><span class="nav-icon">${icons[item] || "•"}</span>${safe(item)}${item === "Service requests" ? `<span class="nav-count">${requests.length}</span>` : ""}</a>`).join("");
  document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active")); link.classList.add("active"); $("crumbTitle").textContent = link.textContent.trim(); }));
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
  }).join("") : `<tr><td class="empty-row" colspan="${head.length}">${role === "technician" ? "No jobs are assigned to this technician yet." : "No service requests match this view."}</td></tr>`;
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
    const userResponse = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" });
    if (userResponse.ok) { user = (await userResponse.json()).user; localStorage.setItem("servora_user", JSON.stringify(user)); }
    const response = await fetch(`${API_BASE_URL}/api/requests`, { credentials: "include" });
    if (response.ok) requests = await response.json();
  } catch (error) { showToast("Could not reach the Servora API. Showing available workspace data.", "error"); }
  setProfile(); buildNav(); setMetrics(); renderRequests(); renderInsights(); renderResources();
  if (user?.role && user.role !== role) showToast(`Signed in as ${user.role}; this is the ${role} workspace.`, "error");
}
$("requestSearch").addEventListener("input", renderRequests);
$("statusFilter").addEventListener("change", renderRequests);
$("exportButton").addEventListener("click", () => {
  const rows = [["Request ID", "Customer", "Appliance", "Issue", "Status", "Date"], ...requests.map((item) => [item.id, item.customer_name, item.appliance_name, item.issue, item.status_badge, item.appointment_date])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `servora-${role}-requests.csv`; link.click(); URL.revokeObjectURL(link.href);
});
$("logoutBtn").addEventListener("click", async () => {
  try { await fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch { /* local sign-out still completes */ }
  localStorage.removeItem("servora_user"); window.location.href = "./index.html";
});
$("menuToggle").addEventListener("click", () => $("opsNav").closest(".ops-sidebar").classList.toggle("open"));
document.addEventListener("DOMContentLoaded", () => { document.title = `${config.title} — Servora`; $("crumbTitle").textContent = config.title; $("workspaceKicker").textContent = config.kicker; $("tableTitle").textContent = config.tableTitle; $("tableSubtitle").textContent = config.tableSubtitle; $("sidePanelTitle").textContent = config.sideTitle; $("bottomTitle").textContent = config.bottomTitle; loadDashboard(); });
