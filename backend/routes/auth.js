const express = require("express");
const axios = require("axios");
const { auth } = require("../firebaseConfig");
const { getTeamByEmail } = require("../services/firebaseService");

const router = express.Router();

// Firebase Web API Key (read securely from environment variables)
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;
if (!FIREBASE_API_KEY) {
  console.warn("⚠️ Warning: FIREBASE_WEB_API_KEY is not set in environment variables.");
}

/**
 * POST /api/auth/login
 * body: { email, password }
 * email = M1_Email
 * password = M1_Phone
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Sign in with Firebase Authentication REST API
    const signInResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        email: email,
        password: password,
        returnSecureToken: true
      }
    );

    // Get the Firebase ID token (contains custom claims)
    const idToken = signInResponse.data.idToken;

    // Verify and decode the token to get custom claims
    const decodedToken = await auth.verifyIdToken(idToken);

    // Get team data from database
    const team = await getTeamByEmail(email);

    if (!team) {
      return res.status(401).json({ error: "Team not found" });
    }

    res.json({
      token: idToken,
      team: {
        vccId: team.vccId,
        teamNo: team.teamNo,
        teamSize: team.teamSize,
        sessionEnded: team.sessionEnded ?? false
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);

    // Handle Firebase Auth errors
    if (err.response?.data?.error?.message) {
      const errorMessage = err.response.data.error.message;
      if (errorMessage.includes("INVALID_PASSWORD") || errorMessage.includes("EMAIL_NOT_FOUND")) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
    }

    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
