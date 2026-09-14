const crypto = require("crypto");
const { db } = require("../firebaseConfig");
const { purgeQueuedPromptsForTeam } = require("./evaluationQueue");
const { logActivity } = require("./firebaseService");

/**
 * THREAT DETECTOR & AUTO-BLOCK SERVICE
 * 
 * Automatically identifies malicious, automated, or abusive participant behavior:
 *  1. Rapid-fire prompt floods (DoS / bot automation)
 *  2. Duplicate prompt blasts (score spamming)
 *  3. Adversarial prompt injection attacks targeting Gemini scoring
 *  4. Malicious code / script injection payloads in inputs
 * 
 * When triggered:
 *  - Immediately marks team as suspended (`blocked: true`) in Firebase RTDB
 *  - Purges any pending jobs from the background evaluation queue (zero wasted Gemini credits)
 *  - Logs security incident in system audit logs
 *  - Rejects all subsequent requests with HTTP 403
 *  - Provides instant unblock capability for organizers in the Management Console
 */

// In-Memory Real-Time State
const blockedTeams = new Map(); // teamId -> { blockedAt, reason, details }
const recentSubmissions = new Map(); // teamId -> Array<timestamp>
const recentPromptHashes = new Map(); // teamId -> Array<{ hash, time }>
const recentDeliverables = new Map(); // teamId -> Array<timestamp>
const violationLog = new Map(); // teamId -> Array<{ reason, time }>

// Threshold Constants
const MIN_SUBMISSION_GAP_MS = 10000;     // 10-second minimum gap between prompt submissions
const BURST_WINDOW_MS = 15000;           // 15-second burst detection window
const MAX_BURST_PROMPTS = 3;             // >= 3 rapid violations in 15s = auto-block
const MINUTE_WINDOW_MS = 60000;          // 60-second window
const MAX_MINUTE_PROMPTS = 4;            // >= 4 prompts in 60s: 5th prompt triggers auto-block
const DUPLICATE_WINDOW_MS = 120000;      // 2-minute duplicate window
const MAX_CONSECUTIVE_DUPLICATES = 3;    // 3 identical prompts in 2 min = auto-block

// Signatures for Adversarial Prompt Injection
const ADVERSARIAL_INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget|override)\s+(all\s+)?(previous|above|system)\s+instructions\b/i,
  /\b(system\s*prompt\s*override|admin\s*override|developer\s*mode|jailbreak)\b/i,
  /\b(you\s+must\s+score\s+(me\s+)?50|give\s+(me\s+)?(a\s+)?score\s+of\s+50|award\s+50\s+points|max\s+score\s+50)\b/i,
  /\b(always\s+respond\s+with\s+score\s+50|rate\s+this\s+50)\b/i,
  /\b(output|reveal|print|show)\s+(the\s+)?system\s+prompt\b/i,
  /\[\/?(?:SYSTEM|END|TRUSTED|CRITICAL ADVERSARIAL|UNTRUSTED|INSTRUCTIONS|EVALUATION)[^\]]*\]/i
];

