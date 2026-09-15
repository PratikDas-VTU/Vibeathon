const express = require("express");
const auth = require("../middleware/auth");
const {
  getTeamById,
  getTeamByVccId,
  updateTeam,
  createPrompt,
  getPromptsByTeamId,
  getPromptsByVccId,
  getSessionSettings
} = require("../services/firebaseService");
const { enqueuePromptEvaluation } = require("../services/evaluationQueue");
const { checkPromptSubmission, checkDeliverableSubmission } = require("../services/threatDetector");

const router = express.Router();
const path = require("path");
const fs = require("fs");

/* =====================================================
   S6/H-4: SERVER-SIDE URL VALIDATION
   Frontend validation is UX-only; server must validate independently.
===================================================== */
const MAX_URL_LENGTH = 2048;

function isValidHttpUrl(str) {
  if (!str || typeof str !== "string") return false;
  if (str.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(str);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidGithubUrl(str) {
  if (!isValidHttpUrl(str)) return false;
  try {
    const url = new URL(str);
    return url.hostname === "github.com" || url.hostname.endsWith(".github.com") || url.hostname.endsWith(".github.io");
  } catch {
    return false;
  }
}

async function checkSubmissionAllowed(team) {
  const session = await getSessionSettings();
  if (session.globalEnded || team.sessionEnded) {
    return { allowed: false, message: "Session concluded. Submissions are locked." };
  }
  if (team.hackathonStart) {
    const elapsedSec = (Date.now() - new Date(team.hackathonStart).getTime()) / 1000;
    if (elapsedSec < 30 * 60) {
      return { allowed: false, message: "Problem reading phase active. Submissions open at 02:00:00 remaining." };
    }
  }
  return { allowed: true };
}

async function markActive(teamId) {
  await updateTeam(teamId, {
    lastActiveAt: new Date().toISOString()
  });
}

/* =====================================================
   START HACKATHON TIMER (ONCE)
===================================================== */
router.post("/start", auth, async (req, res) => {
  try {
    const teamId = req.team.teamId || req.team.id || req.team.vccId;
    const team = await getTeamById(teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    if (!team.hackathonStart) {
      await updateTeam(teamId, {
        hackathonStart: new Date().toISOString()
      });
    }

    await markActive(teamId);

    const session = await getSessionSettings();
    const updatedTeam = await getTeamById(teamId);
    res.json({
      hackathonStart: updatedTeam.hackathonStart,
      sessionEnded: Boolean(updatedTeam.sessionEnded || session.globalEnded),
      baseDurationMinutes: session.baseDurationMinutes || 150,
      extraMinutes: session.extraMinutes || 0,
      globalEnded: session.globalEnded || false
    });
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

  if (!githubUrl || typeof githubUrl !== "string") {
    return res.status(400).json({ message: "GitHub URL required as a valid string" });
  }

  const cleanUrl = githubUrl.trim();

  // S6/H-4: Server-side URL validation
  if (!isValidGithubUrl(cleanUrl)) {
    return res.status(400).json({
      message: "Invalid GitHub URL. Must be a valid http(s) URL pointing to github.com or github.io."
    });
  }

  try {
    const teamId = req.team.teamId || req.team.id || req.team.vccId;

    // Security check for malicious payloads or excessive updating
    const secCheck = await checkDeliverableSubmission(teamId, cleanUrl, "github");
    if (!secCheck.allowed) {
      return res.status(403).json({ message: secCheck.reason, blocked: secCheck.blocked });
    }

    const team = await getTeamById(teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const gateCheck = await checkSubmissionAllowed(team);
    if (!gateCheck.allowed) {
      return res.status(403).json({ message: gateCheck.message });
    }

    await updateTeam(teamId, { githubUrl: cleanUrl });
    await markActive(teamId);

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

  if (!deploymentUrl || typeof deploymentUrl !== "string") {
    return res.status(400).json({ message: "Deployment URL required as a valid string" });
  }

  const cleanUrl = deploymentUrl.trim();

  // S6/H-4: Server-side URL validation — must be http: or https:, no javascript:, data:, file:
  if (!isValidHttpUrl(cleanUrl)) {
    return res.status(400).json({
      message: "Invalid Deployment URL. Must be a valid http(s) URL."
    });
  }

  try {
    const teamId = req.team.teamId || req.team.id || req.team.vccId;

    // Security check for malicious payloads or excessive updating
    const secCheck = await checkDeliverableSubmission(teamId, cleanUrl, "deployment");
    if (!secCheck.allowed) {
      return res.status(403).json({ message: secCheck.reason, blocked: secCheck.blocked });
    }

    const team = await getTeamById(teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const gateCheck = await checkSubmissionAllowed(team);
    if (!gateCheck.allowed) {
      return res.status(403).json({ message: gateCheck.message });
    }

    await updateTeam(teamId, { deploymentUrl: cleanUrl });
    await markActive(teamId);

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
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 51200) {
    return res.status(413).json({ message: "Payload too large. Maximum size is 50kb." });
  }

  const { aiTool, promptText } = req.body;

  if (!aiTool || !promptText || typeof promptText !== 'string' || promptText.trim() === '') {
    return res.status(400).json({ message: "Invalid prompt data: promptText must be a non-empty string" });
  }

  if (promptText.length > 8000) {
    return res.status(400).json({ message: "promptText exceeds maximum length of 8000 characters" });
  }

  if (typeof aiTool !== 'string' || aiTool.trim().length === 0 || aiTool.length > 100) {
    return res.status(400).json({ message: "aiTool must be a valid string between 1 and 100 characters" });
  }

  // Sanitize aiTool to clean text, removing any HTML or control characters
  const cleanAiTool = aiTool.replace(/[<>"'`]/g, "").trim();
  if (cleanAiTool.length === 0) {
    return res.status(400).json({ message: "Invalid aiTool provided." });
  }

  try {
    const teamId = req.team.teamId || req.team.id || req.team.vccId;

    // Automated threat detection: burst flood, duplicate spam, adversarial jailbreak, exploit payload
    const secCheck = await checkPromptSubmission(teamId, promptText, cleanAiTool);
    if (secCheck.blocked) {
      return res.status(403).json({
        message: secCheck.reason,
        blocked: true,
        blockReason: secCheck.reason
      });
    }
    if (secCheck.throttled) {
      return res.status(429).json({
        message: secCheck.message,
        waitSeconds: secCheck.waitSeconds
      });
    }

    const team = await getTeamById(teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const gateCheck = await checkSubmissionAllowed(team);
    if (!gateCheck.allowed) {
      return res.status(403).json({ message: gateCheck.message });
    }

    const nowIso = new Date().toISOString();
    const newPrompt = await createPrompt({
      teamId,
      vccId: teamId,
      teamName: team.teamName || team.name || teamId,
      userId: req.team.uid || "",
      userEmail: req.team.email || "",
      aiTool: cleanAiTool,
      promptText,
      evaluationStatus: "queued",
      createdAt: nowIso,
      submittedAt: nowIso
    });

    await updateTeam(teamId, {
      lastActiveAt: new Date().toISOString(),
      aiEvaluating: true
    });

    // Trigger instant asynchronous evaluation in background
    if (newPrompt && newPrompt.id) {
      enqueuePromptEvaluation(newPrompt.id, teamId, promptText, cleanAiTool);
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
    const teamId = req.team.teamId || req.team.id || req.team.vccId;
    const fetchPrompts = getPromptsByTeamId || getPromptsByVccId;
    const prompts = await fetchPrompts(teamId);

    await markActive(teamId);

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
    const teamId = req.team.teamId || req.team.id || req.team.vccId;
    const team = await getTeamById(teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const nowIso = new Date().toISOString();
    await updateTeam(teamId, {
      sessionEnded: true,
      completedAt: team.completedAt || nowIso,
      sessionEndedAt: team.sessionEndedAt || nowIso
    });
    await markActive(teamId);

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
    const teamId = req.team.teamId || req.team.id || req.team.vccId;
    const team = await getTeamById(teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const { db } = require("../firebaseConfig");
    const snap = await db.ref("settings/problemStatement").once("value");
    const val = snap.val() || {};

    if (val.released !== true) {
      return res.status(403).json({
        message: "The problem statement has not yet been released by the organizers."
      });
    }

    // S7/M-1: Sanitize filename to prevent Content-Disposition header injection
    function sanitizeFileName(name, fallback = "Vibeathon_Problem_Statement.docx") {
      if (!name || typeof name !== "string") return fallback;
      const base = path.basename(name).replace(/[\r\n\0\t"\\;]/g, "").replace(/[^\w\s.\-]/g, "_").trim();
      return base.length > 0 && base.length <= 200 ? base : fallback;
    }

    // 1. If stored in RTDB base64 (survives Render restarts)
    if (val.fileBase64) {
      const buf = Buffer.from(val.fileBase64, "base64");
      const downloadName = sanitizeFileName(val.fileName, "Vibeathon_Problem_Statement.docx");
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

    if (targetFile && fs.existsSync(targetFile)) {
      const downloadName = sanitizeFileName(val.fileName, path.basename(targetFile));
      return res.download(targetFile, downloadName);
    }

    // 3. Guaranteed Dynamic Fallback from problem statement text
    const textContent = val.text || `Institutional Event Resource Management System (IERMS)
Vibeathon 2026 Official Problem Statement

Challenge Overview:
Educational institutions frequently organize large-scale academic, cultural, and technical events requiring coordinated reservation of specialized facilities, high-value AV equipment, faculty supervisors, and guest speaker protocol.

Core Requirements:
1. Multi-Role Workflow & RBAC (Coordinator, HOD, Dean, IT Admin)
2. Conflict Detection Engine
3. Multi-tier Rejection & Feedback
4. Dynamic Mid-Event Adjustments & Audit Trail`;

    const downloadName = sanitizeFileName(val.fileName, "Vibeathon_Problem_Statement.txt");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(Buffer.from(textContent, "utf-8"));
  } catch (err) {
    console.error("Submission problem statement download error:", err);
    res.status(500).json({ message: "Server error downloading problem statement: " + err.message });
  }
});

module.exports = router;
