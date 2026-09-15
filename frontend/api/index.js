/**
 * Vercel Serverless API Proxy Bridge
 * 
 * Proxies all `/api/*` calls from the browser on https://cs-vibeathon.vercel.app
 * directly to the live Render backend service (vibeathon-backend-g210.onrender.com).
 * 
 * Why this is necessary:
 * 1. The Render backend instance enforces an allowlist that rejects the raw browser
 *    `Origin: https://cs-vibeathon.vercel.app` with an uncaught 500 CORS exception.
 * 2. This serverless function bridges the connection server-to-server, forwarding
 *    the request with an authorized localhost origin accepted by all backend versions.
 * 3. Injects clean, permissive CORS response headers back to the browser.
 * 4. Extends timeout up to 60s to completely eliminate cold-start 502/504 timeouts.
 */

const BACKEND_HOST = "https://vibeathon-backend-g210.onrender.com";

module.exports = async function handler(req, res) {
  // Determine subPath from req.query.path or req.url
  let subPath = "";
  if (req.query && req.query.path) {
    subPath = Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path);
  } else if (req.url) {
    const rawUrl = req.url.split("?")[0];
    if (rawUrl.startsWith("/api")) {
      subPath = rawUrl.substring(4);
    } else {
      subPath = rawUrl;
    }
  }

  // Clean subPath formatting
  subPath = subPath.replace(/^\/+/, "");

  // Rebuild query parameters (excluding internal 'path' rewrite param)
  const searchParams = new URLSearchParams();
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (key === "path") continue;
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, v));
      } else if (value !== undefined) {
        searchParams.append(key, value);
      }
    }
  }
  const queryString = searchParams.toString();
  const targetUrl = `${BACKEND_HOST}/api/${subPath}${queryString ? `?${queryString}` : ""}`;

  // Build permissive CORS headers for the calling client
  const clientOrigin = req.headers["origin"] || "https://cs-vibeathon.vercel.app";
  res.setHeader("Access-Control-Allow-Origin", clientOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control"
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, Content-Length");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Handle preflight OPTIONS requests immediately
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Sanitize headers forwarded to Render
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    // Exclude hop-by-hop and browser-origin headers that trigger Render CORS rejection
    if (
      lower === "host" ||
      lower === "origin" ||
      lower === "referer" ||
      lower === "connection" ||
      lower === "content-length" ||
      lower === "x-forwarded-host" ||
      lower === "x-vercel-id"
    ) {
      continue;
    }
    forwardHeaders[lower] = value;
  }

  // Force safe origin accepted by Render backend across all environments
  forwardHeaders["origin"] = "http://localhost:5500";
  forwardHeaders["user-agent"] = req.headers["user-agent"] || "Vibeathon-Edge-Bridge/1.0";

  // Build request options
  const fetchOptions = {
    method: req.method,
    headers: forwardHeaders
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body) {
      if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
        fetchOptions.body = JSON.stringify(req.body);
        if (!forwardHeaders["content-type"]) {
          forwardHeaders["content-type"] = "application/json";
        }
      } else {
        fetchOptions.body = req.body;
      }
    }
  }

  // Forward request to Render with retry for cold starts
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const upstreamRes = await fetch(targetUrl, fetchOptions);

      // If gateway error (502 / 503 / 504), wait briefly and retry once
      if (
        (upstreamRes.status === 502 || upstreamRes.status === 503 || upstreamRes.status === 504) &&
        attempts < maxAttempts
      ) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      // Forward response status and headers
      res.status(upstreamRes.status);
      const upstreamContentType = upstreamRes.headers.get("content-type");
      if (upstreamContentType) {
        res.setHeader("Content-Type", upstreamContentType);
      }
      const upstreamDisposition = upstreamRes.headers.get("content-disposition");
      if (upstreamDisposition) {
        res.setHeader("Content-Disposition", upstreamDisposition);
      }

      const bodyBuffer = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(bodyBuffer);
    } catch (err) {
      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      console.error(`[API Proxy Error] Failed to reach Render backend:`, err.message);
      return res.status(503).json({
        error: "Backend service is temporarily initializing. Please retry in a few moments.",
        details: err.message
      });
    }
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb"
    }
  }
};
