function resolveApiUrl(endpoint) {
  if (typeof window !== "undefined" && window.getApiUrl) {
    return window.getApiUrl(endpoint);
  }
  // Fallback for VS Code Live Server (port 5500/5501)
  if (typeof window !== "undefined" && (window.location.port === "5500" || window.location.port === "5501" || window.location.protocol === "file:")) {
    const clean = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `https://vibeathon-backend-g210.onrender.com${clean}`;
  }
  return endpoint;
}

export async function authFetch(url, options = {}) {
  const targetUrl = resolveApiUrl(url);
  console.log("🔐 authFetch called with URL:", targetUrl);

  const token = localStorage.getItem("token");

  if (!token) {
    console.error("❌ No token found, redirecting to login");
    window.location.replace("participant-login.html");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    "Authorization": `Bearer ${token}`
  };

  try {
    const response = await fetch(targetUrl, {
      ...options,
      headers
    });

    console.log("📥 Response received:", response);
    console.log("📊 Response status:", response.status);
    console.log("📊 Response ok:", response.ok);

    // If token expired / invalid
    if (response.status === 401 || response.status === 403) {
      console.error("❌ Unauthorized - clearing localStorage and redirecting");
      localStorage.clear();
      window.location.replace("participant-login.html");
      return;
    }

    return response;
  } catch (error) {
    console.error("❌ FETCH ERROR in authFetch:", error);
    console.error("❌ Error message:", error.message);
    throw error;
  }
}
