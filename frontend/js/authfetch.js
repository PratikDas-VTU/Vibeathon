function resolveApiUrl(endpoint) {
  if (typeof window !== "undefined" && window.getApiUrl) {
    return window.getApiUrl(endpoint);
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
