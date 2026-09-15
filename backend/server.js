const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();


// Routes
const authRoutes = require("./routes/auth");
const teamRoutes = require("./routes/team");
const submissionRoutes = require("./routes/submission"); // ✅ ADD THIS
const adminAuthRoutes = require("./routes/adminAuth");
const adminRoutes = require("./routes/admin");
const verifyAdmin = require("./middleware/verifyAdmin");


const app = express();
app.set("trust proxy", 1);

/* =====================================================
   MIDDLEWARE & CORS CONFIGURATION
===================================================== */
const allowedOrigins = new Set([
  "https://cs-vibeathon.vercel.app",
  "https://vibeathon-backend-g210.onrender.com",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "http://localhost:5502",
  "http://127.0.0.1:5502",
  "http://127.0.0.1:3000"
]);

if (process.env.FRONTEND_URL) {
  // Support comma-separated list of allowed origins from environment
  process.env.FRONTEND_URL.split(",").map(o => o.trim()).filter(Boolean).forEach(o => allowedOrigins.add(o));
}

function isOriginAllowed(origin) {
  if (!origin) return true; // Server-to-server, curl, same-host requests
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (
      url.hostname === "cs-vibeathon.vercel.app" ||
      url.hostname.endsWith(".vercel.app") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname.endsWith(".onrender.com")
    ) {
      return true;
    }
  } catch (e) {}
  return false;
}

app.use(
  cors({
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      // Never throw an Error: throwing an Error causes Express to respond with 500.
      // Returning callback(null, false) safely omits CORS headers without crashing the server.
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    credentials: true,
    optionsSuccessStatus: 204
  })
);
const path = require("path");

app.use("/public", express.static(path.join(__dirname, "public")));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.disable("x-powered-by");

// Bypass ngrok browser warning
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  res.setHeader('User-Agent', 'CustomClient');
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // S5/H-3: Removed 'unsafe-inline' from script-src. All scripts are served from external .js files.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );
  next();
});

/* =====================================================
   RATE LIMITING
===================================================== */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin login attempts. Please try again in 15 minutes." }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Raised to 1500 to support 32+ teams sharing a single university Wi-Fi / NAT IP
  max: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 1500,
  standardHeaders: true,
  legacyHeaders: false,
});

// FIX HIGH-4: Mount stricter, route-specific limiters BEFORE the general /api limiter
app.use("/api/admin/login", adminLoginLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api", apiLimiter);

/* =====================================================
   ROUTES
===================================================== */
app.use("/api/auth", authRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/submission", submissionRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", require("./routes/evaluatePrompts"));
app.use("/api/manage", require("./routes/management"));
app.use("/api/problem-statement", require("./routes/problemStatement"));


/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/", (req, res) => {
  res.send("Vibeathon Backend is LIVE 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "Vibeathon Backend API",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/version", verifyAdmin, (req, res) => {
  res.json({
    version: "2.3.0",
    build: "production",
    features: [
      "heuristic-eval-fallback",
      "auto-recovery-scanner",
      "wrong-password-explicit-error",
      "atomic-reset-all-submissions",
      "team-id-login-support"
    ],
    timestamp: new Date().toISOString()
  });
});

/* =====================================================
   DATABASE CONNECTION
===================================================== */
// Initialize Firebase (imported in firebaseConfig.js)
const { admin } = require("./firebaseConfig");

console.log("Firebase Admin SDK initialized ✅");


/* =====================================================
   SERVER START (Bind to process.env.PORT and 0.0.0.0)
===================================================== */
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
