const express = require("express");
const path = require("path");
const fs = require("fs");
const verifyAdmin = require("../middleware/verifyAdmin");
const {
  getAllTeams,
  getTeamByVccId,
  createTeam,
  createTeamUser,
  updateTeamCredentials,
  deleteTeam,
  resetSingleTeamSession,
  resetAllTeamSessions,
  generateDemoTeams,
  purgeDemoTeams,
  getSettings,
  updateSettings,
  logActivity,
  getAuditLogs,
  updateAdminPassword
} = require("../services/firebaseService");

const router = express.Router();

/* ============================================================
   1. PARTICIPANT / TEAMS MANAGEMENT
   ============================================================ */

/**
 * GET /api/manage/teams
 * Fetch all teams with full profile and credentials
 */
router.get("/teams", verifyAdmin, async (req, res) => {
  try {
    const teams = await getAllTeams();
    res.json({
      success: true,
      count: teams.length,
      teams
    });
  } catch (err) {
    console.error("Manage fetch teams error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch teams: " + err.message });
  }
});

/**
 * POST /api/manage/teams
 * Create a new team in both RTDB and Firebase Auth
 */
router.post("/teams", verifyAdmin, async (req, res) => {
  try {
    const { vccId, leaderName, email, password, college, teamSize, branch } = req.body;

    if (!vccId || !email || !password) {
      return res.status(400).json({ success: false, message: "vccId, email, and password are required" });
    }

    const cleanVccId = vccId.trim().toUpperCase();
    const existing = await getTeamByVccId(cleanVccId);
    if (existing) {
      return res.status(400).json({ success: false, message: `Team ${cleanVccId} already exists!` });
    }

    const teamData = {
      vccId: cleanVccId,
      teamNo: Math.floor(1000 + Math.random() * 9000),
      teamSize: parseInt(teamSize) || 2,
      college: college || "School of Computing",
      M1_Name: leaderName || "Team Leader",
      M1_Email: email.trim().toLowerCase(),
      M1_Phone: String(password).trim(),
      M1_Branch: branch || "Cyber Security",
      sessionEnded: false,
      hackathonStart: null,
      githubUrl: null,
      deploymentUrl: null
    };

    // 1. Create in Firebase Auth
    try {
      await createTeamUser(teamData.M1_Email, teamData.M1_Phone);
    } catch (authErr) {
      if (authErr.code !== "auth/email-already-exists") {
        console.warn("Auth creation note:", authErr.message);
      }
    }

    // 2. Save in RTDB
    await createTeam(teamData);

    await logActivity(
      "CREATE_TEAM",
      `Created new team ${cleanVccId} (${teamData.M1_Email})`,
      req.admin?.username || "Admin"
    );

    res.status(201).json({
      success: true,
      message: `Team ${cleanVccId} created successfully!`,
      team: teamData
    });
  } catch (err) {
    console.error("Create team error:", err);
    res.status(500).json({ success: false, message: "Failed to create team: " + err.message });
  }
});

/**
 * PUT /api/manage/teams/:vccId
 * Update participant credentials & profile
 */
router.put("/teams/:vccId", verifyAdmin, async (req, res) => {
  try {
    const { vccId } = req.params;
    const updates = req.body;

    const updatedTeam = await updateTeamCredentials(vccId, updates);

    await logActivity(
      "UPDATE_TEAM",
      `Updated credentials/details for ${vccId} (${updates.M1_Email || "no email change"})`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Team ${vccId} updated successfully!`,
      team: updatedTeam
    });
  } catch (err) {
    console.error(`Update team ${req.params.vccId} error:`, err);
    res.status(500).json({ success: false, message: "Failed to update team: " + err.message });
  }
});

/**
 * DELETE /api/manage/teams/:vccId
 * Remove a team from both RTDB and Firebase Auth
 */
router.delete("/teams/:vccId", verifyAdmin, async (req, res) => {
  try {
    const { vccId } = req.params;
    await deleteTeam(vccId);

    await logActivity(
      "DELETE_TEAM",
      `Deleted team ${vccId}`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Team ${vccId} deleted successfully!`
    });
  } catch (err) {
    console.error(`Delete team ${req.params.vccId} error:`, err);
    res.status(500).json({ success: false, message: "Failed to delete team: " + err.message });
  }
});

/* ============================================================
   2. SESSION RESETS (BROWSER-BASED)
   ============================================================ */

/**
 * POST /api/manage/teams/:vccId/reset
 * Reset session for an individual team
 */
router.post("/teams/:vccId/reset", verifyAdmin, async (req, res) => {
  try {
    const { vccId } = req.params;
    const result = await resetSingleTeamSession(vccId);

    await logActivity(
      "RESET_TEAM_SESSION",
      `Reset timer and unlocked session for team ${vccId}`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Team ${vccId} session has been reset!`,
      result
    });
  } catch (err) {
    console.error(`Reset team ${req.params.vccId} error:`, err);
    res.status(500).json({ success: false, message: "Failed to reset session: " + err.message });
  }
});

/**
 * POST /api/manage/reset-all-sessions
 * Reset sessions for ALL teams in production (replaces reset-all-sessions.bat)
 */
router.post("/reset-all-sessions", verifyAdmin, async (req, res) => {
  try {
    const { totalReset } = await resetAllTeamSessions();

    await logActivity(
      "RESET_ALL_SESSIONS",
      `Reset hackathon timers, locks, and submission URLs for all ${totalReset} teams`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Successfully reset hackathon sessions for all ${totalReset} teams!`,
      totalReset
    });
  } catch (err) {
    console.error("Reset all sessions error:", err);
    res.status(500).json({ success: false, message: "Failed to reset all sessions: " + err.message });
  }
});

