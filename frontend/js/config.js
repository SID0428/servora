// Servora Frontend API Configuration for Vercel & Localhost

const DEFAULT_LOCAL_API = "http://127.0.0.1:8000";
// When you deploy your backend to Render, replace this with your actual Render URL:
// Example: https://servora-backend.onrender.com
const DEFAULT_RENDER_API = "https://servora-3v6b.onrender.com";

// Auto-detect environment
const isLocalhost = window.location.hostname === "localhost" || 
                    window.location.hostname === "127.0.0.1" || 
                    window.location.protocol === "file:";

// Allow overriding via localStorage for testing live Render backend from any browser
const savedApiUrl = localStorage.getItem("servora_api_url");

export const API_BASE_URL = savedApiUrl || (isLocalhost ? DEFAULT_LOCAL_API : DEFAULT_RENDER_API);

export function setCustomApiUrl(url) {
  if (url) {
    localStorage.setItem("servora_api_url", url);
  } else {
    localStorage.removeItem("servora_api_url");
  }
  window.location.reload();
}
