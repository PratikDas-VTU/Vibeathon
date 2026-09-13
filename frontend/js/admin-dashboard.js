function enforceAdminAuth() {
  const adminToken = localStorage.getItem("adminToken");
  if (!adminToken) {
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
  const fastestTeamEl = document.getElementById("fastestTeam");

  const searchInput = document.getElementById("searchInput");
  const exportBtn = document.getElementById("exportBtn");
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
      localStorage.removeItem("adminToken");
      localStorage.removeItem("token");
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
    const adminToken = localStorage.getItem("adminToken");
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
  async function fetchTeams() {
    try {
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
    const activeCount = teams.filter(t => t.hackathonStart && !t.sessionEnded).length;
    const submissionCount = teams.filter(t => t.githubUrl || t.deploymentUrl || t.sessionEnded).length;
    const totalPromptsCount = allPrompts.length;

    if (totalTeamsEl) totalTeamsEl.textContent = totalTeamsCount;
    if (activeTeamsEl) activeTeamsEl.textContent = activeCount;
    if (totalSubmissionsEl) totalSubmissionsEl.textContent = submissionCount;
    if (totalPromptsEl) totalPromptsEl.textContent = totalPromptsCount;

    // 2. Prepare teams with computed metrics
    let enrichedTeams = teams.map(team => {
      const tId = team.teamId || team.id || team.vccId;
      const stats = promptStats[tId] || { promptCount: 0, uniqueAITools: 0 };
      const compTime = getCompletionTime(team);
      const evalScore = computeTeamAIScore(tId, team.aiScore);
      const aiScore = typeof evalScore === "number" ? evalScore : (typeof team.aiScore === "number" ? team.aiScore : null);
      const isEvaluating = Boolean(team.aiEvaluating) || (stats.promptCount > 0 && allPrompts.some(p => (p.teamId || p.vccId) === tId && (p.evaluationStatus === "evaluating" || (!p.evaluation && p.evaluationStatus !== "failed"))));

      return {
        ...team,
        teamId: tId,
        promptCount: stats.promptCount,
        uniqueAITools: stats.uniqueAITools,
        completionTime: compTime,
        aiScore: aiScore,
        aiEvaluating: isEvaluating
      };
    });

    // 3. Search Filter
    if (searchQuery) {
      enrichedTeams = enrichedTeams.filter(t => {
        const teamId = (t.teamId || t.id || t.vccId || "").toLowerCase();
        const leader = (t.leaderName || "").toLowerCase();
        const college = (t.college || t.M1_College || "").toLowerCase();
        const email = (t.email || t.M1_Email || "").toLowerCase();
        return teamId.includes(searchQuery) || leader.includes(searchQuery) || college.includes(searchQuery) || email.includes(searchQuery);
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

    // 6. Render Table
    teamTable.innerHTML = "";

    if (rankedTeams.length === 0) {
      teamTable.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-3);">
            No teams match the current criteria.
          </td>
        </tr>
      `;
      return;
    }

    rankedTeams.forEach((team, idx) => {
      const row = document.createElement("tr");

      // Rank badge
      const rankNum = idx + 1;
      let rankClass = "";
      if (rankNum === 1) rankClass = "top-1";
      else if (rankNum === 2) rankClass = "top-2";
      else if (rankNum === 3) rankClass = "top-3";
      const rankLabel = currentFilter === "none" ? "—" : `#${rankNum}`;

      // Status pill
      let statusHtml = "";
      if (team.sessionEnded) {
        statusHtml = `<span class="status-pill ended"><i class="fas fa-check-circle"></i> Completed</span>`;
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
        <td><span class="team-id-chip">${escapeHtml(teamId)}</span></td>
        <td>
          <div class="leader-cell">
            <span class="leader-name">${escapeHtml(team.leaderName || team.M1_Name || "—")}</span>
            <span class="college-name"><i class="fas fa-graduation-cap"></i> ${escapeHtml(collegeDisplay)}</span>
          </div>
        </td>
        <td>${statusHtml}</td>
        <td>${compTimeHtml}</td>
        <td>${delHtml}</td>
        <td>${promptChip}</td>
        <td>${aiScoreHtml}</td>
        <td style="text-align: right;">
          <button class="view-btn" data-id="${escapeHtml(teamId)}" title="Inspect Team Activity & Prompts">
            <i class="fas fa-eye"></i> View
          </button>
        </td>
      `;

      teamTable.appendChild(row);
    });
  }

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
    const duration = formatDuration(getCompletionTime(team));

    teamStats.innerHTML = `
      <div class="m-stat-box">
        <span class="m-stat-label">Session Status</span>
        <span class="m-stat-val ${team.sessionEnded ? "cyan" : team.hackathonStart ? "green" : ""}">
          ${team.sessionEnded ? "Ended" : team.hackathonStart ? "Active" : "Registered"}
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
  async function loadProblemStatementInfo() {
    try {
      const res = await adminFetch("/api/admin/problem-statement");
      if (res.ok) {
        const info = await res.json();
        if (activeFileNameDisplay) {
          if (info.fileName) {
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
        if (problemContextInput && info.text) {
          problemContextInput.value = info.text;
        }

        const adminProblemReleaseToggle = document.getElementById("adminProblemReleaseToggle");
        const adminReleaseToggleLabel = document.getElementById("adminReleaseToggleLabel");
        if (adminProblemReleaseToggle) {
          adminProblemReleaseToggle.checked = Boolean(info.released);
          if (adminReleaseToggleLabel) {
            adminReleaseToggleLabel.textContent = info.released ? "RELEASED" : "LOCKED";
            adminReleaseToggleLabel.style.color = info.released ? "var(--green)" : "var(--rose)";
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

      const formData = new FormData();
      formData.append("problemFile", file);
      if (problemContextInput && problemContextInput.value.trim()) {
        formData.append("contextText", problemContextInput.value.trim());
      }

      uploadFileBtn.disabled = true;
      uploadFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      try {
        const adminToken = localStorage.getItem("adminToken");
        const uploadUrl = window.getApiUrl ? window.getApiUrl("/api/admin/problem-statement/upload") : "/api/admin/problem-statement/upload";
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + adminToken,
            "ngrok-skip-browser-warning": "true"
          },
          body: formData
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error("Upload failed: " + errText);
        }

        const data = await res.json();
        window.showToast(data.message || "Problem statement document uploaded successfully!", "success");
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
    if (!value && value !== 0) return '';
    const str = String(value);
    if (/^[=+\-@|%]/.test(str)) {
      return "'" + str;
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
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
    const isLive = Boolean(team.hackathonStart && !isEnded);
    const status = isEnded ? "Completed" : (isLive ? "Live Sprint" : "Registered");
    const compFormatted = compTime ? formatDuration(compTime) : "—";
    const compMins = compTime ? Math.round(compTime / 60000) : "—";
    const startStr = team.hackathonStart ? new Date(team.hackathonStart).toLocaleString() : "—";
    const endTs = team.completedAt || team.sessionEndedAt || (isEnded ? team.updatedAt : null);
    const endStr = endTs ? new Date(endTs).toLocaleString() : "—";

    let deliverablesStatus = "No Submission";
    if (team.githubUrl && team.deploymentUrl) {
      deliverablesStatus = "Full (Code + Live)";
    } else if (team.githubUrl) {
      deliverablesStatus = "Code Repository Only";
    } else if (team.deploymentUrl) {
      deliverablesStatus = "Live App Only";
    }

    const aiLevel = team.aiLevel || team.evaluation?.level || (aiScore !== null ? (aiScore >= 40 ? "Excellent" : aiScore >= 30 ? "Good" : aiScore >= 20 ? "Basic" : "Very Poor") : "Unrated");
    const aiReasoning = (team.aiReasoning || team.evaluation?.reasoning || "").replace(/\s+/g, " ").trim() || "—";

    return {
      "Team ID": tId,
      "Student 1 Name (Lead)": team.M1_Name || team.leaderName || "",
      "Student 1 VTU No": team.M1_VtuNo || team.m1VtuNo || "",
      "Student 1 Department": team.M1_Branch || team.branch || "",
      "Student 1 Official Email": team.M1_Email || team.email || "",
      "Student 1 Mobile No": team.M1_Phone || team.phone || "",
      "College / Institution": team.college || team.M1_College || "",
      "Student 2 Name (Member)": team.M2_Name || "—",
      "Student 2 VTU No": team.M2_VtuNo || team.m2VtuNo || "—",
      "Student 2 Department": team.M2_Branch || team.m2Branch || "—",
      "Student 2 Official Email": team.M2_Email || team.m2Email || "—",
      "Student 2 Mobile No": team.M2_Phone || team.m2Phone || "—",
      "Team Size": team.teamSize || 2,
      "Session Status": status,
      "Sprint Start": startStr,
      "Sprint End": endStr,
      "Duration": compFormatted,
      "Duration (Mins)": compMins,
      "Total Prompts Logged": stats.promptCount || 0,
      "Unique AI Tools": stats.uniqueAITools || 0,
      "AI Jury Score (0-50)": aiScore !== null ? aiScore : "Not Graded",
      "AI Rating Level": aiLevel,
      "AI Evaluation Summary": aiReasoning,
      "GitHub Repository": team.githubUrl || "Not Submitted",
      "Live Deployment URL": team.deploymentUrl || "Not Submitted",
      "Deliverables Status": deliverablesStatus
    };
  }

  // 1. Export Summary to CSV
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      try {
        const rows = teams.map(buildTelemetryExportRow);
        const dateStr = new Date().toISOString().slice(0, 10);
        exportToCSV(rows, `vibeathon_telemetry_${dateStr}.csv`);
        window.showToast(`Exported telemetry for ${rows.length} teams to CSV.`, "success");
      } catch (err) {
        console.error("Export error:", err);
        window.showToast("Failed to export telemetry data.", "error");
      }
    });
  }

  // 2. Export Summary to Excel (.xlsx)
  const exportExcelBtn = document.getElementById("exportExcelBtn");
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", async () => {
      try {
        const rows = teams.map(buildTelemetryExportRow);
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
          const leader = team.M1_Name || team.leaderName || "—";
          const college = team.college || team.M1_College || "—";
          const teamSize = team.teamSize || 2;
          const status = team.sessionEnded ? "Completed" : (team.hackathonStart ? "Live Sprint" : "Registered");
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
              "Student 1 Lead": leader,
              "Student 1 VTU No": team.M1_VtuNo || team.m1VtuNo || "—",
              "Student 1 Department": team.M1_Branch || team.branch || "—",
              "Student 2 Member": team.M2_Name || "—",
              "Student 2 VTU No": team.M2_VtuNo || team.m2VtuNo || "—",
              "Student 2 Department": team.M2_Branch || team.m2Branch || "—",
              "College": college,
              "Team Status": status,
              "Sprint Start": sessionStart,
              "Sprint End": sessionEnd,
              "Completion Time": compTimeFormatted,
              "Prompt Number": promptNum,
              "Prompt ID": promptId,
              "AI Tool Used": aiTool,
              "Prompt Text": promptText,
              "Prompt Characters": promptText.length,
              "Prompt Words": promptText ? promptText.trim().split(/\s+/).length : 0,
              "Submitted At": submittedAt,
              "Evaluation Status": evalStatus,
              "AI Score (0-50)": score,
              "Score Level": level,
              "Evaluation Reasoning": reasoning,
              "Evaluated At": evaluatedAt,
              "Evaluator Provider": provider,
              "Team Cumulative Score": teamCumulativeScore !== null ? teamCumulativeScore : "Not Graded",
              "Team Total Prompts": totalPrompts,
              "GitHub Repository": team.githubUrl || "—",
              "Live Deployment": team.deploymentUrl || "—"
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
