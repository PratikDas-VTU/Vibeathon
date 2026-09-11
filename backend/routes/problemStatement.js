const express = require("express");
const path = require("path");
const fs = require("fs");
const { db } = require("../firebaseConfig");

const router = express.Router();

/**
 * GET /api/problem-statement/status
 * Public/Participant check to see if problem statement is released
 */
router.get("/status", async (req, res) => {
  try {
    const snap = await db.ref("settings").once("value");
    const settings = snap.val() || {};
    const val = settings.problemStatement || {};
    const announcement = settings.announcement || {};

    const publicDir = path.join(__dirname, "../public");
    let fileExists = false;
    let targetFileName = val.fileName || "Problem_Statement.docx";

    if (fs.existsSync(path.join(publicDir, targetFileName))) {
      fileExists = true;
    } else if (fs.existsSync(publicDir)) {
      const files = fs.readdirSync(publicDir);
      const found = files.find(f => f.toLowerCase().startsWith("problem_statement"));
      if (found) {
        fileExists = true;
        targetFileName = found;
      }
    }

    res.json({
      released: val.released !== false, // Default to true unless explicitly toggled off
      fileName: targetFileName,
      fileSize: val.fileSize || null,
      updatedAt: val.updatedAt || null,
      available: fileExists,
      announcement: announcement.active ? announcement.message : null
    });
  } catch (err) {
    console.error("Problem statement status error:", err);
    res.status(500).json({ released: false, error: err.message });
  }
});


/**
 * GET /api/problem-statement/download
 * Downloads the active problem statement file
 */
router.get("/download", async (req, res) => {
  try {
    const snap = await db.ref("settings/problemStatement").once("value");
    const val = snap.val() || {};

    if (val.released === false) {
      return res.status(403).json({ error: "The problem statement has not yet been released by the organizers." });
    }

    const publicDir = path.join(__dirname, "../public");
    let targetFile = val.fileName ? path.join(publicDir, val.fileName) : null;

    if (!targetFile || !fs.existsSync(targetFile)) {
      // Find fallback in public directory
      const files = fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [];
      const found = files.find(f => f.toLowerCase().startsWith("problem_statement"));
      if (found) {
        targetFile = path.join(publicDir, found);
      }
    }

    if (!targetFile || !fs.existsSync(targetFile)) {
      return res.status(404).json({ error: "Problem statement document not found on server." });
    }

    const downloadName = val.fileName || path.basename(targetFile);
    res.download(targetFile, downloadName);
  } catch (err) {
    console.error("Download problem statement error:", err);
    res.status(500).json({ error: "Failed to download problem statement: " + err.message });
  }
});

module.exports = router;
