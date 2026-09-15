const express = require("express");
const path = require("path");
const fs = require("fs");
const { auth, db } = require("../firebaseConfig");
const verifyAdmin = require("../middleware/verifyAdmin");
const {
  getAllTeams,
  getTeamById,
  getTeamByVccId,
  createTeam,
  createTeamUser,
  updateTeamCredentials,
  deleteTeam,
  resetSingleTeamSession,
  resetAllTeamSessions,
  resetAllSubmissions,
  generateDemoTeams,
  purgeDemoTeams,
  purgeAllParticipants,
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
    const {
      teamId, id, vccId, leaderName, email, password, college, teamSize, branch,
      M1_VtuNo, m1VtuNo,
      M2_Name, m2Name, M2_Email, m2Email, M2_Phone, m2Phone, M2_College, m2College,
      M2_VtuNo, m2VtuNo, M2_Branch, m2Branch
    } = req.body;
    const resolvedId = (teamId || id || vccId || "").trim().toUpperCase();

    if (!resolvedId || !email || !password) {
      return res.status(400).json({ success: false, message: "Team ID, email, and password are required" });
    }

    const teamLookup = getTeamById || getTeamByVccId;
    const existing = await teamLookup(resolvedId);
    if (existing) {
      return res.status(400).json({ success: false, message: `Team ${resolvedId} already exists!` });
    }

    const teamData = {
      id: resolvedId,
      teamId: resolvedId,
      vccId: resolvedId,
      teamNo: Math.floor(1000 + Math.random() * 9000),
      teamSize: parseInt(teamSize) || (M2_Name || m2Name ? 2 : 1),
      college: college || "School of Computing",
      M1_Name: leaderName || "Team Leader",
      M1_Email: email.trim().toLowerCase(),
      M1_Phone: String(password).trim(),
      M1_Branch: branch || "Cyber Security",
      M1_VtuNo: (M1_VtuNo || m1VtuNo || "").trim(),
      sessionEnded: false,
      hackathonStart: null,
      githubUrl: null,
      deploymentUrl: null
    };

    const resolvedM2Name = (M2_Name || m2Name || "").trim();
    if (resolvedM2Name) {
      teamData.M2_Name = resolvedM2Name;
      teamData.M2_Email = (M2_Email || m2Email || "").trim().toLowerCase();
      teamData.M2_Phone = String(M2_Phone || m2Phone || "").replace(/[^0-9]/g, "").trim();
      teamData.M2_College = (M2_College || m2College || teamData.college).trim();
      teamData.M2_VtuNo = (M2_VtuNo || m2VtuNo || "").trim();
      teamData.M2_Branch = (M2_Branch || m2Branch || "").trim();
    }

    // 1. Create in Firebase Auth with immediate custom claims
    try {
      const claims = {
        id: resolvedId,
        teamId: resolvedId,
        vccId: resolvedId,
        teamNo: teamData.teamNo,
        role: "participant"
      };
      await createTeamUser(teamData.M1_Email, teamData.M1_Phone, claims);
    } catch (authErr) {
      if (authErr.code !== "auth/email-already-exists") {
        console.warn("Auth creation note:", authErr.message);
      }
    }

    // 2. Save in RTDB
    await createTeam(teamData);

    await logActivity(
      "CREATE_TEAM",
      `Created new team ${resolvedId} (${teamData.M1_Email})`,
      req.admin?.username || "Admin"
    );

    res.status(201).json({
      success: true,
      message: `Team ${resolvedId} created successfully!`,
      team: teamData
    });
  } catch (err) {
    console.error("Create team error:", err);
    res.status(500).json({ success: false, message: "Failed to create team: " + err.message });
  }
});

/**
 * PUT /api/manage/teams/:id
 * Update participant credentials & profile
 */
