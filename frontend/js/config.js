/**
 * Vibeathon Frontend - Centralized API Configuration
 * 
 * In production on Vercel:
 *   API requests are made using relative URLs (e.g. "/api/auth/login")
 *   which Vercel's rewrite proxy forwards directly to the Render backend service.
 *   This avoids CORS issues and keeps the backend URL decoupled from client code.
 * 
 * In VS Code Live Server (port 5500 / 5501 / file:):
 *   Routes directly to the live production Render backend service.
 */

(function (global) {
  const PRODUCTION_BACKEND = "https://vibeathon-backend-g210.onrender.com";

  const isLocal = Boolean(
    typeof window !== "undefined" && (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.protocol === "file:"
    )
  );

  const isLiveServer = Boolean(
    typeof window !== "undefined" && (
      window.location.port === "5500" ||
      window.location.port === "5501" ||
      window.location.port === "5502" ||
      window.location.protocol === "file:"
    )
  );

  // Allow manual override via localStorage if needed
  let customBackend = null;
  try {
    if (typeof localStorage !== "undefined") {
      customBackend = localStorage.getItem("VIBEATHON_BACKEND_URL");
    }
  } catch (e) {
    // Ignore localStorage access errors (e.g. private browsing)
  }

  // Routing strategy:
  // 1. If customBackend set in localStorage -> use customBackend
  // 2. If running inside VS Code Live Server (port 5500/5501) -> use PRODUCTION_BACKEND
  // 3. In production (Vercel) -> use "" (relative to let vercel.json proxy route to Render)
  let defaultBackend = "";
  if (isLiveServer) {
    defaultBackend = PRODUCTION_BACKEND;
  } else if (isLocal && window.location.port === "5000") {
    defaultBackend = "";
  } else if (isLocal) {
    defaultBackend = PRODUCTION_BACKEND;
  }

  const API_BASE = customBackend || defaultBackend;

  function getApiUrl(endpoint) {
    if (!endpoint) return API_BASE;
    // If endpoint is already absolute (starts with http:// or https://), return as-is
    if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
      return endpoint;
    }
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${API_BASE}${cleanEndpoint}`;
  }

  // Attach to global window object
  if (typeof window !== "undefined") {
    window.VIBEATHON_CONFIG = { API_BASE, getApiUrl };
    window.getApiUrl = getApiUrl;
    window.API_BASE_URL = API_BASE;
  }

  // Support CommonJS / Node environments if required
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { API_BASE, getApiUrl };
  }
})(typeof window !== "undefined" ? window : globalThis);
