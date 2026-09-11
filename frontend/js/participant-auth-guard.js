import { authFetch } from "./authfetch.js";

function enforceParticipantAuth() {
  const token = localStorage.getItem("token");

  // 🚫 No token → force login immediately
  if (!token) {
    window.location.replace("participant-login.html");
    return false;
  }
  return true;
}

// Immediate synchronous check before DOM even paints
enforceParticipantAuth();

// Handle Back/Forward Cache (bfcache) navigation
window.addEventListener("pageshow", (event) => {
  enforceParticipantAuth();
});

document.addEventListener("DOMContentLoaded", async () => {
  if (!enforceParticipantAuth()) return;

  try {
    // 🔐 Validate token with backend
    const res = await authFetch("/api/team/me");

    if (!res || !res.ok) {
      throw new Error("Session invalid or expired");
    }

    // ✅ Token valid → allow dashboard to run
  } catch (err) {
    console.error("Auth guard error:", err);

    // 🧹 Clean logout on ANY auth failure
    localStorage.removeItem("token");
    sessionStorage.clear();

    window.location.replace("participant-login.html");
  }
});
