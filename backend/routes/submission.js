const express = require("express");
const auth = require("../middleware/auth");
const {
  getTeamByVccId,
  updateTeam,
  createPrompt
} = require("../services/firebaseService");
const { enqueuePromptEvaluation } = require("../services/evaluationQueue");

const router = express.Router();
const path = require("path");
const fs = require("fs");

/* =====================================================
   HELPER — MARK TEAM AS ACTIVE
===================================================== */
async function markActive(vccId) {
  await updateTeam(vccId, {
    lastActiveAt: new Date().toISOString()
  });
}

/* =====================================================
   START HACKATHON TIMER (ONCE)
===================================================== */
router.post("/start", auth, async (req, res) => {
  try {
    const team = await getTeamByVccId(req.team.vccId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    if (!team.hackathonStart) {
      await updateTeam(team.vccId, {
        hackathonStart: new Date().toISOString()
      });
    }

    await markActive(team.vccId);

    const updatedTeam = await getTeamByVccId(req.team.vccId);
    res.json({ hackathonStart: updatedTeam.hackathonStart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SUBMIT / UPDATE GITHUB URL
===================================================== */
router.post("/github", auth, async (req, res) => {
  const { githubUrl } = req.body;

  if (!githubUrl) {
    return res.status(400).json({ message: "GitHub URL required" });
  }

  try {
    const team = await getTeamByVccId(req.team.vccId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    if (team.sessionEnded) {
      return res.status(403).json({ message: "Session ended. Locked." });
    }

    await updateTeam(team.vccId, { githubUrl });
    await markActive(team.vccId);

    res.json({ message: "GitHub URL saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SUBMIT / UPDATE DEPLOYMENT URL
===================================================== */
router.post("/deployment", auth, async (req, res) => {
  const { deploymentUrl } = req.body;

  if (!deploymentUrl) {
    return res.status(400).json({ message: "Deployment URL required" });
  }

  try {
    const team = await getTeamByVccId(req.team.vccId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    if (team.sessionEnded) {
      return res.status(403).json({ message: "Session ended. Locked." });
    }

    await updateTeam(team.vccId, { deploymentUrl });
    await markActive(team.vccId);

    res.json({ message: "Deployment URL saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SUBMIT PROMPT (IMMUTABLE)
===================================================== */
router.post("/prompt", auth, async (req, res) => {
  const { aiTool, promptText } = req.body;

  if (!aiTool || !promptText) {
    return res.status(400).json({ message: "Invalid prompt data" });
  }

  try {
    const team = await getTeamByVccId(req.team.vccId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    if (team.sessionEnded) {
      return res.status(403).json({ message: "Session ended" });
    }

    const newPrompt = await createPrompt({
      vccId: team.vccId,
      aiTool: aiTool,
      promptText
    });

    await markActive(team.vccId);

    // Trigger instant asynchronous evaluation in background
    if (newPrompt && newPrompt.id) {
      enqueuePromptEvaluation(newPrompt.id, team.vccId, promptText, aiTool);
    }

    res.json({ message: "Prompt submitted successfully", promptId: newPrompt?.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   GET PROMPTS (READ ONLY)
===================================================== */
router.get("/prompts", auth, async (req, res) => {
  try {
    const { getPromptsByVccId } = require("../services/firebaseService");
    const prompts = await getPromptsByVccId(req.team.vccId);

    await markActive(req.team.vccId);

    res.json(prompts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   END SESSION (PERMANENT LOCK)
===================================================== */
router.post("/end", auth, async (req, res) => {
  try {
    const team = await getTeamByVccId(req.team.vccId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    await updateTeam(team.vccId, { sessionEnded: true });
    await markActive(team.vccId);

    res.json({ message: "Session ended" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   DOWNLOAD PROBLEM STATEMENT (SECURED)
===================================================== */
router.get("/problem-statement", auth, async (req, res) => {
  try {
    const team = await getTeamByVccId(req.team.vccId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    if (!team.hackathonStart) {
      return res.status(403).json({
        message: "Hackathon has not started yet. Please wait for your timer to begin."
      });
    }

    const { db } = require("../firebaseConfig");
    const snap = await db.ref("settings/problemStatement").once("value");
    const val = snap.val() || {};

    if (val.released !== true) {
      return res.status(403).json({
        message: "The problem statement has not yet been released by the organizers."
      });
    }

    // 1. If stored in RTDB base64 (survives Render restarts)
    if (val.fileBase64) {
      const buf = Buffer.from(val.fileBase64, "base64");
      const downloadName = val.fileName || "Vibeathon_Problem_Statement.docx";
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
      res.setHeader("Content-Type", val.mimeType || "application/octet-stream");
      return res.send(buf);
    }

    // 2. Check local disk in public directory
    const publicDir = path.join(__dirname, "../public");
    let targetFile = null;
    if (val.storedName && fs.existsSync(path.join(publicDir, val.storedName))) {
      targetFile = path.join(publicDir, val.storedName);
    } else if (val.fileName && fs.existsSync(path.join(publicDir, val.fileName))) {
      targetFile = path.join(publicDir, val.fileName);
    }

    if (!targetFile || !fs.existsSync(targetFile)) {
      return res.status(404).json({
        message: "Problem statement document has not been uploaded by admin yet. Please check back shortly."
      });
    }

    const downloadName = val.fileName || path.basename(targetFile);
    return res.download(targetFile, downloadName);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
