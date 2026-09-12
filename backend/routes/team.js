const express = require("express");
const auth = require("../middleware/auth");
const { getTeamById, getTeamByVccId } = require("../services/firebaseService");

const router = express.Router();

/**
 * GET /api/team/me
 * Return logged-in team (READ ONLY)
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
      members: team.members,
      githubUrl: team.githubUrl,
      deploymentUrl: team.deploymentUrl,
      sessionEnded: team.sessionEnded ?? false
    });
  } catch (err) {
    console.error("TEAM ME ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
