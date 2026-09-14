function resolveApiUrl(endpoint) {
  if (typeof window !== "undefined" && window.getApiUrl) {
    return window.getApiUrl(endpoint);
  }
  // Fallback for VS Code Live Server (port 5500/5501): prefer local backend on port 5000
  if (typeof window !== "undefined" && (window.location.port === "5500" || window.location.port === "5501" || window.location.port === "5502" || window.location.protocol === "file:")) {
    const clean = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `http://localhost:5000${clean}`;
  }
  return endpoint;
}

export async function authFetch(url, options = {}) {
  const targetUrl = resolveApiUrl(url);

  const token = sessionStorage.getItem("token") || localStorage.getItem("token");

  if (!token) {
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
      await new Promise(r => setTimeout(r, 3000));
      const directUrl = url.startsWith("http")
        ? url
        : `https://vibeathon-backend-g210.onrender.com${url.startsWith("/") ? url : "/" + url}`;
      response = await fetch(directUrl, { ...options, headers });
    }

    // If token expired / unauthenticated (401 only)
    // Note: Do NOT redirect on 403 Forbidden, as 403 carries security suspension or session ended payloads
    if (response.status === 401) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace("participant-login.html");
      return;
    }

    return response;
  } catch (error) {
    throw error;
  }
}

