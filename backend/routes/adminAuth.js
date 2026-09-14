const express = require("express");
const axios = require("axios");
const { auth } = require("../firebaseConfig");
const {
  getAdminByUsername,
  createAdmin,
  createAdminUser
} = require("../services/firebaseService");

const router = express.Router();

// Firebase Web API Key (read securely from environment variables)
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;
if (!FIREBASE_API_KEY) {
  console.warn("⚠️ Warning: FIREBASE_WEB_API_KEY is not set in environment variables.");
}

/* =========================
   TEST ROUTE
========================= */
router.get("/ping", (req, res) => {
  res.json({ status: "admin route alive ✅" });
});

/**
 * POST /api/admin/login
 * Supports:
 *  - Registered admins in database
 *  - Optional demo admin configured via DEMO_ADMIN_PASSWORD env var
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required"
      });
    }

    // 🔍 Find admin (demo or real)
    let admin = await getAdminByUsername(username.toLowerCase());

    const demoAdminUser = (process.env.DEMO_ADMIN_USER || process.env.ADMIN_USERNAME || "").toLowerCase();
    const demoAdminPass = process.env.DEMO_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

    /**
     * DEMO ADMIN FALLBACK (Enabled only when DEMO_ADMIN_PASSWORD env var is explicitly configured)
     */
    if (!admin && demoAdminUser && demoAdminPass && username === demoAdminUser && password === demoAdminPass) {
      // Create Firebase user for demo admin
      const adminEmail = "admin@vibeathon.internal";

      try {
        // Try to get existing user or create new one
        let userRecord;
        try {
          userRecord = await auth.getUserByEmail(adminEmail);
          console.log("✅ Demo admin user already exists in Firebase Auth");
        } catch (error) {
          // User doesn't exist, create it
          console.log("🔧 Creating demo admin user in Firebase Auth...");
          userRecord = await createAdminUser(adminEmail, password);
          console.log("✅ Demo admin user created successfully");
        }

        // Create admin in database if doesn't exist
        try {
          admin = await createAdmin({
            username: "admin",
            email: adminEmail,
            role: "admin"
          });
          console.log("✅ Demo admin created in database");
        } catch (dbError) {
          // Admin might already exist in database, fetch it
          admin = await getAdminByUsername("admin");
          console.log("✅ Demo admin already exists in database");
        }

        // Set custom claims for role-based access
        await auth.setCustomUserClaims(userRecord.uid, {
          id: admin.id,
          role: "admin",
          username: admin.username
        });
        console.log("✅ Custom claims set for demo admin");
      } catch (error) {
        console.error("❌ Error creating demo admin:", error);
        return res.status(500).json({
          message: "Failed to create demo admin"
        });
      }
    } else if (!admin) {
      // Neither demo admin nor real admin found
      return res.status(401).json({
        message: "Invalid credentials"
      });
    }

    // 🔐 Sign in with Firebase Authentication
    const adminEmail = admin.email || `${admin.username}@vibeathon.internal`;

    try {
      // Sign in using Firebase REST API
      const signInResponse = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
        {
          email: adminEmail,
          password: password,
          returnSecureToken: true
        }
      );

      // Get the Firebase ID token (contains custom claims)
      let idToken = signInResponse.data.idToken;

      // Ensure custom claims are set on Firebase user for role-based authorization
      try {
        const userRecord = await auth.getUserByEmail(adminEmail);
        if (!userRecord.customClaims || userRecord.customClaims.role !== "admin") {
          await auth.setCustomUserClaims(userRecord.uid, {
            id: admin.id,
            role: "admin",
            username: admin.username
          });
        }
      } catch (claimErr) {
        console.warn("Notice: Custom claims sync for admin:", claimErr.message);
      }

      return res.status(200).json({
        message: "Admin login successful",
        token: idToken,
        admin: {
          username: admin.username,
          role: admin.role
        }
      });
    } catch (authError) {
      console.error("Firebase Auth Error:", authError);

      // Handle Firebase Auth errors
      if (authError.response?.data?.error?.message) {
        const errorMessage = authError.response.data.error.message;
        if (
          errorMessage.includes("INVALID_PASSWORD") ||
          errorMessage.includes("EMAIL_NOT_FOUND") ||
          errorMessage.includes("INVALID_LOGIN_CREDENTIALS")
        ) {
          return res.status(401).json({
            message: "Invalid credentials"
          });
        }
      }

      return res.status(401).json({
        message: "Invalid credentials"
      });
    }
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
