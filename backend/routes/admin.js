const express = require("express");
const { db } = require("../firebaseConfig");
const verifyAdmin = require("../middleware/verifyAdmin");
const {
  getAllTeams,
  getAllPrompts,
  getPromptsByTeamId,
  getPromptsByVccId,
  createPromptEvaluation,
  getAllPromptEvaluations,
  getEvaluatedPromptIds
} = require("../services/firebaseService");
const { evaluatePrompt } = require("../services/geminiEvaluator");

const path = require("path");
const fs = require("fs");
const multer = require("multer");

const router = express.Router();

// Configure upload storage for problem statement document
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../public");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".docx";
    cb(null, `Problem_Statement${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

/* =========================
   GET ALL TEAMS (ADMIN)
   ========================= */
router.get("/teams", verifyAdmin, async (req, res) => {
  try {
    const teams = await getAllTeams();
    res.json(teams);
  } catch (err) {
    console.error("Admin fetch teams error:", err);
    res.status(500).json({
      message: "Failed to fetch teams"
    });
  }
});

/* =========================
   GET ALL PROMPTS (ADMIN)
   ========================= */
router.get("/prompts", verifyAdmin, async (req, res) => {
  try {
    const prompts = await getAllPrompts();
    res.json(prompts);
  } catch (err) {
    console.error("Admin fetch prompts error:", err);
    res.status(500).json({
      message: "Failed to fetch prompts"
    });
  }
});

/* ==================================================
   GET TEAM-SPECIFIC PROMPT ANALYTICS (ADMIN)
   ================================================== */
router.get(["/teams/:id/prompts", "/teams/:vccId/prompts"], verifyAdmin, async (req, res) => {
  try {
    const teamId = req.params.id || req.params.vccId;

    // Fetch all prompts for this team
    const fetchPrompts = getPromptsByTeamId || getPromptsByVccId;
    const prompts = await fetchPrompts(teamId);

    // Analytics
    const totalPrompts = prompts.length;

    const uniqueAIsSet = new Set(
      prompts.map(p => p.aiTool).filter(Boolean)
    );

    const uniqueAIs = Array.from(uniqueAIsSet);

    res.json({
      id: teamId,
      teamId,
      vccId: teamId,
      totalPrompts,
      uniqueAICount: uniqueAIs.length,
      uniqueAIs,
      prompts
    });

  } catch (err) {
    console.error("Admin team prompt analytics error:", err);
    res.status(500).json({
      message: "Failed to fetch team prompt analytics"
    });
  }
});



/* =========================
   GET PROMPT EVALUATIONS
   ========================= */
router.get("/prompt-evaluations", verifyAdmin, async (req, res) => {
  try {
    // Fetch from Firebase Realtime Database
    const evaluationsSnapshot = await db.ref("promptEvaluations").once("value");
    const evaluations = evaluationsSnapshot.val() || {};

    // Return as object keyed by vccId
    res.json(evaluations);
  } catch (err) {
    console.error("Fetch evaluations error:", err);
    res.status(500).json({
      message: "Failed to fetch evaluations"
    });
  }
});

/* ==================================================
   PROBLEM STATEMENT MANAGEMENT (ADMIN)
   ================================================== */
router.get("/problem-statement", verifyAdmin, async (req, res) => {
  try {
    const snap = await db.ref("settings/problemStatement").once("value");
    const val = snap.val() || {};
    res.json({
      fileName: val.fileName || null,
      text: val.text || "",
      updatedAt: val.updatedAt || null,
      fileSize: val.fileSize || null,
      released: Boolean(val.released === true)
    });
  } catch (err) {
    console.error("Fetch problem statement error:", err);
    res.status(500).json({ message: "Failed to fetch problem statement info" });
  }
});

router.post("/problem-statement/context", verifyAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Problem statement context text is required" });
    }

    await db.ref("settings/problemStatement").update({
      text: text.trim(),
      updatedAt: new Date().toISOString()
    });

    res.json({ message: "Problem statement evaluation context updated successfully" });
  } catch (err) {
    console.error("Update context error:", err);
    res.status(500).json({ message: "Failed to update problem statement context" });
  }
});

router.post("/problem-statement/upload", verifyAdmin, upload.single("problemFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const storedFileName = req.file.filename;
    const originalFileName = req.file.originalname || storedFileName;
    const fileSize = req.file.size;
    const contextText = req.body.contextText ? req.body.contextText.trim() : null;

    const updateData = {
      fileName: originalFileName,
      storedName: storedFileName,
      fileSize: fileSize,
      mimeType: req.file.mimetype || "application/octet-stream",
      updatedAt: new Date().toISOString()
    };

    // Store base64 in RTDB if file <= 8MB so Render cold starts/restarts never lose the file!
    if (fileSize <= 8 * 1024 * 1024 && fs.existsSync(req.file.path)) {
      const fileBuf = fs.readFileSync(req.file.path);
      updateData.fileBase64 = fileBuf.toString("base64");
    }

    if (contextText) {
      updateData.text = contextText;
    }

    await db.ref("settings/problemStatement").update(updateData);

    res.json({
      message: "Problem statement document uploaded and synchronized successfully",
      fileName: originalFileName,
      fileSize
    });
  } catch (err) {
    console.error("Upload problem statement error:", err);
    res.status(500).json({ message: "Failed to upload problem statement file" });
  }
});

module.exports = router;
