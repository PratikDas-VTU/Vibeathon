// Security: Clear any cached session tokens when arriving on the login page
function clearParticipantSession() {
  localStorage.removeItem("token");
  sessionStorage.clear();
  const pwd = document.getElementById("password");
  if (pwd) pwd.value = "";
}

// Clear immediately
clearParticipantSession();

// Also clear on pageshow (e.g. when user clicks browser Back button from dashboard)
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
      const loginUrl = window.getApiUrl ? window.getApiUrl("/api/auth/login") : "/api/auth/login";
      const res = await fetch(
        loginUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password })
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>ENTER DASHBOARD</span> <i class="fas fa-arrow-right"></i>';
        }

        let errorText = data.error || data.message || "";
        if (!errorText || errorText.toLowerCase().includes("server error") || res.status === 500) {
          errorText = "Wrong password or invalid credentials. Please check and try again.";
        }

        message.textContent = errorText;
        message.classList.add("error");
        return;
      }

      /* =====================
         STORE AUTH DATA
      ===================== */
      localStorage.setItem("token", data.token);

      message.textContent = "Login successful. Redirecting to workspace...";
      message.classList.add("success");

      /* =====================
         REDIRECT LOGIC
      ===================== */
      setTimeout(() => {
        window.location.replace("participant-dashboard.html");
      }, 400);

    } catch (err) {
      console.error("Login error:", err);
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
