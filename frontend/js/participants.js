// Security: Clear current tab session token when arriving on the login page
function clearParticipantSession() {
  sessionStorage.removeItem("token");
  const pwd = document.getElementById("password");
  if (pwd) pwd.value = "";
}

// Clear immediately for this tab
clearParticipantSession();

// Also clear on pageshow for this tab (e.g. when user clicks browser Back button)
window.addEventListener("pageshow", () => {
  clearParticipantSession();
});

document.addEventListener("DOMContentLoaded", () => {
  clearParticipantSession();

  const form = document.getElementById("participantForm");
  const message = document.getElementById("loginMessage");

  if (!form || !message) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    message.className = "login-message";
    message.textContent = "Connecting to server...";

    if (!email || !password) {
      message.textContent = "Email and password are required.";
      message.classList.add("error");
      return;
    }

    const btn = document.getElementById("loginBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>SIGNING IN...</span> <i class="fas fa-spinner fa-spin"></i>';
    }

    try {
      const authFn = (typeof window !== "undefined" && window.safeAuthFetch) 
        ? window.safeAuthFetch 
        : async (endpoint, opts) => {
            const url = window.getApiUrl ? window.getApiUrl(endpoint) : endpoint;
            const r = await fetch(url, opts);
            const d = await r.json().catch(() => ({}));
            return { res: r, data: d };
          };

      const { res, data } = await authFn(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password })
        },
        (statusText) => {
          message.textContent = statusText;
          message.className = "login-message";
          if (btn) {
            btn.innerHTML = `<span>CONNECTING...</span> <i class="fas fa-spinner fa-spin"></i>`;
          }
        }
      );

      if (!res.ok) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>ENTER DASHBOARD</span> <i class="fas fa-arrow-right"></i>';
        }

        let errorText = data.error || data.message || "";
        if (typeof errorText === "string" && (errorText.includes("<") || errorText.includes(">") || errorText.toLowerCase().includes("internal server error"))) {
          errorText = "Authentication service is initializing. Please wait a few seconds and try again.";
        } else if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
          errorText = "Authentication service is initializing. Please wait a few seconds and try again.";
        } else if (!errorText) {
          errorText = "Wrong password or invalid credentials. Please check and try again.";
        }

        message.textContent = errorText;
        message.classList.add("error");
        return;
      }

      /* =====================
         STORE AUTH DATA
      ===================== */
      sessionStorage.setItem("token", data.token);
      localStorage.setItem("token", data.token);
      if (data.team) {
        sessionStorage.setItem("teamProfile", JSON.stringify(data.team));
        localStorage.setItem("teamProfile", JSON.stringify(data.team));
      }

      message.textContent = "Login successful. Redirecting to workspace...";
      message.classList.add("success");

      /* =====================
         REDIRECT LOGIC
      ===================== */
      setTimeout(() => {
        window.location.replace("participant-dashboard.html");
      }, 400);

    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>ENTER DASHBOARD</span> <i class="fas fa-arrow-right"></i>';
      }
      if (!navigator.onLine) {
        message.textContent = "No internet connection detected. Please connect to Wi-Fi / Internet and try again.";
      } else {
        message.textContent = "Wrong password or unable to connect. Please check credentials and try again.";
      }
      message.classList.add("error");
    }
  });
});

/* =====================================================
   RULES & GUIDELINES MODAL (LOGIN PAGE)
===================================================== */
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggleRules");
  const rulesSection = document.getElementById("rules");
  const closeBtn = document.getElementById("closeRulesModal");
  const dismissBtn = document.getElementById("dismissRulesBtn");

  function openRules() {
    if (rulesSection) rulesSection.classList.remove("hidden");
  }

  function closeRules() {
    if (rulesSection) rulesSection.classList.add("hidden");
  }

  if (toggleBtn && rulesSection) {
    toggleBtn.addEventListener("click", () => {
      rulesSection.classList.toggle("hidden");
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", closeRules);
  if (dismissBtn) dismissBtn.addEventListener("click", closeRules);

  // Close when clicking overlay backdrop outside card
  if (rulesSection) {
    rulesSection.addEventListener("click", (e) => {
      if (e.target.classList.contains("rules-modal-overlay") || e.target === rulesSection) {
        closeRules();
      }
    });
  }

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && rulesSection && !rulesSection.classList.contains("hidden")) {
      closeRules();
    }
  });

  // Accordion behavior for individual rules
  document.querySelectorAll(".rule-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const content = btn.closest(".rule-item").querySelector(".rule-content");
      const isOpen = content.classList.contains("open");

      // toggle current
      content.classList.toggle("open");
      btn.textContent = isOpen ? "+" : "−";
    });
  });
});
