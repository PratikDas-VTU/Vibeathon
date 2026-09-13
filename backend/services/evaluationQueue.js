const axios = require("axios");
const { db } = require("../firebaseConfig");
const { getPromptsByTeamId } = require("./firebaseService");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const EVALUATION_CONCURRENCY = Math.max(1, parseInt(process.env.EVALUATION_CONCURRENCY, 10) || 2);
const GEMINI_PROVIDER_A_RPM = Math.max(1, parseInt(process.env.GEMINI_PROVIDER_A_RPM || process.env.GEMINI_MAX_RPM, 10) || 13);
const GEMINI_PROVIDER_B_RPM = Math.max(1, parseInt(process.env.GEMINI_PROVIDER_B_RPM || process.env.GEMINI_MAX_RPM, 10) || 13);
const RECOVERY_THRESHOLD_MS = parseInt(process.env.RECOVERY_THRESHOLD_MS, 10) || (3 * 60 * 1000);

// Initialize Two Independent Gemini Providers
function initProviders() {
  const keysFromList = (process.env.GEMINI_API_KEYS || "").split(",").map(k => k.trim()).filter(Boolean);
  const keyA = process.env.GEMINI_API_KEY_A || keysFromList[0] || process.env.GEMINI_API_KEY || "";
  const keyB = process.env.GEMINI_API_KEY_B || keysFromList[1] || "";

  const list = [];
  if (keyA) {
    list.push({
      id: "A",
      projectHint: "vibeathon-508309",
      key: keyA,
      maxRpm: GEMINI_PROVIDER_A_RPM,
      cooldownUntil: 0,
      requestTimestamps: [],
      lastDispatchTime: 0,
      metrics: { calls: 0, successes: 0, rateLimits: 0, errors: 0, retries: 0 }
    });
  }
  if (keyB && keyB !== keyA) {
    list.push({
      id: "B",
      projectHint: "gen-lang-client-0657987677",
      key: keyB,
      maxRpm: GEMINI_PROVIDER_B_RPM,
      cooldownUntil: 0,
      requestTimestamps: [],
      lastDispatchTime: 0,
      metrics: { calls: 0, successes: 0, rateLimits: 0, errors: 0, retries: 0 }
    });
  }
  return list;
}

const providers = initProviders();
console.log(`🤖 [EvaluationQueue] Configured ${providers.length} Gemini provider(s) (Model: ${GEMINI_MODEL}, Workers: ${EVALUATION_CONCURRENCY}).`);
providers.forEach(p => {
  console.log(`   Provider ${p.id} (${p.projectHint}): Cap ${p.maxRpm} RPM`);
});

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
 * Acquire rate limit clearance for a specific Gemini provider
 * Strictly enforces:
 * 1. Rolling 60-second sliding window count < provider.maxRpm (e.g. max 13 req / 60s)
 * 2. Strict minimum dispatch spacing: Math.ceil(60000 / maxRpm) ms (e.g. 4,616 ms for 13 RPM)
 * 3. Serialized slot acquisition across all concurrent workers sharing this provider
 */