router.put(["/teams/:id", "/teams/:vccId"], verifyAdmin, async (req, res) => {
  try {
    const teamId = req.params.id || req.params.vccId;
    
    // FIX MED-2: Explicit allowlist of permissible update fields
    const ALLOWED_FIELDS = [
      "leaderName", "M1_Name", "name",
      "email", "M1_Email",
      "password", "M1_Phone", "phone",
      "college", "M1_College",
      "branch", "M1_Branch",
      "M1_VtuNo", "m1VtuNo",
      "M2_Name", "m2Name",
      "M2_Email", "m2Email",
      "M2_Phone", "m2Phone",
      "M2_College", "m2College",
      "M2_Branch", "m2Branch",
      "M2_VtuNo", "m2VtuNo",
      "teamSize",
      "githubUrl",
      "deploymentUrl",
      "sessionEnded",
      "hackathonStart",
      "blocked",
      "blockReason",
      "blockedAt",
      "unblockedAt",
      "juryScore"
    ];

    const safeUpdates = {};
    for (const key of ALLOWED_FIELDS) {
      if (req.body[key] !== undefined) {
        safeUpdates[key] = req.body[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).json({ success: false, message: "No valid updatable fields provided." });
    }

    const updatedTeam = await updateTeamCredentials(teamId, safeUpdates);

    // Synchronize in-memory threat detector cache with block/unblock state
    if (safeUpdates.blocked === false) {
      try {
        const { unblockTeam } = require("../services/threatDetector");
        await unblockTeam(teamId, req.admin?.username || "Admin");
      } catch (tdErr) {
        console.warn(`[PUT /teams] Threat detector unblock sync notice for ${teamId}:`, tdErr.message);
      }
    } else if (safeUpdates.blocked === true) {
      try {
        const { autoBlockTeam } = require("../services/threatDetector");
        await autoBlockTeam(teamId, safeUpdates.blockReason || "Administrative suspension", safeUpdates.blockDetails);
      } catch (tdErr) {
        console.warn(`[PUT /teams] Threat detector block sync notice for ${teamId}:`, tdErr.message);
      }
    }

    try {
      await logActivity(
        "UPDATE_TEAM",
        `Updated credentials/details for ${teamId} (${safeUpdates.M1_Email || "no email change"})`,
        req.admin?.username || "Admin"
      );
    } catch (logErr) {}

    res.json({
      success: true,
      message: `Team ${teamId} updated successfully!`,
      team: updatedTeam
    });
  } catch (err) {
    console.error(`Update team ${req.params.id || req.params.vccId} error:`, err);
    res.status(500).json({ success: false, message: "Failed to update team: " + err.message });
  }
});

/**
 * POST /api/manage/teams/:id/unblock
 * Restore and unblock a suspended team
 */
router.post(["/teams/:id/unblock", "/teams/:vccId/unblock"], verifyAdmin, async (req, res) => {
  try {
    const teamId = req.params.id || req.params.vccId;
    const adminUser = req.admin?.username || "Admin";

    const { unblockTeam } = require("../services/threatDetector");
    await unblockTeam(teamId, adminUser);

    res.json({
      success: true,
      message: `Team ${teamId} has been unblocked and restored!`,
      teamId
    });
  } catch (err) {
    console.error("Unblock team error:", err);
    res.status(500).json({ success: false, message: "Failed to unblock team: " + err.message });
  }
});

/**
 * POST /api/manage/teams/:id/block
 * Manually suspend a team
 */
router.post(["/teams/:id/block", "/teams/:vccId/block"], verifyAdmin, async (req, res) => {
  try {
    const teamId = req.params.id || req.params.vccId;
    const reason = (req.body?.reason || "Administrative suspension by organizer").trim();
    const adminUser = req.admin?.username || "Admin";

    const { autoBlockTeam } = require("../services/threatDetector");
    await autoBlockTeam(teamId, reason, `Manually suspended by ${adminUser}`);

    res.json({
      success: true,
      message: `Team ${teamId} has been suspended.`,
      teamId,
      reason
    });
  } catch (err) {
    console.error("Block team error:", err);
    res.status(500).json({ success: false, message: "Failed to suspend team: " + err.message });
  }
});

/**
 * DELETE /api/manage/teams/:id
 * Remove a team from both RTDB and Firebase Auth
 */
router.delete(["/teams/:id", "/teams/:vccId"], verifyAdmin, async (req, res) => {
  try {
    const teamId = req.params.id || req.params.vccId;
    await deleteTeam(teamId);

    await logActivity(
      "DELETE_TEAM",
      `Deleted team ${teamId}`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Team ${teamId} deleted successfully!`
    });
  } catch (err) {
    console.error(`Delete team ${req.params.id || req.params.vccId} error:`, err);
    res.status(500).json({ success: false, message: "Failed to delete team: " + err.message });
  }
});

/**
 * POST /api/manage/import-teams
 * Batch import teams from parsed CSV / Google Forms responses
 */
router.post("/import-teams", verifyAdmin, async (req, res) => {
  try {
    const { teams: importedList } = req.body;
    if (!Array.isArray(importedList) || importedList.length === 0) {
      return res.status(400).json({ success: false, message: "No teams provided for import." });
    }

    // ---- Determine next available VB number to avoid collisions ----
    const snap = await db.ref("teams").once("value");
    const existingTeams = snap.val() || {};
    let maxVbNum = 0;
    for (const key of Object.keys(existingTeams)) {
      const m = key.match(/^VB(\d+)$/i);
      if (m) maxVbNum = Math.max(maxVbNum, parseInt(m[1], 10));
    }

    const results = {
      total: importedList.length,
      created: 0,
      updated: 0,
      errors: [],
      importedTeams: []
    };

    // ---- Batch email deduplication ----
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seenEmails = new Set();
    let autoVbIndex = 0; // increments only for rows that need an auto-generated ID

    for (let i = 0; i < importedList.length; i++) {
      const row = importedList[i];
      try {
        let leaderEmail = (row.M1_Email || row.email || row.leaderEmail || "").trim().toLowerCase();
        if (leaderEmail.includes("@")) {
          const atIdx = leaderEmail.indexOf("@");
          const local = leaderEmail.slice(0, atIdx);
          const domain = leaderEmail.slice(atIdx + 1).replace(/,/g, ".");
          leaderEmail = local + "@" + domain;
        }
        const malformedMatch = leaderEmail.match(/^(\d+)gmail@\.com$/i) || leaderEmail.match(/^(\d+)@?g[a-z]+@?\.com$/i);
        if (malformedMatch) {
          leaderEmail = `vtu${malformedMatch[1]}@veltech.edu.in`;
        }
        const leaderPhone = String(row.M1_Phone || row.phone || row.leaderPhone || "").replace(/[^0-9]/g, "").trim();
        const leaderName = (row.M1_Name || row.leaderName || row.name || `Team Lead ${i + 1}`).trim();
        let teamId = (row.Team_ID || row.teamId || row.id || row.VCC_ID || row.vccId || "").trim().toUpperCase();

        // Auto-generate VB ID if none supplied
        if (!teamId) {
          autoVbIndex++;
          teamId = `VB${String(maxVbNum + autoVbIndex).padStart(3, "0")}`;
        }

        // Validate leader email
        if (!leaderEmail) {
          results.errors.push(`Row ${i + 1}: Skipped — missing leader email.`);
          continue;
        }
        if (!emailRegex.test(leaderEmail)) {
          results.errors.push(`Row ${i + 1}: Skipped — invalid leader email format.`);
          continue;
        }
        if (seenEmails.has(leaderEmail)) {
          results.errors.push(`Row ${i + 1}: Skipped — duplicate leader email in this batch.`);
          continue;
        }
        seenEmails.add(leaderEmail);

        // Validate leader phone — reject instead of padding with fake digits
        if (!leaderPhone || leaderPhone.length < 7) {
          results.errors.push(`Row ${i + 1}: Skipped — leader phone is missing or too short (need ≥7 digits).`);
          continue;
        }

        const teamData = {
          id: teamId,
          teamId: teamId,
          vccId: teamId,
          teamNo: parseInt(row.Team_No || row.teamNo) || (i + 1),
          teamSize: parseInt(row.Team_Size || row.teamSize) || (row.M2_Name ? 2 : 1),
          college: (row.M1_College || row.college || "").trim(),
          M1_Name: leaderName,
          M1_Email: leaderEmail,
          M1_Phone: leaderPhone,
          M1_VtuNo: (row.M1_VtuNo || row.m1VtuNo || row.M1_VTUNo || "").trim(),
          M1_Branch: (row.M1_Branch || row.M1_Dept || row.branch || "").trim(),
          sessionEnded: false,
          hackathonStart: null,
          githubUrl: null,
          deploymentUrl: null
        };

        // Member 2 — full schema including VTU number and branch
        if (row.M2_Name) {
          teamData.M2_Name = row.M2_Name.trim();
          teamData.M2_Email = (row.M2_Email || "").trim().toLowerCase();
          teamData.M2_Phone = String(row.M2_Phone || "").replace(/[^0-9]/g, "").trim();
          teamData.M2_College = (row.M2_College || teamData.college || "").trim();
          teamData.M2_VtuNo = (row.M2_VtuNo || row.M2_VTUNo || "").trim();
          teamData.M2_Branch = (row.M2_Branch || row.M2_Dept || row.M2_Department || "").trim();
        }

        // Build normalized members array for instant frontend rendering
        teamData.members = [
          {
            name: teamData.M1_Name,
            email: teamData.M1_Email,
            phone: teamData.M1_Phone,
            college: teamData.M1_College || teamData.college,
            branch: teamData.M1_Branch,
            vtuNo: teamData.M1_VtuNo || (teamData.M1_Email && teamData.M1_Email.match(/(vtu\d+)/i) ? teamData.M1_Email.match(/(vtu\d+)/i)[1].toUpperCase() : ""),
            isLeader: true
          }
        ];
        if (teamData.M2_Name && teamData.M2_Name !== "NA" && teamData.M2_Name !== "undefined") {
          teamData.members.push({
            name: teamData.M2_Name,
            email: teamData.M2_Email || "",
            phone: teamData.M2_Phone || "",
            college: teamData.M2_College || teamData.college,
            branch: teamData.M2_Branch || teamData.M1_Branch,
            vtuNo: teamData.M2_VtuNo || (teamData.M2_Email && teamData.M2_Email.match(/(vtu\d+)/i) ? teamData.M2_Email.match(/(vtu\d+)/i)[1].toUpperCase() : ""),
            isLeader: false
          });
        }

        // 1. Create or sync Firebase Auth (leader only — one login per team) with immediate custom claims
        const teamClaims = {
          id: teamData.teamId,
          teamId: teamData.teamId,
          vccId: teamData.teamId,
          teamNo: teamData.teamNo,
          role: "participant"
        };
        try {
          const userRec = await createTeamUser(teamData.M1_Email, teamData.M1_Phone, teamClaims);
          if (userRec) {
            await auth.setCustomUserClaims(userRec.uid, teamClaims);
          }
        } catch (authErr) {
          console.warn("Auth creation/sync error for", teamData.M1_Email, authErr.message);
        }

        // 2. Save in RTDB
        const teamLookup = getTeamById || getTeamByVccId;
        const existing = await teamLookup(teamData.teamId);
        if (existing) {
          await updateTeamCredentials(teamData.teamId, teamData);
          results.updated++;
        } else {
          await createTeam(teamData);
          results.created++;
        }

        results.importedTeams.push({
          id: teamData.teamId,
          teamId: teamData.teamId,
          vccId: teamData.teamId,
          teamNo: teamData.teamNo,
          leaderName: teamData.M1_Name,
          email: teamData.M1_Email,
          password: teamData.password || teamData.M1_Phone,
          college: teamData.college,
          teamSize: teamData.teamSize,
          M1_Name: teamData.M1_Name,
          M1_VtuNo: teamData.M1_VtuNo || "",
          M1_Branch: teamData.M1_Branch || "",
          M1_Email: teamData.M1_Email,
          M1_Phone: teamData.M1_Phone,
          M2_Name: teamData.M2_Name || "",
          M2_VtuNo: teamData.M2_VtuNo || "",
          M2_Branch: teamData.M2_Branch || "",
          M2_Email: teamData.M2_Email || "",
          M2_Phone: teamData.M2_Phone || ""
        });

      } catch (rowErr) {
        results.errors.push(`Row ${i + 1} (${row.teamId || row.id || row.vccId || "unknown"}): ${rowErr.message}`);
      }
    }

    await logActivity(
      "IMPORT_TEAMS_CSV",
      `Imported ${results.created} new teams and updated ${results.updated} teams from CSV/Google Forms. Errors: ${results.errors.length}`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Import complete! Created ${results.created} teams, updated ${results.updated} teams.${results.errors.length ? ` ${results.errors.length} row(s) had errors.` : ""}`,
      results
    });
  } catch (err) {
    console.error("Batch import error:", err);
    res.status(500).json({ success: false, message: "Failed to batch import teams: " + err.message });
  }
});

