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
    // Only allow localStorage override in local/dev environments, never in production
    if (typeof localStorage !== "undefined" && (isLocal || isLiveServer)) {
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

  /**
   * Safe fetch with cold-start auto-retry and Render direct-routing fallback.
   * Mitigates 502 Bad Gateway timeouts caused by Vercel edge proxies when
   * waiting for sleeping Render free-tier containers.
   */
  async function safeAuthFetch(endpoint, options = {}, onStatusUpdate = null, maxRetries = 2) {
    let currentUrl = getApiUrl(endpoint);
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        const res = await fetch(currentUrl, options);

        // If gateway error (502 / 504 / 503 from Vercel proxy rewrite)
        if ((res.status === 502 || res.status === 504 || res.status === 503) && attempts < maxRetries) {
          attempts++;
          if (onStatusUpdate) {
            onStatusUpdate(`⚡ Server is waking up (cold start)... Retrying directly in 3s (Attempt ${attempts}/${maxRetries})`);
          }
          // Fall back to direct backend URL (browser waits without Vercel's 10s rewrite timeout)
          const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
          currentUrl = `${PRODUCTION_BACKEND}${cleanEndpoint}`;
          await new Promise((resolve) => setTimeout(resolve, 3500));
          continue;
        }

        // Parse JSON or text safely
        let data = {};
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            data = await res.json();
          } catch (e) {
            data = {};
          }
        } else {
          const text = await res.text().catch(() => "");
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = { message: text.length < 150 ? text : `HTTP ${res.status}` };
            }
          }
        }

        return { res, data };
      } catch (networkErr) {
        attempts++;
        if (attempts <= maxRetries) {
          if (onStatusUpdate) {
            onStatusUpdate(`Connecting to server... Attempt ${attempts}/${maxRetries}`);
          }
          const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
          currentUrl = `${PRODUCTION_BACKEND}${cleanEndpoint}`;
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }
        throw networkErr;
      }
    }
  }

  // Auto pre-warm Render backend in background when page loads
  if (typeof window !== "undefined") {
    setTimeout(() => {
      try {
        fetch(`${PRODUCTION_BACKEND}/api/health`, {
          method: "GET",
          cache: "no-store",
          mode: "cors"
        }).catch(() => {});
      } catch (e) {}
    }, 150);
  }

  // Attach to global window object
  if (typeof window !== "undefined") {
    window.VIBEATHON_CONFIG = { API_BASE, PRODUCTION_BACKEND, getApiUrl, safeAuthFetch };
    window.getApiUrl = getApiUrl;
    window.API_BASE_URL = API_BASE;
    window.PRODUCTION_BACKEND = PRODUCTION_BACKEND;
    window.safeAuthFetch = safeAuthFetch;
  }

  // Support CommonJS / Node environments if required
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { API_BASE, PRODUCTION_BACKEND, getApiUrl, safeAuthFetch };
  }
})(typeof window !== "undefined" ? window : globalThis);
