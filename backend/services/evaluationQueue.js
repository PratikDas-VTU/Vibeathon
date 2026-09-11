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
 * Compute Trimmed Mean (Top 80% Average)
 * Prevents penalizing participants for quick syntax/debug queries.
 */
function calculateCumulativeScore(scores) {
  if (!scores || scores.length === 0) return null;
  if (scores.length <= 2) {
    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round(sum / scores.length);
  }

  // Sort ascending
  const sorted = [...scores].sort((a, b) => a - b);

  // Drop bottom 20% (keep top 80%)
  const dropCount = Math.floor(sorted.length * 0.2);
  const considered = sorted.slice(dropCount);

  const sum = considered.reduce((a, b) => a + b, 0);
  return Math.round((sum / considered.length) * 10) / 10;
}

/**
 * Recalculate and persist cumulative team AI score
 */
async function updateTeamCumulativeScore(vccId) {
  try {
    const snap = await db.ref("prompts").orderByChild("vccId").equalTo(vccId).once("value");
    const promptsObj = snap.val() || {};

    const evaluatedScores = [];
    let bestScore = 0;
    let latestLevel = "Evaluating";
    let latestReasoning = "";

    Object.values(promptsObj).forEach(p => {
      if (p.evaluation && typeof p.evaluation.score === "number") {
        evaluatedScores.push(p.evaluation.score);
        if (p.evaluation.score > bestScore) bestScore = p.evaluation.score;
        latestLevel = p.evaluation.level || latestLevel;
        latestReasoning = p.evaluation.reasoning || latestReasoning;
      }
    });

    const cumulativeScore = calculateCumulativeScore(evaluatedScores);

    if (cumulativeScore !== null) {
      // 1. Update /teams/{vccId}/aiScore
      await db.ref(`teams/${vccId}`).update({
        aiScore: cumulativeScore,
        aiEvaluatedCount: evaluatedScores.length
      });

      // 2. Update /promptEvaluations/{vccId} for admin compatibility
      await db.ref(`promptEvaluations/${vccId}`).set({
        score: cumulativeScore,
        bestScore,
        level: latestLevel,
        reasoning: latestReasoning,
        evaluatedAt: new Date().toISOString(),
        promptCount: Object.keys(promptsObj).length,
        evaluatedCount: evaluatedScores.length
      });

      console.log(`📊 [Team ${vccId}] Updated cumulative AI score: ${cumulativeScore} (from ${evaluatedScores.length} evaluated prompts)`);
    }
  } catch (err) {
    console.error(`Failed to update cumulative score for ${vccId}:`, err.message);
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
    const { promptId, vccId, promptText, aiTool, retryCount = 0 } = task;

    console.log(`🤖 [Queue] Evaluating prompt ${promptId} for team ${vccId} (AI: ${aiTool})...`);

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

Evaluate based on:
1. Understanding of requirements, roles, and constraints
2. Prompt clarity, precision, and depth
3. Prompt engineering technique (role prompting, chain-of-thought, constraints specification)

Respond STRICTLY in valid JSON without code blocks or markdown:
{
  "score": <integer from 0 to 100>,
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
        evaluation.score = Math.max(0, Math.min(100, Math.round(evaluation.score)));
      } else {
        evaluation.score = 50;
      }

      evaluation.evaluatedAt = new Date().toISOString();

      // 1. Save evaluation directly into the prompt record
      await db.ref(`prompts/${promptId}/evaluation`).set(evaluation);

      console.log(`✅ [Queue] Prompt ${promptId} evaluated: Score ${evaluation.score}/100 (${evaluation.level})`);

      // 2. Recalculate team's cumulative score
      await updateTeamCumulativeScore(vccId);

    } catch (err) {
      console.error(`❌ [Queue] Failed evaluating prompt ${promptId}:`, err.message);

      // Retry up to 2 times with backoff if rate limited
      if (retryCount < 2) {
        console.log(`🔄 Re-queueing prompt ${promptId} for retry #${retryCount + 1}...`);
        await new Promise(r => setTimeout(r, 2000));
        evaluationQueue.push({ promptId, vccId, promptText, aiTool, retryCount: retryCount + 1 });
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
function enqueuePromptEvaluation(promptId, vccId, promptText, aiTool) {
  if (!promptId || !promptText) return;
  evaluationQueue.push({ promptId, vccId, promptText, aiTool, retryCount: 0 });
  processQueue().catch(err => console.error("Queue worker error:", err));
}

module.exports = {
  enqueuePromptEvaluation,
  getProblemStatementContext,
  updateTeamCumulativeScore
};
