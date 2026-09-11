const express = require("express");
const auth = require("../middleware/auth");
const { getTeamByVccId } = require("../services/firebaseService");

const router = express.Router();

/**
 * GET /api/team/me
 * Return logged-in team (READ ONLY)
 */
router.get("/me", auth, async (req, res) => {
  try {
    const team = await getTeamByVccId(req.team.vccId);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    res.json({
      vccId: team.vccId,
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
