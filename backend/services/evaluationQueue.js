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
 * Call Gemini API with automatic key rotation and failover across multiple keys
 */
async function callGemini(fullPrompt) {
  const keysToTry = geminiKeys.length > 0 ? [...geminiKeys] : [""];
  let lastError = null;

  for (let i = 0; i < keysToTry.length; i++) {
    const currentKey = keysToTry[i];
    try {
      // 1. Try Interactions API
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
            timeout: 20000
          }
        );

        if (response.data?.outputs && response.data.outputs[0]?.text) {
          return response.data.outputs[0].text;
        }
        if (response.data?.output) {
          return typeof response.data.output === "string" ? response.data.output : JSON.stringify(response.data.output);
        }
      } catch (err) {
        // Fallback to generateContent
      }

      // 2. Fallback to generateContent
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
          timeout: 20000
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

  throw lastError || new Error("All configured Gemini API keys failed.");
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
 * Recalculate and persist cumulative team AI score
 */
async function updateTeamCumulativeScore(teamId) {
  try {
    let snap = await db.ref("prompts").orderByChild("teamId").equalTo(teamId).once("value");
    let promptsObj = snap.val();
    if (!promptsObj) {
      snap = await db.ref("prompts").orderByChild("vccId").equalTo(teamId).once("value");
      promptsObj = snap.val() || {};
    }

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
 * Process queue sequentially with rate smoothing
 */
async function processQueue() {
  if (isProcessingQueue || evaluationQueue.length === 0) return;
  isProcessingQueue = true;

  while (evaluationQueue.length > 0) {
    const task = evaluationQueue.shift();
    const { promptId, teamId, vccId, promptText, aiTool, retryCount = 0 } = task;
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

      const rawResponse = await callGemini(evaluationPrompt);

      let evaluation = null;
      try {
        const clean = rawResponse.replace(/\`\`\`json|\`\`\`/gi, "").trim();
        evaluation = JSON.parse(clean);
      } catch (parseErr) {
        const match = rawResponse.match(/\{[\s\S]*\}/);
        if (match) {
          evaluation = JSON.parse(match[0]);
        } else {
          throw new Error("Invalid JSON returned by Gemini");
        }
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

      // 2. Recalculate team's cumulative score & updating evaluating flag
      await updateTeamCumulativeScore(targetTeamId);

    } catch (err) {
      console.error(`❌ [Queue] Failed evaluating prompt ${promptId}:`, err.message);

      // Retry up to 2 times with backoff if rate limited
      if (retryCount < 2) {
        console.log(`🔄 Re-queueing prompt ${promptId} for retry #${retryCount + 1}...`);
        await new Promise(r => setTimeout(r, 2000));
        evaluationQueue.push({ promptId, teamId: targetTeamId, vccId: targetTeamId, promptText, aiTool, retryCount: retryCount + 1 });
      } else {
        // Mark as failed and update team state
        await db.ref(`prompts/${promptId}`).update({ evaluationStatus: "failed" });
        await updateTeamCumulativeScore(targetTeamId);
      }
    }

    // Rate smoothing delay between prompts (800ms)
    await new Promise(r => setTimeout(r, 800));
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

module.exports = {
  enqueuePromptEvaluation,
  getProblemStatementContext,
  updateTeamCumulativeScore
};
