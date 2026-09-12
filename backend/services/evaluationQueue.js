const axios = require("axios");
const { db } = require("../firebaseConfig");

// Collect all configured Gemini API keys (supports comma-separated list or singular key)
const geminiKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

if (geminiKeys.length === 0) {
  console.warn("⚠️ Warning: No Gemini API keys found in GEMINI_API_KEYS or GEMINI_API_KEY.");
} else {
  console.log(`🔑 Loaded ${geminiKeys.length} Gemini API key(s) with automatic failover.`);
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Default problem statement fallback if none uploaded by admin
const DEFAULT_PROBLEM_STATEMENT = `
"Design a web-based Institutional Event Resource Management System involving:
- Multiple user roles (Event Coordinator, HOD, Dean, Institutional Head, Admin/ITC)
- Multi-level approval workflows
- Dynamic venue and resource availability
- Mid-event additional requests
- Rejection handling with explanations
- Continuous state updates without violating constraints"
`;

/**
 * Fetch dynamic problem statement text from RTDB
 */
async function getProblemStatementContext() {
  try {
    const snap = await db.ref("settings/problemStatement").once("value");
    const val = snap.val();
    if (val && val.text && val.text.trim().length > 10) {
      return val.text.trim();
    }
  } catch (err) {
    console.warn("Could not read settings/problemStatement, using fallback:", err.message);
  }
  return DEFAULT_PROBLEM_STATEMENT;
}

/**
 * Advanced Rubric Evaluator (Heuristic Fallback Engine)
 * Runs instantly when Gemini API quota is exceeded (HTTP 429) or network times out.
 * Evaluates strictly across the 5 official rubric dimensions (max 10 pts each, total 50 pts).
 */
function heuristicEvaluate(promptText, aiTool, problemContext) {
  const text = (promptText || "").trim();
  const lower = text.toLowerCase();

  // 1. Detect placeholder / dummy test submissions
  if (
    text.length < 25 ||
    /^(test|testing|hello|hi|hey|check|asdf|qwerty|foo|bar|dummy|ping)/i.test(lower) ||
    lower === "testing the prompt submition"
  ) {
    return {
      score: 0,
      level: "Needs Improvement",
      reasoning: "The prompt appears to be a placeholder or quick connectivity test. It lacks substantive domain requirements, user roles, and architectural specifications.",
      strengths: ["Submitted without syntax errors"],
      weaknesses: [
        "Lacks domain requirements and problem context",
        "Missing prompt engineering structure and technical constraints"
      ],
      evaluatedAt: new Date().toISOString()
    };
  }

  // Dimension 1: Problem Understanding & Requirements (0 - 10)
  let c1 = 4;
  const domainKeywords = [
    "role", "coordinator", "hod", "dean", "admin", "approval", "workflow",
    "venue", "resource", "allocation", "booking", "rejection", "event",
    "conflict", "capacity", "equipment", "status", "audit"
  ];
  let domainMatches = 0;
  domainKeywords.forEach(kw => {
    if (lower.includes(kw)) domainMatches++;
  });
  if (domainMatches >= 8) c1 = 10;
  else if (domainMatches >= 5) c1 = 8;
  else if (domainMatches >= 3) c1 = 6;
  else c1 = 4;

  // Dimension 2: Clarity, Precision, Depth & Technical Detail (0 - 10)
  let c2 = 4;
  const techKeywords = [
    "schema", "database", "postgres", "sql", "api", "rest", "endpoint",
    "jwt", "auth", "validation", "constraint", "react", "node", "state",
    "architecture", "model", "transaction", "error", "security"
  ];
  let techMatches = 0;
  techKeywords.forEach(kw => {
    if (lower.includes(kw)) techMatches++;
  });
  if (text.length > 600 && techMatches >= 4) c2 = 10;
  else if (text.length > 300 && techMatches >= 2) c2 = 8;
  else if (text.length > 150) c2 = 6;
  else c2 = 4;

  // Dimension 3: Prompt Engineering Technique (0 - 10)
  let c3 = 3;
  const hasPersona = /(act as|you are|senior|architect|engineer|expert|assume the role)/i.test(lower);
  const hasFormatting = /(json|table|markdown|step-by-step|format as|bullet|structure)/i.test(lower);
  const hasNegativeConstraints = /(do not|avoid|ensure|must|strictly|never|prohibit)/i.test(lower);
  const hasChainOfThought = /(first|second|then|step 1|verify|think through)/i.test(lower);

  let peBonus = 0;
  if (hasPersona) peBonus += 2;
  if (hasFormatting) peBonus += 2;
  if (hasNegativeConstraints) peBonus += 2;
  if (hasChainOfThought) peBonus += 1;
  c3 = Math.min(10, Math.max(3, 4 + peBonus));

  // Dimension 4: Strategic & Intentional AI Usage (0 - 10)
  let c4 = 5;
  const isLazyDump = /(write code for everything|give full project|do it all)/i.test(lower);
  const isArchitectural = /(design|architecture|trade-off|workflow|engine|boundaries|audit trail|lifecycle)/i.test(lower);
  if (isArchitectural) c4 = 9;
  else if (!isLazyDump && text.length > 250) c4 = 8;
  else if (isLazyDump) c4 = 4;
  else c4 = 6;

  // Dimension 5: Contextual Alignment with Problem Statement (0 - 10)
  let c5 = 5;
  if (domainMatches >= 6) c5 = 9;
  else if (domainMatches >= 3) c5 = 7;
  else c5 = 5;

  const totalScore = Math.min(50, Math.max(0, c1 + c2 + c3 + c4 + c5));

  let level = "Basic";
  if (totalScore >= 42) level = "Excellent";
  else if (totalScore >= 32) level = "Good";
  else if (totalScore >= 20) level = "Basic";
  else level = "Needs Improvement";

  const strengths = [];
  const weaknesses = [];

  if (c1 >= 8) strengths.push("Strong grasp of event domain requirements and role workflows");
  else weaknesses.push("Could expand role-specific rules and approval hierarchies");

  if (c2 >= 8) strengths.push("High technical precision with clear system constraints");
  else weaknesses.push("Would benefit from explicit database schema contracts and API specifications");

  if (hasPersona) strengths.push("Effective persona framing for targeted architectural guidance");
  else weaknesses.push("Add role framing (e.g. 'Act as a Senior System Architect') for higher precision");

  if (hasNegativeConstraints) strengths.push("Explicit negative constraints to prevent hallucinated assumptions");

  if (strengths.length === 0) strengths.push("Clear, intelligible instructions communicated to the model");
  if (weaknesses.length === 0) weaknesses.push("Consider requesting few-shot examples for edge cases");

  const reasoning = `The prompt scored ${totalScore}/50 (${level}) based on domain requirement coverage and structural technical depth. It demonstrates ${level === "Excellent" ? "exceptional" : level === "Good" ? "solid" : "moderate"} alignment with the hackathon scenario and workflow constraints.`;

  return {
    score: totalScore,
    level,
    reasoning,
    strengths,
    weaknesses,
    evaluatedAt: new Date().toISOString()
  };
}

/**
 * Call Gemini API with automatic key rotation and failover across multiple keys
 */
async function callGemini(fullPrompt) {
  const keysToTry = geminiKeys.length > 0 ? [...geminiKeys] : [""];
  let lastError = null;

  for (let i = 0; i < keysToTry.length; i++) {
    const currentKey = keysToTry[i];
    if (!currentKey) continue;

    try {
      // 1. Try Interactions API with 5s timeout
      try {
        const interactionsUrl = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${currentKey}`;
        const response = await axios.post(
          interactionsUrl,
          {
            model: GEMINI_MODEL,
            input: fullPrompt
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 5000
          }
        );

        if (response.data?.outputs && response.data.outputs[0]?.text) {
          return response.data.outputs[0].text;
        }
        if (response.data?.output) {
          return typeof response.data.output === "string" ? response.data.output : JSON.stringify(response.data.output);
        }
      } catch (err) {
        if (err.response?.status === 429) throw err; // propagate quota errors immediately
      }

      // 2. Fallback to generateContent with 5s timeout
      const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${currentKey}`;
      const response = await axios.post(
        generateUrl,
        {
          contents: [
            {
              parts: [{ text: fullPrompt }]
            }
          ]
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 5000
        }
      );

      return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      console.warn(`⚠️ Gemini API call failed on key #${i + 1}${status ? ` (HTTP ${status})` : ""}: ${err.message}`);
      if (i < keysToTry.length - 1) {
        console.log(`🔄 Automatically failing over to next Gemini API key...`);
      }
    }
  }

  throw lastError || new Error("All configured Gemini API keys failed or rate-limited.");
}

/**
 * Compute Cumulative AI Score (0-50 scale)
 * Computes average of evaluated prompts, normalizing legacy 100-pt scores to 50,
 * and filtering out 0-point test prompts if valid prompts exist.
 */
function calculateCumulativeScore(scores) {
  if (!scores || scores.length === 0) return null;

  // Normalize any legacy 100-point scores down to 50
  const normalized = scores.map(s => {
    const num = Number(s) || 0;
    return num > 50 ? Math.round(num / 2) : Math.max(0, Math.min(50, Math.round(num)));
  });

  // If there are multiple prompts and some non-zero scores, drop 0-point test/placeholder queries
  const nonZero = normalized.filter(s => s > 0);
  const pool = nonZero.length > 0 ? nonZero : normalized;

  const sum = pool.reduce((a, b) => a + b, 0);
  const avg = sum / pool.length;

  return Math.min(50, Math.max(0, Math.round(avg * 10) / 10));
}

/**
 * Recalculate and persist cumulative team AI score across all prompts
 */
async function updateTeamCumulativeScore(teamId) {
  try {
    // Read all prompts to reliably find both teamId and vccId records
    const snap = await db.ref("prompts").once("value");
    const allPromptsVal = snap.val() || {};
    const promptsObj = {};

    Object.entries(allPromptsVal).forEach(([pId, pData]) => {
      const pTeamId = pData.teamId || pData.vccId || pData.id;
      if (pTeamId === teamId) {
        promptsObj[pId] = pData;
      }
    });

    const evaluatedScores = [];
    let bestScore = 0;
    let latestLevel = "Evaluating";
    let latestReasoning = "";
    let isAnyEvaluating = false;

    Object.values(promptsObj).forEach(p => {
      if (p.evaluationStatus === "evaluating" || (!p.evaluation && p.evaluationStatus !== "failed")) {
        isAnyEvaluating = true;
      }
      if (p.evaluation && typeof p.evaluation.score === "number") {
        const normalized = p.evaluation.score > 50 ? Math.round(p.evaluation.score / 2) : p.evaluation.score;
        evaluatedScores.push(normalized);
        if (normalized > bestScore) bestScore = normalized;
        latestLevel = p.evaluation.level || latestLevel;
        latestReasoning = p.evaluation.reasoning || latestReasoning;
      }
    });

    const cumulativeScore = calculateCumulativeScore(evaluatedScores);

    // Update /teams/{teamId}
    await db.ref(`teams/${teamId}`).update({
      aiScore: cumulativeScore,
      aiEvaluatedCount: evaluatedScores.length,
      aiEvaluating: isAnyEvaluating
    });

    if (cumulativeScore !== null) {
      // Update /promptEvaluations/{teamId} for admin compatibility
      await db.ref(`promptEvaluations/${teamId}`).set({
        score: cumulativeScore,
        bestScore,
        level: latestLevel,
        reasoning: latestReasoning,
        evaluatedAt: new Date().toISOString(),
        promptCount: Object.keys(promptsObj).length,
        evaluatedCount: evaluatedScores.length
      });

      console.log(`📊 [Team ${teamId}] Updated cumulative AI score: ${cumulativeScore}/50 (evaluating: ${isAnyEvaluating})`);
    }
  } catch (err) {
    console.error(`Failed to update cumulative score for ${teamId}:`, err.message);
  }
}

// In-memory queue state
const evaluationQueue = [];
let isProcessingQueue = false;

/**
 * Process queue sequentially with rate smoothing and instant fallback
 */
async function processQueue() {
  if (isProcessingQueue || evaluationQueue.length === 0) return;
  isProcessingQueue = true;

  while (evaluationQueue.length > 0) {
    const task = evaluationQueue.shift();
    const { promptId, teamId, vccId, promptText, aiTool } = task;
    const targetTeamId = teamId || vccId;

    console.log(`🤖 [Queue] Evaluating prompt ${promptId} for team ${targetTeamId} (AI: ${aiTool})...`);

    try {
      const problemStatementContext = await getProblemStatementContext();

      const evaluationPrompt = `You are an expert AI evaluator for a university hackathon (Vibeathon).
Your task is to evaluate the QUALITY and PROMPT ENGINEERING of the AI prompt used by a participant.

Problem Statement Context:
${problemStatementContext}

Participant Prompt to Evaluate:
AI Tool Used: ${aiTool || "AI Copilot"}
Verbatim Prompt:
${promptText}

Evaluate strictly out of 50 based on these 5 criteria (max 10 points each):
1. Problem Understanding & Requirements (0-10)
2. Clarity, Precision, Depth & Technical Detail (0-10)
3. Prompt Engineering Technique (role, chain-of-thought, constraints specification) (0-10)
4. Strategic Intentional AI Usage (thinking/design assistant vs raw code dump) (0-10)
5. Contextual Alignment with the Event Management Problem Statement (0-10)

Total maximum score is 50 points.
If the prompt is just a greeting, placeholder, or random test like "testing", award 0 points.

Respond STRICTLY in valid JSON without code blocks or markdown:
{
  "score": <integer from 0 to 50>,
  "level": "<Needs Improvement | Basic | Good | Excellent>",
  "reasoning": "<2 concise sentences explaining the score>",
  "strengths": ["point1", "point2"],
  "weaknesses": ["point1", "point2"]
}`;

      let evaluation = null;

      try {
        const rawResponse = await callGemini(evaluationPrompt);
        const clean = rawResponse.replace(/\`\`\`json|\`\`\`/gi, "").trim();
        evaluation = JSON.parse(clean);
      } catch (geminiErr) {
        console.warn(`⚡ [Queue] Gemini unavailable (${geminiErr.message}). Instantly executing advanced rubric evaluator fallback...`);
        evaluation = heuristicEvaluate(promptText, aiTool, problemStatementContext);
      }

      if (typeof evaluation.score === "number") {
        if (evaluation.score > 50) {
          evaluation.score = Math.round(evaluation.score / 2);
        }
        evaluation.score = Math.max(0, Math.min(50, Math.round(evaluation.score)));
      } else {
        evaluation.score = 25;
      }

      evaluation.evaluatedAt = new Date().toISOString();

      // 1. Save evaluation and status directly into the prompt record
      await db.ref(`prompts/${promptId}`).update({
        evaluation,
        evaluationStatus: "evaluated"
      });

      console.log(`✅ [Queue] Prompt ${promptId} evaluated: Score ${evaluation.score}/50 (${evaluation.level})`);

      // 2. Recalculate team's cumulative score & update evaluating flag
      await updateTeamCumulativeScore(targetTeamId);

    } catch (err) {
      console.error(`❌ [Queue] Failed evaluating prompt ${promptId}:`, err.message);

      // Even on unexpected exceptions, run heuristic evaluator so prompt NEVER hangs
      try {
        const problemStatementContext = await getProblemStatementContext();
        const fallbackEval = heuristicEvaluate(promptText, aiTool, problemStatementContext);
        await db.ref(`prompts/${promptId}`).update({
          evaluation: fallbackEval,
          evaluationStatus: "evaluated"
        });
        await updateTeamCumulativeScore(targetTeamId);
      } catch (fallbackErr) {
        console.error("Emergency fallback failed:", fallbackErr);
        await db.ref(`prompts/${promptId}`).update({ evaluationStatus: "failed" });
        await updateTeamCumulativeScore(targetTeamId);
      }
    }

    // Rate smoothing delay between prompts (200ms)
    await new Promise(r => setTimeout(r, 200));
  }

  isProcessingQueue = false;
}

/**
 * Enqueue a newly submitted prompt for background evaluation
 */
function enqueuePromptEvaluation(promptId, teamId, promptText, aiTool) {
  if (!promptId || !promptText) return;
  const targetId = teamId;
  db.ref(`teams/${targetId}/aiEvaluating`).set(true).catch(() => {});
  db.ref(`prompts/${promptId}/evaluationStatus`).set("evaluating").catch(() => {});

  evaluationQueue.push({ promptId, teamId: targetId, vccId: targetId, promptText, aiTool, retryCount: 0 });
  processQueue().catch(err => console.error("Queue worker error:", err));
}

/**
 * Auto-Recovery Engine:
 * Scans Firebase RTDB on startup and periodically to find any prompts that were left
 * unevaluated (e.g. from server restarts, network drops, or previous rate limits)
 * and resolves them within seconds using the rubric heuristic evaluator.
 */
let isRecovering = false;
async function recoverPendingEvaluations() {
  if (isRecovering) return;
  isRecovering = true;

  try {
    const snap = await db.ref("prompts").once("value");
    const allPrompts = snap.val() || {};
    const affectedTeams = new Set();
    const problemContext = await getProblemStatementContext();

    for (const [promptId, p] of Object.entries(allPrompts)) {
      // Check if prompt is missing evaluation and has not explicitly failed
      if (!p.evaluation && p.evaluationStatus !== "failed") {
        const teamId = p.teamId || p.vccId || p.id;
        if (!teamId) continue;

        console.log(`🛠️ [Auto-Recovery] Found pending prompt ${promptId} for team ${teamId}. Evaluating...`);
        const evalResult = heuristicEvaluate(p.promptText, p.aiTool, problemContext);

        await db.ref(`prompts/${promptId}`).update({
          evaluation: evalResult,
          evaluationStatus: "evaluated"
        });

        affectedTeams.add(teamId);
      }
    }

    // Recalculate scores for all teams that had recovered prompts
    for (const teamId of affectedTeams) {
      await updateTeamCumulativeScore(teamId);
      console.log(`✅ [Auto-Recovery] Successfully resolved evaluation for team ${teamId}`);
    }

    // Safety check: clear aiEvaluating flag for teams where all prompts are finished
    const teamsSnap = await db.ref("teams").once("value");
    const allTeams = teamsSnap.val() || {};
    for (const [teamKey, team] of Object.entries(allTeams)) {
      if (team.aiEvaluating) {
        const teamPrompts = Object.values(allPrompts).filter(
          p => (p.teamId || p.vccId || p.id) === (team.teamId || teamKey)
        );
        const hasPending = teamPrompts.some(p => !p.evaluation && p.evaluationStatus !== "failed");
        if (!hasPending) {
          await db.ref(`teams/${teamKey}/aiEvaluating`).set(false);
        }
      }
    }

  } catch (err) {
    console.error("Auto-recovery error:", err.message);
  } finally {
    isRecovering = false;
  }
}

/**
 * Initialize evaluation worker and continuous recovery loop
 */
let workerStarted = false;
function initEvaluationWorker() {
  if (workerStarted) return;
  workerStarted = true;

  // Run initial scan immediately after connection
  setTimeout(() => {
    recoverPendingEvaluations().catch(e => console.error("Initial recovery error:", e));
  }, 2000);

  // Re-check periodically every 45 seconds to catch any orphaned prompts
  setInterval(() => {
    recoverPendingEvaluations().catch(e => console.error("Periodic recovery error:", e));
  }, 45000);

  console.log("🚀 [EvaluationWorker] Background AI evaluation and auto-recovery service started.");
}

// Auto-start worker on module load
initEvaluationWorker();

module.exports = {
  enqueuePromptEvaluation,
  getProblemStatementContext,
  updateTeamCumulativeScore,
  recoverPendingEvaluations,
  initEvaluationWorker
};
