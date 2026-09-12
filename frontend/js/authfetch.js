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
    let response = await fetch(targetUrl, {
      ...options,
      headers
    });

    // Handle Render free tier cold-start timeout from Vercel proxy rewrite (502 / 504)
    if (response.status === 502 || response.status === 504) {
      console.warn("⚠️ Gateway timeout in authFetch (Render cold start). Retrying directly against Render backend...");
      await new Promise(r => setTimeout(r, 3000));
      const directUrl = url.startsWith("http") 
        ? url 
        : `https://vibeathon-backend-g210.onrender.com${url.startsWith("/") ? url : "/" + url}`;
      response = await fetch(directUrl, { ...options, headers });
    }

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
