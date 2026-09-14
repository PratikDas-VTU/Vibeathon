import { authFetch } from "./authfetch.js";

document.addEventListener("DOMContentLoaded", async () => {

  /* ===================== STATE ===================== */
  let timerInterval = null;

  let team;
  let TEAM_ID;
  let VCC_ID; // Declare at top level
  let hackathonStart = null;
  let sessionEnded = false;

  /* ===================== TOAST NOTIFICATION SYSTEM ===================== */
  function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const iconClass = type === "success"
      ? "fa-check-circle"
      : type === "error"
        ? "fa-exclamation-circle"
        : "fa-info-circle";

    toast.innerHTML = `<i class="fas ${iconClass}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3600);
  }

  /* ===================== HELPERS ===================== */
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  const isValidGitHubUrl = url =>
    /^https:\/\/(www\.)?github\.com\/[^\/]+\/[^\/]+/.test(url);

  const isValidDeploymentUrl = url => {
    try { new URL(url); return true; } catch { return false; }
  };

  function freezeUI() {
    [
      githubInput, deployInput,
      submitGithubBtn, submitDeployBtn,
      aiInput, promptInput, submitPromptBtn,
      endBtn, downloadBtn
    ].forEach(el => el && (el.disabled = true));
  }

  function showSessionEndedUI() {
    sessionEnded = true;
    stopTimer();

    freezeUI();
    if (timerEl) {
      timerEl.textContent = "00:00:00";
      timerEl.classList.add("session-ended");
    }

    const arenaStatus = document.getElementById("arenaStatus");
    if (arenaStatus) {
      arenaStatus.textContent = "SESSION CONCLUDED";
      arenaStatus.classList.remove("status-active");
      arenaStatus.style.color = "var(--rose-400)";
    }

    if (sessionModal) {
      sessionModal.classList.add("show");
    }
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function showSuspendedUI(reason) {
    stopTimer();
    freezeUI();
    if (timerEl) {
      timerEl.textContent = "SUSPENDED";
      timerEl.classList.add("session-ended");
      timerEl.style.color = "var(--rose-400)";
    }

    const arenaStatus = document.getElementById("arenaStatus");
    if (arenaStatus) {
      arenaStatus.innerHTML = `<span style="color:var(--rose-400); font-weight:700;"><i class="fas fa-ban"></i> ACCOUNT SUSPENDED</span>`;
      arenaStatus.classList.remove("status-active");
    }

    let banner = document.getElementById("securitySuspensionBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "securitySuspensionBanner";
      banner.style.cssText = "position:fixed; top:0; left:0; right:0; z-index:99999; background:#7f1d1d; color:#fecaca; padding:14px 20px; text-align:center; font-family:var(--font-sans, sans-serif); font-size:14px; font-weight:600; box-shadow:0 4px 25px rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; gap:12px;";
      document.body.prepend(banner);
    }
    banner.innerHTML = `<i class="fas fa-shield-alt" style="font-size:1.3rem; color:#f87171;"></i> <span><strong>ACCOUNT SUSPENDED:</strong> Suspicious activity detected (${escapeHtml(reason || "Security violation")}). Please visit the Event Coordinator / ITC Desk to review your account.</span>`;
  }

  /* ===================== LOAD TEAM ===================== */
  console.log("🔍 Starting team load process...");

  try {
    const res = await authFetch(
      "/api/team/me"
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (res.status === 403 && errData.blocked) {
        showSuspendedUI(errData.blockReason || errData.message);
        return;
      }
      throw new Error(`Server returned status ${res.status}`);
    }

    const teamData = await res.json();
    team = teamData;
    TEAM_ID = team.teamId || team.id || team.vccId;
    VCC_ID = TEAM_ID;
    sessionEnded = team.sessionEnded === true;

    if (team.blocked === true) {
      showSuspendedUI(team.blockReason);
    }

    console.log("✅ Team loaded successfully:", TEAM_ID);

  } catch (error) {
    console.error("❌ TEAM LOAD ERROR:", error);
    showToast("Failed to load team data from server", "error");
    return;
  }

  /* ===================== ELEMENTS ===================== */
  const timerEl = document.getElementById("timer");

  const githubInput = document.getElementById("githubUrl");
  const deployInput = document.getElementById("deploymentUrl");
  const submitGithubBtn = document.getElementById("submitGithub");
  const submitDeployBtn = document.getElementById("submitDeployment");

  const githubStatus = document.getElementById("githubStatus");
  const deploymentStatus = document.getElementById("deploymentStatus");
  const githubError = document.getElementById("githubError");
  const deployError = document.getElementById("deployError");

  const aiInput = document.getElementById("aiNameInput");
  const promptInput = document.getElementById("promptInput");
  const submitPromptBtn = document.getElementById("submitPrompt");
  const promptTable = document.getElementById("promptTable");

  const logoutBtn = document.getElementById("logoutBtn");
  const endBtn = document.getElementById("endSession");

  const confirmModal = document.getElementById("confirmModal");
  const confirmEndBtn = document.getElementById("confirmEnd");
  const cancelEndBtn = document.getElementById("cancelEnd");
  const sessionModal = document.getElementById("sessionModal");

  const downloadBtn = document.getElementById("downloadProblem");
  const copyTeamIdBtn = document.getElementById("copyTeamIdBtn");

  // ===== POPULATE TEAM INFO =====
  const headerTeamEl = document.getElementById("headerTeamId");
  const teamIdEl = document.getElementById("teamId");
  const teamSizeEl = document.getElementById("teamSize");

  if (headerTeamEl) headerTeamEl.textContent = TEAM_ID || "TEAM";
  if (teamIdEl) teamIdEl.textContent = TEAM_ID || "—";
  if (teamSizeEl) teamSizeEl.textContent = `${team.teamSize || 1} BUILDER${team.teamSize > 1 ? "S" : ""}`;

  // Copy Team ID functionality
  if (copyTeamIdBtn) {
    copyTeamIdBtn.onclick = () => {
      if (TEAM_ID) {
        navigator.clipboard.writeText(TEAM_ID).then(() => {
          showToast(`Team ID ${TEAM_ID} copied to clipboard!`, "success");
        }).catch(() => {
          showToast(`Team ID: ${TEAM_ID}`, "info");
        });
      }
    };
  }

  // Populate Squad Roster
  const membersList = document.getElementById("teamMembersList");
  if (membersList) {
    membersList.innerHTML = "";

    let cachedProfile = null;
    try {
      cachedProfile = JSON.parse(sessionStorage.getItem("teamProfile") || "null");
    } catch (e) {}

    const sourceTeam = (cachedProfile && !team.M1_Name && (!team.members || team.members.length === 0))
      ? { ...cachedProfile, ...team }
      : team;

    const rawMembers = Array.isArray(sourceTeam.members) && sourceTeam.members.length > 0
      ? sourceTeam.members
      : [
          ...(sourceTeam.M1_Name || sourceTeam.leaderName || sourceTeam.name ? [{
            name: sourceTeam.M1_Name || sourceTeam.leaderName || sourceTeam.name,
            email: sourceTeam.M1_Email || sourceTeam.email || "",
            phone: sourceTeam.M1_Phone || sourceTeam.phone || "",
            college: sourceTeam.M1_College || sourceTeam.college || "",
            branch: sourceTeam.M1_Branch || sourceTeam.branch || "",
            vtuNo: sourceTeam.M1_VtuNo || sourceTeam.m1VtuNo || (sourceTeam.M1_Email && sourceTeam.M1_Email.match(/(vtu\d+)/i) ? sourceTeam.M1_Email.match(/(vtu\d+)/i)[1].toUpperCase() : ""),
            isLeader: true
          }] : []),
          ...(sourceTeam.M2_Name && sourceTeam.M2_Name !== "NA" && sourceTeam.M2_Name !== "undefined" ? [{
            name: sourceTeam.M2_Name,
            email: sourceTeam.M2_Email || sourceTeam.m2Email || "",
            phone: sourceTeam.M2_Phone || sourceTeam.m2Phone || "",
            college: sourceTeam.M2_College || sourceTeam.college || "",
            branch: sourceTeam.M2_Branch || sourceTeam.m2Branch || sourceTeam.M1_Branch || "",
            vtuNo: sourceTeam.M2_VtuNo || sourceTeam.m2VtuNo || (sourceTeam.M2_Email && sourceTeam.M2_Email.match(/(vtu\d+)/i) ? sourceTeam.M2_Email.match(/(vtu\d+)/i)[1].toUpperCase() : ""),
            isLeader: false
          }] : [])
        ];

    const memberData = rawMembers.map((m, index) => {
      const vtu = m.vtuNo || (m.email && m.email.match(/(vtu\d+)/i) ? m.email.match(/(vtu\d+)/i)[1].toUpperCase() : "");
      return {
        ...m,
        vtuNo: vtu,
        isLeader: m.isLeader !== undefined ? m.isLeader : (index === 0)
      };
    });

    if (memberData.length === 0) {
      membersList.innerHTML = `<li class="squad-card" style="color:var(--text-3); font-style:italic;">No member details registered.</li>`;
    } else {
      memberData.forEach((m, index) => {
        const li = document.createElement("li");
        li.className = "squad-card";

        const rawName = String(m.name || "Participant").trim();
        const initials = rawName
          .split(" ")
          .filter(Boolean)
          .map(p => p[0])
          .slice(0, 2)
          .join("")
          .toUpperCase() || "P";

        const isLeader = m.isLeader === true || index === 0;
        const roleBadge = isLeader
          ? '<span class="squad-role-tag leader"><i class="fas fa-crown"></i> LEADER</span>'
          : '<span class="squad-role-tag member"><i class="fas fa-user"></i> MEMBER</span>';

        li.innerHTML = `
          <div class="squad-avatar">${escapeHtml(initials)}</div>
          <div class="squad-info">
            <div class="squad-name-row">
              <span class="squad-name">${escapeHtml(m.name || "Participant")}</span>
              ${roleBadge}
            </div>
            <div class="squad-meta">
              ${m.email ? `<span class="squad-meta-item" title="Official VTU Email"><i class="fas fa-envelope"></i> ${escapeHtml(m.email)}</span>` : ""}
              ${m.phone ? `<span class="squad-meta-item" title="Mobile / WhatsApp"><i class="fas fa-phone"></i> ${escapeHtml(m.phone)}</span>` : ""}
              ${m.branch ? `<span class="squad-meta-item" title="Department / Branch"><i class="fas fa-code-branch"></i> ${escapeHtml(m.branch)}</span>` : ""}
              ${m.vtuNo ? `<span class="squad-meta-item" title="VTU Roll Number"><i class="fas fa-id-card"></i> ${escapeHtml(m.vtuNo)}</span>` : ""}
              ${m.college ? `<span class="squad-meta-item" title="College"><i class="fas fa-graduation-cap"></i> ${escapeHtml(m.college)}</span>` : ""}
            </div>
          </div>
        `;
        membersList.appendChild(li);
      });
    }
  }

  /* ===================== UPDATE ARTIFACT STATUS & PREVIEW LINKS ===================== */
  function updateArtifactTelemetry() {
    let count = 0;
    const dotGh = document.getElementById("dotGithub");
    const dotDep = document.getElementById("dotDeploy");
    const summary = document.getElementById("artifactSummary");

    if (team.githubUrl) {
      count++;
      if (dotGh) {
        dotGh.classList.add("active");
        dotGh.title = "GitHub: Submitted";
      }
    } else {
      if (dotGh) dotGh.classList.remove("active");
    }

    if (team.deploymentUrl) {
      count++;
      if (dotDep) {
        dotDep.classList.add("active");
        dotDep.title = "Deployment: Submitted";
      }
    } else {
      if (dotDep) dotDep.classList.remove("active");
    }

    if (summary) {
      summary.textContent = `${count} / 2 SUBMITTED`;
      if (count === 2) {
        summary.style.color = "var(--emerald-400)";
      }
    }
  }

  // Check saved GitHub URL
  if (team.githubUrl) {
    githubInput.value = team.githubUrl;
    githubStatus.textContent = "✅ Saved";
    githubStatus.className = "status success";
    deployInput.disabled = false;
    submitDeployBtn.disabled = false;

    const ghLinkWrap = document.getElementById("githubLinkContainer");
    const ghLink = document.getElementById("githubPreviewLink");
    if (ghLinkWrap && ghLink) {
      ghLink.href = team.githubUrl;
      ghLinkWrap.style.display = "block";
    }
  }

  // Check saved Deployment URL
  if (team.deploymentUrl) {
    deployInput.value = team.deploymentUrl;
    deploymentStatus.textContent = "✅ Saved";
    deploymentStatus.className = "status success";

    const depLinkWrap = document.getElementById("deployLinkContainer");
    const depLink = document.getElementById("deployPreviewLink");
    if (depLinkWrap && depLink) {
      depLink.href = team.deploymentUrl;
      depLinkWrap.style.display = "block";
    }
  }

  updateArtifactTelemetry();

  /* ===================== SESSION ENDED ON LOAD ===================== */
  if (sessionEnded) {
    showSessionEndedUI();
    return;
  }

  /* ===================== NAVIGATION SECURITY ===================== */
  // Intercept back button navigation to securely logout rather than leaving exposed state
  try {
    history.pushState(null, document.title, location.href);
  } catch (e) {}

  window.addEventListener("popstate", () => {
    sessionStorage.removeItem("token");
    window.location.replace("participant-login.html");
  });

  /* ===================== TIMER & HACKATHON START ===================== */
  const TOTAL_TIME = 2 * 60 * 60; // 2 hours in seconds

  function updateTimerTick() {
    if (sessionEnded || !hackathonStart) return;

    const elapsed = Math.floor((Date.now() - hackathonStart) / 1000);
    const remaining = Math.max(TOTAL_TIME - elapsed, 0);

    const hours = String(Math.floor(remaining / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
    const seconds = String(remaining % 60).padStart(2, "0");

    if (timerEl) {
      timerEl.textContent = `${hours}:${minutes}:${seconds}`;
    }

    if (remaining === 0 && !sessionEnded) {
      showSessionEndedUI();
    }
  }

  // Check if we have a locally cached start time for this team to render immediately
  const cachedStart = localStorage.getItem("hackathonStart_" + TEAM_ID);
  if (cachedStart) {
    hackathonStart = new Date(cachedStart).getTime();
    updateTimerTick();
  }

  try {
    const startRes = await authFetch(
      "/api/submission/start",
      { method: "POST" }
    );
    const startData = await startRes.json();
    if (startData && startData.hackathonStart) {
      hackathonStart = new Date(startData.hackathonStart).getTime();
      localStorage.setItem("hackathonStart_" + TEAM_ID, startData.hackathonStart);
      updateTimerTick();
    }
  } catch (err) {
    console.error("Timer start check error:", err);
  }

  // ===== PROBLEM STATEMENT & ANNOUNCEMENT SYNCHRONIZATION =====
  const announcementBanner = document.getElementById("announcementBanner");
  const announcementText = document.getElementById("announcementText");
  const downloadStatusChip = document.getElementById("downloadStatusChip");

  let activeProblemFileName = "Problem_Statement.docx";

  async function checkLivePlatformStatus() {
    try {
      const statusUrl = window.getApiUrl ? window.getApiUrl("/api/problem-statement/status") : "/api/problem-statement/status";
      const res = await fetch(statusUrl);
      if (!res.ok) return;

      const data = await res.json();

      // 1. Live Announcements
      if (announcementBanner && announcementText) {
        if (data.announcement) {
          announcementText.textContent = data.announcement;
          announcementBanner.style.display = "flex";
        } else {
          announcementBanner.style.display = "none";
        }
      }

      // 2. Problem Statement Release Status
      if (data.fileName) activeProblemFileName = data.fileName;

      if (downloadBtn) {
        if (!data.released) {
          downloadBtn.disabled = true;
          downloadBtn.innerHTML = '<i class="fas fa-lock"></i> <span>NOT YET RELEASED</span>';
          if (downloadStatusChip) {
            downloadStatusChip.innerHTML = '<i class="fas fa-lock"></i> Not yet released by organizers';
            downloadStatusChip.style.borderColor = "rgba(244, 63, 94, 0.4)";
            downloadStatusChip.style.color = "#fb7185";
          }
        } else {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = '<i class="fas fa-download"></i> <span>DOWNLOAD PROBLEM STATEMENT</span>';
          if (downloadStatusChip) {
            downloadStatusChip.innerHTML = '<i class="fas fa-check-circle"></i> Available for download';
            downloadStatusChip.style.borderColor = "rgba(16, 185, 129, 0.4)";
            downloadStatusChip.style.color = "#34d399";
          }
        }
      }
    } catch (err) {
      console.warn("Platform status sync note:", err);
    }
  }

  // Initial check & periodic poll every 15 seconds
  checkLivePlatformStatus();
  setInterval(checkLivePlatformStatus, 15000);

  if (downloadBtn) {
    downloadBtn.onclick = async () => {
      try {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>DOWNLOADING...</span>';

        const res = await authFetch("/api/submission/problem-statement");

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          showToast(errJson.message || "Problem statement not available yet", "error");
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = '<i class="fas fa-download"></i> <span>DOWNLOAD PROBLEM STATEMENT</span>';
          return;
        }

        let downloadFileName = activeProblemFileName || "Vibeathon_Problem_Statement.docx";
        const disposition = res.headers.get("Content-Disposition");
        if (disposition && disposition.includes("filename=")) {
          const match = disposition.match(/filename="?([^";]+)"?/);
          if (match && match[1]) downloadFileName = match[1];
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = downloadFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(url), 2000);

        showToast("Problem statement downloaded successfully!", "success");
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<i class="fas fa-check-circle"></i> <span>DOWNLOAD AGAIN</span>';
      } catch (err) {
        console.error("Download error:", err);
        showToast("Failed to download problem statement: " + err.message, "error");
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> <span>DOWNLOAD PROBLEM STATEMENT</span>';
      }
    };
  }


  // Active Timer Interval
  timerInterval = setInterval(updateTimerTick, 1000);

  /* ===================== SUBMISSIONS ===================== */
  submitGithubBtn.onclick = async () => {
    const val = githubInput.value.trim();
    if (!isValidGitHubUrl(val)) {
      githubError.textContent = "Please enter a valid GitHub repository URL (e.g. https://github.com/user/repo)";
      githubInput.focus();
      return;
    }
    githubError.textContent = "";

    try {
      submitGithubBtn.disabled = true;
      submitGithubBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SUBMITTING...';

      const res = await authFetch(
        "/api/submission/github",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ githubUrl: val })
        }
      );

      if (res.ok) {
        showToast("GitHub repository saved successfully!", "success");
        team.githubUrl = val;
        githubStatus.textContent = "✅ Saved";
        githubStatus.className = "status success";
        deployInput.disabled = false;
        submitDeployBtn.disabled = false;

        const ghLinkWrap = document.getElementById("githubLinkContainer");
        const ghLink = document.getElementById("githubPreviewLink");
        if (ghLinkWrap && ghLink) {
          ghLink.href = val;
          ghLinkWrap.style.display = "block";
        }
        updateArtifactTelemetry();
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 && errData.blocked) {
          showSuspendedUI(errData.blockReason || errData.message);
          showToast(errData.message || "Account suspended due to security violation.", "error");
          return;
        }
        githubError.textContent = errData.message || "Failed to save GitHub URL.";
        showToast(errData.message || "Failed to save GitHub URL", "error");
      }
    } catch (err) {
      console.error("GitHub submit error:", err);
      githubError.textContent = "Network error. Please try again.";
      showToast("Network error saving GitHub URL", "error");
    } finally {
      submitGithubBtn.disabled = false;
      submitGithubBtn.innerHTML = '<i class="fas fa-upload"></i> SUBMIT GITHUB';
    }
  };

  submitDeployBtn.onclick = async () => {
    const val = deployInput.value.trim();
    if (!isValidDeploymentUrl(val)) {
      deployError.textContent = "Please enter a valid deployment URL (e.g. https://your-project.vercel.app)";
      deployInput.focus();
      return;
    }
    deployError.textContent = "";

    try {
      submitDeployBtn.disabled = true;
      submitDeployBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SUBMITTING...';

      const res = await authFetch(
        "/api/submission/deployment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deploymentUrl: val })
        }
      );

      if (res.ok) {
        showToast("Live deployment URL saved successfully!", "success");
        team.deploymentUrl = val;
        deploymentStatus.textContent = "✅ Saved";
        deploymentStatus.className = "status success";

        const depLinkWrap = document.getElementById("deployLinkContainer");
        const depLink = document.getElementById("deployPreviewLink");
        if (depLinkWrap && depLink) {
          depLink.href = val;
          depLinkWrap.style.display = "block";
        }
        updateArtifactTelemetry();
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 && errData.blocked) {
          showSuspendedUI(errData.blockReason || errData.message);
          showToast(errData.message || "Account suspended due to security violation.", "error");
          return;
        }
        deployError.textContent = errData.message || "Failed to save deployment URL.";
        showToast(errData.message || "Failed to save deployment URL", "error");
      }
    } catch (err) {
      console.error("Deploy submit error:", err);
      deployError.textContent = "Network error. Please try again.";
      showToast("Network error saving deployment URL", "error");
    } finally {
      submitDeployBtn.disabled = false;
      submitDeployBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> SUBMIT DEPLOYMENT';
    }
  };

  /* ===================== PROMPT TELEMETRY CONSOLE ===================== */

  // Quick Select AI Model Pills
  document.querySelectorAll(".ai-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const model = pill.getAttribute("data-model");
      if (model && aiInput) {
        aiInput.value = model;
        document.querySelectorAll(".ai-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        if (promptInput) promptInput.focus();
      }
    });
  });

  // Prompt Character Counter
  const charCountEl = document.getElementById("promptCharCount");
  if (promptInput && charCountEl) {
    promptInput.addEventListener("input", () => {
      const len = promptInput.value.length;
      charCountEl.textContent = `${len} character${len === 1 ? "" : "s"}`;
    });
  }

  // Shortcut: Ctrl + Enter to submit prompt
  if (promptInput) {
    promptInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitPromptBtn.click();
      }
    });
  }

  submitPromptBtn.onclick = async () => {
    const tool = aiInput.value.trim();
    const text = promptInput.value.trim();

    if (!tool) {
      showToast("Please select or enter the AI tool used", "error");
      aiInput.focus();
      return;
    }

    if (!text) {
      showToast("Please enter the prompt passed to the AI", "error");
      promptInput.focus();
      return;
    }

    try {
      submitPromptBtn.disabled = true;
      submitPromptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> LOGGING...';

      const res = await authFetch(
        "/api/submission/prompt",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiTool: tool, promptText: text })
        }
      );

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast("Prompt logged to telemetry stream!", "success");
        promptInput.value = "";
        if (charCountEl) charCountEl.textContent = "0 characters";
        await loadPrompts();

        // 10s pacing cooldown countdown on button
        let remainingSeconds = 10;
        submitPromptBtn.disabled = true;
        submitPromptBtn.innerHTML = `<i class="fas fa-hourglass-half fa-spin"></i> <span>COOLDOWN (${remainingSeconds}s)</span>`;
        const cdInterval = setInterval(() => {
          remainingSeconds--;
          if (remainingSeconds <= 0) {
            clearInterval(cdInterval);
            submitPromptBtn.disabled = false;
            submitPromptBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>LOG PROMPT TO TELEMETRY</span>';
          } else {
            submitPromptBtn.innerHTML = `<i class="fas fa-hourglass-half fa-spin"></i> <span>COOLDOWN (${remainingSeconds}s)</span>`;
          }
        }, 1000);
        return;
      } else if (res.status === 403 && data.blocked) {
        showSuspendedUI(data.blockReason || data.message);
        showToast(data.message || "Account suspended due to detected security violation.", "error");
      } else if (res.status === 429) {
        const waitSec = data.waitSeconds || 10;
        showToast(data.message || `Please wait ${waitSec}s between prompt submissions.`, "warning");
        let remainingSeconds = waitSec;
        submitPromptBtn.disabled = true;
        submitPromptBtn.innerHTML = `<i class="fas fa-hourglass-half fa-spin"></i> <span>COOLDOWN (${remainingSeconds}s)</span>`;
        const cdInterval = setInterval(() => {
          remainingSeconds--;
          if (remainingSeconds <= 0) {
            clearInterval(cdInterval);
            submitPromptBtn.disabled = false;
            submitPromptBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>LOG PROMPT TO TELEMETRY</span>';
          } else {
            submitPromptBtn.innerHTML = `<i class="fas fa-hourglass-half fa-spin"></i> <span>COOLDOWN (${remainingSeconds}s)</span>`;
          }
        }, 1000);
        return;
      } else {
        showToast(data.message || "Failed to log prompt to server", "error");
      }
    } catch (err) {
      console.error("Submit prompt error:", err);
      showToast("Network error submitting prompt", "error");
    } finally {
      if (!submitPromptBtn.disabled) {
        submitPromptBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>LOG PROMPT TO TELEMETRY</span>';
      }
    }
  };

  async function loadPrompts() {
    try {
      const res = await authFetch(
        "/api/submission/prompts"
      );

      const rawPrompts = await res.json();
      const prompts = Array.isArray(rawPrompts)
        ? rawPrompts.filter(p => !p.teamId || p.teamId === TEAM_ID || p.vccId === TEAM_ID)
        : [];
      promptTable.innerHTML = "";

      // Update counters (Prompt count only, do not expose internal AI score to participants)
      const countEl = document.getElementById("promptCount");
      const feedCountEl = document.getElementById("promptFeedCount");
      const emptyState = document.getElementById("emptyPromptState");

      if (countEl) {
        countEl.textContent = `${prompts.length} PROMPT${prompts.length === 1 ? "" : "S"}`;
      }

      if (feedCountEl) {
        feedCountEl.textContent = `${prompts.length} Logged`;
      }

      if (emptyState) {
        if (prompts.length === 0) {
          emptyState.classList.add("show");
        } else {
          emptyState.classList.remove("show");
        }
      }

      // Populate datalist with unique AI tools
      const uniqueAITools = [...new Set(prompts.map(p => p.aiTool).filter(Boolean))];
      const datalist = document.getElementById("aiToolsList");
      if (datalist) {
        datalist.innerHTML = "";
        uniqueAITools.forEach(tool => {
          const option = document.createElement("option");
          option.value = tool;
          datalist.appendChild(option);
        });
      }

      prompts.forEach((p, i) => {
        const card = document.createElement("div");
        card.className = "prompt-card";

        const CLAMP_LEN = 220; // characters before truncation
        const fullText = p.promptText || "";
        const isLong = fullText.length > CLAMP_LEN;
        const preview = isLong ? fullText.slice(0, CLAMP_LEN) + "…" : fullText;

        const dt = new Date(p.submittedAt);
        const timeStr = isNaN(dt.getTime())
          ? "Just now"
          : dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        // Participant status badge: Simply indicates prompt is logged/received
        const evalBadge = `<span class="pc-eval-pill evaluated"><i class="fas fa-check-circle"></i> Logged</span>`;

        card.innerHTML = `
          <div class="pc-header">
            <div class="pc-meta">
              <span class="pc-num">#${i + 1}</span>
              <span class="ai-tool-badge">${escapeHtml(p.aiTool || "AI")}</span>
              ${evalBadge}
            </div>
            <span class="pc-time">${timeStr}</span>
          </div>
          <div class="pc-body">
            <p class="pc-text" data-full="${escapeHtml(fullText)}" data-preview="${escapeHtml(preview)}" data-expanded="false">${escapeHtml(preview)}</p>
            ${isLong ? `<button class="pc-toggle" type="button">Show more <i class="fas fa-chevron-down"></i></button>` : ""}
          </div>
        `;

        // Wire up Show more / Show less toggle
        if (isLong) {
          const toggle = card.querySelector(".pc-toggle");
          const textEl = card.querySelector(".pc-text");
          toggle.addEventListener("click", () => {
            const expanded = textEl.dataset.expanded === "true";
            if (expanded) {
              textEl.textContent = textEl.dataset.preview;
              textEl.dataset.expanded = "false";
              toggle.innerHTML = `Show more <i class="fas fa-chevron-down"></i>`;
            } else {
              textEl.textContent = textEl.dataset.full;
              textEl.dataset.expanded = "true";
              toggle.innerHTML = `Show less <i class="fas fa-chevron-up"></i>`;
            }
          });
        }

        promptTable.appendChild(card);
      });

    } catch (err) {
      console.error("Load prompts error:", err);
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  loadPrompts();

  /* ===================== LOGOUT + END SESSION ===================== */
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      stopTimer();
      sessionStorage.clear();
      localStorage.removeItem("token");
      location.href = "participant-login.html";
    };
  }

  if (endBtn) {
    endBtn.onclick = () => {
      if (confirmModal) confirmModal.classList.add("show");
    };
  }

  if (confirmEndBtn) {
    confirmEndBtn.onclick = async () => {
      try {
        confirmEndBtn.disabled = true;
        confirmEndBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> LOCKING...';

        await authFetch(
          "/api/submission/end",
          { method: "POST" }
        );

        if (confirmModal) confirmModal.classList.remove("show");
        showSessionEndedUI();
      } catch (err) {
        console.error("End session error:", err);
        showToast("Failed to lock session", "error");
        confirmEndBtn.disabled = false;
        confirmEndBtn.innerHTML = '<i class="fas fa-lock"></i> Yes, End Session';
      }
    };
  }

  if (cancelEndBtn) {
    cancelEndBtn.onclick = () => {
      if (confirmModal) confirmModal.classList.remove("show");
    };
  }

});
