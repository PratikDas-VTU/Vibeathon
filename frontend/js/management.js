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
    } else {
      if (teamsTableBody) {
        teamsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--rose);">Failed to load teams: ${data.message || "Unknown error"}</td></tr>`;
      }
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

      let statusBadge = `<span class="status-pill">STANDBY</span>`;
      if (isDemo) statusBadge = `<span class="status-pill demo"><i class="fas fa-flask"></i> DEMO</span>`;
      else if (isLive) statusBadge = `<span class="status-pill active"><i class="fas fa-satellite-dish"></i> LIVE</span>`;
      else if (isEnded) statusBadge = `<span class="status-pill ended"><i class="fas fa-lock"></i> ENDED</span>`;

      const hasGithub = Boolean(t.githubUrl);
      const hasDeploy = Boolean(t.deploymentUrl);
      const deliverableSummary = `${hasGithub ? '<i class="fab fa-github" style="color:var(--cyan);" title="GitHub Submitted"></i>' : '<span style="opacity:0.3;">GH</span>'} &nbsp; ${hasDeploy ? '<i class="fas fa-external-link-alt" style="color:var(--green);" title="Live Demo Submitted"></i>' : '<span style="opacity:0.3;">URL</span>'}`;

      return `
        <tr>
          <td><span class="vcc-badge">${t.vccId || "—"}</span></td>
          <td>
            <div style="font-weight: 600; color: var(--text-1);">${escapeHtml(t.M1_Name || "Team Leader")}</div>
            <div style="font-size: 0.72rem; color: var(--text-3);">${escapeHtml(t.college || "—")}</div>
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
    if (!confirm(`Reset session and 2-hour countdown for Team ${vccId}?`)) return;

    const res = await manageFetch(`/api/manage/teams/${vccId}/reset`, { method: "POST" });
    if (res && res.ok) {
      showToast(`Team ${vccId} timer reset and session unlocked!`, "success");
      loadParticipants();
    }
  };

  // Single Team Delete
  window.deleteTeamSingle = async (vccId) => {
    if (!confirm(`Are you sure you want to completely delete Team ${vccId}? This removes their login account and database records.`)) return;

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
        activeDemoList = data.demoTeams || [];
        showToast(`Provisioned ${activeDemoList.length} demo accounts!`, "success");
        renderDemoList(activeDemoList);
        loadParticipants();
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
      if (!confirm(`Delete all test accounts with prefix "${prefix}"? Real participants will NOT be affected.`)) return;

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
    if (releaseToggle && currentSettings.problemStatement) {
      const isReleased = currentSettings.problemStatement.released !== false;
      releaseToggle.checked = isReleased;
      if (releaseLabel) {
        releaseLabel.textContent = isReleased ? "RELEASED" : "FROZEN / HIDDEN";
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
    const data = await res.json();
    if (mgmtActiveFileName) mgmtActiveFileName.textContent = data.fileName || "Problem Statement.docx";
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

  if (refreshLogsBtn) refreshLogsBtn.addEventListener("click", loadAuditLogs);

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
