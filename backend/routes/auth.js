const express = require("express");
const axios = require("axios");
const { auth } = require("../firebaseConfig");
const { getTeamByEmail, getTeamById } = require("../services/firebaseService");

const router = express.Router();

// Firebase Web API Key with production fallback
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyDDYX61344lv5bOHf6oBv1Z0Udl8S7C3Oc";

/**
 * POST /api/auth/login
 * body: { email, password }
 * email = M1_Email OR Team ID (e.g. DEMO101, TEAM101)
 * password = M1_Phone or default password
 */
router.post("/login", async (req, res) => {
  const inputIdentifier = (req.body.email || req.body.identifier || req.body.teamId || "").trim();
  const password = (req.body.password || "").trim();

  if (!inputIdentifier || !password) {
    return res.status(400).json({ error: "Email or Team ID and password are required." });
  }

  let email = inputIdentifier.toLowerCase();
  let targetTeam = null;

  // 1. Support direct login with Team ID (e.g. "DEMO101", "TEAM105") without "@"
  if (!email.includes("@")) {
    targetTeam = await getTeamById(inputIdentifier.toUpperCase());
    if (targetTeam && (targetTeam.M1_Email || targetTeam.email)) {
      email = (targetTeam.M1_Email || targetTeam.email).toLowerCase();
    } else {
      return res.status(401).json({ error: "Team ID not found in records." });
    }
  }

  try {
    // 2. Sign in with Firebase Authentication REST API
    let idToken = null;
    let authFailed = false;
    let authErrorMessage = "";

    try {
      const signInResponse = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
        {
          email: email,
          password: password,
          returnSecureToken: true
        }
      );
      idToken = signInResponse.data.idToken;
    } catch (authErr) {
      authFailed = true;
      authErrorMessage = authErr.response?.data?.error?.message || authErr.message;
    }

    // 3. Fallback: If Firebase Auth sign-in failed, check RTDB records
    if (authFailed) {
      if (!targetTeam) {
        targetTeam = await getTeamByEmail(email);
      }

      // If credentials match RTDB record, auto-synchronize Firebase Auth on the fly
      if (targetTeam && (targetTeam.M1_Phone === password || targetTeam.password === password)) {
        try {
          let userRecord;
          try {
            userRecord = await auth.getUserByEmail(email);
            await auth.updateUser(userRecord.uid, { password });
          } catch (getErr) {
            userRecord = await auth.createUser({
              email,
              password,
              emailVerified: true
            });
          }

          const teamId = targetTeam.teamId || targetTeam.id || targetTeam.vccId;
          await auth.setCustomUserClaims(userRecord.uid, {
            id: teamId,
            teamId,
            vccId: teamId,
            teamNo: targetTeam.teamNo,
            role: "participant"
          });

          // Re-attempt sign-in
          const retrySignIn = await axios.post(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
            {
              email: email,
              password: password,
              returnSecureToken: true
            }
          );
          idToken = retrySignIn.data.idToken;
          authFailed = false;
        } catch (syncErr) {
          console.warn("[Login Auto-Sync Warning]:", syncErr.message);
        }
      }
    }

    // 4. Handle persistent auth failures gracefully
    if (authFailed || !idToken) {
      if (
        authErrorMessage.includes("INVALID_PASSWORD") ||
        authErrorMessage.includes("INVALID_LOGIN_CREDENTIALS")
      ) {
        return res.status(401).json({ error: "Wrong password. Please check your password and try again." });
      }
      if (authErrorMessage.includes("EMAIL_NOT_FOUND")) {
        return res.status(401).json({ error: "Team ID or email not found in participant records." });
      }
      if (authErrorMessage.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) {
        return res.status(429).json({ error: "Too many failed attempts. Please try again in a few minutes." });
      }
      if (authErrorMessage.includes("USER_DISABLED")) {
        return res.status(403).json({ error: "This participant account has been disabled." });
      }
      if (authErrorMessage.includes("INVALID_EMAIL")) {
        return res.status(400).json({ error: "Invalid email format. You can also sign in with your Team ID (e.g. DEMO101)." });
      }

      // If team exists in RTDB records, the failure was definitely an incorrect password
      if (targetTeam) {
        return res.status(401).json({ error: "Wrong password. Please check your password and try again." });
      }

      return res.status(401).json({ error: "Invalid credentials. Please verify your Team ID/email and password." });
    }

    // 5. Get team data from database
    if (!targetTeam) {
      targetTeam = await getTeamByEmail(email);
    }

    if (!targetTeam) {
      return res.status(401).json({ error: "Team record not found." });
    }

    const teamId = targetTeam.teamId || targetTeam.id || targetTeam.vccId;

    res.json({
      token: idToken,
      team: {
        id: teamId,
        teamId: teamId,
        vccId: teamId,
        teamNo: targetTeam.teamNo,
        teamSize: targetTeam.teamSize,
        sessionEnded: targetTeam.sessionEnded ?? false
      }
    });
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message || "";
    console.error("LOGIN ERROR HANDLER:", errorMsg);

    if (
      errorMsg.includes("INVALID_PASSWORD") ||
      errorMsg.includes("INVALID_LOGIN_CREDENTIALS")
    ) {
      return res.status(401).json({ error: "Wrong password. Please check your password and try again." });
    }
    if (errorMsg.includes("EMAIL_NOT_FOUND")) {
      return res.status(401).json({ error: "Team ID or email not found in participant records." });
    }

    // If targetTeam was located, failure was wrong password
    if (targetTeam) {
      return res.status(401).json({ error: "Wrong password. Please check your password and try again." });
    }

    res.status(401).json({ error: "Wrong password or invalid credentials. Please check and try again." });
  }
});

module.exports = router;
