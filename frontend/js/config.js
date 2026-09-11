/**
 * Vibeathon Frontend - Centralized API Configuration
 * 
 * In production on Vercel:
 *   API requests are made using relative URLs (e.g. "/api/auth/login")
 *   which Vercel's rewrite proxy forwards directly to the Render backend service.
 *   This avoids CORS issues and keeps the backend URL decoupled from client code.
 * 
 * In local development:
 *   Automatically routes requests to http://localhost:5000 unless overridden.
 */

(function (global) {
  const isLocal = Boolean(
    typeof window !== "undefined" && (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
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
    // Ignore localStorage access errors (e.g. private browsing restrictions)
  }

  // In production (Vercel), empty string = relative URLs routed via Vercel rewrites proxy
  const defaultBackend = isLocal ? "http://localhost:5000" : "";
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

  // Attach to global window object for classic <script> tags
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

// Support ES Module imports
export const API_BASE = typeof window !== "undefined" && window.VIBEATHON_CONFIG 
  ? window.VIBEATHON_CONFIG.API_BASE 
  : "";

export function getApiUrl(endpoint) {
  if (typeof window !== "undefined" && window.getApiUrl) {
    return window.getApiUrl(endpoint);
  }
  return endpoint;
}

export default { API_BASE, getApiUrl };
