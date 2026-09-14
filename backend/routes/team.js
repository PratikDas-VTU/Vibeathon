const express = require("express");
const auth = require("../middleware/auth");
const { getTeamById, getTeamByVccId } = require("../services/firebaseService");

const router = express.Router();

/**
 * Build a normalized members array from flat M1_* / M2_* RTDB fields.
 * Falls back to the legacy team.members array if no flat fields exist.
 */
function buildMembersArray(team) {
  // Prefer flat fields (current import schema)
  if (team.M1_Name) {
    const members = [
      {
        name: team.M1_Name || "",
        email: team.M1_Email || "",
        phone: team.M1_Phone || "",
        college: team.M1_College || team.college || "",
        branch: team.M1_Branch || "",
        vtuNo: team.M1_VtuNo || "",
        isLeader: true
      }
    ];
    if (team.M2_Name) {
      members.push({
        name: team.M2_Name || "",
        email: team.M2_Email || "",
        phone: team.M2_Phone || "",
        college: team.M2_College || team.college || "",
        branch: team.M2_Branch || "",
        vtuNo: team.M2_VtuNo || "",
        isLeader: false
      });
    }
    return members;
  }
  // Fallback: legacy teams stored members as an array directly
  if (Array.isArray(team.members) && team.members.length > 0) {
    return team.members;
  }
  return [];
}

/**
 * GET /api/team/me
 * Return logged-in team's full profile (READ ONLY)
 */
router.get("/me", auth, async (req, res) => {
  try {
    const teamLookup = getTeamById || getTeamByVccId;
    const teamId = req.team.teamId || req.team.id || req.team.vccId;
    const team = await teamLookup(teamId);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const tId = team.teamId || team.id || team.vccId;

    res.json({
      id: tId,
      teamId: tId,
      vccId: tId,
      teamNo: team.teamNo,
      teamSize: team.teamSize,
      college: team.college || team.M1_College || "",
      // Normalized members array (works for both old and new schema)
      members: buildMembersArray(team),
      // Full flat fields for rich display
      M1_Name: team.M1_Name || "",
      M1_Email: team.M1_Email || "",
      M1_Phone: team.M1_Phone || "",
      M1_VtuNo: team.M1_VtuNo || "",
      M1_Branch: team.M1_Branch || "",
      M1_College: team.M1_College || team.college || "",
      M2_Name: team.M2_Name || "",
      M2_Email: team.M2_Email || "",
      M2_Phone: team.M2_Phone || "",
      M2_College: team.M2_College || "",
      M2_Branch: team.M2_Branch || "",
      M2_VtuNo: team.M2_VtuNo || "",
      githubUrl: team.githubUrl || null,
      deploymentUrl: team.deploymentUrl || null,
      sessionEnded: team.sessionEnded ?? false,
      blocked: Boolean(team.blocked === true),
      blockReason: team.blockReason || null,
      blockedAt: team.blockedAt || null
    });
  } catch (err) {
    console.error("TEAM ME ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
