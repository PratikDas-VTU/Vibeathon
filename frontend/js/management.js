/**
 * VIBEATHON 2.0 - SUPER MANAGEMENT CONSOLE CONTROLLER
 * Full management of participants, credentials, sessions, demo generation, and AI rubric.
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Session Verification
  const token = localStorage.getItem("adminToken");
  if (!token) {
    window.location.replace("manage-login.html");
    return;
  }

  const adminUser = localStorage.getItem("adminUser") || "admin";
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
      const res = await fetch(fullUrl, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...(options.headers || {})
        }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("adminToken");
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

    let icon = "info-circle";
    if (type === "success") icon = "check-circle";
    if (type === "error") icon = "exclamation-circle";

    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // 4. Tab Navigation Switching
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;

      tabButtons.forEach(b => b.classList.remove("active"));
      tabPanels.forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPanel = document.getElementById(`tab-${target}`);
      if (targetPanel) targetPanel.classList.add("active");

      // Contextual refresh
      if (target === "logs") loadAuditLogs();
      if (target === "participants") loadParticipants();
      if (target === "problem") loadProblemStatementData();
      if (target === "sessions") loadSettings();
    });
  });

  // 5. Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminUser");
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
    const demoTeams = allTeamsData.filter(t => t.isDemo === true || (t.vccId && t.vccId.toUpperCase().startsWith("DEMO")));
    if (demoTeams.length > 0) {
      activeDemoList = demoTeams.map(t => ({
        vccId: t.vccId,
        email: t.M1_Email,
        password: t.M1_Phone || "demo12345",
        leader: t.M1_Name
      })).sort((a, b) => (a.vccId || "").localeCompare(b.vccId || "", undefined, { numeric: true }));
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
    const demo = teams.filter(t => t.isDemo || (t.vccId && t.vccId.startsWith("DEMO"))).length;

    const statTotal = document.getElementById("statTotalTeams");
    const statActive = document.getElementById("statActiveTeams");
    const statSub = document.getElementById("statSubmissions");
    const statDemo = document.getElementById("statDemoTeams");

    if (statTotal) statTotal.textContent = total;
    if (statActive) statActive.textContent = active;
    if (statSub) statSub.textContent = submitted;
    if (statDemo) statDemo.textContent = demo;
  }

  function renderTeams(teams) {
    if (!teamsTableBody) return;

    if (teams.length === 0) {
      teamsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-3);">No matching teams found.</td></tr>`;
      return;
    }

    teamsTableBody.innerHTML = teams.map(t => {
      const isEnded = Boolean(t.sessionEnded);
      const isLive = Boolean(t.hackathonStart && !isEnded);
      const isDemo = Boolean(t.isDemo || (t.vccId && t.vccId.startsWith("DEMO")));

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
      if (isEnded) {
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
      const deliverableSummary = `${hasGithub ? '<i class="fab fa-github" style="color:var(--cyan);" title="GitHub Submitted"></i>' : '<span style="opacity:0.3;">GH</span>'} &nbsp; ${hasDeploy ? '<i class="fas fa-external-link-alt" style="color:var(--green);" title="Live Demo Submitted"></i>' : '<span style="opacity:0.3;">URL</span>'}`;

      const beaconIcon = isOnline 
        ? `<span class="online-beacon" title="Connected: Active within last 4 minutes" style="margin-right:6px;"></span>`
        : `<span class="offline-beacon" title="Offline / Idle: No recent activity" style="margin-right:6px;"></span>`;

      return `
        <tr>
          <td><span class="vcc-badge">${t.vccId || "—"}</span></td>
          <td>
            <div style="font-weight: 600; color: var(--text-1); display:flex; align-items:center;">
              ${beaconIcon} ${escapeHtml(t.M1_Name || "Team Leader")}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-3); padding-left: 14px;">${escapeHtml(t.college || "—")}</div>
          </td>
          <td>
            <span class="cred-chip"><i class="far fa-envelope"></i> ${escapeHtml(t.M1_Email || "—")}</span>
          </td>
          <td>
            <span class="cred-chip"><i class="fas fa-key"></i> ${escapeHtml(t.M1_Phone || "—")}</span>
          </td>
          <td>${statusBadge}</td>
          <td>${deliverableSummary}</td>
          <td class="actions-cell">
            <button class="btn btn-secondary btn-sm" onclick="window.openEditTeamModal('${t.vccId}')" title="Edit Credentials">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn btn-warning btn-sm" onclick="window.resetTeamSessionSingle('${t.vccId}')" title="Reset Timer / Session">
              <i class="fas fa-undo"></i> Reset
            </button>
            <button class="btn btn-danger btn-sm" onclick="window.deleteTeamSingle('${t.vccId}')" title="Delete Team">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Filter Search
  if (participantSearch) {
    participantSearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderTeams(allTeamsData);
        return;
      }
      const filtered = allTeamsData.filter(t => 
        (t.vccId && t.vccId.toLowerCase().includes(q)) ||
        (t.M1_Name && t.M1_Name.toLowerCase().includes(q)) ||
        (t.M1_Email && t.M1_Email.toLowerCase().includes(q)) ||
        (t.M1_Phone && t.M1_Phone.toLowerCase().includes(q)) ||
        (t.college && t.college.toLowerCase().includes(q))
      );
      renderTeams(filtered);
    });
  }

  if (refreshTeamsBtn) refreshTeamsBtn.addEventListener("click", loadParticipants);

  // Edit Participant Modal
  const editTeamModal = document.getElementById("editTeamModal");
  const editTeamForm = document.getElementById("editTeamForm");
  const closeEditModalBtn = document.getElementById("closeEditModalBtn");
  const cancelEditModalBtn = document.getElementById("cancelEditModalBtn");

  window.openEditTeamModal = (vccId) => {
    const team = allTeamsData.find(t => t.vccId === vccId);
    if (!team) return;

    document.getElementById("editModalVccId").textContent = vccId;
    document.getElementById("editVccId").value = vccId;
    document.getElementById("editLeaderName").value = team.M1_Name || "";
    document.getElementById("editCollege").value = team.college || "";
    document.getElementById("editEmail").value = team.M1_Email || "";
    document.getElementById("editPassword").value = team.M1_Phone || "";
    document.getElementById("editTeamSize").value = team.teamSize || 2;
    document.getElementById("editBranch").value = team.M1_Branch || "";

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
      const vccId = document.getElementById("editVccId").value;
      const updates = {
        M1_Name: document.getElementById("editLeaderName").value.trim(),
        college: document.getElementById("editCollege").value.trim(),
        M1_Email: document.getElementById("editEmail").value.trim().toLowerCase(),
        M1_Phone: document.getElementById("editPassword").value.trim(),
        password: document.getElementById("editPassword").value.trim(),
        teamSize: parseInt(document.getElementById("editTeamSize").value) || 2,
        M1_Branch: document.getElementById("editBranch").value.trim()
      };

      const btn = document.getElementById("saveTeamChangesBtn");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      }

      const res = await manageFetch(`/api/manage/teams/${vccId}`, {
        method: "PUT",
        body: JSON.stringify(updates)
      });

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Save & Sync to Firebase';
      }

      if (res && res.ok) {
        showToast(`Team ${vccId} updated successfully!`, "success");
        closeEditModal();
        loadParticipants();
      } else {
        showToast(`Failed to update team ${vccId}.`, "error");
      }
    });
  }

  // Single Team Reset
  window.resetTeamSessionSingle = async (vccId) => {
    const confirmed = await window.showConfirmDialog({
      title: "Reset Team Countdown",
      message: `Reset session and 2-hour countdown for Team ${vccId}?`,
      details: "This unlocks their dashboard terminal and restarts their 2-hour timer back to 2:00:00.",
      type: "warning",
      confirmText: "Reset Countdown",
      icon: "fas fa-history"
    });
    if (!confirmed) return;

    const res = await manageFetch(`/api/manage/teams/${vccId}/reset`, { method: "POST" });
    if (res && res.ok) {
      showToast(`Team ${vccId} timer reset and session unlocked!`, "success");
      loadParticipants();
    }
  };

  // Single Team Delete
  window.deleteTeamSingle = async (vccId) => {
    const confirmed = await window.showConfirmDialog({
      title: "Delete Team Account",
      message: `Are you sure you want to completely delete Team ${vccId}?`,
      details: "This removes their login credentials, team roster, and all database records. This action cannot be undone.",
      type: "danger",
      confirmText: "Delete Team",
      icon: "fas fa-trash-alt"
    });
    if (!confirmed) return;

    const res = await manageFetch(`/api/manage/teams/${vccId}`, { method: "DELETE" });
    if (res && res.ok) {
      showToast(`Team ${vccId} deleted.`, "success");
      loadParticipants();
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
      const payload = {
        vccId: document.getElementById("addVccId").value.trim().toUpperCase(),
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
        showToast(`Team ${payload.vccId} registered and live!`, "success");
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
      const count = parseInt(document.getElementById("demoCount").value) || 3;
      const prefix = document.getElementById("demoPrefix").value.trim() || "DEMO";
      const password = document.getElementById("demoPassword").value.trim() || "demo12345";

      const btn = document.getElementById("generateDemoSubmitBtn");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Provisioning accounts...';
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
      }
    });
  }

  function renderDemoList(list) {
    if (!demoCredentialsSection || !demoTableBody) return;
    if (list.length === 0) {
      demoCredentialsSection.style.display = "none";
      return;
    }

    demoCredentialsSection.style.display = "block";
    demoTableBody.innerHTML = list.map(item => `
      <tr>
        <td><span class="vcc-badge">${item.vccId}</span></td>
        <td><code>${escapeHtml(item.email)}</code></td>
        <td><code>${escapeHtml(item.password)}</code></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${item.email} | ${item.password}')">
            <i class="far fa-copy"></i> Copy
          </button>
        </td>
      </tr>
    `).join("");
  }

  if (copyAllDemoBtn) {
    copyAllDemoBtn.addEventListener("click", () => {
      if (activeDemoList.length === 0) return;
      const text = activeDemoList.map(d => `VCC ID: ${d.vccId} | Email: ${d.email} | Password: ${d.password}`).join("\n");
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

  async function loadProblemStatementData() {
    const res = await manageFetch("/api/admin/problem-statement");
    if (!res) return;
    if (mgmtActiveFileName) {
      if (data.fileName) {
        mgmtActiveFileName.textContent = data.fileName;
        mgmtActiveFileName.style.color = "var(--cyan)";
      } else {
        mgmtActiveFileName.textContent = "No document uploaded yet";
        mgmtActiveFileName.style.color = "var(--text-3)";
      }
    }
    if (mgmtProblemContext && data.text) mgmtProblemContext.value = data.text;
    loadSettings();
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

      const formData = new FormData();
      formData.append("problemFile", file);

      mgmtUploadFileBtn.disabled = true;
      mgmtUploadFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      const res = await manageFetch("/api/admin/problem-statement/upload", {
        method: "POST",
        body: formData
      });

      mgmtUploadFileBtn.disabled = false;
      mgmtUploadFileBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload & Deploy';

      if (res && res.ok) {
        showToast("Problem statement document uploaded successfully!", "success");
        loadProblemStatementData();
      }
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
  const importVccPrefix = document.getElementById("importVccPrefix");
  const importVccStart = document.getElementById("importVccStart");
  const dropZoneText = document.getElementById("dropZoneText");
  const importSuccessDownloadSection = document.getElementById("importSuccessDownloadSection");
  const importSuccessMsg = document.getElementById("importSuccessMsg");
  const downloadImportedCredsBtn = document.getElementById("downloadImportedCredsBtn");

  let parsedImportTeams = [];
  let lastImportedCredentials = [];

  // Robust phone number sanitizer for Indian & international formats
  function cleanPhoneNumber(raw) {
    if (!raw) return "";
    let digits = String(raw).replace(/[^0-9]/g, "");
    if (digits.length === 12 && digits.startsWith("91")) {
      digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith("0")) {
      digits = digits.slice(1);
    }
    if (digits.length < 6) {
      digits = (digits + "123456").slice(0, 8);
    }
    return digits;
  }

  // Intelligent column detector for Google Forms & CSV
  function detectColumns(headers) {
    const mapping = {
      vccId: -1,
      teamNo: -1,
      teamSize: -1,
      m1Name: -1,
      m1Email: -1,
      m1Phone: -1,
      m1College: -1,
      m1Branch: -1,
      m2Name: -1,
      m2Email: -1,
      m2Phone: -1,
      m2College: -1,
      m3Name: -1,
      m3Email: -1,
      m3Phone: -1,
      m4Name: -1,
      m4Email: -1,
      m4Phone: -1
    };

    headers.forEach((raw, idx) => {
      const h = raw.toLowerCase().trim();

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

      // Member 2
      if (/m2|member\s*2/i.test(h)) {
        if (/email/i.test(h)) mapping.m2Email = idx;
        else if (/phone|mobile|whatsapp|contact/i.test(h)) mapping.m2Phone = idx;
        else if (/college|institution/i.test(h)) mapping.m2College = idx;
        else if (/name/i.test(h)) mapping.m2Name = idx;
        return;
      }

      // Team / Leader / Member 1
      if (mapping.vccId === -1 && /vcc|team\s*id|team_id/i.test(h)) {
        mapping.vccId = idx;
      } else if (mapping.teamNo === -1 && /team\s*no|team_no|s\.?no|sl\.?no/i.test(h)) {
        mapping.teamNo = idx;
      } else if (mapping.teamSize === -1 && /team\s*size|team_size|members\s*count/i.test(h)) {
        mapping.teamSize = idx;
      } else if (mapping.m1Email === -1 && /email/i.test(h)) {
        mapping.m1Email = idx;
      } else if (mapping.m1Phone === -1 && /phone|mobile|whatsapp|contact/i.test(h)) {
        mapping.m1Phone = idx;
      } else if (mapping.m1College === -1 && /college|institution|university|campus|school/i.test(h)) {
        mapping.m1College = idx;
      } else if (mapping.m1Branch === -1 && /branch|dept|department|stream|course/i.test(h)) {
        mapping.m1Branch = idx;
      } else if (mapping.m1Name === -1 && /leader|m1|name/i.test(h)) {
        mapping.m1Name = idx;
      }
    });

    return mapping;
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

    const rawHeaders = splitCSVLine(lines[0]);
    const colMap = detectColumns(rawHeaders);

    const prefix = (importVccPrefix ? importVccPrefix.value.trim() : "VCC").toUpperCase() || "VCC";
    const startNum = parseInt(importVccStart ? importVccStart.value : 101) || 101;

    const teams = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = splitCSVLine(lines[i]);
      if (vals.length === 0 || vals.every(v => !v)) continue;

      const getVal = (idx) => (idx !== -1 && vals[idx] !== undefined) ? vals[idx].trim() : "";

      const leaderEmail = getVal(colMap.m1Email).toLowerCase();
      if (!leaderEmail) continue;

      let leaderPhone = cleanPhoneNumber(getVal(colMap.m1Phone));
      const leaderName = getVal(colMap.m1Name) || `Leader ${i}`;
      const college = getVal(colMap.m1College) || "School of Computing";
      const branch = getVal(colMap.m1Branch) || "Cyber Security";

      let vccId = getVal(colMap.vccId).toUpperCase();
      if (!vccId) {
        vccId = `${prefix}${startNum + (i - 1)}`;
      }

      const teamNo = parseInt(getVal(colMap.teamNo)) || i;

      const m2Name = getVal(colMap.m2Name);
      const m2Email = getVal(colMap.m2Email).toLowerCase();
      const m2Phone = cleanPhoneNumber(getVal(colMap.m2Phone));
      const m2College = getVal(colMap.m2College) || college;

      const m3Name = getVal(colMap.m3Name);
      const m3Email = getVal(colMap.m3Email).toLowerCase();
      const m3Phone = cleanPhoneNumber(getVal(colMap.m3Phone));

      const m4Name = getVal(colMap.m4Name);
      const m4Email = getVal(colMap.m4Email).toLowerCase();
      const m4Phone = cleanPhoneNumber(getVal(colMap.m4Phone));

      let calcSize = parseInt(getVal(colMap.teamSize)) || 1;
      if (!getVal(colMap.teamSize)) {
        if (m4Name) calcSize = 4;
        else if (m3Name) calcSize = 3;
        else if (m2Name) calcSize = 2;
      }

      const teamEntry = {
        VCC_ID: vccId,
        Team_No: teamNo,
        Team_Size: calcSize,
        M1_College: college,
        M1_Name: leaderName,
        M1_Email: leaderEmail,
        M1_Phone: leaderPhone,
        M1_Branch: branch
      };

      if (m2Name) {
        teamEntry.M2_Name = m2Name;
        teamEntry.M2_Email = m2Email;
        teamEntry.M2_Phone = m2Phone;
        teamEntry.M2_College = m2College;
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

  function handleParsedCSV(teams) {
    parsedImportTeams = teams;
    if (teams.length > 0) {
      if (importPreviewSection) importPreviewSection.style.display = "block";
      if (importCountBadge) importCountBadge.textContent = `${teams.length} Teams Ready`;
      if (importMappingSummary) {
        importMappingSummary.textContent = `Auto-mapped Email, Phone, Leader & College fields`;
      }
      if (executeImportBtn) executeImportBtn.disabled = false;

      if (importPreviewTableBody) {
        importPreviewTableBody.innerHTML = teams.slice(0, 8).map(t => `
          <tr>
            <td><strong style="color:var(--cyan); font-family:var(--font-mono);">${escapeHtml(t.VCC_ID)}</strong></td>
            <td><strong>${escapeHtml(t.M1_Name)}</strong></td>
            <td><span class="cred-chip">${escapeHtml(t.M1_Email)}</span></td>
            <td><span class="cred-chip" style="color:var(--green); font-weight:700;">${escapeHtml(t.M1_Phone)}</span></td>
            <td style="color:var(--text-3);">${escapeHtml(t.M1_College)}</td>
            <td><span class="vcc-badge">${t.Team_Size} Members</span></td>
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
    if (dropZoneText) dropZoneText.textContent = "Click or Drag & Drop Google Forms CSV file here";
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

  // Instant Download of Generated Credentials CSV
  if (downloadImportedCredsBtn) {
    downloadImportedCredsBtn.addEventListener("click", () => {
      if (lastImportedCredentials.length === 0) {
        showToast("No credentials available to export", "error");
        return;
      }

      const header = "Team_ID,Leader_Name,Login_Email,Login_Password,College,Team_Size\n";
      const rows = lastImportedCredentials.map(t => 
        `"${t.vccId || t.VCC_ID}","${t.leaderName || t.M1_Name}","${t.email || t.M1_Email}","${t.password || t.M1_Phone}","${t.college || t.M1_College || ''}",${t.teamSize || t.Team_Size || 2}`
      ).join("\n");

      const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Vibeathon_Imported_Credentials_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Credentials CSV downloaded!", "success");
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
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initial Data Load
  loadParticipants();
  loadSettings();
});
