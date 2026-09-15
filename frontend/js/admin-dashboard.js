function enforceAdminAuth() {
  const adminToken = sessionStorage.getItem("adminToken");
  if (!adminToken) {
    localStorage.removeItem("adminToken");
    window.location.replace("admin-login.html");
    return false;
  }
  return true;
}

enforceAdminAuth();

window.addEventListener("pageshow", () => {
  enforceAdminAuth();
});

document.addEventListener("DOMContentLoaded", () => {
  if (!enforceAdminAuth()) return;
  console.log("🔵 Admin Dashboard: Initializing Mission Control...");

  /* ==========================
     ELEMENT REFERENCES
     ========================== */
  const teamTable = document.getElementById("teamTable");
  const teamModal = document.getElementById("teamModal");
  const closeModal = document.getElementById("closeModal");
  const closeModalBottom = document.getElementById("closeModalBottom");

  const modalTeamTitle = document.getElementById("modalTeamTitle");
  const teamInfo = document.getElementById("teamInfo");
  const teamStats = document.getElementById("teamStats");
  const modalPromptCount = document.getElementById("modalPromptCount");
  const promptTable = document.getElementById("promptTable");

  const totalTeamsEl = document.getElementById("totalTeams");
  const activeTeamsEl = document.getElementById("activeTeams");
  const totalSubmissionsEl = document.getElementById("totalSubmissions");
  const totalPromptsEl = document.getElementById("totalPrompts");
  const suspendedTeamsEl = document.getElementById("suspendedTeams");
  const fastestTeamEl = document.getElementById("fastestTeam");

  const searchInput = document.getElementById("searchInput");
  const exportPdfBtn = document.getElementById("exportPdfBtn");
  const exportDetailedBtn = document.getElementById("exportDetailedBtn");
  const evaluateAIBtn = document.getElementById("evaluateAI");

  // Problem Statement Manager elements
  const manageProblemBtn = document.getElementById("manageProblemBtn");
  const problemModal = document.getElementById("problemModal");
  const closeProblemModal = document.getElementById("closeProblemModal");
  const closeProblemModalBottom = document.getElementById("closeProblemModalBottom");
  const chooseFileBtn = document.getElementById("chooseFileBtn");
  const problemFileInput = document.getElementById("problemFileInput");
  const selectedFileName = document.getElementById("selectedFileName");
  const uploadFileBtn = document.getElementById("uploadFileBtn");
  const activeFileNameDisplay = document.getElementById("activeFileNameDisplay");
  const activeFileUpdatedDisplay = document.getElementById("activeFileUpdatedDisplay");
  const problemContextInput = document.getElementById("problemContextInput");
  const saveContextBtn = document.getElementById("saveContextBtn");

  const logoutBtn = document.getElementById("logoutBtn");
  const logoutOverlay = document.getElementById("logoutConfirm");
  const cancelLogout = document.getElementById("cancelLogout");
  const confirmLogout = document.getElementById("confirmLogout");

  /* ==========================
     DATA STATE
     ========================== */
  let teams = [];
  let prompts = [];
  let allPrompts = [];
  let promptStats = {};
  let promptEvaluations = {};
  let currentFilter = "time";
  let searchQuery = "";
  let autoRefreshInterval = null;
  let adminSessionExtraMinutes = 0;

  /* ==========================
     LOGOUT LOGIC
     ========================== */
  if (logoutBtn && logoutOverlay && cancelLogout && confirmLogout) {
    logoutBtn.addEventListener("click", () => {
      logoutOverlay.classList.add("show");
    });

    cancelLogout.addEventListener("click", () => {
      logoutOverlay.classList.remove("show");
    });

    confirmLogout.addEventListener("click", () => {
      sessionStorage.removeItem("adminToken");
      localStorage.removeItem("adminToken");
      localStorage.removeItem("token");
      sessionStorage.clear();
      window.location.replace("admin-login.html");
    });

    logoutOverlay.addEventListener("click", (e) => {
      if (e.target === logoutOverlay) logoutOverlay.classList.remove("show");
    });
  }

  /* ==========================
     SEARCH & FILTER EVENTS
     ========================== */
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderDashboard();
    });
  }

  if (rankFilter) {
    rankFilter.addEventListener("change", (e) => {
      currentFilter = e.target.value;
      renderDashboard();
    });
  }

  /* ==========================
     ADMIN FETCH HELPER
     ========================== */
  async function adminFetch(url, options = {}) {
    const adminToken = sessionStorage.getItem("adminToken");
    if (!adminToken) {
      window.location.replace("admin-login.html");
      throw new Error("No admin token found");
    }

    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "ngrok-skip-browser-warning": "true",
      "Authorization": `Bearer ${adminToken}`,
      ...(options.headers || {})
    };

    const separator = url.includes("?") ? "&" : "?";
    const cacheBustedUrl = `${url}${separator}_t=${Date.now()}`;
    const targetUrl = window.getApiUrl ? window.getApiUrl(cacheBustedUrl) : cacheBustedUrl;
    let res = await fetch(targetUrl, { ...options, cache: "no-store", headers });

    // Cold start mitigation for 502/504 gateway timeout
    if (res.status === 502 || res.status === 504) {
      console.warn("Gateway timeout in admin API (Render cold start). Retrying directly against Render backend...");
      await new Promise(r => setTimeout(r, 3000));
      const cleanUrl = cacheBustedUrl.startsWith("/") ? cacheBustedUrl : `/${cacheBustedUrl}`;
      const directUrl = `https://vibeathon-backend-g210.onrender.com${cleanUrl}`;
      res = await fetch(directUrl, { ...options, cache: "no-store", headers });
    }

    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem("adminToken");
      localStorage.removeItem("adminToken");
      window.location.replace("admin-login.html");
      throw new Error("Unauthorized admin access");
    }

    return res;
  }

  /* ==========================
     DATA HELPERS
     ========================== */
  function getCompletionTime(team) {
    if (!team || !team.sessionEnded) return null;
    const endTimestamp = team.completedAt || team.sessionEndedAt || team.updatedAt;
    if (!team.hackathonStart || !endTimestamp) return null;

    const start = new Date(team.hackathonStart).getTime();
    const end = new Date(endTimestamp).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return null;
    return end - start;
  }

  function formatDuration(ms) {
    if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return null;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");

    if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
    return `${minutes}m ${pad(seconds)}s`;
  }

  function normalizeAIScore(score) {
    if (typeof score !== "number" || isNaN(score)) return null;
    if (score > 50) score = Math.round(score / 2);
    return Math.min(50, Math.max(0, Math.round(score * 10) / 10));
  }

  function computeTeamAIScore(teamId, fallbackScore) {
    // 1. Prioritize live team record in teams array
    if (Array.isArray(teams)) {
      const team = teams.find(t => (t.teamId || t.id || t.vccId) === teamId);
      if (team && typeof team.aiScore === "number") {
        return normalizeAIScore(team.aiScore);
      }
    }
    // 2. Fallback to promptEvaluations map
    const evalData = promptEvaluations[teamId];
    if (evalData && typeof evalData.score === "number") {
      return normalizeAIScore(evalData.score);
    }
    // 3. Fallback to passed fallbackScore
    if (typeof fallbackScore === "number") {
      return normalizeAIScore(fallbackScore);
    }
    return null;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  }

  function formatExternalUrl(url) {
    if (!url) return "#";
    const trimmed = String(url).trim();
    if (!trimmed) return "#";
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return isSafeUrl(withProtocol) ? withProtocol : '#';
  }

  /* ==========================
     FETCH LIVE DATA
     ========================== */
  async function fetchSessionSettings() {
    try {
      const res = await adminFetch("/api/manage/session-config");
      if (res && res.ok) {
        const data = await res.json();
        if (data.session && typeof data.session.extraMinutes === "number") {
          adminSessionExtraMinutes = data.session.extraMinutes;
        }
      }
    } catch (e) {}
  }

  async function fetchTeams() {
    try {
      await fetchSessionSettings();
      const res = await adminFetch("/api/admin/teams");
      if (!res.ok) throw new Error("HTTP " + res.status);
      teams = await res.json();
      renderDashboard();
    } catch (err) {
      console.error("Failed to fetch teams:", err);
    }
  }

  async function fetchPrompts() {
    try {
      const res = await adminFetch("/api/admin/prompts");
      if (!res.ok) return [];

      prompts = await res.json();
      allPrompts = prompts;

      promptStats = {};
      prompts.forEach(p => {
        const tId = p.teamId || p.vccId;
        if (!tId) return;
        if (!promptStats[tId]) {
          promptStats[tId] = {
            promptCount: 0,
            uniqueAITools: new Set()
          };
        }
        promptStats[tId].promptCount += 1;
        if (p.aiTool) promptStats[tId].uniqueAITools.add(p.aiTool);
      });

      Object.keys(promptStats).forEach(teamId => {
        promptStats[teamId].uniqueAITools = promptStats[teamId].uniqueAITools.size;
      });

      return prompts;
    } catch (err) {
      console.error("Fetch prompts error:", err);
      return [];
    }
  }

  async function fetchEvaluations() {
    try {
      const res = await adminFetch("/api/admin/prompt-evaluations");
      if (res.ok) {
        promptEvaluations = await res.json() || {};
      }
    } catch (err) {
      console.error("Fetch evaluations error:", err);
      promptEvaluations = {};
    }
  }

  /* ==========================
     RENDER DASHBOARD
     ========================== */
  function renderDashboard() {
    // 1. Compute Stats
    const totalTeamsCount = teams.length;
    const activeCount = teams.filter(t => t.hackathonStart && !t.sessionEnded && !t.blocked).length;
    const submissionCount = teams.filter(t => t.githubUrl || t.deploymentUrl || t.sessionEnded).length;
    const totalPromptsCount = allPrompts.length;
    const suspendedCount = teams.filter(t => t.blocked === true).length;

    if (totalTeamsEl) totalTeamsEl.textContent = totalTeamsCount;
    if (activeTeamsEl) activeTeamsEl.textContent = activeCount;
    if (totalSubmissionsEl) totalSubmissionsEl.textContent = submissionCount;
    if (totalPromptsEl) totalPromptsEl.textContent = totalPromptsCount;
    if (suspendedTeamsEl) suspendedTeamsEl.textContent = suspendedCount;

    // 2. Prepare teams with computed metrics
    let enrichedTeams = teams.map(team => {
      const tId = team.teamId || team.id || team.vccId;
      const stats = promptStats[tId] || { promptCount: 0, uniqueAITools: 0 };
      const compTime = getCompletionTime(team);
      const evalScore = computeTeamAIScore(tId, team.aiScore);
      const aiScore = typeof evalScore === "number" ? evalScore : (typeof team.aiScore === "number" ? team.aiScore : null);
      const isEvaluating = Boolean(team.aiEvaluating) || (stats.promptCount > 0 && allPrompts.some(p => (p.teamId || p.vccId) === tId && (p.evaluationStatus === "evaluating" || (!p.evaluation && p.evaluationStatus !== "failed"))));

      const startMs = team.hackathonStart ? new Date(team.hackathonStart).getTime() : null;
      const isStarted = Boolean(startMs && !isNaN(startMs));
      const isEnded = Boolean(team.sessionEnded);
      const totalDurationMs = (150 + adminSessionExtraMinutes) * 60 * 1000;
      const isTimedOut = Boolean(isStarted && !team.blocked && !isEnded && (Date.now() - startMs >= totalDurationMs));
      const isReadingPhase = Boolean(isStarted && !team.blocked && !isEnded && (Date.now() - startMs < 30 * 60 * 1000));

      return {
        ...team,
        teamId: tId,
        promptCount: stats.promptCount,
        uniqueAITools: stats.uniqueAITools,
        completionTime: compTime,
        aiScore: aiScore,
        aiEvaluating: isEvaluating,
        isTimedOut: isTimedOut,
        isReadingPhase: isReadingPhase
      };
    });

    // 3. Search Filter
    if (searchQuery) {
      enrichedTeams = enrichedTeams.filter(t => {
        const teamId = (t.teamId || t.id || t.vccId || "").toLowerCase();
        const leader = (t.leaderName || "").toLowerCase();
        const college = (t.college || t.M1_College || "").toLowerCase();
        const email = (t.email || t.M1_Email || "").toLowerCase();
        return teamId.includes(searchQuery) || leader.includes(searchQuery) || college.includes(searchQuery) || email.includes(searchQuery) || (t.isTimedOut && ("timed out".includes(searchQuery) || "timeout".includes(searchQuery)));
      });
    }

    // 4. Ranking Sort
    let rankedTeams = [...enrichedTeams];
    switch (currentFilter) {
      case "time":
        rankedTeams.sort((a, b) => {
          if (a.completionTime === null && b.completionTime === null) return 0;
          if (a.completionTime === null) return 1;
          if (b.completionTime === null) return -1;
          return a.completionTime - b.completionTime;
        });
        break;

      case "ai-score":
        rankedTeams.sort((a, b) => {
          const scoreA = a.aiScore !== null ? a.aiScore : -1;
          const scoreB = b.aiScore !== null ? b.aiScore : -1;
          return scoreB - scoreA;
        });
        break;

      case "prompts":
        rankedTeams.sort((a, b) => a.promptCount - b.promptCount);
        break;

      case "most-prompts":
        rankedTeams.sort((a, b) => b.promptCount - a.promptCount);
        break;

      case "balanced":
        rankedTeams.sort((a, b) => {
          const timeA = a.completionTime ? a.completionTime / 60000 : 999;
          const timeB = b.completionTime ? b.completionTime / 60000 : 999;
          const scoreA = timeA + (a.promptCount * 5);
          const scoreB = timeB + (b.promptCount * 5);
          return scoreA - scoreB;
        });
        break;

      case "none":
      default:
        // natural order (teamNo or teamId)
        break;
    }

    // 5. Fastest completion update
    const completedList = rankedTeams.filter(t => t.completionTime !== null);
    if (fastestTeamEl) {
      fastestTeamEl.textContent = completedList.length > 0 ? (completedList[0].teamId || completedList[0].id || completedList[0].vccId) : "—";
    }

    // Sort demo teams to the bottom
    const isDemo = t => Boolean(t.isDemo || (t.teamId || '').startsWith('DEMO'));
    rankedTeams.sort((a, b) => {
      const aDemo = isDemo(a) ? 1 : 0;
      const bDemo = isDemo(b) ? 1 : 0;
      return aDemo - bDemo;
    });

    // 6. Render Table
    teamTable.innerHTML = "";

    if (rankedTeams.length === 0) {
      teamTable.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; padding: 2.5rem; color: var(--text-3);">
            No teams match the current criteria.
          </td>
        </tr>
      `;
      return;
    }

    rankedTeams.forEach((team, idx) => {
      const row = document.createElement("tr");
      if (team.blocked) row.className = "row-suspended";

      // Rank badge
      const rankNum = idx + 1;
      let rankClass = "";
      if (rankNum === 1) rankClass = "top-1";
      else if (rankNum === 2) rankClass = "top-2";
      else if (rankNum === 3) rankClass = "top-3";
      const rankLabel = currentFilter === "none" ? "—" : `#${rankNum}`;

      // Status pill
      let statusHtml = "";
      if (team.blocked) {
        statusHtml = `<span class="status-pill blocked" title="SUSPENDED: ${escapeHtml(team.blockReason || 'Security violation detected')}"><i class="fas fa-ban"></i> SUSPENDED</span>`;
      } else if (team.sessionEnded) {
        statusHtml = `<span class="status-pill ended"><i class="fas fa-check-circle"></i> Completed</span>`;
      } else if (team.isTimedOut) {
        statusHtml = `<span class="status-pill timed-out"><i class="fas fa-hourglass-end"></i> Timed Out</span>`;
      } else if (team.isReadingPhase) {
        statusHtml = `<span class="status-pill reading" style="background:rgba(6,182,212,0.15); color:#38bdf8; border:1px solid rgba(6,182,212,0.4);"><i class="fas fa-book-reader"></i> Reading Phase</span>`;
      } else if (team.hackathonStart) {
        statusHtml = `<span class="status-pill active"><span class="pulse-dot"></span> Live Sprint</span>`;
      } else {
        statusHtml = `<span class="status-pill idle"><i class="far fa-clock"></i> Registered</span>`;
      }

      // Completion Time
      let compTimeHtml = '<span class="time-chip none">—</span>';
      if (team.sessionEnded) {
        const formatted = formatDuration(team.completionTime);
        compTimeHtml = `<span class="time-chip"><i class="far fa-clock"></i> ${formatted || "—"}</span>`;
      } else if (team.isTimedOut) {
        compTimeHtml = `<span class="time-chip timeout"><i class="far fa-clock"></i> Timed Out</span>`;
      } else if (team.isReadingPhase) {
        compTimeHtml = `<span class="time-chip in-progress" style="border-color:rgba(6,182,212,0.4); color:#38bdf8;"><i class="fas fa-book-reader"></i> Reading</span>`;
      } else if (team.hackathonStart) {
        compTimeHtml = `<span class="time-chip in-progress"><i class="fas fa-running"></i> In Progress</span>`;
      }

      // Deliverables
      let delHtml = '<div class="deliverables-group">';
      if (team.githubUrl) {
        delHtml += `<a href="${escapeHtml(formatExternalUrl(team.githubUrl))}" target="_blank" rel="noopener noreferrer" class="del-chip gh-active" title="Open GitHub Repo (${escapeHtml(team.githubUrl)})"><i class="fab fa-github"></i> GitHub</a>`;
      } else {
        delHtml += `<span class="del-chip pending"><i class="fab fa-github"></i> Pending</span>`;
      }

      if (team.deploymentUrl) {
        delHtml += `<a href="${escapeHtml(formatExternalUrl(team.deploymentUrl))}" target="_blank" rel="noopener noreferrer" class="del-chip dep-active" title="Open Live App (${escapeHtml(team.deploymentUrl)})"><i class="fas fa-globe"></i> Live</a>`;
      } else {
        delHtml += `<span class="del-chip pending"><i class="fas fa-globe"></i> Pending</span>`;
      }
      delHtml += '</div>';

      // Prompts
      const promptChip = `<span class="prompt-chip"><i class="fas fa-terminal"></i> ${team.promptCount}</span>`;

      // AI Score
      let aiScoreHtml = '<span class="score-badge none">—</span>';
      if (team.aiEvaluating) {
        aiScoreHtml = `<span class="score-badge evaluating"><i class="fas fa-spinner fa-spin"></i> Evaluating...</span>`;
      } else if (typeof team.aiScore === "number") {
        aiScoreHtml = `<span class="score-badge"><i class="fas fa-bolt"></i> ${team.aiScore}/50</span>`;
      }

      const teamId = team.teamId || team.id || team.vccId;
      const collegeDisplay = team.college || team.M1_College || "—";

      row.innerHTML = `
        <td><span class="rank-badge ${rankClass}">${rankLabel}</span></td>
        <td><span class="team-id-chip ${team.blocked ? 'badge-suspended' : ''}">${escapeHtml(teamId)}</span></td>
        <td>
          <div class="leader-cell">
            <span class="leader-name">${escapeHtml(team.leaderName || team.M1_Name || "—")}</span>
            ${team.M1_VtuNo ? `<span class="college-name" style="font-size:0.72rem; color: var(--text-3);">${escapeHtml(team.M1_VtuNo)}</span>` : ''}
          </div>
        </td>
        <td>${statusHtml}</td>
        <td>${compTimeHtml}</td>
        <td>${delHtml}</td>
        <td>${promptChip}</td>
        <td>${aiScoreHtml}</td>
        <td style="text-align:center;">
          <input
            type="number"
            min="0"
            max="20"
            step="1"
            class="score-input"
            data-teamid="${escapeHtml(teamId)}"
            data-field="interimScore"
            value="${(team.interimScore !== null && team.interimScore !== undefined) ? team.interimScore : ''}"
            placeholder="—"
            title="Enter Interim Score (0-20)"
            style="width:54px; background:transparent; border:1px solid rgba(255,255,255,0.12); border-radius:6px; color:var(--text-1); font-family:var(--font-mono); font-weight:700; font-size:0.92rem; text-align:center; padding:4px 4px; outline:none;"
          />
        </td>
        <td style="text-align:center;">
          <input
            type="number"
            min="0"
            max="30"
            step="1"
            class="score-input"
            data-teamid="${escapeHtml(teamId)}"
            data-field="deploymentScore"
            value="${(team.deploymentScore !== null && team.deploymentScore !== undefined) ? team.deploymentScore : ''}"
            placeholder="—"
            title="Enter Deployment Score (0-30)"
            style="width:54px; background:transparent; border:1px solid rgba(255,255,255,0.12); border-radius:6px; color:var(--text-1); font-family:var(--font-mono); font-weight:700; font-size:0.92rem; text-align:center; padding:4px 4px; outline:none;"
          />
        </td>
        <td style="text-align:center; font-family:var(--font-mono); font-weight:800; color:var(--cyan);">
          ${(() => {
            const ai = typeof team.aiScore === 'number' ? team.aiScore : 0;
            const interim = typeof team.interimScore === 'number' ? team.interimScore : 0;
            const deploy = typeof team.deploymentScore === 'number' ? team.deploymentScore : 0;
            const hasAny = typeof team.aiScore === 'number' || typeof team.interimScore === 'number' || typeof team.deploymentScore === 'number';
            return hasAny ? (ai + interim + deploy) + '/100' : '—';
          })()}
        </td>
        <td style="text-align: right;">
          <button class="view-btn" data-id="${escapeHtml(teamId)}" title="Inspect Team Activity &amp; Prompts">
            <i class="fas fa-eye"></i> View
          </button>
        </td>
      `;

      teamTable.appendChild(row);
    });
  }

  /* ==========================
     SCORE SAVE (Interim / Deployment)
     ========================== */
  teamTable.addEventListener("change", async (e) => {
    const input = e.target.closest(".score-input");
    if (!input) return;
    const teamId = input.dataset.teamid;
    const field = input.dataset.field; // "interimScore" or "deploymentScore"
    const raw = input.value.trim();
    const score = raw === "" ? null : Number(raw);
    const maxVal = field === "interimScore" ? 20 : 30;
    if (score !== null && (isNaN(score) || score < 0 || score > maxVal)) {
      window.showToast(`Score must be 0–${maxVal}.`, "error");
      return;
    }
    try {
      const res = await adminFetch(`/api/manage/teams/${teamId}`, {
        method: "PUT",
        body: JSON.stringify({ [field]: score })
      });
      if (res && res.ok) {
        const t = teams.find(x => (x.teamId || x.id || x.vccId) === teamId);
        if (t) t[field] = score;
        input.style.borderColor = "rgba(52,211,153,0.5)";
        setTimeout(() => { input.style.borderColor = "rgba(255,255,255,0.12)"; }, 1500);
        window.showToast(`Score saved for ${teamId}.`, "success");
      } else {
        window.showToast(`Failed to save score for ${teamId}.`, "error");
      }
    } catch (err) {
      window.showToast("Network error saving score.", "error");
    }
  });

  teamTable.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const input = e.target.closest(".score-input");
      if (input) { input.blur(); }
    }
  });

  /* ==========================
     TEAM DETAILS MODAL
     ========================== */
  teamTable.addEventListener("click", (e) => {
    const btn = e.target.closest(".view-btn");
    if (!btn) return;

    const teamId = btn.dataset.id;
    const team = teams.find(t => (t.teamId || t.id || t.vccId) === teamId);
    if (!team) return;

    if (modalTeamTitle) {
      modalTeamTitle.textContent = `${teamId} · ${team.leaderName || "Team Overview"}`;
    }

    // 1. Team Info Box
    const members = (Array.isArray(team.members) && team.members.length > 0)
      ? team.members
      : [
          ...(team.M1_Name ? [{
            name: team.M1_Name,
            email: team.M1_Email || team.email || "",
            phone: team.M1_Phone || team.phone || "",
            branch: team.M1_Branch || team.branch || "",
            college: team.M1_College || team.college || "",
            vtuNo: team.M1_VtuNo || team.m1VtuNo || "",
            isLeader: true
          }] : []),
          ...(team.M2_Name ? [{
            name: team.M2_Name,
            email: team.M2_Email || "",
            phone: team.M2_Phone || "",
            branch: team.M2_Branch || "",
            vtuNo: team.M2_VtuNo || "",
            college: team.M2_College || team.college || "",
            isLeader: false
          }] : [])
        ];

    const collegeDisplay = team.college || team.M1_College || "—";
    const emailDisplay = team.email || team.M1_Email || "—";
    const phoneDisplay = team.phone || team.M1_Phone || "—";
    const branchDisplay = team.M1_Branch || team.branch || "";
    const leaderVtuDisplay = team.M1_VtuNo || team.m1VtuNo || (members[0] && members[0].isLeader ? members[0].vtuNo : "");

    let deliverablesRow = "";
    if (team.githubUrl || team.deploymentUrl) {
      deliverablesRow = '<div class="modal-deliverables-row">';
      if (team.githubUrl) {
        deliverablesRow += `<a href="${escapeHtml(formatExternalUrl(team.githubUrl))}" target="_blank" rel="noopener noreferrer" class="modal-del-link github"><i class="fab fa-github"></i> Open GitHub Repository</a>`;
      }
      if (team.deploymentUrl) {
        deliverablesRow += `<a href="${escapeHtml(formatExternalUrl(team.deploymentUrl))}" target="_blank" rel="noopener noreferrer" class="modal-del-link deploy"><i class="fas fa-external-link-alt"></i> Open Live Application</a>`;
      }
      deliverablesRow += '</div>';
    }

    const selectedTeamId = team.teamId || team.id || team.vccId;

    teamInfo.innerHTML = `
      <div class="info-grid">
        ${team.blocked ? `
        <div style="grid-column: 1 / -1; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; color: #f87171; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div>
            <strong style="display:flex; align-items:center; gap:6px;"><i class="fas fa-ban"></i> SECURITY SUSPENSION ACTIVE</strong>
            <div style="font-size:0.8rem; margin-top:3px; color:#fca5a5;">Reason: ${escapeHtml(team.blockReason || "Security violation detected")}</div>
            ${team.blockDetails ? `<div style="font-size:0.75rem; opacity:0.85; margin-top:2px; font-family:var(--font-mono); color:var(--text-2);">${escapeHtml(team.blockDetails)}</div>` : ''}
          </div>
          <div style="font-size: 0.75rem; background: rgba(0,0,0,0.35); padding: 4px 10px; border-radius: 4px; color: var(--text-3);">
            <i class="fas fa-lock"></i> Unblock restricted to Management Console
          </div>
        </div>
        ` : ""}
        <div class="info-item">
          <span class="info-label">Team ID</span>
          <span class="info-value" style="color: var(--cyan); font-family: var(--font-mono); font-weight: 800;">${escapeHtml(selectedTeamId)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Team Leader</span>
          <span class="info-value">${escapeHtml(team.leaderName || team.M1_Name || "—")}</span>
        </div>
        ${leaderVtuDisplay ? `
        <div class="info-item">
          <span class="info-label">Leader VTU No</span>
          <span class="info-value" style="font-family: var(--font-mono);">${escapeHtml(leaderVtuDisplay)}</span>
        </div>
        ` : ""}
        ${branchDisplay ? `
        <div class="info-item">
          <span class="info-label">Leader Department</span>
          <span class="info-value">${escapeHtml(branchDisplay)}</span>
        </div>
        ` : ""}
        <div class="info-item">
          <span class="info-label">Institution / College</span>
          <span class="info-value">${escapeHtml(collegeDisplay)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Contact Email</span>
          <span class="info-value">${escapeHtml(emailDisplay)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Contact Phone</span>
          <span class="info-value">${escapeHtml(phoneDisplay)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Team Size</span>
          <span class="info-value">${team.teamSize || (members.length ? members.length : 1)} Builder(s)</span>
        </div>

        ${members.length > 0 ? `
        <div class="members-block">
          <span class="info-label">Registered Squad Members</span>
          <div class="member-pill-list">
            ${members.map((m, i) => `
              <span class="member-tag">
                <i class="fas ${m.isLeader ? 'fa-crown' : 'fa-user'}"></i>
                <strong>${escapeHtml(m.name || "Member " + (i+1))}</strong>
                ${m.vtuNo ? `<span style="opacity:0.85;">[${escapeHtml(m.vtuNo)}]</span>` : ''}
                ${m.branch ? `<span style="opacity:0.85;">(${escapeHtml(m.branch)})</span>` : ''}
                ${m.email ? `&lt;${escapeHtml(m.email)}&gt;` : ''}
                ${m.phone ? `· ${escapeHtml(m.phone)}` : ''}
              </span>
            `).join("")}
          </div>
        </div>
        ` : ""}

        ${deliverablesRow}
      </div>
    `;

    // 2. Team Stats Box
    const stats = promptStats[selectedTeamId] || { promptCount: 0, uniqueAITools: 0 };
    const aiScore = computeTeamAIScore(selectedTeamId, team.aiScore);
    const modalStartMs = team.hackathonStart ? new Date(team.hackathonStart).getTime() : null;
    const modalIsStarted = Boolean(modalStartMs && !isNaN(modalStartMs));
    const modalIsEnded = Boolean(team.sessionEnded);
    const modalTotalMs = (150 + adminSessionExtraMinutes) * 60 * 1000;
    const modalIsTimedOut = Boolean(modalIsStarted && !team.blocked && !modalIsEnded && (Date.now() - modalStartMs >= modalTotalMs));
    const modalIsReading = Boolean(modalIsStarted && !team.blocked && !modalIsEnded && (Date.now() - modalStartMs < 30 * 60 * 1000));
    const duration = formatDuration(getCompletionTime(team)) || (modalIsTimedOut ? "Timed Out" : modalIsReading ? "Reading Phase" : "—");

    teamStats.innerHTML = `
      <div class="m-stat-box">
        <span class="m-stat-label">Session Status</span>
        <span class="m-stat-val ${team.blocked ? "red" : team.sessionEnded ? "cyan" : modalIsTimedOut ? "amber" : modalIsReading ? "blue" : team.hackathonStart ? "green" : ""}" style="${team.blocked ? "color:#f87171;" : modalIsTimedOut ? "color:#fbbf24;" : modalIsReading ? "color:#38bdf8;" : ""}">
          ${team.blocked ? "Suspended" : team.sessionEnded ? "Ended" : modalIsTimedOut ? "Timed Out" : modalIsReading ? "Reading Phase" : team.hackathonStart ? "Active" : "Registered"}
        </span>
      </div>
      <div class="m-stat-box">
        <span class="m-stat-label">Completion Time</span>
        <span class="m-stat-val">${duration}</span>
      </div>
      <div class="m-stat-box">
        <span class="m-stat-label">Prompts Logged</span>
        <span class="m-stat-val amber">${stats.promptCount}</span>
      </div>
      <div class="m-stat-box">
        <span class="m-stat-label">AI Jury Score</span>
        <span class="m-stat-val ${team.aiEvaluating ? "amber" : "cyan"}">${team.aiEvaluating ? '<i class="fas fa-spinner fa-spin"></i> Evaluating...' : (typeof aiScore === "number" ? aiScore + "/50" : "Not Graded")}</span>
      </div>
    `;

    // 3. Team Prompts (Expandable Cards)
    const teamPrompts = allPrompts.filter(p => (p.teamId || p.vccId) === selectedTeamId);
    if (modalPromptCount) modalPromptCount.textContent = `${teamPrompts.length} Prompt${teamPrompts.length === 1 ? "" : "s"}`;

    promptTable.innerHTML = "";

    if (teamPrompts.length === 0) {
      promptTable.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-3); font-size: 0.9rem;">
          <i class="fas fa-terminal" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
          No AI prompts logged by this team yet.
        </div>
      `;
    } else {
      teamPrompts.forEach((p, idx) => {
        const card = document.createElement("div");
        card.className = "admin-prompt-card";

        const CLAMP = 200;
        const fullText = p.promptText || "";
        const isLong = fullText.length > CLAMP;
        const previewText = isLong ? fullText.slice(0, CLAMP) + "…" : fullText;

        const dt = new Date(p.submittedAt);
        const timeStr = isNaN(dt.getTime())
          ? "Just now"
          : dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        const ev = p.evaluation;
        let evalHtml = '';
        if (ev && typeof ev.score === 'number') {
          const s = ev.score > 50 ? Math.round(ev.score / 2) : ev.score;
          evalHtml = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; padding: 6px 10px; background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.2); border-radius: 8px; font-size: 0.76rem;">
              <span style="font-weight: 700; color: var(--green); font-family: var(--font-mono);"><i class="fas fa-check-circle"></i> AI Score: ${s}/50 (${escapeHtml(ev.level || "Evaluated")})</span>
              <span style="color: var(--text-2); font-size: 0.72rem;">${escapeHtml(ev.reasoning ? ev.reasoning.slice(0, 110) + "..." : "")}</span>
            </div>
          `;
        } else if (p.evaluationStatus === "evaluating" || !ev) {
          evalHtml = `
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; padding: 6px 10px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25); border-radius: 8px; font-size: 0.76rem; color: var(--amber);">
              <i class="fas fa-spinner fa-spin"></i> <span style="font-weight: 600;">AI Evaluation in progress...</span>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="apc-header">
            <div class="apc-left">
              <span class="apc-num">#${idx + 1}</span>
              <span class="apc-tool">${escapeHtml(p.aiTool || p.aiName || "AI Tool")}</span>
            </div>
            <span class="apc-time"><i class="far fa-clock"></i> ${timeStr}</span>
          </div>
          <div class="apc-text" data-full="${escapeHtml(fullText)}" data-preview="${escapeHtml(previewText)}" data-expanded="false">${escapeHtml(previewText)}</div>
          ${isLong ? `<button class="apc-toggle" type="button"><i class="fas fa-chevron-down"></i> Expand Prompt (${fullText.length} chars)</button>` : ""}
          ${evalHtml}
        `;

        if (isLong) {
          const toggle = card.querySelector(".apc-toggle");
          const textEl = card.querySelector(".apc-text");
          toggle.addEventListener("click", () => {
            const isExp = textEl.dataset.expanded === "true";
            if (isExp) {
              textEl.textContent = textEl.dataset.preview;
              textEl.dataset.expanded = "false";
              toggle.innerHTML = `<i class="fas fa-chevron-down"></i> Expand Prompt (${fullText.length} chars)`;
            } else {
              textEl.textContent = textEl.dataset.full;
              textEl.dataset.expanded = "true";
              toggle.innerHTML = `<i class="fas fa-chevron-up"></i> Collapse Prompt`;
            }
          });
        }

        promptTable.appendChild(card);
      });
    }

    teamModal.classList.add("show");
  });

  function hideModal() {
    teamModal.classList.remove("show");
  }

  if (closeModal) closeModal.addEventListener("click", hideModal);
  if (closeModalBottom) closeModalBottom.addEventListener("click", hideModal);
  teamModal.addEventListener("click", (e) => {
    if (e.target === teamModal) hideModal();
  });

  
  /* ==========================
     PROBLEM STATEMENT MANAGER
     ========================== */
  const DEFAULT_ADMIN_PROBLEM_TEXT = `Institutional Event Resource Management System (IERMS)
Vibeathon 2026 Official Problem Statement

Challenge Overview:
Educational institutions frequently organize large-scale academic, cultural, and technical events requiring coordinated reservation of specialized facilities, high-value AV equipment, faculty supervisors, and guest speaker protocol. Inefficient manual coordination leads to severe double-booking collisions, unapproved budget escalations, and zero accountability when resources are damaged or unreturned.

Core Functional Requirements:
1. Multi-Role Workflow & RBAC:
   • Event Coordinator: Submits multi-resource requisition proposals with event schedules, expected attendance, and equipment checklists.
   • Head of Department (HOD): Evaluates academic merit and departmental calendar alignment.
   • Dean of Student Affairs: Approves institutional priority and space allocations.
   • IT & Campus Security Admin: Dispatches technical personnel, keys, and network provisioning.

2. Conflict Detection Engine:
   • Strict time-slot collision detection preventing double-booking across venues, specialized AV setups, and keynote auditoriums.
   • Automated alternative resource recommendations upon conflict discovery.

3. Rejection & Remediation Feedback Loops:
   • Multi-tiered rejections must mandate explicit feedback notes with structured change requests.

4. Dynamic Mid-Event Adjustments:
   • Handle unexpected overflow capacity, emergency equipment dispatch, and audit logging.`;

  const adminProbTabs = document.querySelectorAll(".admin-prob-tab");
  const adminSectionStatement = document.getElementById("adminSectionStatement");
  const adminSectionRubric = document.getElementById("adminSectionRubric");
  const adminSectionUpload = document.getElementById("adminSectionUpload");
  const adminLiveDocName = document.getElementById("adminLiveDocName");
  const adminLiveDocMeta = document.getElementById("adminLiveDocMeta");
  const adminLiveReleaseBadge = document.getElementById("adminLiveReleaseBadge");
  const adminLiveStatementText = document.getElementById("adminLiveStatementText");
  const adminStatementUpdatedTimestamp = document.getElementById("adminStatementUpdatedTimestamp");
  const adminDownloadDocBtn = document.getElementById("adminDownloadDocBtn");
  const adminJumpToEditBtn = document.getElementById("adminJumpToEditBtn");

  function switchAdminProbTab(target) {
    adminProbTabs.forEach(btn => {
      const isTarget = btn.dataset.tab === target;
      btn.classList.toggle("active", isTarget);
      if (isTarget) {
        btn.style.background = "rgba(34, 211, 238, 0.15)";
        btn.style.borderColor = "rgba(34, 211, 238, 0.4)";
        btn.style.color = "#fff";
      } else {
        btn.style.background = "";
        btn.style.borderColor = "";
        btn.style.color = "";
      }
    });

    if (adminSectionStatement) adminSectionStatement.style.display = target === "statement" ? "block" : "none";
    if (adminSectionRubric) adminSectionRubric.style.display = target === "rubric" ? "block" : "none";
    if (adminSectionUpload) adminSectionUpload.style.display = target === "upload" ? "block" : "none";
  }

  adminProbTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      if (target) switchAdminProbTab(target);
    });
  });

  if (adminJumpToEditBtn) {
    adminJumpToEditBtn.addEventListener("click", () => {
      switchAdminProbTab("upload");
      if (problemContextInput) {
        problemContextInput.focus();
        problemContextInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  if (adminDownloadDocBtn) {
    adminDownloadDocBtn.addEventListener("click", async () => {
      try {
        adminDownloadDocBtn.disabled = true;
        adminDownloadDocBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';

        const token = sessionStorage.getItem("adminToken") || localStorage.getItem("adminToken");
        const downloadUrl = window.getApiUrl ? window.getApiUrl("/api/problem-statement/download") : "/api/problem-statement/download";

        let res = await fetch(downloadUrl, {
          headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });

        if (!res.ok) {
          const adminDlUrl = window.getApiUrl ? window.getApiUrl("/api/admin/problem-statement/download") : "/api/admin/problem-statement/download";
          res = await fetch(adminDlUrl, {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
          });
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          window.showToast(errData.message || errData.error || "Failed to download problem statement file.", "error");
          return;
        }

        const blob = await res.blob();
        let downloadFileName = "Vibeathon_Problem_Statement.docx";
        const disposition = res.headers.get("Content-Disposition");
        if (disposition && disposition.includes("filename=")) {
          const match = disposition.match(/filename="?([^";]+)"?/);
          if (match && match[1]) downloadFileName = match[1];
        } else if (adminLiveDocName && adminLiveDocName.textContent.trim()) {
          downloadFileName = adminLiveDocName.textContent.trim();
        }

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = downloadFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        window.showToast("Problem statement document downloaded successfully!", "success");
      } catch (err) {
        console.error("Admin download problem statement error:", err);
        window.showToast("Download error: " + err.message, "error");
      } finally {
        adminDownloadDocBtn.disabled = false;
        adminDownloadDocBtn.innerHTML = '<i class="fas fa-download"></i> Download File';
      }
    });
  }

  async function loadProblemStatementInfo() {
    try {
      const res = await adminFetch("/api/admin/problem-statement");
      if (res.ok) {
        const info = await res.json();
        const hasFile = Boolean(info.fileName);
        const fileName = info.fileName || "Vibeathon_Problem_Statement.docx";

        if (activeFileNameDisplay) {
          if (hasFile) {
            activeFileNameDisplay.textContent = info.fileName;
            activeFileNameDisplay.style.color = "var(--cyan)";
          } else {
            activeFileNameDisplay.textContent = "No document uploaded yet";
            activeFileNameDisplay.style.color = "var(--text-3)";
          }
        }
        if (activeFileUpdatedDisplay) {
          activeFileUpdatedDisplay.textContent = info.updatedAt ? "Updated " + new Date(info.updatedAt).toLocaleTimeString() : "";
        }

        if (adminLiveDocName) {
          adminLiveDocName.textContent = fileName;
        }
        if (adminLiveDocMeta) {
          adminLiveDocMeta.textContent = hasFile
            ? `Serving custom file to participants • Uploaded: ${info.updatedAt ? new Date(info.updatedAt).toLocaleDateString() : "Active"}`
            : "Default document ready • Upload replacement file anytime";
        }

        if (problemContextInput) {
          problemContextInput.value = (info.text && info.text.trim()) ? info.text.trim() : DEFAULT_ADMIN_PROBLEM_TEXT;
        }

        const problemText = (info.text && info.text.trim()) ? info.text.trim() : DEFAULT_ADMIN_PROBLEM_TEXT;
        if (adminLiveStatementText) {
          adminLiveStatementText.textContent = problemText;
        }
        if (adminStatementUpdatedTimestamp) {
          adminStatementUpdatedTimestamp.textContent = info.updatedAt
            ? "Last updated: " + new Date(info.updatedAt).toLocaleString()
            : "Default active configuration";
        }

        const adminProblemReleaseToggle = document.getElementById("adminProblemReleaseToggle");
        const adminReleaseToggleLabel = document.getElementById("adminReleaseToggleLabel");
        const isReleased = Boolean(info.released);

        if (adminProblemReleaseToggle) {
          adminProblemReleaseToggle.checked = isReleased;
        }
        if (adminReleaseToggleLabel) {
          adminReleaseToggleLabel.textContent = isReleased ? "RELEASED" : "LOCKED";
          adminReleaseToggleLabel.style.color = isReleased ? "var(--green)" : "var(--rose)";
        }

        if (adminLiveReleaseBadge) {
          if (isReleased) {
            adminLiveReleaseBadge.innerHTML = '<i class="fas fa-check-circle"></i> RELEASED';
            adminLiveReleaseBadge.style.background = 'var(--green-dim)';
            adminLiveReleaseBadge.style.color = 'var(--green)';
            adminLiveReleaseBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          } else {
            adminLiveReleaseBadge.innerHTML = '<i class="fas fa-lock"></i> LOCKED';
            adminLiveReleaseBadge.style.background = 'rgba(244, 63, 94, 0.12)';
            adminLiveReleaseBadge.style.color = 'var(--rose)';
            adminLiveReleaseBadge.style.borderColor = 'rgba(244, 63, 94, 0.3)';
          }
        }
      }
    } catch (err) {
      console.warn("Load problem statement info error:", err);
    }
  }

  const adminProblemReleaseToggle = document.getElementById("adminProblemReleaseToggle");
  if (adminProblemReleaseToggle) {
    adminProblemReleaseToggle.addEventListener("change", async () => {
      const released = adminProblemReleaseToggle.checked;
      const adminReleaseToggleLabel = document.getElementById("adminReleaseToggleLabel");
      if (adminReleaseToggleLabel) {
        adminReleaseToggleLabel.textContent = released ? "RELEASED" : "LOCKED";
        adminReleaseToggleLabel.style.color = released ? "var(--green)" : "var(--rose)";
      }

      if (adminLiveReleaseBadge) {
        if (released) {
          adminLiveReleaseBadge.innerHTML = '<i class="fas fa-check-circle"></i> RELEASED';
          adminLiveReleaseBadge.style.background = 'var(--green-dim)';
          adminLiveReleaseBadge.style.color = 'var(--green)';
          adminLiveReleaseBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else {
          adminLiveReleaseBadge.innerHTML = '<i class="fas fa-lock"></i> LOCKED';
          adminLiveReleaseBadge.style.background = 'rgba(244, 63, 94, 0.12)';
          adminLiveReleaseBadge.style.color = 'var(--rose)';
          adminLiveReleaseBadge.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        }
      }

      try {
        const res = await adminFetch("/api/manage/settings", {
          method: "PUT",
          body: JSON.stringify({
            problemStatement: {
              released
            }
          })
        });
        if (res.ok) {
          window.showToast(`Problem statement access ${released ? "RELEASED to all participants!" : "LOCKED / FROZEN!"}`, released ? "success" : "info");
        }
      } catch (err) {
        console.error("Failed to update release status:", err);
      }
    });
  }

  if (manageProblemBtn && problemModal) {
    manageProblemBtn.addEventListener("click", () => {
      loadProblemStatementInfo();
      problemModal.classList.add("show");
    });
  }

  function hideProblemModal() {
    if (problemModal) problemModal.classList.remove("show");
  }

  if (closeProblemModal) closeProblemModal.addEventListener("click", hideProblemModal);
  if (closeProblemModalBottom) closeProblemModalBottom.addEventListener("click", hideProblemModal);
  if (problemModal) {
    problemModal.addEventListener("click", (e) => {
      if (e.target === problemModal) hideProblemModal();
    });
  }

  if (chooseFileBtn && problemFileInput) {
    chooseFileBtn.addEventListener("click", () => {
      problemFileInput.click();
    });

    problemFileInput.addEventListener("change", () => {
      const file = problemFileInput.files[0];
      if (file) {
        if (selectedFileName) selectedFileName.textContent = file.name + " (" + Math.round(file.size / 1024) + " KB)";
        if (uploadFileBtn) uploadFileBtn.disabled = false;
      } else {
        if (selectedFileName) selectedFileName.textContent = "No file selected";
        if (uploadFileBtn) uploadFileBtn.disabled = true;
      }
    });
  }

  if (uploadFileBtn && problemFileInput) {
    uploadFileBtn.addEventListener("click", async () => {
      const file = problemFileInput.files[0];
      if (!file) return window.showToast("Please select a document file to upload.", "warning");

      uploadFileBtn.disabled = true;
      uploadFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = String(reader.result).split(",")[1];
          const payload = {
            fileName: file.name,
            fileBase64: base64Data,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            contextText: (problemContextInput && problemContextInput.value.trim()) ? problemContextInput.value.trim() : null
          };

          const adminToken = sessionStorage.getItem("adminToken") || localStorage.getItem("adminToken");
          const uploadUrl = window.getApiUrl ? window.getApiUrl("/api/admin/problem-statement/upload") : "/api/admin/problem-statement/upload";

          const res = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + adminToken,
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || "Upload failed: HTTP " + res.status);
          }

          const data = await res.json();
          window.showToast(data.message || "Problem statement document uploaded and deployed successfully!", "success");
          problemFileInput.value = "";
          if (selectedFileName) selectedFileName.textContent = "No file selected";
          await loadProblemStatementInfo();

        } catch (err) {
          console.error("Upload error:", err);
          window.showToast("Error uploading problem statement: " + err.message, "error");
        } finally {
          uploadFileBtn.disabled = false;
          uploadFileBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Deploy';
        }
      };

      reader.onerror = () => {
        uploadFileBtn.disabled = false;
        uploadFileBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Deploy';
        window.showToast("Failed to read document file from disk.", "error");
      };

      reader.readAsDataURL(file);
    });
  }

  if (saveContextBtn && problemContextInput) {
    saveContextBtn.addEventListener("click", async () => {
      const text = problemContextInput.value.trim();
      if (!text) return window.showToast("Please enter challenge description or constraints text.", "warning");

      saveContextBtn.disabled = true;
      saveContextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

      try {
        const res = await adminFetch("/api/admin/problem-statement/context", {
          method: "POST",
          body: JSON.stringify({ text })
        });

        if (!res.ok) throw new Error("Failed to save context: " + res.status);
        window.showToast("AI Evaluation challenge context updated! All subsequent evaluations will use this rubric.", "success");
        await loadProblemStatementInfo();

      } catch (err) {
        console.error("Save context error:", err);
        window.showToast("Error saving context: " + err.message, "error");
      } finally {
        saveContextBtn.disabled = false;
        saveContextBtn.innerHTML = '<i class="fas fa-save"></i> Save Context for AI Evaluator';
      }
    });
  }

  /* ==========================
     EXPORT TO CSV
     ========================== */
  function sanitizeCsvField(value) {
    if (value === null || value === undefined) return '';
    let str = String(value);
    if (/^[=+\-@|%]/.test(str)) {
      str = "'" + str;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function exportToCSV(rows, filename = "vibeathon_admin_telemetry.csv") {
    if (!rows.length) return window.showToast("No team data to export.", "info");

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.map(sanitizeCsvField).join(","),
      ...rows.map(row => headers.map(h => sanitizeCsvField(row[h])).join(","))
    ];

    const blob = new Blob([csvLines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportToExcel(rows, filename = "vibeathon_admin_telemetry.xlsx", sheetName = "Telemetry") {
    if (!rows.length) return window.showToast("No team data to export.", "info");
    if (typeof XLSX === "undefined") {
      exportToCSV(rows, filename.replace(/\.xlsx$/i, ".csv"));
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const keys = Object.keys(rows[0]);
    worksheet['!cols'] = keys.map(k => {
      let maxLen = k.length;
      for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const val = rows[i][k];
        if (val !== undefined && val !== null) {
          maxLen = Math.max(maxLen, String(val).length);
        }
      }
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }

  function buildTelemetryExportRow(team) {
    const tId = team.teamId || team.id || team.vccId || "";
    const stats = promptStats[tId] || { promptCount: 0, uniqueAITools: 0 };
    const compTime = getCompletionTime(team);
    const aiScore = computeTeamAIScore(tId, team.aiScore);
    const isEnded = Boolean(team.sessionEnded);
    const startMs = team.hackathonStart ? new Date(team.hackathonStart).getTime() : null;
    const isStarted = Boolean(startMs && !isNaN(startMs));
    const totalMs = (150 + adminSessionExtraMinutes) * 60 * 1000;
    const isTimedOut = Boolean(isStarted && !team.blocked && !isEnded && (Date.now() - startMs >= totalMs));
    const isReading = Boolean(isStarted && !team.blocked && !isEnded && (Date.now() - startMs < 30 * 60 * 1000));
    const isLive = Boolean(team.hackathonStart && !isEnded && !isTimedOut && !isReading);
    const status = team.blocked ? "Suspended" : (isEnded ? "Completed" : (isTimedOut ? "Timed Out" : (isReading ? "Reading Phase" : (isLive ? "Live Sprint" : "Registered"))));
    const compFormatted = compTime ? formatDuration(compTime) : (isTimedOut ? "Timed Out" : (isReading ? "Reading Phase" : "—"));

    return {
      "Team ID": tId,
      "Team Lead Name": team.M1_Name || team.leaderName || "",
      "VTU Reg. No. (Lead)": team.M1_VtuNo || team.m1VtuNo || "",
      "Branch": team.M1_Branch || team.branch || "",
      "Lead Email": team.M1_Email || team.email || "",
      "Lead Mobile": team.M1_Phone || team.phone || "",
      "Member 2 Name": team.M2_Name || "—",
      "Member 2 VTU No.": team.M2_VtuNo || team.m2VtuNo || "—",
      "Participation Status": status,
      "Sprint Duration": compFormatted,
      "AI Prompts Logged": stats.promptCount || 0,
      "Distinct AI Tools": stats.uniqueAITools || 0,
      "AI Score /50": aiScore !== null ? aiScore : "Not Graded",
      "Interim Score /20": (team.interimScore !== null && team.interimScore !== undefined) ? team.interimScore : "—",
      "Deployment Score /30": (team.deploymentScore !== null && team.deploymentScore !== undefined) ? team.deploymentScore : "—",
      "Total /100": (() => {
        const ai = typeof aiScore === 'number' ? aiScore : 0;
        const interim = typeof team.interimScore === 'number' ? team.interimScore : 0;
        const deploy = typeof team.deploymentScore === 'number' ? team.deploymentScore : 0;
        return (typeof aiScore === 'number' || typeof team.interimScore === 'number' || typeof team.deploymentScore === 'number') ? (ai + interim + deploy) : "—";
      })(),
      "GitHub Repository": team.githubUrl || "Not Submitted",
      "Live Deployment URL": team.deploymentUrl || "Not Submitted"
    };
  }

  // 1. Export PDF — Official Evaluation Report
  function exportToPDF(rows) {
    if (!rows || rows.length === 0) return window.showToast("No team data to export.", "info");
    if (typeof window.jspdf === "undefined" && typeof jsPDF === "undefined") {
      window.showToast("PDF library unavailable. Please check your connection.", "error");
      return;
    }
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });

    const dateStr = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("Vibeathon 2026 — Official Participant Evaluation Report", 14, 16);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`School of Computing  |  Generated: ${dateStr}`, 14, 23);
    doc.text(`Total Teams: ${rows.length}`, doc.internal.pageSize.getWidth() - 14, 23, { align: "right" });

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 26, doc.internal.pageSize.getWidth() - 14, 26);

    const columns = [
      { header: "Team ID", dataKey: "Team ID" },
      { header: "Team Lead", dataKey: "Team Lead Name" },
      { header: "VTU No.", dataKey: "VTU Reg. No. (Lead)" },
      { header: "Branch", dataKey: "Branch" },
      { header: "Member 2", dataKey: "Member 2 Name" },
      { header: "M2 VTU No.", dataKey: "Member 2 VTU No." },
      { header: "Status", dataKey: "Participation Status" },
      { header: "Duration", dataKey: "Sprint Duration" },
      { header: "Prompts", dataKey: "AI Prompts Logged" },
      { header: "AI /50", dataKey: "AI Score /50" },
      { header: "Interim /20", dataKey: "Interim Score /20" },
      { header: "Deploy /30", dataKey: "Deployment Score /30" },
      { header: "Total /100", dataKey: "Total /100" },
      { header: "GitHub", dataKey: "GitHub Repository" },
      { header: "Live URL", dataKey: "Live Deployment URL" }
    ];

    doc.autoTable({
      columns,
      body: rows,
      startY: 30,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42], textColor: [200, 200, 200], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      columnStyles: {
        0: { cellWidth: 20, fontStyle: "bold" },
        1: { cellWidth: 28 },
        2: { cellWidth: 22, font: "courier" },
        3: { cellWidth: 24 },
        4: { cellWidth: 25 },
        5: { cellWidth: 20, font: "courier" },
        6: { cellWidth: 18 },
        7: { cellWidth: 18, halign: "center" },
        8: { cellWidth: 14, halign: "center" },
        9: { cellWidth: 16, halign: "center", fontStyle: "bold" },
        10: { cellWidth: 18, halign: "center", fontStyle: "bold" },
        11: { cellWidth: 18, halign: "center", fontStyle: "bold" },
        12: { cellWidth: 20, halign: "center", fontStyle: "bold" },
        13: { cellWidth: 32 },
        14: { cellWidth: 32 }
      },
      didParseCell(data) {
        if ([9, 10, 11, 12].includes(data.column.index) && data.section === "body") {
          const v = Number(data.cell.raw);
          if (!isNaN(v)) {
            data.cell.styles.textColor = v >= 40 ? [22, 163, 74] : v >= 20 ? [217, 119, 6] : [220, 38, 38];
          }
        }
      },
      didDrawPage(data) {
        const pageCount = doc.internal.getNumberOfPages();
        const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `Page ${pageNum} of ${pageCount}  |  Vibeathon 2026  |  School of Computing  |  Confidential Academic Record`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: "center" }
        );
      }
    });

    doc.save(`Vibeathon_Evaluation_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", () => {
      try {
        if (teams.length === 0) { window.showToast("No team data to export.", "info"); return; }
        const realTeams = teams.filter(t => !(t.isDemo === true || (t.teamId || t.id || t.vccId || '').startsWith('DEMO')));
        const rows = realTeams.map(buildTelemetryExportRow);
        exportToPDF(rows);
        window.showToast(`PDF report generated for ${rows.length} teams.`, "success");
      } catch (err) {
        console.error("PDF export error:", err);
        window.showToast("Failed to generate PDF: " + err.message, "error");
      }
    });
  }

  // 2. Export Summary to Excel (.xlsx)
  const exportExcelBtn = document.getElementById("exportExcelBtn");
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", async () => {
      try {
        const realTeams = teams.filter(t => !(t.isDemo === true || (t.teamId || t.id || t.vccId || '').startsWith('DEMO')));
        const rows = realTeams.map(buildTelemetryExportRow);
        const dateStr = new Date().toISOString().slice(0, 10);
        exportToExcel(rows, `vibeathon_telemetry_${dateStr}.xlsx`, "Telemetry");
        window.showToast(`Exported telemetry for ${rows.length} teams to Excel!`, "success");
      } catch (err) {
        console.error("Export error:", err);
        window.showToast("Failed to export telemetry to Excel.", "error");
      }
    });
  }

  // 3. Export Detailed Prompt Audit Log
  if (exportDetailedBtn) {
    exportDetailedBtn.addEventListener("click", async () => {
      const originalText = exportDetailedBtn.innerHTML;
      exportDetailedBtn.disabled = true;
      exportDetailedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';

      try {
        // Refresh latest prompts and teams to guarantee authoritative data
        await fetchPrompts();
        await fetchTeams();

        const detailedRows = [];

        teams.forEach(team => {
          const tId = team.teamId || team.id || team.vccId;
          // Skip demo teams
          if (team.isDemo === true || (tId || '').startsWith('DEMO')) return;

          const leader = team.M1_Name || team.leaderName || "—";
          const college = team.college || team.M1_College || "—";
          const teamSize = team.teamSize || 2;
          const isEnded = Boolean(team.sessionEnded);
          const startMs = team.hackathonStart ? new Date(team.hackathonStart).getTime() : null;
          const isStarted = Boolean(startMs && !isNaN(startMs));
          const totalMs = (150 + adminSessionExtraMinutes) * 60 * 1000;
          const isTimedOut = Boolean(isStarted && !team.blocked && !isEnded && (Date.now() - startMs >= totalMs));
          const isReading = Boolean(isStarted && !team.blocked && !isEnded && (Date.now() - startMs < 30 * 60 * 1000));
          const isLive = Boolean(team.hackathonStart && !isEnded && !isTimedOut && !isReading);
          const status = team.blocked ? "Suspended" : (isEnded ? "Completed" : (isTimedOut ? "Timed Out" : (isReading ? "Reading Phase" : (isLive ? "Live Sprint" : "Registered"))));
          const securityStatus = team.blocked ? `Suspended (${team.blockReason || 'Security Violation'})` : "Active / Clear";
          const sessionStart = team.hackathonStart ? new Date(team.hackathonStart).toLocaleString() : "—";
          const endTimestamp = team.completedAt || team.sessionEndedAt || (team.sessionEnded ? team.updatedAt : null);
          const sessionEnd = endTimestamp ? new Date(endTimestamp).toLocaleString() : "—";
          const compTimeMs = getCompletionTime(team);
          const compTimeFormatted = formatDuration(compTimeMs) || "—";
          const teamCumulativeScore = computeTeamAIScore(tId, team.aiScore);

          // Find this team's prompts using authoritative ownership
          const teamPrompts = allPrompts.filter(p => (p.teamId || p.vccId) === tId);
          teamPrompts.sort((a, b) => new Date(a.submittedAt || a.createdAt || 0) - new Date(b.submittedAt || b.createdAt || 0));

          const totalPrompts = teamPrompts.length;
          const evaluatedCount = teamPrompts.filter(p => p.evaluationStatus === "evaluated" || (p.evaluation && typeof p.evaluation.score === "number")).length;

          teamPrompts.forEach((p, idx) => {
            const promptNum = idx + 1;
            const promptId = p.id || p._id || `P-${idx + 1}`;
            const promptText = p.promptText || "";
            const submittedAt = (p.submittedAt || p.createdAt) ? new Date(p.submittedAt || p.createdAt).toLocaleString() : "—";
            const aiTool = p.aiTool || "—";
            const evalStatus = p.evaluationStatus || (p.evaluation ? "evaluated" : "pending");
            const score = p.evaluation && typeof p.evaluation.score === "number" ? p.evaluation.score : "—";
            const level = p.evaluation?.level || "—";
            const reasoning = (p.evaluation?.reasoning || "—").replace(/\s+/g, " ").trim();
            const evaluatedAt = p.evaluation?.evaluatedAt ? new Date(p.evaluation.evaluatedAt).toLocaleString() : "—";
            const provider = p.evaluation?.evaluatorProvider || "—";

            detailedRows.push({
              "Team ID": tId,
              "Team Lead": leader,
              "Lead VTU No.": team.M1_VtuNo || team.m1VtuNo || "—",
              "Branch": team.M1_Branch || team.branch || "—",
              "Member 2": team.M2_Name || "—",
              "M2 VTU No.": team.M2_VtuNo || team.m2VtuNo || "—",
              "Status": status,
              "Session Start": sessionStart,
              "Sprint Duration": compTimeFormatted,
              "Prompt #": promptNum,
              "Prompt ID": promptId,
              "AI Tool": aiTool,
              "Prompt Text": promptText,
              "Characters": promptText.length,
              "Words": promptText ? promptText.trim().split(/\s+/).length : 0,
              "Submitted At": submittedAt,
              "Eval Status": evalStatus,
              "Score /50": score,
              "Rating Level": level,
              "Reasoning": reasoning,
              "Evaluated At": evaluatedAt,
              "Team Score /50": teamCumulativeScore !== null ? teamCumulativeScore : "Not Graded",
              "Total Prompts": totalPrompts,
              "GitHub": team.githubUrl || "—",
              "Live URL": team.deploymentUrl || "—",
              "Interim Score /20": (team.interimScore !== null && team.interimScore !== undefined) ? team.interimScore : "—",
              "Deployment Score /30": (team.deploymentScore !== null && team.deploymentScore !== undefined) ? team.deploymentScore : "—"
            });
          });
        });

        if (detailedRows.length === 0) {
          window.showToast("No submitted prompts found across any team.", "info");
          return;
        }

        const dateStr = new Date().toISOString().slice(0, 10);
        if (typeof XLSX !== "undefined") {
          exportToExcel(detailedRows, `vibeathon_prompt_audit_${dateStr}.xlsx`, "PromptAudit");
          window.showToast(`Exported ${detailedRows.length} prompt audit records to Excel!`, "success");
        } else {
          exportToCSV(detailedRows, `vibeathon_prompt_audit_${dateStr}.csv`);
          window.showToast(`Exported ${detailedRows.length} prompt audit records to CSV.`, "success");
        }
      } catch (err) {
        console.error("Detailed export error:", err);
        window.showToast("Failed to export detailed prompt audit.", "error");
      } finally {
        exportDetailedBtn.disabled = false;
        exportDetailedBtn.innerHTML = originalText;
      }
    });
  }

  /* ==========================
     SCORE SHEET EXPORT
     ========================== */
  function buildScoreSheetRows() {
    return teams
      .filter(t => !(t.isDemo === true || (t.teamId || t.id || t.vccId || '').startsWith('DEMO')))
      .map(team => {
        const tId = team.teamId || team.id || team.vccId || "";
        const aiScore = computeTeamAIScore(tId, team.aiScore);
        const ai = typeof aiScore === 'number' ? aiScore : 0;
        const interim = typeof team.interimScore === 'number' ? team.interimScore : 0;
        const deploy = typeof team.deploymentScore === 'number' ? team.deploymentScore : 0;
        const hasScore = typeof aiScore === 'number' || typeof team.interimScore === 'number' || typeof team.deploymentScore === 'number';
        return {
          "Team ID": tId,
          "Team Leader Name": team.M1_Name || team.leaderName || "—",
          "AI Score /50": aiScore !== null ? aiScore : "—",
          "Interim Score /20": (team.interimScore !== null && team.interimScore !== undefined) ? team.interimScore : "—",
          "Deployment Score /30": (team.deploymentScore !== null && team.deploymentScore !== undefined) ? team.deploymentScore : "—",
          "Total /100": hasScore ? (ai + interim + deploy) : "—"
        };
      })
      .sort((a, b) => {
        const ta = typeof a["Total /100"] === 'number' ? a["Total /100"] : -1;
        const tb = typeof b["Total /100"] === 'number' ? b["Total /100"] : -1;
        return tb - ta;
      });
  }

  const exportScoreSheetExcelBtn = document.getElementById("exportScoreSheetExcelBtn");
  if (exportScoreSheetExcelBtn) {
    exportScoreSheetExcelBtn.addEventListener("click", () => {
      try {
        const rows = buildScoreSheetRows();
        if (rows.length === 0) { window.showToast("No team data to export.", "info"); return; }
        const dateStr = new Date().toISOString().slice(0, 10);
        exportToExcel(rows, `Vibeathon_Score_Sheet_${dateStr}.xlsx`, "Score Sheet");
        window.showToast(`Score Sheet exported for ${rows.length} teams!`, "success");
      } catch (err) {
        console.error("Score Sheet Excel error:", err);
        window.showToast("Failed to export Score Sheet: " + err.message, "error");
      }
    });
  }

  const exportScoreSheetPdfBtn = document.getElementById("exportScoreSheetPdfBtn");
  if (exportScoreSheetPdfBtn) {
    exportScoreSheetPdfBtn.addEventListener("click", () => {
      try {
        const rows = buildScoreSheetRows();
        if (rows.length === 0) { window.showToast("No team data to export.", "info"); return; }
        if (typeof window.jspdf === "undefined" && typeof jsPDF === "undefined") {
          window.showToast("PDF library unavailable.", "error"); return;
        }
        const { jsPDF } = window.jspdf || window;
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const dateStr = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("VIBEATHON 2026 — Score Sheet", 14, 16);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(`Vel Tech University  |  CSE (CS) Hackathon  |  Generated: ${dateStr}`, 14, 23);
        doc.text(`Total Teams: ${rows.length}`, doc.internal.pageSize.getWidth() - 14, 23, { align: "right" });

        doc.setDrawColor(180, 180, 180);
        doc.line(14, 26, doc.internal.pageSize.getWidth() - 14, 26);

        doc.autoTable({
          columns: [
            { header: "#", dataKey: "_rank" },
            { header: "Team ID", dataKey: "Team ID" },
            { header: "Team Leader Name", dataKey: "Team Leader Name" },
            { header: "AI Score /50", dataKey: "AI Score /50" },
            { header: "Interim Score /20", dataKey: "Interim Score /20" },
            { header: "Deployment Score /30", dataKey: "Deployment Score /30" },
            { header: "Total /100", dataKey: "Total /100" }
          ],
          body: rows.map((r, i) => ({ ...r, _rank: i + 1 })),
          startY: 30,
          margin: { left: 14, right: 14 },
          styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
          headStyles: { fillColor: [15, 23, 42], textColor: [200, 200, 255], fontStyle: "bold", fontSize: 9.5 },
          alternateRowStyles: { fillColor: [245, 248, 255] },
          columnStyles: {
            0: { cellWidth: 12, halign: "center", fontStyle: "bold" },
            1: { cellWidth: 35, fontStyle: "bold" },
            2: { cellWidth: 70 },
            3: { cellWidth: 30, halign: "center", fontStyle: "bold" },
            4: { cellWidth: 30, halign: "center", fontStyle: "bold" },
            5: { cellWidth: 35, halign: "center", fontStyle: "bold" },
            6: { cellWidth: 30, halign: "center", fontStyle: "bold" }
          },
          didParseCell(data) {
            if ([3, 4, 5, 6].includes(data.column.index) && data.section === "body") {
              const v = Number(data.cell.raw);
              if (!isNaN(v) && v > 0) {
                data.cell.styles.textColor = v >= 80 ? [22, 163, 74] : v >= 50 ? [217, 119, 6] : [220, 38, 38];
              }
            }
            // Highlight top 3
            if (data.section === "body" && data.column.index === 0) {
              const rank = Number(data.cell.raw);
              if (rank === 1) data.cell.styles.fillColor = [255, 215, 0];
              else if (rank === 2) data.cell.styles.fillColor = [192, 192, 192];
              else if (rank === 3) data.cell.styles.fillColor = [205, 127, 50];
            }
          },
          didDrawPage(data) {
            const pageCount = doc.internal.getNumberOfPages();
            const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(
              `Page ${pageNum} of ${pageCount}  |  Vibeathon 2026  |  Vel Tech University  |  Confidential`,
              doc.internal.pageSize.getWidth() / 2,
              doc.internal.pageSize.getHeight() - 8,
              { align: "center" }
            );
          }
        });

        doc.save(`Vibeathon_Score_Sheet_${new Date().toISOString().slice(0, 10)}.pdf`);
        window.showToast(`Score Sheet PDF generated for ${rows.length} teams!`, "success");
      } catch (err) {
        console.error("Score Sheet PDF error:", err);
        window.showToast("Failed to generate Score Sheet PDF: " + err.message, "error");
      }
    });
  }


  /* ==========================
     RUN AI EVALUATION
     ========================== */
  if (evaluateAIBtn) {
    evaluateAIBtn.addEventListener("click", async () => {
      const confirmed = await window.showConfirmDialog({
        title: "Run Gemini AI Evaluation",
        message: "Run Gemini AI evaluation across all submitted prompts?",
        details: "Gemini AI will score prompt complexity, intent, and relevance across all teams and update the telemetry leaderboard.",
        type: "info",
        confirmText: "Start Evaluation",
        icon: "fas fa-robot"
      });
      if (!confirmed) return;

      evaluateAIBtn.disabled = true;
      evaluateAIBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Evaluating...';

      try {
        const res = await adminFetch(
          "/api/admin/evaluate-prompts",
          { method: "POST" }
        );

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Evaluation failed: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        const r = data.results || {};
        await window.showAlertDialog({
          title: "Gemini AI Evaluation Complete",
          message: "Prompt grading completed successfully across all teams.",
          details: `Total Teams Evaluated: ${r.evaluated || 0}\nSkipped: ${r.skipped || 0}\nFailed: ${r.failed || 0}`,
          type: "success",
          buttonText: "View Leaderboard",
          icon: "fas fa-check-circle"
        });

        await fetchEvaluations();
        renderDashboard();

      } catch (err) {
        console.error("AI evaluation failed:", err);
        await window.showAlertDialog({
          title: "AI Evaluation Notice",
          message: "AI evaluation encountered an issue: " + err.message,
          details: "Check server logs or verify your Gemini API key configuration in Render environment variables.",
          type: "error",
          buttonText: "Dismiss",
          icon: "fas fa-exclamation-circle"
        });
      } finally {
        evaluateAIBtn.disabled = false;
        evaluateAIBtn.innerHTML = '<i class="fas fa-robot"></i> Run AI Evaluation';
      }
    });
  }

  /* ==========================
     SILENT AUTO REFRESH (12s)
     ========================== */
  function startSilentAutoRefresh() {
    if (autoRefreshInterval) return;
    autoRefreshInterval = setInterval(async () => {
      try {
        await fetchEvaluations();
        await fetchPrompts();
        const res = await adminFetch("/api/admin/teams");
        if (res.ok) {
          teams = await res.json();
          renderDashboard();
        }
      } catch (err) {
        // silent
      }
    }, 12000);
  }

  /* ==========================
     MANUAL REFRESH BUTTON
     ========================== */
  const refreshAdminBtn = document.getElementById("refreshAdminBtn");
  if (refreshAdminBtn) {
    refreshAdminBtn.addEventListener("click", async () => {
      const originalHtml = refreshAdminBtn.innerHTML;
      refreshAdminBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      refreshAdminBtn.disabled = true;
      try {
        await fetchEvaluations();
        await fetchPrompts();
        await fetchTeams();
        window.showToast("Leaderboard & AI scores updated!", "success");
      } catch (err) {
        console.error("Refresh error:", err);
        window.showToast("Failed to refresh leaderboard", "error");
      } finally {
        refreshAdminBtn.innerHTML = originalHtml;
        refreshAdminBtn.disabled = false;
      }
    });
  }

  /* ==========================
     BOOTSTRAP
     ========================== */
  (async () => {
    await fetchPrompts();
    await fetchEvaluations();
    await fetchTeams();
    startSilentAutoRefresh();
  })();

});