/**
 * DELETE /api/manage/prompts
 * Clear all test prompts and reset team evaluation stats
 */
router.delete("/prompts", verifyAdmin, async (req, res) => {
  try {
    const snap = await db.ref("prompts").once("value");
    const count = snap.numChildren();

    await db.ref("prompts").remove();
    await db.ref("promptEvaluations").remove();

    // Reset cumulative scores on all teams
    const teamsSnap = await db.ref("teams").once("value");
    const teamsObj = teamsSnap.val() || {};
    const updates = {};
    Object.keys(teamsObj).forEach(teamKey => {
      updates[`teams/${teamKey}/aiScore`] = null;
      updates[`teams/${teamKey}/aiEvaluatedCount`] = 0;
      updates[`teams/${teamKey}/aiEvaluating`] = false;
      updates[`teams/${teamKey}/score`] = null;
      updates[`teams/${teamKey}/totalScore`] = null;
      updates[`teams/${teamKey}/promptCount`] = 0;
    });
    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    await logActivity(
      "CLEAR_PROMPTS",
      `Cleared all ${count} test prompts and reset evaluations`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Successfully cleared all ${count} prompts and reset evaluation scores to 0!`,
      clearedCount: count
    });
  } catch (err) {
    console.error("Clear prompts error:", err);
    res.status(500).json({ success: false, message: "Failed to clear prompts: " + err.message });
  }
});

/**
 * POST /api/manage/reset-all-submissions
 * Clear all participant submissions (GitHub URLs, Deployment URLs, prompts, and AI scores)
 */
router.post("/reset-all-submissions", verifyAdmin, async (req, res) => {
  try {
    const { includeTimers = false } = req.body;
    const result = await resetAllSubmissions(includeTimers);

    await logActivity(
      "RESET_ALL_SUBMISSIONS",
      `Reset all deliverables, submission URLs, prompts, and AI scores for ${result.totalTeams} teams (includeTimers: ${includeTimers})`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Successfully reset all submissions, deliverables, and prompt scores for all ${result.totalTeams} teams!`,
      ...result
    });
  } catch (err) {
    console.error("Reset all submissions error:", err);
    res.status(500).json({ success: false, message: "Failed to reset submissions: " + err.message });
  }
});