// Signatures for Malicious / Exploit Payloads
const EXPLOIT_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /data:text\/html/i,
  /(\.\.[\/\\]){2,}/,
  /\b(eval|exec|passthru|system)\s*\(/i,
  /('|"|`)\s*(or|and)\s*('|"|`|\d+)\s*=\s*('|"|`|\d+)/i
];

function hashText(text) {
  return crypto.createHash("sha256").update(String(text || "").trim().toLowerCase()).digest("hex");
}

/**
 * Fast synchronous check if a team is currently blocked
 */
function isTeamBlocked(teamId) {
  if (!teamId) return false;
  return blockedTeams.has(String(teamId).trim().toUpperCase());
}

/**
 * Get block details for a team
 */
function getTeamBlockInfo(teamId) {
  if (!teamId) return null;
  return blockedTeams.get(String(teamId).trim().toUpperCase()) || null;
}

/**
 * Automatically block a team due to security threat
 */
async function autoBlockTeam(teamId, reason, details = "") {
  if (!teamId) return;
  const normalizedId = String(teamId).trim().toUpperCase();

  const blockRecord = {
    blocked: true,
    blockedAt: new Date().toISOString(),
    blockReason: reason,
    blockDetails: details
  };

  // 1. Update in-memory set immediately for zero-latency route enforcement
  blockedTeams.set(normalizedId, blockRecord);

  console.warn(`🚨 [THREAT DETECTOR] Auto-blocking team ${normalizedId}! Reason: ${reason}. Details: ${details}`);

  try {
    // 2. Persist to Firebase RTDB
    await db.ref(`teams/${normalizedId}`).update({
      blocked: true,
      blockedAt: blockRecord.blockedAt,
      blockReason: reason,
      blockDetails: details
    });

    // 3. Purge any pending jobs in the evaluation queue (stops queue starvation & saves Gemini quota)
    const purged = purgeQueuedPromptsForTeam(normalizedId);

    // 4. Record high-priority audit log
    await logActivity(
      "AUTO_BLOCK_PARTICIPANT",
      `Team ${normalizedId} automatically suspended: ${reason} (Purged ${purged} queued jobs). ${details}`,
      "THREAT_DETECTION_SYSTEM"
    );

  } catch (err) {
    console.error(`❌ [THREAT DETECTOR] Error during autoBlockTeam for ${normalizedId}:`, err.message);
  }

  return blockRecord;
}

/**
 * Manually unblock a team (called by event organizers via Management Console)
 */
async function unblockTeam(teamId, adminUser = "Admin") {
  if (!teamId) return;
  const normalizedId = String(teamId).trim().toUpperCase();

  // 1. Remove from in-memory blocked set
  blockedTeams.delete(normalizedId);

  // 2. Clear rate limit & violation tracking
  recentSubmissions.delete(normalizedId);
  recentPromptHashes.delete(normalizedId);
  recentDeliverables.delete(normalizedId);
  violationLog.delete(normalizedId);

  console.log(`✅ [THREAT DETECTOR] Team ${normalizedId} unblocked by ${adminUser}.`);

  try {
    // 3. Update Firebase RTDB (clear block flags, reason, and details)
    await db.ref(`teams/${normalizedId}`).update({
      blocked: false,
      blockReason: null,
      blockDetails: null,
      unblockedAt: new Date().toISOString(),
      unblockedBy: adminUser
    });

    // 4. Record audit log safely without interrupting unblock
    try {
      await logActivity(
        "MANUAL_UNBLOCK",
        `Team ${normalizedId} manually unblocked and restored by ${adminUser}.`,
        adminUser
      );
    } catch (logErr) {
      console.warn(`⚠️ [THREAT DETECTOR] Audit log error during unblock for ${normalizedId}:`, logErr.message);
    }

  } catch (err) {
    console.error(`❌ [THREAT DETECTOR] Error during unblockTeam for ${normalizedId}:`, err.message);
    throw err;
  }

  return { success: true, teamId: normalizedId };
}

/**
 * Comprehensive security validation on prompt submission
 * Returns:
 *   - { allowed: true }
 *   - { blocked: true, reason }
 *   - { throttled: true, waitSeconds, message }
 */
async function checkPromptSubmission(teamId, promptText, aiTool) {
  const normalizedId = String(teamId || "").trim().toUpperCase();
  if (!normalizedId) return { allowed: false, message: "Missing team ID" };

  // 1. Check if already blocked
  if (isTeamBlocked(normalizedId)) {
    const info = getTeamBlockInfo(normalizedId);
    return {
      blocked: true,
      reason: info?.blockReason || "Account suspended due to security violations."
    };
  }

  const now = Date.now();
  const text = String(promptText || "").trim();

  // 2. Exploit / Code Injection Payload Detection
  for (const pattern of EXPLOIT_PATTERNS) {
    if (pattern.test(text) || pattern.test(aiTool)) {
      await autoBlockTeam(
        normalizedId,
        "Malicious exploit payload detected",
        `Input matched security rule: ${pattern.toString().slice(0, 40)}`
      );
      return {
        blocked: true,
        reason: "Malicious exploit payload detected in submission."
      };
    }
  }

  // 3. Adversarial Prompt Injection / Jury Manipulation Detection
  let hasAdversarialPattern = false;
  let matchedPatternStr = "";
  for (const pattern of ADVERSARIAL_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      hasAdversarialPattern = true;
      matchedPatternStr = pattern.toString().slice(0, 50);
      break;
    }
  }

  if (hasAdversarialPattern) {
    const vList = violationLog.get(normalizedId) || [];
    vList.push({ reason: "ADVERSARIAL_INJECTION", time: now, pattern: matchedPatternStr });
    violationLog.set(normalizedId, vList);

    console.warn(`⚠️ [THREAT DETECTOR] Team ${normalizedId} submitted adversarial prompt injection pattern: ${matchedPatternStr}`);

    // If 2 or more adversarial injection attempts, auto-block team
    if (vList.filter(v => v.reason === "ADVERSARIAL_INJECTION").length >= 2) {
      await autoBlockTeam(
        normalizedId,
        "Repeated adversarial prompt injection attempts",
        `Deliberate score manipulation pattern: ${matchedPatternStr}`
      );
      return {
        blocked: true,
        reason: "Repeated adversarial prompt injection attempts targeting the evaluation jury."
      };
    }
  }

  // 4. Rapid-Fire Flooding (DoS / Bot Detection)
  let timestamps = recentSubmissions.get(normalizedId) || [];
  // Prune timestamps older than 60 seconds
  timestamps = timestamps.filter(t => now - t < MINUTE_WINDOW_MS);

  // Check 10-second minimum pacing gap
  if (timestamps.length > 0) {
    const lastSubmission = timestamps[timestamps.length - 1];
    const elapsedMs = now - lastSubmission;
    if (elapsedMs < MIN_SUBMISSION_GAP_MS) {
      const waitSeconds = Math.ceil((MIN_SUBMISSION_GAP_MS - elapsedMs) / 1000);

      // Record rapid-fire violation
      const vList = violationLog.get(normalizedId) || [];
      vList.push({ reason: "RAPID_FIRE", time: now });
      violationLog.set(normalizedId, vList);

      // If burst of 3 attempts within 15 seconds: trigger AUTO-BLOCK
      const recentBursts = vList.filter(v => v.reason === "RAPID_FIRE" && (now - v.time < BURST_WINDOW_MS));
      if (recentBursts.length >= MAX_BURST_PROMPTS) {
        await autoBlockTeam(
          normalizedId,
          "Rapid-fire prompt flood attack detected",
          `${recentBursts.length} rapid requests within ${BURST_WINDOW_MS / 1000}s (automated bot behavior)`
        );
        return {
          blocked: true,
          reason: "Automated rapid-fire prompt flood detected. Account suspended."
        };
      }

      return {
        throttled: true,
        waitSeconds,
        message: `Please wait ${waitSeconds} second(s) before submitting your next prompt.`
      };
    }
  }

  // Check 60-second window volume limit (max 4 per minute)
  if (timestamps.length >= MAX_MINUTE_PROMPTS) {
    await autoBlockTeam(
      normalizedId,
      "Excessive submission rate (rate flood)",
      `Sent ${timestamps.length + 1} prompts in less than 60 seconds`
    );
    return {
      blocked: true,
      reason: "Automated submission rate exceeded allowable limit."
    };
  }

  // 5. Consecutive Duplicate Prompt Spamming
  const hash = hashText(text);
  let hashHistory = recentPromptHashes.get(normalizedId) || [];
  hashHistory = hashHistory.filter(h => now - h.time < DUPLICATE_WINDOW_MS);

  const duplicateMatches = hashHistory.filter(h => h.hash === hash);
  if (duplicateMatches.length >= MAX_CONSECUTIVE_DUPLICATES) {
    await autoBlockTeam(
      normalizedId,
      "Repeated duplicate prompt blast",
      `Submitted the exact same prompt ${duplicateMatches.length + 1} times in 2 minutes`
    );
    return {
      blocked: true,
      reason: "Repeated duplicate prompt blast detected."
    };
  }

  // Record valid submission
  timestamps.push(now);
  recentSubmissions.set(normalizedId, timestamps);

  hashHistory.push({ hash, time: now });
  recentPromptHashes.set(normalizedId, hashHistory);

  return { allowed: true };
}

/**
 * Validate deliverable URLs for exploit payloads or flooding
 */
async function checkDeliverableSubmission(teamId, url, type = "github") {
  const normalizedId = String(teamId || "").trim().toUpperCase();
  if (!normalizedId) return { allowed: false, message: "Missing team ID" };

  if (isTeamBlocked(normalizedId)) {
    const info = getTeamBlockInfo(normalizedId);
    return {
      blocked: true,
      reason: info?.blockReason || "Account suspended due to security violations."
    };
  }

  const cleanUrl = String(url || "").trim();

  // Check for script/malicious payloads
  for (const pattern of EXPLOIT_PATTERNS) {
    if (pattern.test(cleanUrl)) {
      await autoBlockTeam(
        normalizedId,
        `Malicious payload in ${type} URL`,
        `URL matched exploit pattern: ${pattern.toString().slice(0, 40)}`
      );
      return {
        blocked: true,
        reason: `Malicious payload detected in submitted ${type} URL.`
      };
    }
  }

  // Check update frequency (max 10 URL updates per minute)
  const now = Date.now();
  let deliverableTimestamps = recentDeliverables.get(normalizedId) || [];
  deliverableTimestamps = deliverableTimestamps.filter(t => now - t < MINUTE_WINDOW_MS);

  if (deliverableTimestamps.length >= 10) {
    await autoBlockTeam(
      normalizedId,
      "Excessive deliverable URL updates (flood)",
      `Updated deliverables ${deliverableTimestamps.length + 1} times in 60 seconds`
    );
    return {
      blocked: true,
      reason: "Excessive deliverable URL update rate detected."
    };
  }

  deliverableTimestamps.push(now);
  recentDeliverables.set(normalizedId, deliverableTimestamps);

  return { allowed: true };
}

/**
 * Pre-load blocked teams from Firebase RTDB on startup
 */
async function syncBlockedTeamsFromDb() {
  try {
    const snap = await db.ref("teams").once("value");
    const allTeams = snap.val() || {};
    let count = 0;

    for (const [key, t] of Object.entries(allTeams)) {
      if (t && t.blocked === true) {
        const id = String(t.teamId || t.id || t.vccId || key).trim().toUpperCase();
        blockedTeams.set(id, {
          blocked: true,
          blockedAt: t.blockedAt || new Date().toISOString(),
          blockReason: t.blockReason || "Administrative suspension",
          blockDetails: t.blockDetails || ""
        });
        count++;
      }
    }

    console.log(`🛡️ [THREAT DETECTOR] Synchronized ${count} blocked team(s) from database.`);
  } catch (err) {
    console.warn("⚠️ [THREAT DETECTOR] Could not pre-load blocked teams from DB:", err.message);
  }
}

// Auto-sync on startup
syncBlockedTeamsFromDb();

module.exports = {
  isTeamBlocked,
  getTeamBlockInfo,
  checkPromptSubmission,
  checkDeliverableSubmission,
  autoBlockTeam,
  unblockTeam,
  syncBlockedTeamsFromDb
};
