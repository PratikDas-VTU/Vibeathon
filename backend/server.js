const express = require("express");
const cors = require("cors");
require("dotenv").config();


// Routes
const authRoutes = require("./routes/auth");
const teamRoutes = require("./routes/team");
const submissionRoutes = require("./routes/submission"); // ✅ ADD THIS
const adminAuthRoutes = require("./routes/adminAuth");
const adminRoutes = require("./routes/admin");



const app = express();

/* =====================================================
   MIDDLEWARE
===================================================== */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:3000"
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, server-to-server, or Vercel rewrites)
      if (!origin || origin === "null") {
        return callback(null, true);
      }
      // Allow any vercel.app deployment preview or production domain
      if (origin.endsWith(".vercel.app") || allowedOrigins.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  })
);
const path = require("path");

app.use("/public", express.static(path.join(__dirname, "public")));

app.use(express.json());
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
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );

  next();
});


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

app.get("/api/version", (req, res) => {
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