/* ============================================================
   2. SESSION RESETS (BROWSER-BASED)
   ============================================================ */

/**
 * POST /api/manage/teams/:id/reset
 * Reset session for an individual team
 */
router.post(["/teams/:id/reset", "/teams/:vccId/reset"], verifyAdmin, async (req, res) => {
  try {
    const teamId = req.params.id || req.params.vccId;
    const result = await resetSingleTeamSession(teamId);

    await logActivity(
      "RESET_TEAM_SESSION",
      `Reset timer and unlocked session for team ${teamId}`,
      req.admin?.username || "Admin"
    );

    res.json({
      success: true,
      message: `Team ${teamId} session has been reset!`,
      result
    });
  } catch (err) {
    console.error(`Reset team ${req.params.id || req.params.vccId} error:`, err);
    res.status(500).json({ success: false, message: "Failed to reset session: " + err.message });
  }
});

/**
 * POST /api/manage/purge-participants
 * Delete all participant teams, prompts, evaluations, and participant auth accounts
 */
router.post("/purge-participants", verifyAdmin, async (req, res) => {
  try {
    const result = await purgeAllParticipants();

    await logActivity(
      "PURGE_ALL_PARTICIPANTS",
      `Purged all participant records and accounts (${result.deletedAuthCount} auth users removed)`,
      req.admin?.username || "Admin"
    );

    res.json(result);
  } catch (err) {
    console.error("Purge participants error:", err);
    res.status(500).json({ success: false, message: "Failed to purge participants: " + err.message });
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
 * Change admin password (enforces 12-character minimum)
 */
router.put("/admin/password", verifyAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    // S9/M-3: Enforce minimum 12 characters for admin passwords
    if (!newPassword || newPassword.length < 12) {
      return res.status(400).json({ success: false, message: "Admin password must be at least 12 characters" });
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
    // S12/M-6: Bound limit to safe maximum of 500 to prevent large RTDB reads/memory spikes
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 500);
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