/* ============================================================
   3. DEMO TESTING CREDENTIALS GENERATOR
   ============================================================ */

/**
 * POST /api/manage/demo-credentials
 * Batch generate N demo teams with known test passwords
 */
router.post("/demo-credentials", verifyAdmin, async (req, res) => {
  try {
    const { count = 3, prefix = "DEMO", password = "demo12345" } = req.body;
    const cleanPrefix = (prefix || "DEMO").toUpperCase().replace(/[^A-Z0-9]/g, "");

    const created = await generateDemoTeams(count, cleanPrefix, password);

    await logActivity(
      "GENERATE_DEMO_TEAMS",
      `Generated ${created.length} test accounts (Prefix: ${cleanPrefix})`,
      req.admin?.username || "Admin"
    );

    res.status(201).json({
      success: true,
      message: `Generated ${created.length} demo credentials!`,
      demoTeams: created
    });
  } catch (err) {
    console.error("Demo credentials generation error:", err);
    res.status(500).json({ success: false, message: "Failed to generate demo teams: " + err.message });
  }
});

/**
 * DELETE /api/manage/demo-credentials
 * Clean up / delete all demo teams
 */
router.delete("/demo-credentials", verifyAdmin, async (req, res) => {
  try {
    const { prefix = "DEMO" } = req.query;
    const { deletedCount } = await purgeDemoTeams(prefix);

    await logActivity(
      "PURGE_DEMO_TEAMS",
      `Purged ${deletedCount} test accounts (Prefix: ${prefix})`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} demo accounts!`,
      deletedCount
    });
  } catch (err) {
    console.error("Demo purge error:", err);
    res.status(500).json({ success: false, message: "Failed to purge demo teams: " + err.message });
  }
});

/* ============================================================
   4. PLATFORM SETTINGS & BROADCAST ANNOUNCEMENTS
   ============================================================ */

/**
 * GET /api/manage/settings
 * Retrieve current platform settings (problem statement release, broadcast banner, etc.)
 */
router.get("/settings", verifyAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      success: true,
      settings
    });
  } catch (err) {
    console.error("Fetch settings error:", err);
    res.status(500).json({ success: false, message: "Failed to load settings: " + err.message });
  }
});

/**
 * PUT /api/manage/settings
 * Update global competition settings
 */
router.put("/settings", verifyAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const settings = await updateSettings(updates);

    await logActivity(
      "UPDATE_SETTINGS",
      `Updated platform settings: ${Object.keys(updates).join(", ")}`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: "Platform settings updated successfully!",
      settings
    });
  } catch (err) {
    console.error("Update settings error:", err);
    res.status(500).json({ success: false, message: "Failed to update settings: " + err.message });
  }
});

/**
 * POST /api/manage/announcement
 * Broadcast or clear an announcement for participant dashboards
 */
router.post("/announcement", verifyAdmin, async (req, res) => {
  try {
    const { message, active = true } = req.body;
    const announcement = {
      message: message ? message.trim() : "",
      active: Boolean(active && message && message.trim()),
      updatedAt: new Date().toISOString()
    };

    await updateSettings({ announcement });

    await logActivity(
      "BROADCAST_ANNOUNCEMENT",
      announcement.active ? `Broadcast: "${announcement.message}"` : "Cleared broadcast announcement",
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: announcement.active ? "Announcement broadcasted!" : "Announcement cleared!",
      announcement
    });
  } catch (err) {
    console.error("Announcement error:", err);
    res.status(500).json({ success: false, message: "Failed to post announcement: " + err.message });
  }
});

/* ============================================================
   5. ADMIN CREDENTIALS
   ============================================================ */

/**
 * PUT /api/manage/admin/password
 * Change admin password
 */
router.put("/admin/password", verifyAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const username = req.admin?.username || "admin";
    await updateAdminPassword(username, newPassword);

    await logActivity(
      "CHANGE_ADMIN_PASSWORD",
      `Admin password changed for account: ${username}`,
      username
    );

    res.json({
      success: true,
      message: "Admin password updated successfully!"
    });
  } catch (err) {
    console.error("Change admin password error:", err);
    res.status(500).json({ success: false, message: "Failed to change admin password: " + err.message });
  }
});

/* ============================================================
   6. AUDIT LOGS
   ============================================================ */

/**
 * GET /api/manage/logs
 * Retrieve real-time activity and audit logs
 */
router.get("/logs", verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await getAuditLogs(limit);
    res.json({
      success: true,
      logs
    });
  } catch (err) {
    console.error("Fetch logs error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch logs: " + err.message });
  }
});

module.exports = router;
