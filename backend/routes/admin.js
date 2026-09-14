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

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ];
  const allowedExts = ['.pdf', '.doc', '.docx', '.txt', '.md'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Supported formats: .docx, .pdf, .txt, .doc"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: fileFilter
});


/* =========================
   GET ALL TEAMS (ADMIN)
   ========================= */
router.get("/teams", verifyAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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

router.post("/problem-statement/upload", verifyAdmin, (req, res, next) => {
  if (req.is("json")) return next();
  upload.single("problemFile")(req, res, (err) => {
    if (err) {
      console.error("Multer file upload error:", err);
      return res.status(400).json({ message: err.message || "File upload validation failed" });
    }
    next();
  });
}, async (req, res) => {
  try {
    let originalFileName = null;
    let storedFileName = null;
    let fileSize = 0;
    let mimeType = "application/octet-stream";
    let fileBase64 = null;
    let contextText = null;

    if (req.file) {
      storedFileName = req.file.filename;
      originalFileName = req.file.originalname || storedFileName;
      fileSize = req.file.size;
      mimeType = req.file.mimetype || "application/octet-stream";
      contextText = req.body.contextText ? req.body.contextText.trim() : null;

      if (fileSize <= 15 * 1024 * 1024 && fs.existsSync(req.file.path)) {
        const fileBuf = fs.readFileSync(req.file.path);
        fileBase64 = fileBuf.toString("base64");
      }
    } else if (req.body && req.body.fileBase64) {
      originalFileName = req.body.fileName || "Vibeathon_Problem_Statement.docx";
      const ext = path.extname(originalFileName).toLowerCase() || ".docx";
      storedFileName = `Problem_Statement${ext}`;
      fileBase64 = req.body.fileBase64;
      mimeType = req.body.mimeType || "application/octet-stream";
      contextText = req.body.contextText ? req.body.contextText.trim() : null;

      const fileBuf = Buffer.from(fileBase64, "base64");
      fileSize = fileBuf.length;

      try {
        const publicDir = path.join(__dirname, "../public");
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
        fs.writeFileSync(path.join(publicDir, storedFileName), fileBuf);
        fs.writeFileSync(path.join(publicDir, originalFileName), fileBuf);
      } catch (diskErr) {
        console.warn("Could not cache file to disk:", diskErr.message);
      }
    } else {
      return res.status(400).json({ message: "No problem statement file provided. Please choose a document." });
    }

    const updateData = {
      fileName: originalFileName,
      storedName: storedFileName,
      fileSize: fileSize,
      mimeType: mimeType,
      updatedAt: new Date().toISOString()
    };

    if (fileBase64) {
      updateData.fileBase64 = fileBase64;
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
    res.status(500).json({ message: "Failed to upload problem statement file: " + err.message });
  }
});

router.get("/problem-statement/download", verifyAdmin, async (req, res) => {
  try {
    const snap = await db.ref("settings/problemStatement").once("value");
    const val = snap.val() || {};

    function sanitizeFileName(name, fallback = "Vibeathon_Problem_Statement.docx") {
      if (!name || typeof name !== "string") return fallback;
      const base = path.basename(name).replace(/[\r\n\0\t"\\;]/g, "").replace(/[^\w\s.\-]/g, "_").trim();
      return base.length > 0 && base.length <= 200 ? base : fallback;
    }

    // 1. If stored in Firebase RTDB
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

    // 3. Dynamic guaranteed fallback from problem statement text
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
    console.error("Admin download problem statement error:", err);
    res.status(500).json({ message: "Failed to download problem statement: " + err.message });
  }
});

module.exports = router;
