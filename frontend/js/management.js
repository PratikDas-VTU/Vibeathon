/**
 * VIBEATHON 2.0 - SUPER MANAGEMENT CONSOLE CONTROLLER
 * Full management of participants, credentials, sessions, demo generation, and AI rubric.
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Session Verification
  // FIX MED-1: use sessionStorage only — localStorage persists indefinitely and
  // would expose the admin token to any future XSS on the same origin.
  const token = sessionStorage.getItem("adminToken");
  if (!token) {
    // Clean up any stale localStorage token left from older versions
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    window.location.replace("manage-login.html");
    return;
  }

  const adminUser = sessionStorage.getItem("adminUser") || "admin";
  const currentAdminUserDisplay = document.getElementById("currentAdminUserDisplay");
  if (currentAdminUserDisplay) currentAdminUserDisplay.value = adminUser;

  // Cached state
  let allTeamsData = [];
  let currentSettings = {};

  // 2. Network Fetch Helper
  async function manageFetch(endpoint, options = {}) {
    const defaultHeaders = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    if (options.body instanceof FormData) {
      delete defaultHeaders["Content-Type"];
    }

    const fullUrl = (typeof window !== "undefined" && window.getApiUrl) 
      ? window.getApiUrl(endpoint) 
      : endpoint;


    try {
      let res = await fetch(fullUrl, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...(options.headers || {})
        }
      });

      // Cold start mitigation for 502/504 gateway timeout
      if (res.status === 502 || res.status === 504) {
        console.warn(`Gateway 502/504 for ${endpoint}. Retrying directly against Render backend...`);
        const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        const directUrl = `https://vibeathon-backend-g210.onrender.com${cleanEndpoint}`;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        res = await fetch(directUrl, {
          ...options,
          headers: {
            ...defaultHeaders,
            ...(options.headers || {})
          }
        });
      }

      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem("adminToken");
        localStorage.removeItem("adminToken");
        sessionStorage.removeItem("adminUser");
        localStorage.removeItem("adminUser");
        showToast("Session expired or unauthorized. Please re-login.", "error");
        setTimeout(() => window.location.replace("manage-login.html"), 1000);
        return null;
      }

      return res;
    } catch (err) {
      console.error(`Fetch error for ${endpoint}:`, err);
      showToast("Network error communicating with server.", "error");
      return null;
    }
  }

  // Utility: HTML-escape untrusted strings before injecting into innerHTML
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = String(str == null ? "" : str);
    return d.innerHTML;
  }

  // 3. Toast Notifications
  function showToast(message, type = "info") {
    if (window.showToast && window.showToast !== showToast) {
      window.showToast(message, type);
      return;
    }
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    // SECURITY: whitelist icon names to prevent injection; escape message
    const ALLOWED_ICONS = { "info": "info-circle", "success": "check-circle", "error": "exclamation-circle", "warning": "exclamation-triangle" };
    const icon = ALLOWED_ICONS[type] || "info-circle";

    // FIX HIGH-3: was `${message}` — now escaped to prevent XSS
    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // 3. Tab Navigation Switching
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      if (!target) return;

      tabButtons.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPanel = document.getElementById(`tab-${target}`);
      if (targetPanel) targetPanel.classList.add("active");

      // Auto-refresh contextual data when switching tabs
      if (target === "participants") loadParticipants();
      if (target === "sessions") loadSettings();
      if (target === "problem") loadProblemStatementData();
      if (target === "logs") loadAuditLogs();
    });
  });

  // 4. Quick Refresh Button
  const refreshAllBtn = document.getElementById("refreshAllBtn");
  if (refreshAllBtn) {
    refreshAllBtn.addEventListener("click", () => {
      loadParticipants();
      loadSettings();
      showToast("Data refreshed from cloud database", "info");
    });
  }

  // 5. Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem("adminToken");
      localStorage.removeItem("adminToken");
      sessionStorage.removeItem("adminUser");
      localStorage.removeItem("adminUser");
      sessionStorage.clear();
      window.location.replace("manage-login.html");
    });
  }

  // =========================================================================
  // TAB 1: PARTICIPANTS & CREDENTIALS
  // =========================================================================
  const teamsTableBody = document.getElementById("teamsTableBody");
  const participantSearch = document.getElementById("participantSearch");
  const refreshTeamsBtn = document.getElementById("refreshTeamsBtn");

  async function loadParticipants() {
    if (teamsTableBody) {
      teamsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-2);"><i class="fas fa-spinner fa-spin"></i> Loading participant roster...</td></tr>`;
    }

    const res = await manageFetch("/api/manage/teams");
    if (!res) return;

    const data = await res.json();
    if (data.success && Array.isArray(data.teams)) {
      allTeamsData = data.teams;
      updateStats(allTeamsData);
      renderTeams(allTeamsData);
      syncDemoCredentialsList();
    } else {
      if (teamsTableBody) {
        teamsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--rose);">Failed to load teams: ${data.message || "Unknown error"}</td></tr>`;
      }
    }
  }

  function syncDemoCredentialsList() {
    if (!allTeamsData) return;
    const demoTeams = allTeamsData.filter(t => t.isDemo === true || ((t.id || t.teamId || t.vccId) && (t.id || t.teamId || t.vccId).toUpperCase().startsWith("DEMO")));
    if (demoTeams.length > 0) {
      activeDemoList = demoTeams.map(t => {
        const teamId = t.id || t.teamId || t.vccId;
        return {
          id: teamId,
          teamId: teamId,
          vccId: teamId,
          email: t.M1_Email,
          password: t.M1_Phone || "demo12345",
          leader: t.M1_Name
        };
      }).sort((a, b) => (a.id || a.teamId || "").localeCompare(b.id || b.teamId || "", undefined, { numeric: true }));
      renderDemoList(activeDemoList);
    } else {
      activeDemoList = [];
      if (demoCredentialsSection) demoCredentialsSection.style.display = "none";
    }
  }

  function updateStats(teams) {
    const total = teams.length;
    const active = teams.filter(t => t.hackathonStart && !t.sessionEnded).length;
    const submitted = teams.filter(t => t.githubUrl || t.deploymentUrl).length;
    const demo = teams.filter(t => t.isDemo || ((t.id || t.teamId || t.vccId) && (t.id || t.teamId || t.vccId).toUpperCase().startsWith("DEMO"))).length;
    const blocked = teams.filter(t => t.blocked === true).length;

    const statTotal = document.getElementById("statTotalTeams");
    const statActive = document.getElementById("statActiveTeams");
    const statSub = document.getElementById("statSubmissions");
    const statDemo = document.getElementById("statDemoTeams");
    const statBlocked = document.getElementById("statBlockedTeams");

    if (statTotal) statTotal.textContent = total;
    if (statActive) statActive.textContent = active;
    if (statSub) statSub.textContent = submitted;
    if (statDemo) statDemo.textContent = demo;
    if (statBlocked) statBlocked.textContent = blocked;
  }

  function formatDisplayEmail(emailStr) {
    if (!emailStr || typeof emailStr !== "string") return "—";
    return emailStr.replace(/^demo_demo_/i, "demo_");
  }

  function formatBranchWithLineBreak(branchStr) {
    if (!branchStr) return "";
    const escaped = escapeHtml(branchStr);
    return escaped.replace(
      /(Artificial\s+Intelligence)(\s*(?:-?\s*and\s*Machine\s*Learning|&amp;?\s*Machine\s*Learning))/i,
      (match, p1, p2) => `${p1}<br>${p2}`
    );
  }

  function renderTeams(teams) {
    if (!teamsTableBody) return;

    if (teams.length === 0) {
      teamsTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-3);">No matching teams found.</td></tr>`;
      return;
    }

    teamsTableBody.innerHTML = teams.map(t => {
      const teamId = t.id || t.teamId || t.vccId || "—";
      const isEnded = Boolean(t.sessionEnded);
      const isLive = Boolean(t.hackathonStart && !isEnded);
      const isDemo = Boolean(t.isDemo || (teamId && teamId.startsWith("DEMO")));
      const displayEmail = formatDisplayEmail(t.M1_Email);

      // Live sprint remaining time calculation
      let remainingStr = "";
      if (isLive && t.hackathonStart) {
        const startMs = new Date(t.hackathonStart).getTime();
        const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
        const totalSec = 2 * 60 * 60; // 2 hour duration
        const remSec = Math.max(0, totalSec - elapsedSec);
        const remH = Math.floor(remSec / 3600);
        const remM = Math.floor((remSec % 3600) / 60);
        remainingStr = `${remH}h ${remM}m left`;
      }

      // Online activity beacon (active in last 4 mins)
      let isOnline = false;
      if (t.lastActiveAt) {
        const diffMs = Date.now() - new Date(t.lastActiveAt).getTime();
        if (diffMs < 4 * 60 * 1000) isOnline = true;
      }

      // Status pill determination
      let statusBadge = "";
      const isBlocked = Boolean(t.blocked === true);
      if (isBlocked) {
        statusBadge = `<span class="status-pill blocked" style="background:rgba(239,68,68,0.18); color:#f87171; border:1px solid rgba(239,68,68,0.4); font-weight:700;" title="SUSPENDED: ${escapeHtml(t.blockReason || 'Security violation detected')}"><i class="fas fa-ban"></i> SUSPENDED</span>`;
      } else if (isEnded) {
        statusBadge = `<span class="status-pill ended"><i class="fas fa-flag-checkered"></i> CONCLUDED</span>`;
      } else if (isLive) {
        statusBadge = `<span class="status-pill active"><span class="online-beacon"></span> LIVE SPRINT ${remainingStr ? `(${remainingStr})` : ''}</span>`;
      } else {
        statusBadge = `<span class="status-pill standby"><span class="offline-beacon"></span> OFFLINE (Standby)</span>`;
      }

      if (isDemo) {
        statusBadge += ` <span class="status-pill demo-tag">DEMO</span>`;
      }

      const hasGithub = Boolean(t.githubUrl);
      const hasDeploy = Boolean(t.deploymentUrl);
      let deliverableSummary = '<div class="deliv-wrap">';
      if (hasGithub) {
        deliverableSummary += `<a href="${escapeHtml(formatExternalUrl(t.githubUrl))}" target="_blank" rel="noopener noreferrer" class="deliv-chip gh-active" title="Open GitHub Repo (${escapeHtml(t.githubUrl)})"><i class="fab fa-github"></i> GH</a>`;
      } else {
        deliverableSummary += `<span class="deliv-chip pending" title="GitHub not submitted"><i class="fab fa-github"></i> —</span>`;
      }

      if (hasDeploy) {
        deliverableSummary += `<a href="${escapeHtml(formatExternalUrl(t.deploymentUrl))}" target="_blank" rel="noopener noreferrer" class="deliv-chip dep-active" title="Open Live Application (${escapeHtml(t.deploymentUrl)})"><i class="fas fa-external-link-alt"></i> Live</a>`;
      } else {
        deliverableSummary += `<span class="deliv-chip pending" title="Live demo not submitted"><i class="fas fa-external-link-alt"></i> —</span>`;
      }
      deliverableSummary += '</div>';

      const beaconIcon = isOnline 
        ? `<span class="online-beacon" title="Connected: Active within last 4 minutes" style="margin-right:6px;"></span>`
        : `<span class="offline-beacon" title="Offline / Idle: No recent activity" style="margin-right:6px;"></span>`;

      // Compact AI Score badge
      let aiScoreBadge = '<span class="ai-score-pill none">—</span>';
      if (t.aiEvaluating) {
        aiScoreBadge = `<span class="ai-score-pill evaluating" title="AI evaluation in progress"><i class="fas fa-spinner fa-spin"></i> Eval...</span>`;
      } else if (typeof t.aiScore === "number") {
        const normScore = t.aiScore > 50 ? Math.round(t.aiScore / 2) : t.aiScore;
        aiScoreBadge = `<span class="ai-score-pill" title="AI Score: ${normScore}/50"><i class="fas fa-bolt"></i> ${normScore}/50</span>`;
      }

      return `
        <tr class="${isBlocked ? 'row-suspended' : ''}">
          <td class="col-id"><span class="team-badge ${isBlocked ? 'badge-suspended' : ''}">${teamId}</span></td>
          <td class="col-leader">
            <div style="font-weight: 600; color: var(--text-1); display:flex; align-items:center; line-height:1.35; word-break:break-word;">
              ${beaconIcon} <span>${escapeHtml(t.M1_Name || "Team Leader")}</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-3); padding-left: 14px; line-height:1.35; word-break:break-word; margin-top:2px;">
              ${escapeHtml(t.college || "—")}${t.M1_Branch ? ` · ${formatBranchWithLineBreak(t.M1_Branch)}` : ''}
            </div>
            ${t.M2_Name ? `
            <div style="font-size: 0.70rem; color: var(--cyan); padding-left: 14px; margin-top:3px; line-height:1.35; word-break:break-word;">
              <i class="fas fa-user-friends"></i> ${escapeHtml(t.M2_Name)}${t.M2_VtuNo ? ` [${escapeHtml(t.M2_VtuNo)}]` : ''}${t.M2_Branch ? ` · ${formatBranchWithLineBreak(t.M2_Branch)}` : ''}
            </div>` : ''}
          </td>
          <td class="col-email">
            <span class="cred-chip" title="${escapeHtml(displayEmail)}"><i class="far fa-envelope"></i> ${escapeHtml(displayEmail)}</span>
          </td>
          <td class="col-phone">
            <span class="cred-chip"><i class="fas fa-key"></i> ${escapeHtml(t.M1_Phone || "—")}</span>
          </td>
          <td class="col-status">${statusBadge}</td>
          <td class="col-deliv">${deliverableSummary}</td>
          <td class="col-score">${aiScoreBadge}</td>
          <td class="col-actions actions-cell">
            <div class="actions-wrap">
              ${isBlocked ? `
              <!-- UNBLOCK BUTTON FOR SUSPENDED TEAMS -->
              <button class="btn btn-success btn-sm js-team-unblock" data-id="${escapeHtml(teamId)}" title="Unblock Team & Restore Access" style="background:var(--green); color:#000; font-weight:700;">
                <i class="fas fa-unlock"></i> Unblock
              </button>
              ` : `
              <button class="btn btn-secondary btn-sm js-team-edit" data-id="${escapeHtml(teamId)}" title="Edit Credentials">
                <i class="fas fa-edit"></i> Edit
              </button>
              <button class="btn btn-warning btn-sm js-team-reset" data-id="${escapeHtml(teamId)}" title="Reset Timer / Session">
                <i class="fas fa-undo"></i> Reset
              </button>
              <button class="btn btn-danger btn-sm js-team-block" data-id="${escapeHtml(teamId)}" title="Suspend Team Account" style="opacity:0.85;">
                <i class="fas fa-ban"></i>
              </button>
              `}
              <button class="btn btn-danger btn-sm js-team-delete" data-id="${escapeHtml(teamId)}" title="Delete Team">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Event delegation for team action buttons (Edit, Reset, Delete, Unblock, Block)
  if (teamsTableBody) {
    teamsTableBody.addEventListener("click", (e) => {
      const editBtn = e.target.closest(".js-team-edit");
      const resetBtn = e.target.closest(".js-team-reset");
      const deleteBtn = e.target.closest(".js-team-delete");
      const unblockBtn = e.target.closest(".js-team-unblock");
      const blockBtn = e.target.closest(".js-team-block");

      if (unblockBtn) {
        const teamId = unblockBtn.dataset.id;
        if (teamId && window.unblockTeamSingle) window.unblockTeamSingle(teamId);
      } else if (blockBtn) {
        const teamId = blockBtn.dataset.id;
        if (teamId && window.blockTeamSingle) window.blockTeamSingle(teamId);
      } else if (editBtn) {
        const teamId = editBtn.dataset.id;
        if (teamId && window.openEditTeamModal) window.openEditTeamModal(teamId);
      } else if (resetBtn) {
        const teamId = resetBtn.dataset.id;
        if (teamId && window.resetTeamSessionSingle) window.resetTeamSessionSingle(teamId);
      } else if (deleteBtn) {
        const teamId = deleteBtn.dataset.id;
        if (teamId && window.deleteTeamSingle) window.deleteTeamSingle(teamId);
      }
    });
  }

  // Filter Search
  if (participantSearch) {
    participantSearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderTeams(allTeamsData);
        return;
      }
      const filtered = allTeamsData.filter(t => {
        const teamId = (t.id || t.teamId || t.vccId || "").toLowerCase();
        return (
          teamId.includes(q) ||
          (t.M1_Name && t.M1_Name.toLowerCase().includes(q)) ||
          (t.M1_Email && t.M1_Email.toLowerCase().includes(q)) ||
          (t.M1_Phone && t.M1_Phone.toLowerCase().includes(q)) ||
          (t.M1_Branch && t.M1_Branch.toLowerCase().includes(q)) ||
          (t.M2_Name && t.M2_Name.toLowerCase().includes(q)) ||
          (t.M2_VtuNo && t.M2_VtuNo.toLowerCase().includes(q)) ||
          (t.M2_Email && t.M2_Email.toLowerCase().includes(q)) ||
          (t.college && t.college.toLowerCase().includes(q)) ||
          (t.blocked && ("suspended".includes(q) || "blocked".includes(q) || (t.blockReason && t.blockReason.toLowerCase().includes(q))))
        );
      });
      renderTeams(filtered);
    });
  }

  if (refreshTeamsBtn) refreshTeamsBtn.addEventListener("click", loadParticipants);

  // Edit Participant Modal
  const editTeamModal = document.getElementById("editTeamModal");
  const editTeamForm = document.getElementById("editTeamForm");
  const closeEditModalBtn = document.getElementById("closeEditModalBtn");
  const cancelEditModalBtn = document.getElementById("cancelEditModalBtn");

  window.openEditTeamModal = (teamId) => {
    const team = allTeamsData.find(t => (t.id || t.teamId || t.vccId) === teamId);
    if (!team) return;

    const modalTitleEl = document.getElementById("editModalTeamId") || document.getElementById("editModalVccId");
    if (modalTitleEl) modalTitleEl.textContent = teamId;

    const hiddenIdEl = document.getElementById("editTeamId") || document.getElementById("editVccId");
    if (hiddenIdEl) hiddenIdEl.value = teamId;

    document.getElementById("editLeaderName").value = team.M1_Name || "";
    document.getElementById("editCollege").value = team.college || "";
    document.getElementById("editEmail").value = team.M1_Email || "";
    document.getElementById("editPassword").value = team.M1_Phone || "";
    document.getElementById("editBranch").value = team.M1_Branch || "";
    const m1VtuEl = document.getElementById("editM1VtuNo");
    if (m1VtuEl) m1VtuEl.value = team.M1_VtuNo || "";

    const m2NameEl = document.getElementById("editM2Name");
    if (m2NameEl) m2NameEl.value = team.M2_Name || "";
    const m2VtuEl = document.getElementById("editM2VtuNo");
    if (m2VtuEl) m2VtuEl.value = team.M2_VtuNo || "";
    const m2BranchEl = document.getElementById("editM2Branch");
    if (m2BranchEl) m2BranchEl.value = team.M2_Branch || "";
    const m2EmailEl = document.getElementById("editM2Email");
    if (m2EmailEl) m2EmailEl.value = team.M2_Email || "";
    const m2PhoneEl = document.getElementById("editM2Phone");
    if (m2PhoneEl) m2PhoneEl.value = team.M2_Phone || "";
    const m2CollegeEl = document.getElementById("editM2College");
    if (m2CollegeEl) m2CollegeEl.value = team.M2_College || "";

    if (editTeamModal) editTeamModal.classList.add("show");
  };

  function closeEditModal() {
    if (editTeamModal) editTeamModal.classList.remove("show");
  }

  if (closeEditModalBtn) closeEditModalBtn.addEventListener("click", closeEditModal);
  if (cancelEditModalBtn) cancelEditModalBtn.addEventListener("click", closeEditModal);

  if (editTeamForm) {
    editTeamForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const idEl = document.getElementById("editTeamId") || document.getElementById("editVccId");
      const teamId = idEl ? idEl.value : "";
      const updates = {
        M1_Name: document.getElementById("editLeaderName").value.trim(),
        college: document.getElementById("editCollege").value.trim(),
        M1_Email: document.getElementById("editEmail").value.trim().toLowerCase(),
        M1_Phone: document.getElementById("editPassword").value.trim(),
        password: document.getElementById("editPassword").value.trim(),
        teamSize: parseInt(document.getElementById("editTeamSize").value) || 2,
        M1_Branch: document.getElementById("editBranch").value.trim(),
        M1_VtuNo: (document.getElementById("editM1VtuNo")?.value || "").trim()
      };

      const m2NameVal = (document.getElementById("editM2Name")?.value || "").trim();
      if (m2NameVal) {
        updates.M2_Name = m2NameVal;
        updates.M2_VtuNo = (document.getElementById("editM2VtuNo")?.value || "").trim();
        updates.M2_Branch = (document.getElementById("editM2Branch")?.value || "").trim();
        updates.M2_Email = (document.getElementById("editM2Email")?.value || "").trim().toLowerCase();
        updates.M2_Phone = (document.getElementById("editM2Phone")?.value || "").trim();
        updates.M2_College = (document.getElementById("editM2College")?.value || "").trim();
      }

      const btn = document.getElementById("saveTeamChangesBtn");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      }

      const res = await manageFetch(`/api/manage/teams/${teamId}`, {
        method: "PUT",
        body: JSON.stringify(updates)
      });

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Save & Sync to Firebase';
      }

      if (res && res.ok) {
        showToast(`Team ${teamId} updated successfully!`, "success");
        closeEditModal();
        loadParticipants();
      } else {
        showToast(`Failed to update team ${teamId}.`, "error");
      }
    });
  }

  // Single Team Reset
  window.resetTeamSessionSingle = async (teamId) => {
    const confirmed = await window.showConfirmDialog({
      title: "Reset Team Countdown",
      message: `Reset session and 2-hour countdown for Team ${teamId}?`,
      details: "This unlocks their dashboard terminal and restarts their 2-hour timer back to 2:00:00.",
      type: "warning",
      confirmText: "Reset Countdown",
      icon: "fas fa-history"
    });
    if (!confirmed) return;

    const res = await manageFetch(`/api/manage/teams/${teamId}/reset`, { method: "POST" });
    if (res && res.ok) {
      showToast(`Team ${teamId} timer reset and session unlocked!`, "success");
      loadParticipants();
    }
  };

  // Single Team Delete
  window.deleteTeamSingle = async (teamId) => {
    const confirmed = await window.showConfirmDialog({
      title: "Delete Team Account",
      message: `Are you sure you want to completely delete Team ${teamId}?`,
      details: "This removes their login credentials, team roster, and all database records. This action cannot be undone.",
      type: "danger",
      confirmText: "Delete Team",
      icon: "fas fa-trash-alt"
    });
    if (!confirmed) return;

    const res = await manageFetch(`/api/manage/teams/${teamId}`, { method: "DELETE" });
    if (res && res.ok) {
      showToast(`Team ${teamId} deleted.`, "success");
      loadParticipants();
    }
  };

  // Single Team Unblock (Organizer Recovery Action)
  window.unblockTeamSingle = async (teamId) => {
    const confirmed = await window.showConfirmDialog({
      title: "Restore & Unblock Team Access",
      message: `Are you sure you want to unblock Team ${teamId}?`,
      details: "This will remove the automated security suspension, clear rate-limit violation penalties, and immediately re-enable their dashboard and terminal access.",
      type: "success",
      confirmText: "Unblock & Restore Access",
      icon: "fas fa-unlock"
    });
    if (!confirmed) return;

    let res = await manageFetch(`/api/manage/teams/${teamId}/unblock`, {
      method: "POST",
      body: JSON.stringify({})
    });

    // Resilient Fallback: If Render backend does not have the dedicated /unblock route yet (404),
    // update the team's suspension flags directly via PUT /api/manage/teams/:id
    if (!res || !res.ok) {
      console.warn(`[Unblock] POST /teams/${teamId}/unblock returned ${res?.status || 'error'}, applying PUT fallback...`);
      res = await manageFetch(`/api/manage/teams/${teamId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocked: false,
          blockReason: null,
          blockDetails: null,
          unblockedAt: new Date().toISOString()
        })
      });
    }

    if (res && res.ok) {
      showToast(`Team ${teamId} has been successfully restored and unblocked!`, "success");
      const t = allTeamsData.find(x => (x.id || x.teamId || x.vccId) === teamId);
      if (t) {
        t.blocked = false;
        t.blockReason = null;
        t.blockDetails = null;
        t.unblockedAt = new Date().toISOString();
      }
      updateStats(allTeamsData);
      renderTeams(allTeamsData);
      loadParticipants();
    } else {
      showToast(`Failed to unblock Team ${teamId}.`, "error");
    }
  };

  // Single Team Manual Suspend / Block
  window.blockTeamSingle = async (teamId) => {
    const confirmed = await window.showConfirmDialog({
      title: "Suspend Team Account",
      message: `Manually suspend Team ${teamId}?`,
      details: "This blocks the team from submitting prompts, deliverables, or accessing sprint features, and cancels any pending evaluation jobs.",
      type: "danger",
      confirmText: "Suspend Team",
      icon: "fas fa-ban"
    });
    if (!confirmed) return;

    let res = await manageFetch(`/api/manage/teams/${teamId}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Administrative suspension by organizer" })
    });

    // Resilient Fallback: If Render backend does not have the dedicated /block route yet (404),
    // apply PUT fallback directly
    if (!res || !res.ok) {
      console.warn(`[Block] POST /teams/${teamId}/block returned ${res?.status || 'error'}, applying PUT fallback...`);
      res = await manageFetch(`/api/manage/teams/${teamId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocked: true,
          blockReason: "Administrative suspension by organizer",
          blockDetails: "Manually suspended by organizer from Management Console",
          blockedAt: new Date().toISOString()
        })
      });
    }

    if (res && res.ok) {
      showToast(`Team ${teamId} account suspended.`, "warning");
      const t = allTeamsData.find(x => (x.id || x.teamId || x.vccId) === teamId);
      if (t) {
        t.blocked = true;
        t.blockReason = "Administrative suspension by organizer";
        t.blockedAt = new Date().toISOString();
      }
      updateStats(allTeamsData);
      renderTeams(allTeamsData);
      loadParticipants();
    } else {
      showToast(`Failed to suspend Team ${teamId}.`, "error");
    }
  };

  // Add New Team Modal
  const addTeamModal = document.getElementById("addTeamModal");
  const addTeamBtn = document.getElementById("addTeamBtn");
  const addTeamForm = document.getElementById("addTeamForm");
  const closeAddModalBtn = document.getElementById("closeAddModalBtn");
  const cancelAddModalBtn = document.getElementById("cancelAddModalBtn");

  if (addTeamBtn && addTeamModal) {
    addTeamBtn.addEventListener("click", () => addTeamModal.classList.add("show"));
  }

  function closeAddModal() {
    if (addTeamModal) addTeamModal.classList.remove("show");
  }

  if (closeAddModalBtn) closeAddModalBtn.addEventListener("click", closeAddModal);
  if (cancelAddModalBtn) cancelAddModalBtn.addEventListener("click", closeAddModal);

  if (addTeamForm) {
    addTeamForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const addInput = document.getElementById("addTeamId") || document.getElementById("addVccId");
      const teamId = addInput.value.trim().toUpperCase();
      const payload = {
        id: teamId,
        teamId: teamId,
        vccId: teamId,
        leaderName: document.getElementById("addLeaderName").value.trim(),
        email: document.getElementById("addEmail").value.trim().toLowerCase(),
        password: document.getElementById("addPassword").value.trim(),
        college: document.getElementById("addCollege").value.trim(),
        teamSize: parseInt(document.getElementById("addTeamSize").value) || 2
      };

      const btn = document.getElementById("createTeamSubmitBtn");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
      }

      const res = await manageFetch("/api/manage/teams", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Create & Register';
      }

      if (res && res.ok) {
        showToast(`Team ${payload.teamId || payload.id || payload.vccId} registered and live!`, "success");
        closeAddModal();
        addTeamForm.reset();
        loadParticipants();
      } else {
        const errData = res ? await res.json() : {};
        showToast(errData.message || "Failed to create team.", "error");
      }
    });
  }

  // =========================================================================
  // TAB 2: DEMO GENERATOR
  // =========================================================================
  const demoGenForm = document.getElementById("demoGenForm");
  const purgeDemoBtn = document.getElementById("purgeDemoBtn");
  const demoCredentialsSection = document.getElementById("demoCredentialsSection");
  const demoTableBody = document.getElementById("demoTableBody");
  const copyAllDemoBtn = document.getElementById("copyAllDemoBtn");
  let activeDemoList = [];

  if (demoGenForm) {
    demoGenForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const count = parseInt(document.getElementById("demoCount").value) || 10;
      if (count < 1 || count > 200) {
        showToast("Please enter a count between 1 and 200.", "warning");
        return;
      }
      const prefix = document.getElementById("demoPrefix").value.trim() || "DEMO";
      const password = document.getElementById("demoPassword").value.trim() || "demo12345";

      const btn = document.getElementById("generateDemoSubmitBtn");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Provisioning ${count} accounts...`;
      }

      const res = await manageFetch("/api/manage/demo-credentials", {
        method: "POST",
        body: JSON.stringify({ count, prefix, password })
      });

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bolt"></i> Generate Demo Credentials';
      }

      if (res && res.ok) {
        const data = await res.json();
        showToast(`Provisioned ${data.demoTeams?.length || 0} demo accounts!`, "success");
        await loadParticipants();
      } else {
        const errData = res ? await res.json().catch(() => ({})) : {};
        showToast(errData.message || "Failed to generate demo accounts.", "error");
      }
    });
  }

  function renderDemoList(list) {
    if (!demoCredentialsSection || !demoTableBody) return;
    const badge = document.getElementById("demoListCountBadge");
    if (badge) {
      badge.textContent = list.length > 0 ? `(${list.length} active)` : "";
    }
    if (list.length === 0) {
      demoCredentialsSection.style.display = "none";
      return;
    }

    demoCredentialsSection.style.display = "block";
    // FIX HIGH-2: escape teamId and use data-copy with event delegation instead of inline onclick
    demoTableBody.innerHTML = list.map(item => `
      <tr>
        <td><span class="team-badge">${escapeHtml(item.teamId || item.id || item.vccId)}</span></td>
        <td><code>${escapeHtml(item.email)}</code></td>
        <td><code>${escapeHtml(item.password)}</code></td>
        <td>
          <button class="btn btn-secondary btn-sm js-copy-demo" data-copy="${escapeHtml(`${item.email} | ${item.password}`)}">
            <i class="far fa-copy"></i> Copy
          </button>
        </td>
      </tr>
    `).join("");
  }

  // FIX HIGH-2: Event delegation for demo copy buttons (replaces inline onclick)
  if (demoTableBody) {
    demoTableBody.addEventListener("click", (e) => {
      const copyBtn = e.target.closest(".js-copy-demo");
      if (copyBtn && copyBtn.dataset.copy) {
        navigator.clipboard.writeText(copyBtn.dataset.copy);
        showToast("Demo credentials copied to clipboard!", "success");
      }
    });
  }

  if (copyAllDemoBtn) {
    copyAllDemoBtn.addEventListener("click", () => {
      if (activeDemoList.length === 0) return;
      const text = activeDemoList.map(d => `Team ID: ${d.teamId || d.id || d.vccId} | Email: ${d.email} | Password: ${d.password}`).join("\n");
      navigator.clipboard.writeText(text);
      showToast("All demo credentials copied to clipboard!", "success");
    });
  }

  if (purgeDemoBtn) {
    purgeDemoBtn.addEventListener("click", async () => {
      const prefix = document.getElementById("demoPrefix").value.trim() || "DEMO";
      const confirmed = await window.showConfirmDialog({
        title: "Purge Demo Accounts",
        message: `Delete all demo accounts with prefix "${prefix}"?`,
        details: "Real registered participant accounts will NOT be affected. This will purge demo testing credentials from the database.",
        type: "danger",
        confirmText: "Purge Demo Accounts",
        icon: "fas fa-trash-alt"
      });
      if (!confirmed) return;

      const res = await manageFetch(`/api/manage/demo-credentials?prefix=${prefix}`, { method: "DELETE" });
      if (res && res.ok) {
        const data = await res.json();
        showToast(`Deleted ${data.deletedCount} demo accounts.`, "success");
        activeDemoList = [];
        if (demoCredentialsSection) demoCredentialsSection.style.display = "none";
        loadParticipants();
      }
    });
  }

  // =========================================================================
  // TAB 3: GLOBAL SESSIONS & CONTROLS
  // =========================================================================
  const resetConfirmModal = document.getElementById("resetConfirmModal");
  const quickResetAllBtn = document.getElementById("quickResetAllBtn");
  const triggerResetAllSessionsBtn = document.getElementById("triggerResetAllSessionsBtn");
  const closeResetConfirmBtn = document.getElementById("closeResetConfirmBtn");
  const cancelResetBtn = document.getElementById("cancelResetBtn");
  const confirmExecuteResetBtn = document.getElementById("confirmExecuteResetBtn");

  function openResetConfirm() {
    if (resetConfirmModal) resetConfirmModal.classList.add("show");
  }
  function closeResetConfirm() {
    if (resetConfirmModal) resetConfirmModal.classList.remove("show");
  }

  if (quickResetAllBtn) quickResetAllBtn.addEventListener("click", openResetConfirm);
  if (triggerResetAllSessionsBtn) triggerResetAllSessionsBtn.addEventListener("click", openResetConfirm);
  if (closeResetConfirmBtn) closeResetConfirmBtn.addEventListener("click", closeResetConfirm);
  if (cancelResetBtn) cancelResetBtn.addEventListener("click", closeResetConfirm);

  if (confirmExecuteResetBtn) {
    confirmExecuteResetBtn.addEventListener("click", async () => {
      confirmExecuteResetBtn.disabled = true;
      confirmExecuteResetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting all teams...';

      const res = await manageFetch("/api/manage/reset-all-sessions", { method: "POST" });
      confirmExecuteResetBtn.disabled = false;
      confirmExecuteResetBtn.innerHTML = 'Yes, Reset All Sessions';
      closeResetConfirm();

      if (res && res.ok) {
        const data = await res.json();
        showToast(`Success! Reset sessions for all ${data.totalReset} teams.`, "success");
        loadParticipants();
      }
    });
  }

  // Reset Submissions Only
  const resetSubmissionsOnlyBtn = document.getElementById("resetSubmissionsOnlyBtn");
  if (resetSubmissionsOnlyBtn) {
    resetSubmissionsOnlyBtn.addEventListener("click", async () => {
      const confirmed = await window.showConfirmDialog({
        title: "Reset All Submissions & AI Scores",
        message: "Wipe all GitHub URLs, Live App URLs, and submitted AI prompts across all teams?",
        details: "AI scores will reset to unrated (—) and prompt counters will drop to 0. Participant accounts, passwords, and timers will remain intact for fresh testing.",
        type: "danger",
        confirmText: "Wipe Submissions & AI Scores",
        icon: "fas fa-trash-alt"
      });
      if (!confirmed) return;

      resetSubmissionsOnlyBtn.disabled = true;
      resetSubmissionsOnlyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting submissions...';

      const res = await manageFetch("/api/manage/reset-all-submissions", {
        method: "POST",
        body: JSON.stringify({ includeTimers: false })
      });

      resetSubmissionsOnlyBtn.disabled = false;
      resetSubmissionsOnlyBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Reset Submissions & AI Scores Only';

      if (res && res.ok) {
        const data = await res.json();
        showToast(data.message || "Submissions and AI scores cleared!", "success");
        loadParticipants();
      } else {
        showToast("Failed to reset submissions.", "error");
      }
    });
  }

  // Complete Factory Reset (Timers + Submissions)
  const completeFactoryResetBtn = document.getElementById("completeFactoryResetBtn");
  if (completeFactoryResetBtn) {
    completeFactoryResetBtn.addEventListener("click", async () => {
      const confirmed = await window.showConfirmDialog({
        title: "Complete Factory Reset (Timers + Submissions)",
        message: "Perform a 100% complete test reset across all participating teams?",
        details: "This will reset 2-hour timers to 2:00:00, unlock all sessions, clear GitHub and Live URLs, and purge all AI prompts and scores. Team accounts and passwords will be preserved.",
        type: "danger",
        confirmText: "Execute Complete Factory Reset",
        icon: "fas fa-bomb"
      });
      if (!confirmed) return;

      completeFactoryResetBtn.disabled = true;
      completeFactoryResetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing factory reset...';

      const res = await manageFetch("/api/manage/reset-all-submissions", {
        method: "POST",
        body: JSON.stringify({ includeTimers: true })
      });

      completeFactoryResetBtn.disabled = false;
      completeFactoryResetBtn.innerHTML = '<i class="fas fa-bomb"></i> Complete Factory Reset (Timers + All Submissions)';

      if (res && res.ok) {
        const data = await res.json();
        showToast(data.message || "All sessions, deliverables, and prompts reset!", "success");
        loadParticipants();
      } else {
        showToast("Failed to execute complete reset.", "error");
      }
    });
  }

  // Announcements
  const broadcastMessageInput = document.getElementById("broadcastMessage");
  const postAnnouncementBtn = document.getElementById("postAnnouncementBtn");
  const clearAnnouncementBtn = document.getElementById("clearAnnouncementBtn");
  const announcementStatus = document.getElementById("announcementStatus");

  async function loadSettings() {
    const res = await manageFetch("/api/manage/settings");
    if (!res) return;
    const data = await res.json();
    currentSettings = data.settings || {};

    // Populate announcement
    if (currentSettings.announcement && currentSettings.announcement.active) {
      if (broadcastMessageInput) broadcastMessageInput.value = currentSettings.announcement.message || "";
      if (announcementStatus) announcementStatus.innerHTML = '<span style="color:var(--green);"><i class="fas fa-check-circle"></i> ACTIVE BROADCAST</span>';
    } else {
      if (announcementStatus) announcementStatus.innerHTML = '<span style="color:var(--text-3);">No active announcement</span>';
    }

    // Populate problem release switch
    const releaseToggle = document.getElementById("problemReleaseToggle");
    const releaseLabel = document.getElementById("releaseToggleLabel");
    if (releaseToggle) {
      const isReleased = Boolean(currentSettings.problemStatement && currentSettings.problemStatement.released === true);
      releaseToggle.checked = isReleased;
      if (releaseLabel) {
        releaseLabel.textContent = isReleased ? "RELEASED" : "LOCKED / HIDDEN";
        releaseLabel.style.color = isReleased ? "var(--green)" : "var(--rose)";
      }
    }
  }

  if (postAnnouncementBtn) {
    postAnnouncementBtn.addEventListener("click", async () => {
      const message = broadcastMessageInput.value.trim();
      if (!message) {
        showToast("Please enter an announcement message to broadcast.", "error");
        return;
      }

      const res = await manageFetch("/api/manage/announcement", {
        method: "POST",
        body: JSON.stringify({ message, active: true })
      });

      if (res && res.ok) {
        showToast("Announcement broadcasted live to all participant dashboards!", "success");
        loadSettings();
      }
    });
  }

  if (clearAnnouncementBtn) {
    clearAnnouncementBtn.addEventListener("click", async () => {
      const res = await manageFetch("/api/manage/announcement", {
        method: "POST",
        body: JSON.stringify({ message: "", active: false })
      });

      if (res && res.ok) {
        showToast("Active announcement cleared.", "info");
        if (broadcastMessageInput) broadcastMessageInput.value = "";
        loadSettings();
      }
    });
  }

  // =========================================================================
  // TAB 4: PROBLEM STATEMENT & AI EVALUATION RUBRIC
  // =========================================================================
  const mgmtChooseFileBtn = document.getElementById("mgmtChooseFileBtn");
  const mgmtProblemFileInput = document.getElementById("mgmtProblemFileInput");
  const mgmtSelectedFileText = document.getElementById("mgmtSelectedFileText");
  const mgmtUploadFileBtn = document.getElementById("mgmtUploadFileBtn");
  const mgmtActiveFileName = document.getElementById("mgmtActiveFileName");
  const mgmtProblemContext = document.getElementById("mgmtProblemContext");
  const saveAiContextBtn = document.getElementById("saveAiContextBtn");
  const problemReleaseToggle = document.getElementById("problemReleaseToggle");

  const DEFAULT_PROBLEM_STATEMENT_TEXT = `Institutional Event Resource Management System (IERMS)
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

  const mgmtSubnavBtns = document.querySelectorAll(".mgmt-subnav-btn");
  const mgmtSubpanelStatement = document.getElementById("mgmtSubpanelStatement");
  const mgmtSubpanelRubric = document.getElementById("mgmtSubpanelRubric");
  const mgmtSubpanelUpload = document.getElementById("mgmtSubpanelUpload");
  const mgmtLiveDocName = document.getElementById("mgmtLiveDocName");
  const mgmtLiveDocMeta = document.getElementById("mgmtLiveDocMeta");
  const mgmtLiveReleaseBadge = document.getElementById("mgmtLiveReleaseBadge");
  const mgmtLiveStatementText = document.getElementById("mgmtLiveStatementText");
  const mgmtStatementUpdatedTimestamp = document.getElementById("mgmtStatementUpdatedTimestamp");
  const mgmtDownloadDocBtn = document.getElementById("mgmtDownloadDocBtn");
  const mgmtJumpToEditBtn = document.getElementById("mgmtJumpToEditBtn");

  function switchMgmtSubtab(target) {
    mgmtSubnavBtns.forEach(btn => {
      const isTarget = btn.dataset.subtab === target;
      btn.classList.toggle("active", isTarget);
      if (isTarget) {
        btn.style.background = "var(--cyan-dim)";
        btn.style.borderColor = "var(--cyan)";
        btn.style.color = "#fff";
      } else {
        btn.style.background = "";
        btn.style.borderColor = "";
        btn.style.color = "";
      }
    });

    if (mgmtSubpanelStatement) mgmtSubpanelStatement.style.display = target === "live-statement" ? "block" : "none";
    if (mgmtSubpanelRubric) mgmtSubpanelRubric.style.display = target === "ai-rubric" ? "block" : "none";
    if (mgmtSubpanelUpload) mgmtSubpanelUpload.style.display = target === "upload-manage" ? "block" : "none";
  }

  mgmtSubnavBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.subtab;
      if (target) switchMgmtSubtab(target);
    });
  });

  if (mgmtJumpToEditBtn) {
    mgmtJumpToEditBtn.addEventListener("click", () => {
      switchMgmtSubtab("upload-manage");
      if (mgmtProblemContext) {
        mgmtProblemContext.focus();
        mgmtProblemContext.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  async function loadProblemStatementData() {
    try {
      const res = await manageFetch("/api/admin/problem-statement");
      if (!res) return;
      const data = await res.json().catch(() => ({}));

      const fileName = data.fileName || "Vibeathon_Problem_Statement.docx";
      const hasUploadedFile = Boolean(data.fileName);

      if (mgmtActiveFileName) {
        mgmtActiveFileName.textContent = hasUploadedFile ? data.fileName : "No document uploaded yet";
        mgmtActiveFileName.style.color = hasUploadedFile ? "var(--cyan)" : "var(--text-3)";
      }

      if (mgmtLiveDocName) {
        mgmtLiveDocName.textContent = fileName;
      }

      if (mgmtLiveDocMeta) {
        mgmtLiveDocMeta.textContent = hasUploadedFile
          ? `Serving custom file to participants • Uploaded: ${data.updatedAt ? new Date(data.updatedAt).toLocaleDateString() : "Active"}`
          : "Default document ready • Upload replacement file anytime";
      }

      const isReleased = Boolean(data.released || (currentSettings.problemStatement && currentSettings.problemStatement.released));
      if (mgmtLiveReleaseBadge) {
        if (isReleased) {
          mgmtLiveReleaseBadge.innerHTML = '<i class="fas fa-check-circle"></i> RELEASED TO PARTICIPANTS';
          mgmtLiveReleaseBadge.style.background = 'var(--green-dim)';
          mgmtLiveReleaseBadge.style.color = 'var(--green)';
          mgmtLiveReleaseBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else {
          mgmtLiveReleaseBadge.innerHTML = '<i class="fas fa-lock"></i> LOCKED / HIDDEN';
          mgmtLiveReleaseBadge.style.background = 'rgba(244, 63, 94, 0.12)';
          mgmtLiveReleaseBadge.style.color = 'var(--rose)';
          mgmtLiveReleaseBadge.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        }
      }

      const problemText = (data.text && data.text.trim()) ? data.text.trim() : DEFAULT_PROBLEM_STATEMENT_TEXT;
      if (mgmtLiveStatementText) {
        mgmtLiveStatementText.textContent = problemText;
      }

      if (mgmtStatementUpdatedTimestamp) {
        mgmtStatementUpdatedTimestamp.textContent = data.updatedAt
          ? "Last updated: " + new Date(data.updatedAt).toLocaleString()
          : "Default active configuration";
      }

      if (mgmtProblemContext && data.text) {
        mgmtProblemContext.value = data.text;
      }

      loadSettings();
    } catch (err) {
      console.warn("loadProblemStatementData error:", err);
    }
  }

  if (mgmtDownloadDocBtn) {
    mgmtDownloadDocBtn.addEventListener("click", async () => {
      try {
        mgmtDownloadDocBtn.disabled = true;
        mgmtDownloadDocBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';

        const token = sessionStorage.getItem("adminToken") || localStorage.getItem("adminToken");
        const downloadUrl = window.getApiUrl ? window.getApiUrl("/api/admin/problem-statement/download") : "/api/admin/problem-statement/download";

        const res = await fetch(downloadUrl, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.message || "Failed to download problem statement file.", "error");
          return;
        }

        const blob = await res.blob();
        let downloadFileName = "Vibeathon_Problem_Statement.docx";
        const disposition = res.headers.get("Content-Disposition");
        if (disposition && disposition.includes("filename=")) {
          const match = disposition.match(/filename="?([^";]+)"?/);
          if (match && match[1]) downloadFileName = match[1];
        } else if (mgmtLiveDocName && mgmtLiveDocName.textContent.trim()) {
          downloadFileName = mgmtLiveDocName.textContent.trim();
        }

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = downloadFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        showToast("Problem statement file downloaded successfully!", "success");
      } catch (err) {
        console.error("Download problem statement error:", err);
        showToast("Download error: " + err.message, "error");
      } finally {
        mgmtDownloadDocBtn.disabled = false;
        mgmtDownloadDocBtn.innerHTML = '<i class="fas fa-download"></i> Download Active File';
      }
    });
  }

  if (mgmtChooseFileBtn && mgmtProblemFileInput) {
    mgmtChooseFileBtn.addEventListener("click", () => mgmtProblemFileInput.click());
    mgmtProblemFileInput.addEventListener("change", () => {
      const file = mgmtProblemFileInput.files[0];
      if (file) {
        if (mgmtSelectedFileText) mgmtSelectedFileText.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        if (mgmtUploadFileBtn) mgmtUploadFileBtn.disabled = false;
      }
    });
  }

  if (mgmtUploadFileBtn) {
    mgmtUploadFileBtn.addEventListener("click", async () => {
      const file = mgmtProblemFileInput.files[0];
      if (!file) return;

      mgmtUploadFileBtn.disabled = true;
      mgmtUploadFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = String(reader.result).split(",")[1];
          const payload = {
            fileName: file.name,
            fileBase64: base64Data,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size
          };

          const res = await manageFetch("/api/admin/problem-statement/upload", {
            method: "POST",
            body: JSON.stringify(payload)
          });

          if (res && res.ok) {
            showToast("Problem statement document uploaded and deployed successfully!", "success");
            await loadProblemStatementData();
          } else {
            const errData = res ? await res.json().catch(() => ({})) : {};
            showToast(errData.message || "Failed to upload problem statement document.", "error");
          }
        } catch (err) {
          console.error("Upload error:", err);
          showToast("Upload error: " + err.message, "error");
        } finally {
          mgmtUploadFileBtn.disabled = false;
          mgmtUploadFileBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload & Deploy';
        }
      };

      reader.onerror = () => {
        mgmtUploadFileBtn.disabled = false;
        mgmtUploadFileBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload & Deploy';
        showToast("Failed to read file from disk.", "error");
      };

      reader.readAsDataURL(file);
    });
  }

  if (saveAiContextBtn) {
    saveAiContextBtn.addEventListener("click", async () => {
      const text = mgmtProblemContext.value.trim();
      if (!text) {
        showToast("Please enter challenge context text for Gemini evaluation.", "error");
        return;
      }

      saveAiContextBtn.disabled = true;
      saveAiContextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

      const res = await manageFetch("/api/admin/problem-statement/context", {
        method: "POST",
        body: JSON.stringify({ text })
      });

      saveAiContextBtn.disabled = false;
      saveAiContextBtn.innerHTML = '<i class="fas fa-save"></i> Save & Sync AI Evaluation Context';

      if (res && res.ok) {
        showToast("AI Evaluation context synchronized with Gemini!", "success");
      }
    });
  }

  if (problemReleaseToggle) {
    problemReleaseToggle.addEventListener("change", async () => {
      const released = problemReleaseToggle.checked;
      const releaseLabel = document.getElementById("releaseToggleLabel");
      if (releaseLabel) {
        releaseLabel.textContent = released ? "RELEASED" : "FROZEN / HIDDEN";
        releaseLabel.style.color = released ? "var(--green)" : "var(--rose)";
      }

      if (mgmtLiveReleaseBadge) {
        if (released) {
          mgmtLiveReleaseBadge.innerHTML = '<i class="fas fa-check-circle"></i> RELEASED TO PARTICIPANTS';
          mgmtLiveReleaseBadge.style.background = 'var(--green-dim)';
          mgmtLiveReleaseBadge.style.color = 'var(--green)';
          mgmtLiveReleaseBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else {
          mgmtLiveReleaseBadge.innerHTML = '<i class="fas fa-lock"></i> LOCKED / HIDDEN';
          mgmtLiveReleaseBadge.style.background = 'rgba(244, 63, 94, 0.12)';
          mgmtLiveReleaseBadge.style.color = 'var(--rose)';
          mgmtLiveReleaseBadge.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        }
      }

      const res = await manageFetch("/api/manage/settings", {
        method: "PUT",
        body: JSON.stringify({
          problemStatement: {
            ...(currentSettings.problemStatement || {}),
            released
          }
        })
      });

      if (res && res.ok) {
        showToast(`Problem statement access ${released ? "RELEASED to participants" : "LOCKED"}!`, "info");
      }
    });
  }

  // =========================================================================
  // TAB 5: ADMIN CREDENTIALS
  // =========================================================================
  const adminPasswordForm = document.getElementById("adminPasswordForm");
  if (adminPasswordForm) {
    adminPasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const p1 = document.getElementById("newAdminPassword").value;
      const p2 = document.getElementById("confirmAdminPassword").value;

      if (p1.length < 6) {
        showToast("Password must be at least 6 characters.", "error");
        return;
      }
      if (p1 !== p2) {
        showToast("Passwords do not match.", "error");
        return;
      }

      const btn = document.getElementById("changeAdminPassBtn");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
      }

      const res = await manageFetch("/api/manage/admin/password", {
        method: "PUT",
        body: JSON.stringify({ newPassword: p1 })
      });

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shield-alt"></i> Update Master Password';
      }

      if (res && res.ok) {
        showToast("Admin password updated successfully!", "success");
        adminPasswordForm.reset();
      }
    });
  }

  // =========================================================================
  // TAB 6: AUDIT LOGS
  // =========================================================================
  const logsContainer = document.getElementById("logsContainer");
  const refreshLogsBtn = document.getElementById("refreshLogsBtn");

  async function loadAuditLogs() {
    if (logsContainer) {
      logsContainer.innerHTML = '<div style="color: var(--text-3); text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Loading activity logs...</div>';
    }

    const res = await manageFetch("/api/manage/logs?limit=80");
    if (!res) return;

    const data = await res.json();
    if (data.success && Array.isArray(data.logs)) {
      renderLogs(data.logs);
    }
  }

  function renderLogs(logs) {
    if (!logsContainer) return;
    if (logs.length === 0) {
      logsContainer.innerHTML = '<div style="color: var(--text-3); text-align: center; padding: 2rem;">No system logs recorded yet.</div>';
      return;
    }

    logsContainer.innerHTML = logs.map(log => {
      const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "--:--";
      const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : "";
      const badgeClass = log.action || "INFO";

      return `
        <div class="log-entry">
          <span class="log-time">[${dateStr} ${timeStr}]</span>
          <span class="log-badge ${badgeClass}">${log.action}</span>
          <span class="log-desc">${escapeHtml(log.details || "")}</span>
          <span style="color: var(--text-3); font-size: 0.7rem;">(${escapeHtml(log.adminUser || "Admin")})</span>
        </div>
      `;
    }).join("");
  }

  /* =========================================================================
     SYSTEM HEALTH & REAL-TIME CONNECTIVITY MONITOR
     ========================================================================= */
  const systemHealthBadge = document.getElementById("systemHealthBadge");
  const systemHealthDot = document.getElementById("systemHealthDot");
  const systemHealthText = document.getElementById("systemHealthText");
  const systemLatencyText = document.getElementById("systemLatencyText");

  async function checkSystemHealth() {
    const t0 = performance.now();
    try {
      const healthUrl = window.getApiUrl ? window.getApiUrl("/api/health") : "/api/health";
      const res = await fetch(healthUrl, { cache: "no-store" });
      const latency = Math.round(performance.now() - t0);

      if (res.ok) {
        if (systemHealthDot) {
          systemHealthDot.style.background = "#10b981";
          systemHealthDot.classList.add("pulse-dot");
        }
        if (systemHealthText) {
          systemHealthText.textContent = "SYSTEM LIVE";
          systemHealthText.style.color = "#10b981";
        }
        if (systemLatencyText) {
          systemLatencyText.textContent = `(${latency}ms)`;
          systemLatencyText.style.color = "#34d399";
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (systemHealthDot) {
        systemHealthDot.style.background = "#f43f5e";
        systemHealthDot.classList.remove("pulse-dot");
      }
      if (systemHealthText) {
        systemHealthText.textContent = "SYSTEM OFFLINE / RECONNECTING";
        systemHealthText.style.color = "#fb7185";
      }
      if (systemLatencyText) {
        systemLatencyText.textContent = "(no response)";
        systemLatencyText.style.color = "#fb7185";
      }
    }
  }

  // Run initial health check & poll every 10 seconds
  checkSystemHealth();
  setInterval(checkSystemHealth, 10000);
  if (systemHealthBadge) {
    systemHealthBadge.addEventListener("click", () => {
      if (systemHealthText) systemHealthText.textContent = "PINGING...";
      checkSystemHealth();
    });
  }

  /* =========================================================================
     ADVANCED GOOGLE FORMS & CSV PARTICIPANT IMPORTER
     ========================================================================= */
  const importCsvModalBtn = document.getElementById("importCsvModalBtn");
  const importCsvModal = document.getElementById("importCsvModal");
  const closeImportCsvBtn = document.getElementById("closeImportCsvBtn");
  const cancelImportBtn = document.getElementById("cancelImportBtn");
  const importDropZone = document.getElementById("importDropZone");
  const importFileInput = document.getElementById("importFileInput");
  const importRawCsvText = document.getElementById("importRawCsvText");
  const importPreviewSection = document.getElementById("importPreviewSection");
  const importPreviewTableBody = document.getElementById("importPreviewTableBody");
  const importCountBadge = document.getElementById("importCountBadge");
  const importMappingSummary = document.getElementById("importMappingSummary");
  const executeImportBtn = document.getElementById("executeImportBtn");
  const importTeamPrefix = document.getElementById("importTeamPrefix") || document.getElementById("importVccPrefix");
  const importTeamStart = document.getElementById("importTeamStart") || document.getElementById("importVccStart");
  const dropZoneText = document.getElementById("dropZoneText");
  const importSuccessDownloadSection = document.getElementById("importSuccessDownloadSection");
  const importSuccessMsg = document.getElementById("importSuccessMsg");
  const downloadImportedCredsBtn = document.getElementById("downloadImportedCredsBtn");

  let parsedImportTeams = [];
  let lastImportedCredentials = [];
  let lastSkippedDuplicates = [];

  // Robust phone number sanitizer for Indian & international formats
  function cleanPhoneNumber(raw) {
    if (!raw) return "";
    let digits = String(raw).replace(/[^0-9]/g, "");
    if (digits.length === 12 && digits.startsWith("91")) {
      digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith("0")) {
      digits = digits.slice(1);
    }
    return digits;
  }

  // Robust email cleaner for Google Forms mobile typos and transposed addresses
  function cleanEmail(raw, vtuNo, fallbackEmail) {
    if (!raw) return (fallbackEmail || "").trim().toLowerCase();
    let email = String(raw).trim().toLowerCase();

    // Fix comma typos in domain: e.g. veltech,edu,in -> veltech.edu.in
    if (email.includes("@")) {
      const atIdx = email.indexOf("@");
      const local = email.slice(0, atIdx);
      const domain = email.slice(atIdx + 1).replace(/,/g, ".");
      email = local + "@" + domain;
    }

    // Fix common mobile typo: <vtu>gmail@.com or <vtu>@gamil.com -> vtu<vtu>@veltech.edu.in
    const malformedMatch = email.match(/^(\d+)gmail@\.com$/i) || email.match(/^(\d+)@?g[a-z]+@?\.com$/i);
    if (malformedMatch) {
      const digits = malformedMatch[1];
      email = `vtu${digits}@veltech.edu.in`;
    }

    // Fix generic gamil typo
    email = email.replace(/@gamil\.com$/i, "@gmail.com");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) && fallbackEmail && emailRegex.test(fallbackEmail)) {
      email = fallbackEmail.trim().toLowerCase();
    }

    return email;
  }

  // Intelligent column detector for Google Forms & CSV
  function detectColumns(headers) {
    const mapping = {
      teamId: -1,
      teamNo: -1,
      teamSize: -1,
      m1Name: -1,
      m1Email: -1,
      m1Phone: -1,
      m1College: -1,
      m1Branch: -1,
      m1VtuNo: -1,
      m2Name: -1,
      m2Email: -1,
      m2Phone: -1,
      m2College: -1,
      m2VtuNo: -1,
      m2Branch: -1,
      m3Name: -1,
      m3Email: -1,
      m3Phone: -1,
      m4Name: -1,
      m4Email: -1,
      m4Phone: -1,
      fallbackEmail: -1
    };

    headers.forEach((raw, idx) => {
      const h = String(raw || "").toLowerCase().trim();
      if (mapping.fallbackEmail === -1 && /^email(\s*address)?$/i.test(h)) {
        mapping.fallbackEmail = idx;
      }

      // Member 4
      if (/m4|member\s*4/i.test(h)) {
        if (/email/i.test(h)) mapping.m4Email = idx;
        else if (/phone|mobile|whatsapp|contact/i.test(h)) mapping.m4Phone = idx;
        else if (/name/i.test(h)) mapping.m4Name = idx;
        return;
      }

      // Member 3
      if (/m3|member\s*3/i.test(h)) {
        if (/email/i.test(h)) mapping.m3Email = idx;
        else if (/phone|mobile|whatsapp|contact/i.test(h)) mapping.m3Phone = idx;
        else if (/name/i.test(h)) mapping.m3Name = idx;
        return;
      }

      // Member 2 / Student 2
      const isM2 = /m2|member\s*2|student\s*2|team\s*member/i.test(h);
      if (isM2) {
        if (/vtu|roll.*no|enrollment/i.test(h) && !/email/i.test(h)) {
          mapping.m2VtuNo = idx;
        } else if (/dept|department|branch|stream/i.test(h)) {
          mapping.m2Branch = idx;
        } else if (/email/i.test(h)) {
          mapping.m2Email = idx;
        } else if (/phone|mobile|whatsapp|contact/i.test(h)) {
          mapping.m2Phone = idx;
        } else if (/college|institution|university/i.test(h)) {
          mapping.m2College = idx;
        } else if (/name/i.test(h)) {
          mapping.m2Name = idx;
        }
        return;
      }

      // Leader / Student 1 / Member 1 VTU Number
      if (mapping.m1VtuNo === -1 && /vtu|roll.*no|enrollment/i.test(h) && (/leader|student\s*1|m1/i.test(h) || !/m2|member\s*2|student\s*2|team\s*member/i.test(h) && /lead/i.test(h))) {
        mapping.m1VtuNo = idx;
        return;
      }

      // Fallback check for M2 VTU number if header didn't match isM2 explicitly
      if (mapping.m2VtuNo === -1 && /vtu.*(?:no|num|id)|roll.*no/i.test(h) && !/leader|student\s*1|m1/i.test(h)) {
        mapping.m2VtuNo = idx;
        return;
      }

      // Team / Leader / Member 1
      if (mapping.teamId === -1 && /team\s*id|team_id|\bid\b|vcc/i.test(h) && !/vtu/i.test(h)) {
        mapping.teamId = idx;
      } else if (mapping.teamNo === -1 && /team\s*no|team_no|s\.?no|sl\.?no/i.test(h)) {
        mapping.teamNo = idx;
      } else if (mapping.teamSize === -1 && /team\s*size|team_size|members\s*count/i.test(h)) {
        mapping.teamSize = idx;
      } else if (mapping.m1Email === -1 && (/official.*email|email.*official|vtu.*email|email.*vtu/i.test(h) || /leader.*email|email.*leader|student\s*1.*email/i.test(h))) {
        // Priority 1: Authoritative Leader Official VTU Email
        mapping.m1Email = idx;
      } else if (mapping.m1Phone === -1 && /phone|mobile|whatsapp|contact/i.test(h)) {
        mapping.m1Phone = idx;
      } else if (mapping.m1College === -1 && /college|institution|university|campus|school/i.test(h)) {
        mapping.m1College = idx;
      } else if (mapping.m1Branch === -1 && /branch|dept|department|stream|course/i.test(h)) {
        mapping.m1Branch = idx;
      } else if (mapping.m1Name === -1 && /leader|m1|student\s*1|name/i.test(h) && !/dept|department/i.test(h) && !/vtu/i.test(h)) {
        mapping.m1Name = idx;
      }
    });

    // Fallback for m1Email: if no official/vtu email was found, look for first non-M2 email that is not just generic "Email Address"
    if (mapping.m1Email === -1) {
      const nonGenericIdx = headers.findIndex(raw => {
        const h = String(raw || "").toLowerCase().trim();
        return /email/i.test(h) && !/m2|member\s*2|student\s*2|team\s*member/i.test(h) && !/^email(\s*address)?$/i.test(h);
      });
      if (nonGenericIdx !== -1) {
        mapping.m1Email = nonGenericIdx;
      } else {
        // Absolute last fallback: any non-M2 email column
        const anyEmailIdx = headers.findIndex(raw => {
          const h = String(raw || "").toLowerCase().trim();
          return /email/i.test(h) && !/m2|member\s*2|student\s*2|team\s*member/i.test(h);
        });
        if (anyEmailIdx !== -1) mapping.m1Email = anyEmailIdx;
      }
    }

    return mapping;
  }

  function parseRowsArray(rows) {
    if (!rows || rows.length < 2) return [];

    const rawHeaders = (rows[0] || []).map(h => String(h || "").trim());
    const colMap = detectColumns(rawHeaders);

    const prefix = (importTeamPrefix ? importTeamPrefix.value.trim() : "VB").toUpperCase() || "VB";
    const startNum = parseInt(importTeamStart ? importTeamStart.value : 1) || 1;

    const teams = [];
    const seenEmails = new Set();
    const seenPhones = new Set();
    lastSkippedDuplicates = [];
    let autoIdIndex = 0;

    for (let i = 1; i < rows.length; i++) {
      const vals = rows[i];
      if (!vals || vals.length === 0 || vals.every(v => !String(v || "").trim())) continue;

      const getVal = (idx) => (idx !== -1 && vals[idx] !== undefined) ? String(vals[idx]).trim() : "";

      const leaderName = getVal(colMap.m1Name) || `Leader ${i}`;
      const leaderVtuNo = getVal(colMap.m1VtuNo);
      let leaderPhone = cleanPhoneNumber(getVal(colMap.m1Phone));
      const fallbackEmail = getVal(colMap.fallbackEmail);
      const leaderEmail = cleanEmail(getVal(colMap.m1Email), leaderVtuNo, fallbackEmail);
      const college = getVal(colMap.m1College) || "School of Computing";
      const branch = getVal(colMap.m1Branch) || "";

      // Deduplicate: automatically skip duplicate submissions within the batch
      if (seenEmails.has(leaderEmail) || (leaderPhone && seenPhones.has(leaderPhone))) {
        lastSkippedDuplicates.push({
          row: i + 1,
          name: leaderName,
          email: leaderEmail,
          phone: leaderPhone,
          reason: seenEmails.has(leaderEmail) ? `Duplicate Leader Email (${leaderEmail})` : `Duplicate Leader Phone (${leaderPhone})`
        });
        continue; // Exclude duplicate submission
      }
      if (leaderEmail) seenEmails.add(leaderEmail);
      if (leaderPhone) seenPhones.add(leaderPhone);

      let teamId = getVal(colMap.teamId).toUpperCase();
      if (!teamId) {
        autoIdIndex++;
        const autoNum = startNum + (autoIdIndex - 1);
        teamId = `${prefix}${String(autoNum).padStart(3, "0")}`;
      }

      const teamNo = parseInt(getVal(colMap.teamNo)) || (teams.length + 1);

      const m2Name = getVal(colMap.m2Name);
      const m2Email = cleanEmail(getVal(colMap.m2Email), getVal(colMap.m2VtuNo), "");
      const m2Phone = cleanPhoneNumber(getVal(colMap.m2Phone));
      const m2College = getVal(colMap.m2College) || college;
      const m2VtuNo = getVal(colMap.m2VtuNo);
      const m2Branch = getVal(colMap.m2Branch);

      const m3Name = getVal(colMap.m3Name);
      const m3Email = cleanEmail(getVal(colMap.m3Email), "", "");
      const m3Phone = cleanPhoneNumber(getVal(colMap.m3Phone));

      const m4Name = getVal(colMap.m4Name);
      const m4Email = cleanEmail(getVal(colMap.m4Email), "", "");
      const m4Phone = cleanPhoneNumber(getVal(colMap.m4Phone));

      let calcSize = parseInt(getVal(colMap.teamSize)) || 1;
      if (!getVal(colMap.teamSize)) {
        if (m4Name) calcSize = 4;
        else if (m3Name) calcSize = 3;
        else if (m2Name) calcSize = 2;
      }

      const teamEntry = {
        Team_ID: teamId,
        teamId: teamId,
        id: teamId,
        VCC_ID: teamId,
        Team_No: teamNo,
        Team_Size: calcSize,
        M1_College: college,
        M1_Name: leaderName,
        M1_Email: leaderEmail,
        M1_Phone: leaderPhone,
        M1_Branch: branch,
        M1_VtuNo: leaderVtuNo
      };

      if (m2Name) {
        teamEntry.M2_Name = m2Name;
        teamEntry.M2_Email = m2Email;
        teamEntry.M2_Phone = m2Phone;
        teamEntry.M2_College = m2College;
        teamEntry.M2_VtuNo = m2VtuNo;
        teamEntry.M2_Branch = m2Branch;
      }
      if (m3Name) {
        teamEntry.M3_Name = m3Name;
        teamEntry.M3_Email = m3Email;
        teamEntry.M3_Phone = m3Phone;
      }
      if (m4Name) {
        teamEntry.M4_Name = m4Name;
        teamEntry.M4_Email = m4Email;
        teamEntry.M4_Phone = m4Phone;
      }

      teams.push(teamEntry);
    }

    return teams;
  }

  function parseCSV(text) {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    function splitCSVLine(line) {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ""));
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      return result;
    }

    const rows = lines.map(line => splitCSVLine(line));
    return parseRowsArray(rows);
  }

  function validateImportedTeams(teams) {
    const errors = [];
    const seenEmails = new Set();
    const seenPhones = new Set();
    const seenIds = new Set();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    teams.forEach((t, idx) => {
      const rowNum = idx + 2;
      const email = (t.M1_Email || "").trim().toLowerCase();
      const phone = (t.M1_Phone || "").replace(/[^0-9]/g, "");
      const teamId = (t.Team_ID || t.teamId || "").trim();

      if (!email) {
        errors.push(`Team ${teamId || rowNum}: Missing leader official email.`);
      } else if (!emailRegex.test(email)) {
        errors.push(`Team ${teamId || rowNum}: Invalid leader email format ("${email}").`);
      } else if (seenEmails.has(email)) {
        errors.push(`Team ${teamId || rowNum}: Duplicate leader email ("${email}").`);
      } else {
        seenEmails.add(email);
      }

      if (!phone || phone.length < 7) {
        errors.push(`Team ${teamId || rowNum}: Missing or invalid leader phone number (need ≥7 digits).`);
      } else if (seenPhones.has(phone)) {
        errors.push(`Team ${teamId || rowNum}: Duplicate leader phone number in batch.`);
      } else {
        seenPhones.add(phone);
      }

      if (teamId && seenIds.has(teamId)) {
        errors.push(`Team ${teamId}: Duplicate Team ID ("${teamId}").`);
      } else if (teamId) {
        seenIds.add(teamId);
      }
    });

    return errors;
  }

  function handleParsedCSV(teams) {
    parsedImportTeams = teams;
    if (teams.length > 0) {
      const validationErrors = validateImportedTeams(teams);

      if (importPreviewSection) importPreviewSection.style.display = "block";
      if (importCountBadge) importCountBadge.textContent = `${teams.length} Teams Detected`;

      if (validationErrors.length > 0) {
        if (importMappingSummary) {
          importMappingSummary.innerHTML = `<span style="color:var(--rose); font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Validation Failed (${validationErrors.length} issue${validationErrors.length > 1 ? "s" : ""}):<br><span style="font-size:0.75rem; font-weight:normal;">${validationErrors.slice(0, 6).map(e => escapeHtml(e)).join("<br>")}${validationErrors.length > 6 ? `<br>...and ${validationErrors.length - 6} more errors.` : ""}</span></span>`;
        }
        if (executeImportBtn) executeImportBtn.disabled = true;
      } else {
        if (importMappingSummary) {
          const dupNote = (typeof lastSkippedDuplicates !== "undefined" && lastSkippedDuplicates.length > 0)
            ? `<br><span style="color:var(--amber); font-size:0.75rem; font-weight:normal;"><i class="fas fa-info-circle"></i> Note: ${lastSkippedDuplicates.length} duplicate submission automatically excluded (${lastSkippedDuplicates.map(d => `Row ${d.row}: ${escapeHtml(d.name)}`).join(", ")}).</span>`
            : "";
          importMappingSummary.innerHTML = `<span style="color:var(--green); font-weight:600;"><i class="fas fa-check-circle"></i> Validation Passed! Leader VTU Email, Phone, Dept & Member 2 fields auto-mapped.</span>${dupNote}`;
        }
        if (executeImportBtn) executeImportBtn.disabled = false;
      }

      if (importPreviewTableBody) {
        importPreviewTableBody.innerHTML = teams.slice(0, 8).map(t => `
          <tr>
            <td><strong style="color:var(--cyan); font-family:var(--font-mono);">${escapeHtml(t.Team_ID || t.teamId || t.VCC_ID)}</strong></td>
            <td><strong>${escapeHtml(t.M1_Name)}</strong>${t.M1_VtuNo ? `<br><small style="color:var(--cyan); font-family:var(--font-mono); font-weight:600;">[${escapeHtml(t.M1_VtuNo)}]</small>` : ""}<br><small style="color:var(--text-3);">${escapeHtml(t.M1_Branch || "")}</small></td>
            <td><span class="cred-chip">${escapeHtml(t.M1_Email)}</span></td>
            <td><span class="cred-chip" style="color:var(--green); font-weight:700;">${escapeHtml(t.M1_Phone)}</span></td>
            <td style="color:var(--text-3);">${escapeHtml(t.M1_College)}</td>
            <td><span class="team-badge">${t.Team_Size} Members</span>${t.M2_Name ? `<br><small style="color:var(--text-3);">${escapeHtml(t.M2_Name)}${t.M2_VtuNo ? ` (${escapeHtml(t.M2_VtuNo)})` : ""}</small>` : ""}</td>
          </tr>
        `).join("");
      }
    } else {
      if (importPreviewSection) importPreviewSection.style.display = "none";
      if (executeImportBtn) executeImportBtn.disabled = true;
    }
  }

  if (importCsvModalBtn && importCsvModal) {
    importCsvModalBtn.addEventListener("click", () => {
      importCsvModal.classList.add("show");
      if (importSuccessDownloadSection) importSuccessDownloadSection.style.display = "none";
    });
  }

  function closeImportCsv() {
    if (importCsvModal) importCsvModal.classList.remove("show");
    if (importRawCsvText) importRawCsvText.value = "";
    if (importPreviewSection) importPreviewSection.style.display = "none";
    if (importSuccessDownloadSection) importSuccessDownloadSection.style.display = "none";
    if (executeImportBtn) executeImportBtn.disabled = true;
    if (dropZoneText) dropZoneText.textContent = "Click or Drag & Drop Google Forms Excel (.xlsx) or CSV file here";
    parsedImportTeams = [];
  }

  if (closeImportCsvBtn) closeImportCsvBtn.addEventListener("click", closeImportCsv);
  if (cancelImportBtn) cancelImportBtn.addEventListener("click", closeImportCsv);

  if (importDropZone && importFileInput) {
    importDropZone.addEventListener("click", () => importFileInput.click());

    // Drag & Drop visual highlights
    ['dragenter', 'dragover'].forEach(eventName => {
      importDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        importDropZone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      importDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        importDropZone.classList.remove('dragover');
      }, false);
    });

    importDropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt.files[0];
      if (file) {
        processUploadedFile(file);
      }
    });

    importFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        processUploadedFile(file);
      }
    });

    function processUploadedFile(file) {
      if (dropZoneText) dropZoneText.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      const isExcel = /\.(xlsx|xls)$/i.test(file.name) ||
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel";

      if (isExcel) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            if (typeof XLSX === "undefined") {
              showToast("SheetJS library (XLSX) not available. Please ensure xlsx.full.min.js is loaded.", "error");
              return;
            }
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const csvText = XLSX.utils.sheet_to_csv(worksheet);
            if (importRawCsvText) importRawCsvText.value = csvText;
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            const teams = parseRowsArray(rows);
            handleParsedCSV(teams);
          } catch (err) {
            console.error("Failed to parse Excel file:", err);
            showToast("Failed to parse Excel workbook: " + err.message, "error");
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = evt.target.result;
          if (importRawCsvText) importRawCsvText.value = text;
          const teams = parseCSV(text);
          handleParsedCSV(teams);
        };
        reader.readAsText(file);
      }
    }
  }

  if (importRawCsvText) {
    importRawCsvText.addEventListener("input", () => {
      const text = importRawCsvText.value;
      const teams = parseCSV(text);
      handleParsedCSV(teams);
    });
  }

  if (executeImportBtn) {
    executeImportBtn.addEventListener("click", async () => {
      if (parsedImportTeams.length === 0) {
        showToast("No valid team data parsed from CSV", "error");
        return;
      }

      executeImportBtn.disabled = true;
      executeImportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing Firebase Accounts...';

      try {
        const res = await manageFetch("/api/manage/import-teams", {
          method: "POST",
          body: JSON.stringify({ teams: parsedImportTeams })
        });

        if (!res) throw new Error("Server did not respond");
        const data = await res.json();

        if (data.success) {
          showToast(`✅ ${data.message}`, "success");
          lastImportedCredentials = data.results?.importedTeams || parsedImportTeams;

          if (importSuccessDownloadSection) {
            importSuccessDownloadSection.style.display = "block";
            if (importSuccessMsg) {
              importSuccessMsg.innerHTML = `<i class="fas fa-check-circle"></i> Successfully Imported ${data.results.created} New Teams & Updated ${data.results.updated} Teams!`;
            }
          }

          loadParticipants();
        } else {
          showToast(data.message || "Failed to import teams", "error");
        }
      } catch (err) {
        console.error("Import error:", err);
        showToast("Import error: " + err.message, "error");
      } finally {
        executeImportBtn.disabled = false;
        executeImportBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Import & Generate Credentials';
      }
    });
  }

  // =========================================================================
  // ENHANCED EXPORT ENGINE & PARAMETERS
  // =========================================================================
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

  function getCurrentParticipantList() {
    const q = participantSearch ? participantSearch.value.toLowerCase().trim() : "";
    if (!q) return allTeamsData;
    return allTeamsData.filter(t => {
      const teamId = (t.id || t.teamId || t.vccId || "").toLowerCase();
      return (
        teamId.includes(q) ||
        (t.M1_Name && t.M1_Name.toLowerCase().includes(q)) ||
        (t.M1_Email && t.M1_Email.toLowerCase().includes(q)) ||
        (t.M1_Phone && t.M1_Phone.toLowerCase().includes(q)) ||
        (t.M1_Branch && t.M1_Branch.toLowerCase().includes(q)) ||
        (t.M1_VtuNo && t.M1_VtuNo.toLowerCase().includes(q)) ||
        (t.M2_Name && t.M2_Name.toLowerCase().includes(q)) ||
        (t.M2_VtuNo && t.M2_VtuNo.toLowerCase().includes(q)) ||
        (t.M2_Email && t.M2_Email.toLowerCase().includes(q)) ||
        (t.college && t.college.toLowerCase().includes(q))
      );
    });
  }

  function buildParticipantExportObjects(teamsList) {
    return teamsList.map(t => {
      const teamId = t.Team_ID || t.teamId || t.id || t.vccId || t.VCC_ID || "";
      const isEnded = Boolean(t.sessionEnded);
      const isLive = Boolean(t.hackathonStart && !isEnded);
      const status = t.blocked ? "Suspended" : (isEnded ? "Completed" : (isLive ? "Live Sprint" : "Registered"));
      const securityStatus = t.blocked ? `Suspended (${t.blockReason || 'Security Violation'})` : "Active / Clear";
      const startTime = t.hackathonStart ? new Date(t.hackathonStart).toLocaleString() : "—";
      const endTime = (t.completedAt || t.sessionEndedAt) ? new Date(t.completedAt || t.sessionEndedAt).toLocaleString() : "—";
      const aiScoreVal = typeof t.aiScore === 'number' ? t.aiScore : (t.evaluation?.score ?? "—");
      const promptCountVal = t.promptCount ?? (t.prompts ? (Array.isArray(t.prompts) ? t.prompts.length : Object.keys(t.prompts).length) : 0);
      const passVal = t.password || t.M1_Phone || t.phone || "";

      return {
        "Team ID": teamId,
        "Team Size": t.teamSize || t.Team_Size || 2,
        "Student 1 Name (Lead)": t.M1_Name || t.leaderName || "",
        "Student 1 VTU No": t.M1_VtuNo || t.m1VtuNo || "",
        "Student 1 Department": t.M1_Branch || t.branch || "",
        "Student 1 Official Email (Login ID)": t.M1_Email || t.email || "",
        "Student 1 Mobile No": t.M1_Phone || t.phone || "",
        "Student 1 Login Password": passVal,
        "College / Campus": t.college || t.M1_College || "",
        "Student 2 Name (Member)": t.M2_Name || "—",
        "Student 2 VTU No": t.M2_VtuNo || t.m2VtuNo || "—",
        "Student 2 Department": t.M2_Branch || t.m2Branch || "—",
        "Student 2 Official Email": t.M2_Email || t.m2Email || "—",
        "Student 2 Mobile No": t.M2_Phone || t.m2Phone || "—",
        "Session Status": status,
        "Security Status": securityStatus,
        "Sprint Start": startTime,
        "Sprint End": endTime,
        "GitHub Repository": t.githubUrl || "—",
        "Live Deployment": t.deploymentUrl || "—",
        "Total Prompts": promptCountVal,
        "AI Score (0-50)": aiScoreVal,
        "AI Rating Level": t.aiLevel || t.evaluation?.level || "—",
        "Registered Timestamp": t.createdAt ? new Date(t.createdAt).toLocaleString() : "—"
      };
    });
  }

  function downloadCsvFile(rows, filename) {
    if (!rows || rows.length === 0) {
      showToast("No data available to export.", "info");
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.map(sanitizeCsvField).join(","),
      ...rows.map(r => headers.map(h => sanitizeCsvField(r[h])).join(","))
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadExcelFile(rows, filename, sheetName = "Participants") {
    if (!rows || rows.length === 0) {
      showToast("No data available to export.", "info");
      return;
    }
    if (typeof XLSX === "undefined") {
      downloadCsvFile(rows, filename.replace(/\.xlsx$/i, ".csv"));
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
      return { wch: Math.min(Math.max(maxLen + 2, 10), 45) };
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }

  // 1. Tab 1 Toolbar: Export Credentials CSV
  const exportCredsBtn = document.getElementById("exportCredsBtn");
  if (exportCredsBtn) {
    exportCredsBtn.addEventListener("click", () => {
      const list = getCurrentParticipantList();
      if (!list || list.length === 0) {
        showToast("No participant data loaded to export.", "info");
        return;
      }
      const rows = buildParticipantExportObjects(list);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadCsvFile(rows, `Vibeathon_Participant_Roster_${dateStr}.csv`);
      showToast(`Exported ${rows.length} participant teams to CSV.`, "success");
    });
  }

  // 2. Tab 1 Toolbar: Export Master Excel (.xlsx)
  const exportExcelBtn = document.getElementById("exportExcelBtn");
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", () => {
      const list = getCurrentParticipantList();
      if (!list || list.length === 0) {
        showToast("No participant data loaded to export.", "info");
        return;
      }
      const rows = buildParticipantExportObjects(list);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadExcelFile(rows, `Vibeathon_Master_Roster_${dateStr}.xlsx`, "Roster");
      showToast(`Exported ${rows.length} participant teams to Excel!`, "success");
    });
  }

  // 3. Import Modal: Download CSV
  if (downloadImportedCredsBtn) {
    downloadImportedCredsBtn.addEventListener("click", () => {
      const list = (lastImportedCredentials && lastImportedCredentials.length > 0) ? lastImportedCredentials : allTeamsData;
      if (!list || list.length === 0) {
        showToast("No credentials available to export", "error");
        return;
      }
      const rows = buildParticipantExportObjects(list);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadCsvFile(rows, `Vibeathon_Imported_Credentials_${dateStr}.csv`);
      showToast(`Downloaded ${rows.length} credentials to CSV!`, "success");
    });
  }

  // 4. Import Modal: Download Excel (.xlsx)
  const downloadImportedExcelBtn = document.getElementById("downloadImportedExcelBtn");
  if (downloadImportedExcelBtn) {
    downloadImportedExcelBtn.addEventListener("click", () => {
      const list = (lastImportedCredentials && lastImportedCredentials.length > 0) ? lastImportedCredentials : allTeamsData;
      if (!list || list.length === 0) {
        showToast("No credentials available to export", "error");
        return;
      }
      const rows = buildParticipantExportObjects(list);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadExcelFile(rows, `Vibeathon_Imported_Credentials_${dateStr}.xlsx`, "Credentials");
      showToast(`Downloaded ${rows.length} credentials to Excel!`, "success");
    });
  }

  // Clear All Prompts handler
  const clearPromptsBtn = document.getElementById("clearPromptsBtn");
  if (clearPromptsBtn) {
    clearPromptsBtn.addEventListener("click", async () => {
      const confirmed = await window.showConfirmDialog({
        title: "Reset AI Prompt Telemetry",
        message: "Clear all logged AI evaluation prompts from previous tests?",
        details: "The prompt counter will reset to 0 for the official competition start. Use this right before the event kicks off.",
        type: "danger",
        confirmText: "Purge All Prompts (Reset to 0)",
        icon: "fas fa-trash-alt"
      });
      if (!confirmed) return;

      clearPromptsBtn.disabled = true;
      clearPromptsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clearing Prompts...';

      try {
        const res = await manageFetch("/api/manage/prompts", { method: "DELETE" });
        if (!res) return;
        const data = await res.json();
        if (data.success) {
          showToast(`✅ ${data.message}`, "success");
        } else {
          showToast(data.message || "Failed to clear prompts", "error");
        }
      } catch (err) {
        showToast("Error clearing prompts: " + err.message, "error");
      } finally {
        clearPromptsBtn.disabled = false;
        clearPromptsBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Clear All Prompts (Reset to 0)';
      }
    });
  }

  // Helper: HTML Escaping
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

  // ================= VISUAL PURGE ALL PARTICIPANTS HANDLER =================
  const purgeVisualModal = document.getElementById("purgeVisualModal");
  const purgeProgressBar = document.getElementById("purgeProgressBar");
  const purgeProgressPercent = document.getElementById("purgeProgressPercent");
  const purgeProgressStepText = document.getElementById("purgeProgressStepText");
  const purgeVisualIcon = document.getElementById("purgeVisualIcon");
  const purgeModalTitle = document.getElementById("purgeModalTitle");
  const purgeModalSubtitle = document.getElementById("purgeModalSubtitle");
  const purgeTerminal = document.getElementById("purgeTerminal");
  const purgeModalFooter = document.getElementById("purgeModalFooter");
  const closePurgeVisualBtn = document.getElementById("closePurgeVisualBtn");
  const deleteAllParticipantsBtn = document.getElementById("deleteAllParticipantsBtn");
  const purgeAllParticipantsTabBtn = document.getElementById("purgeAllParticipantsTabBtn");

  function logToPurgeTerminal(tag, message, level = 'info') {
    if (!purgeTerminal) return;
    const line = document.createElement('div');
    line.className = 'term-line';
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const tagClass = level === 'danger' ? 'term-danger' : (level === 'success' ? 'term-success' : (level === 'warn' ? 'term-warn' : 'term-info'));
    line.innerHTML = `<span class="term-time">[${timeStr}]</span> <span class="${tagClass}">[${tag}]</span> ${escapeHtml(message)}`;
    purgeTerminal.appendChild(line);
    purgeTerminal.scrollTop = purgeTerminal.scrollHeight;
  }

  function updatePurgeStep(stepNum, status) {
    const stepEl = document.getElementById(`pipeStep${stepNum}`);
    const statusEl = document.getElementById(`pipeStatus${stepNum}`);
    if (!stepEl || !statusEl) return;

    if (status === 'active') {
      stepEl.className = 'purge-pipe-item active';
      statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    } else if (status === 'completed') {
      stepEl.className = 'purge-pipe-item completed';
      statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: #34d399;"></i>';
    } else if (status === 'error') {
      stepEl.className = 'purge-pipe-item active';
      statusEl.innerHTML = '<i class="fas fa-times-circle" style="color: #fb7185;"></i>';
    } else {
      stepEl.className = 'purge-pipe-item';
      statusEl.innerHTML = '<i class="far fa-circle"></i>';
    }
  }

  function setPurgeProgress(percent, stepText) {
    if (purgeProgressBar) purgeProgressBar.style.width = `${percent}%`;
    if (purgeProgressPercent) purgeProgressPercent.textContent = `${percent}%`;
    if (purgeProgressStepText) purgeProgressStepText.innerHTML = stepText;
  }

  async function executeVisualPurgeAll() {
    const confirmed = await window.showConfirmDialog({
      title: "CRITICAL: Wipe All Participants & Database",
      message: "Are you absolutely certain you want to delete ALL participants, deliverables, prompts, evaluations, and Firebase Auth logins?",
      details: "This permanently deletes all participant records from Firebase Realtime Database (/teams, /prompts, /promptEvaluations) and deletes participant auth accounts. Master administrator accounts are safely preserved. This action CANNOT be undone.",
      type: "danger",
      confirmText: "CONFIRM PURGE ALL",
      icon: "fas fa-radiation"
    });

    if (!confirmed) return;

    // Reset visual modal state
    if (purgeVisualIcon) {
      purgeVisualIcon.innerHTML = '<i class="fas fa-radiation"></i>';
      purgeVisualIcon.style.removeProperty('background');
      purgeVisualIcon.style.removeProperty('border-color');
      purgeVisualIcon.style.removeProperty('color');
      purgeVisualIcon.style.removeProperty('box-shadow');
    }
    if (purgeModalTitle) purgeModalTitle.textContent = "PURGING ALL PARTICIPANTS";
    if (purgeModalSubtitle) purgeModalSubtitle.textContent = "Executing live wipe across Realtime Database & Firebase Authentication...";
    if (purgeTerminal) purgeTerminal.innerHTML = '';
    if (purgeModalFooter) purgeModalFooter.style.display = 'none';

    updatePurgeStep(1, 'active');
    updatePurgeStep(2, 'pending');
    updatePurgeStep(3, 'pending');
    updatePurgeStep(4, 'pending');
    setPurgeProgress(10, '<i class="fas fa-spinner fa-spin"></i> Initializing security authorization gate...');

    if (purgeVisualModal) purgeVisualModal.classList.add('active');

    logToPurgeTerminal("INIT", "Purge protocol engaged by Administrator.");
    logToPurgeTerminal("AUTH", "Verifying master admin authorization token...");

    // Smooth visual delay
    await new Promise(r => setTimeout(r, 450));
    updatePurgeStep(1, 'completed');
    logToPurgeTerminal("SEC", "Admin token verified. Master accounts protected.", "success");

    updatePurgeStep(2, 'active');
    setPurgeProgress(35, '<i class="fas fa-spinner fa-spin"></i> Wiping Realtime Database (/teams, /prompts, /evaluations)...');
    logToPurgeTerminal("RTDB", "Transmitting cascade delete across Realtime Database nodes...");

    try {
      const res = await manageFetch("/api/manage/purge-participants", {
        method: "POST"
      });

      if (!res) throw new Error("Server connection lost or request aborted");
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || "Backend purge failed");
      }

      // Stage 2 completed
      updatePurgeStep(2, 'completed');
      logToPurgeTerminal("RTDB", "Cleared /teams, /prompts, /promptEvaluations successfully.", "success");

      // Stage 3: Firebase Auth
      updatePurgeStep(3, 'active');
      setPurgeProgress(70, '<i class="fas fa-spinner fa-spin"></i> Removing participant Firebase Auth logins...');
      logToPurgeTerminal("AUTH", "Purging participant login credentials from Firebase Auth...");

      await new Promise(r => setTimeout(r, 400));
      updatePurgeStep(3, 'completed');
      const count = data.deletedAuthCount || 0;
      logToPurgeTerminal("AUTH", `Purged ${count} participant user account(s). Admin accounts preserved.`, "success");

      // Stage 4: Refresh cache & UI
      updatePurgeStep(4, 'active');
      setPurgeProgress(90, '<i class="fas fa-spinner fa-spin"></i> Refreshing directory cache & dashboard counters...');
      logToPurgeTerminal("CACHE", "Synchronizing local participant directory and resetting metrics...");

      await loadParticipants();

      await new Promise(r => setTimeout(r, 350));
      updatePurgeStep(4, 'completed');
      setPurgeProgress(100, '<i class="fas fa-check-circle" style="color:var(--emerald);"></i> Purge completed successfully!');
      logToPurgeTerminal("COMPLETE", "Platform completely sanitized. Ready for new participant import.", "success");

      // Final visual triumph state
      if (purgeVisualIcon) {
        purgeVisualIcon.innerHTML = '<i class="fas fa-check"></i>';
        purgeVisualIcon.style.background = 'rgba(16, 185, 129, 0.2)';
        purgeVisualIcon.style.borderColor = 'var(--emerald)';
        purgeVisualIcon.style.color = 'var(--emerald)';
        purgeVisualIcon.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.4)';
      }
      if (purgeModalTitle) purgeModalTitle.textContent = "PURGE COMPLETE";
      if (purgeModalSubtitle) purgeModalSubtitle.textContent = `All participant records and ${count} Firebase logins wiped successfully.`;
      if (purgeModalFooter) purgeModalFooter.style.display = 'flex';

      showToast(`✅ Database purged: ${count} participant accounts removed.`, "success");
    } catch (err) {
      console.error("Visual purge error:", err);
      logToPurgeTerminal("ERROR", err.message, "danger");
      setPurgeProgress(100, `<i class="fas fa-times-circle" style="color:var(--rose);"></i> Error: ${escapeHtml(err.message)}`);
      if (purgeModalSubtitle) purgeModalSubtitle.textContent = `Purge failed: ${err.message}`;
      if (purgeModalFooter) purgeModalFooter.style.display = 'flex';
      showToast("Purge failed: " + err.message, "error");
    }
  }

  if (deleteAllParticipantsBtn) {
    deleteAllParticipantsBtn.addEventListener("click", executeVisualPurgeAll);
  }

  if (purgeAllParticipantsTabBtn) {
    purgeAllParticipantsTabBtn.addEventListener("click", executeVisualPurgeAll);
  }

  if (closePurgeVisualBtn) {
    closePurgeVisualBtn.addEventListener("click", () => {
      if (purgeVisualModal) purgeVisualModal.classList.remove("active");
    });
  }

  // Initial Data Load
  loadParticipants();
  loadSettings();
});