async function acquireProviderRateLimit(provider) {
  // Ensure sequential slot acquisition across concurrent workers
  if (!provider.limiterChain) {
    provider.limiterChain = Promise.resolve();
  }

  let releaseSlot;
  const slotTurn = new Promise(resolve => { releaseSlot = resolve; });
  const previousTurn = provider.limiterChain;
  provider.limiterChain = slotTurn;

  await previousTurn;

  try {
    while (true) {
      const now = Date.now();
      const windowMs = 60000;

      // 1. Prune timestamps older than 60 seconds
      provider.requestTimestamps = provider.requestTimestamps.filter(t => now - t < windowMs);

      // 2. Rolling 60-second window check
      if (provider.requestTimestamps.length >= provider.maxRpm) {
        const oldest = provider.requestTimestamps[0];
        const waitMs = Math.max(50, (oldest + windowMs) - now + 50);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // 3. Strict inter-dispatch spacing: exactly ceil(60000 / maxRpm)
      // At 13 RPM: ceil(60000 / 13) = 4616 ms
      const minSpacing = Math.ceil(windowMs / provider.maxRpm);
      const elapsedSinceLast = now - (provider.lastDispatchTime || 0);
      if (provider.lastDispatchTime > 0 && elapsedSinceLast < minSpacing) {
        const waitMs = minSpacing - elapsedSinceLast;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // Acquired slot
      const dispatchTime = Date.now();
      provider.requestTimestamps.push(dispatchTime);
      provider.lastDispatchTime = dispatchTime;
      break;
    }
  } finally {
    releaseSlot();
  }
}

// Track last provider index for round-robin distribution
let lastProviderIdx = -1;

/**
 * Select an eligible, healthy Gemini provider
 */
function selectEligibleProvider(preferredId = null) {
  const now = Date.now();
  if (providers.length === 0) return null;

  if (preferredId) {
    const p = providers.find(prov => prov.id === preferredId);
    if (p && now >= p.cooldownUntil) return p;
    return null;
  }

  const eligible = providers.filter(p => now >= p.cooldownUntil);
  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  lastProviderIdx = (lastProviderIdx + 1) % providers.length;
  const candidate = providers[lastProviderIdx];
  if (eligible.includes(candidate)) {
    return candidate;
  }
  return eligible[0];
}

/**
 * Call Gemini API directly using a single generateContent request
 */
async function callGeminiDirect(provider, fullPrompt) {
  await acquireProviderRateLimit(provider);
  provider.metrics.calls++;

  const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${provider.key}`;
  const response = await axios.post(
    generateUrl,
    {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 9000
    }
  );

  const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  provider.metrics.successes++;
  return text;
}

/**
 * Robust evaluation execution across providers with controlled retry and safe fallback
 */
async function evaluateWithGeminiProviders(evaluationPrompt, promptText, aiTool, problemContext) {
  if (providers.length === 0) {
    console.warn("⚠️ No Gemini providers configured. Executing rubric heuristic fallback.");
    return {
      evaluation: heuristicEvaluate(promptText, aiTool, problemContext),
      providerId: "HEURISTIC_FALLBACK",
      latency: 0
    };
  }

  let attempts = 0;
  const maxAttempts = providers.length > 1 ? 2 : 2;
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts++;
    let provider = selectEligibleProvider();

    // If all providers are in cooldown, pause until the earliest cooldown expires
    if (!provider) {
      const earliestCooldown = Math.min(...providers.map(p => p.cooldownUntil));
      const waitMs = Math.max(500, earliestCooldown - Date.now() + 100);
      console.warn(`⏳ [Queue] All providers in cooldown. Waiting ${Math.round(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, waitMs));
      provider = selectEligibleProvider();
      if (!provider) {
        break;
      }
    }

    const startTime = Date.now();
    try {
      const rawText = await callGeminiDirect(provider, evaluationPrompt);
      const latency = Date.now() - startTime;
      const clean = rawText.replace(/\`\`\`json|\`\`\`/gi, "").trim();
      const parsed = JSON.parse(clean);

      return {
        evaluation: parsed,
        providerId: provider.id,
        latency
      };
    } catch (err) {
      lastError = err;
      const latency = Date.now() - startTime;
      provider.metrics.errors++;
      const status = err.response?.status;

      if (status === 429) {
        provider.metrics.rateLimits++;
        let cooldownMs = 15000;
        const retryInfo = err.response?.data?.error?.details?.find(d => d["@type"]?.includes("RetryInfo"));
        if (retryInfo?.retryDelay) {
          const parsedDelay = parseFloat(retryInfo.retryDelay);
          if (!isNaN(parsedDelay)) cooldownMs = Math.ceil(parsedDelay * 1000) + 1000;
        }
        provider.cooldownUntil = Date.now() + cooldownMs;
        console.warn(`⏳ [Provider ${provider.id}] Rate limited (429). Cooldown: ${Math.round(cooldownMs / 1000)}s.`);
      } else {
        console.warn(`⚠️ [Provider ${provider.id}] Error (${status || err.code || err.message}) after ${latency}ms.`);
        provider.cooldownUntil = Date.now() + 5000;
      }

      if (attempts < maxAttempts) {
        provider.metrics.retries++;
        const jitter = Math.floor(Math.random() * 800) + 400;
        await new Promise(r => setTimeout(r, jitter));
      }
    }
  }

  // All provider attempts failed: Last-resort heuristic fallback
  console.warn(`⚡ [Queue] Gemini providers exhausted (${lastError?.message || "unavailable"}). Using heuristic fallback.`);
  return {
    evaluation: heuristicEvaluate(promptText, aiTool, problemContext),
    providerId: "HEURISTIC_FALLBACK",
    latency: 0
  };
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
 * Optimized: Queries only the specific team's prompts, eliminating full-table scans
 */
async function updateTeamCumulativeScore(teamId) {
  try {
    let teamPrompts = await getPromptsByTeamId(teamId);
    if (!teamPrompts || teamPrompts.length === 0) {
      const snap = await db.ref("prompts").orderByChild("teamId").equalTo(teamId).once("value");
      const val = snap.val();
      if (val) {
        teamPrompts = Object.entries(val).map(([id, p]) => ({ ...p, id, _id: id }));
      }
    }

    const evaluatedScores = [];
    let bestScore = 0;
    let latestLevel = "Evaluating";
    let latestReasoning = "";
    let isAnyEvaluating = false;

    (teamPrompts || []).forEach(p => {
      if (p.evaluationStatus === "evaluating" || p.evaluationStatus === "queued" || (!p.evaluation && p.evaluationStatus !== "failed")) {
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
      promptCount: (teamPrompts || []).length,
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
        promptCount: (teamPrompts || []).length,
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
const inProgressJobs = new Set();
let activeWorkers = 0;

/**
 * Execute an individual evaluation task independently
 */
async function executeEvaluationTask(task) {
  const { promptId, teamId, vccId, promptText, aiTool, enqueuedAt } = task;
  const targetTeamId = teamId || vccId;
  const queueWaitMs = Date.now() - (enqueuedAt || Date.now());

  inProgressJobs.add(promptId);
  await db.ref(`prompts/${promptId}`).update({ evaluationStatus: "evaluating" }).catch(() => {});

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

    const { evaluation, providerId, latency } = await evaluateWithGeminiProviders(
      evaluationPrompt,
      promptText,
      aiTool,
      problemStatementContext
    );

    if (typeof evaluation.score === "number") {
      if (evaluation.score > 50) {
        evaluation.score = Math.round(evaluation.score / 2);
      }
      evaluation.score = Math.max(0, Math.min(50, Math.round(evaluation.score)));
    } else {
      evaluation.score = 25;
    }

    evaluation.evaluatedAt = new Date().toISOString();
    evaluation.evaluatorProvider = providerId;

    // 1. Save evaluation directly into prompt record
    await db.ref(`prompts/${promptId}`).update({
      evaluation,
      evaluationStatus: "evaluated"
    });

    const totalLatency = Date.now() - (enqueuedAt || Date.now());
    console.log(`✅ [Provider ${providerId}] Prompt ${promptId} evaluated: Score ${evaluation.score}/50 (${evaluation.level}) in ${latency}ms (Queue wait: ${queueWaitMs}ms, Total: ${totalLatency}ms)`);

    // 2. Recalculate team's cumulative score
    await updateTeamCumulativeScore(targetTeamId);

  } catch (err) {
    console.error(`❌ [Queue] Failed evaluating prompt ${promptId}:`, err.message);

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
  } finally {
    inProgressJobs.delete(promptId);
  }
}

/**
 * Worker execution loop
 */
async function workerLoop() {
  while (evaluationQueue.length > 0) {
    const task = evaluationQueue.shift();
    if (!task) break;
    await executeEvaluationTask(task);
  }
}

/**
 * Bounded concurrency worker pool manager
 */
function startWorkerPool() {
  while (activeWorkers < EVALUATION_CONCURRENCY && evaluationQueue.length > 0) {
    activeWorkers++;
    workerLoop().finally(() => {
      activeWorkers--;
      if (evaluationQueue.length > 0 && activeWorkers < EVALUATION_CONCURRENCY) {
        startWorkerPool();
      }
    });
  }
}

/**
 * Enqueue a newly submitted prompt for background evaluation
 * Protected with idempotency checks against duplicate enqueues
 */
function enqueuePromptEvaluation(promptId, teamId, promptText, aiTool) {
  if (!promptId || !promptText) return;
  const targetId = teamId;

  // Idempotency: skip if already being evaluated or in queue
  if (inProgressJobs.has(promptId) || evaluationQueue.some(t => t.promptId === promptId)) {
    console.log(`ℹ️ [Queue] Prompt ${promptId} already queued or evaluating. Skipping duplicate.`);
    return;
  }

  db.ref(`teams/${targetId}/aiEvaluating`).set(true).catch(() => {});
  db.ref(`prompts/${promptId}/evaluationStatus`).set("queued").catch(() => {});

  evaluationQueue.push({
    promptId,
    teamId: targetId,
    vccId: targetId,
    promptText,
    aiTool,
    enqueuedAt: Date.now()
  });

  console.log(`📥 [Queue] Prompt ${promptId} enqueued for team ${targetId}. Queue depth: ${evaluationQueue.length}`);
  startWorkerPool();
}

/**
 * Auto-Recovery Engine:
 * Scans Firebase RTDB to find any genuinely stuck prompts (e.g. from server restarts)
 * Skips fresh, queued, or currently in-progress prompts
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
    const now = Date.now();

    for (const [promptId, p] of Object.entries(allPrompts)) {
      // 1. Skip if already evaluated or explicitly failed
      if (p.evaluation || p.evaluationStatus === "failed") continue;

      // 2. Skip if currently in memory queue or in progress
      if (inProgressJobs.has(promptId) || evaluationQueue.some(t => t.promptId === promptId)) continue;

      // 3. Skip if fresh (< 3 minutes old) to prevent hijacking queued prompts
      const submittedTime = p.submittedAt ? new Date(p.submittedAt).getTime() : 0;
      if (submittedTime > 0 && (now - submittedTime) < RECOVERY_THRESHOLD_MS) {
        continue;
      }

      const teamId = p.teamId || p.vccId || p.id;
      if (!teamId) continue;

      console.log(`🛠️ [Auto-Recovery] Found genuinely stuck prompt ${promptId} (age: ${Math.round((now - submittedTime) / 1000)}s) for team ${teamId}. Resolving...`);
      const evalResult = heuristicEvaluate(p.promptText, p.aiTool, problemContext);

      await db.ref(`prompts/${promptId}`).update({
        evaluation: evalResult,
        evaluationStatus: "evaluated"
      });

      affectedTeams.add(teamId);
    }

    for (const teamId of affectedTeams) {
      await updateTeamCumulativeScore(teamId);
      console.log(`✅ [Auto-Recovery] Resolved evaluation for team ${teamId}`);
    }

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
 * Initialize evaluation worker and periodic recovery loop
 */
let workerStarted = false;
function initEvaluationWorker() {
  if (workerStarted) return;
  workerStarted = true;

  setTimeout(() => {
    recoverPendingEvaluations().catch(e => console.error("Initial recovery error:", e));
  }, 5000);

  setInterval(() => {
    recoverPendingEvaluations().catch(e => console.error("Periodic recovery error:", e));
  }, 60000);

  console.log("🚀 [EvaluationWorker] Background AI evaluation and auto-recovery service active.");
}

// Auto-start worker on module load
initEvaluationWorker();

module.exports = {
  enqueuePromptEvaluation,
  getProblemStatementContext,
  updateTeamCumulativeScore,
  recoverPendingEvaluations,
  initEvaluationWorker,
  heuristicEvaluate,
  calculateCumulativeScore,
  evaluateWithGeminiProviders
};
