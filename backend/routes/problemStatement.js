const express = require("express");
const path = require("path");
const fs = require("fs");
const { db } = require("../firebaseConfig");
const auth = require("../middleware/auth");

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
    let hasFile = Boolean(val.fileBase64 || val.text);
    let targetFileName = val.fileName || "Vibeathon_Problem_Statement.docx";

    if (!hasFile) {
      if (val.storedName && fs.existsSync(path.join(publicDir, val.storedName))) {
        hasFile = true;
      } else if (val.fileName && fs.existsSync(path.join(publicDir, val.fileName))) {
        hasFile = true;
      }
    }

    const isReleased = Boolean(val.released === true);
    const session = settings.session || {};

    res.json({
      released: isReleased,
      hasFile: hasFile,
      fileName: targetFileName,
      fileSize: val.fileSize || null,
      updatedAt: val.updatedAt || null,
      available: isReleased,
      announcement: announcement.active ? announcement.message : null,
      session: {
        baseDurationMinutes: typeof session.baseDurationMinutes === "number" ? session.baseDurationMinutes : 150,
        extraMinutes: typeof session.extraMinutes === "number" ? session.extraMinutes : 0,
        globalEnded: Boolean(session.globalEnded === true)
      }
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

    let isAuthorized = Boolean(val.released === true);
    const authHeader = req.headers.authorization;
    if (!isAuthorized && authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const { verifyIdToken } = require("../services/firebaseService");
        const token = authHeader.split(" ")[1];
        const decoded = await verifyIdToken(token);
        if (decoded) isAuthorized = true;
      } catch (e) {
        // invalid token
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: "The problem statement has not yet been released by the organizers." });
    }

    function sanitizeFileName(name, fallback = "Vibeathon_Problem_Statement.docx") {
      if (!name || typeof name !== "string") return fallback;
      const base = path.basename(name).replace(/[\r\n\0\t"\\;]/g, "").replace(/[^\w\s.\-]/g, "_").trim();
      return base.length > 0 && base.length <= 200 ? base : fallback;
    }

    // 1. If stored in Firebase RTDB (persisted across Render restarts)
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

    // 3. Guaranteed Dynamic Fallback
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
    console.error("Download problem statement error:", err);
    res.status(500).json({ error: "Failed to download problem statement: " + err.message });
  }
});

module.exports = router;
