document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("manageLoginForm");
  const adminIdInput = document.getElementById("adminId");
  const adminPasswordInput = document.getElementById("adminPassword");
  const loginBtn = document.getElementById("loginBtn");
  const authMsgBox = document.getElementById("authMsgBox");
  const msgText = document.getElementById("msgText");
  const msgIcon = document.getElementById("msgIcon");
  const togglePwdBtn = document.getElementById("togglePwdBtn");
  const togglePwdIcon = document.getElementById("togglePwdIcon");
  const quickFillBtn = document.getElementById("quickFillBtn");

  // Show/Hide Password Toggle
  if (togglePwdBtn && adminPasswordInput && togglePwdIcon) {
    togglePwdBtn.addEventListener("click", () => {
      const isPassword = adminPasswordInput.type === "password";
      adminPasswordInput.type = isPassword ? "text" : "password";
      togglePwdIcon.className = isPassword ? "far fa-eye-slash" : "far fa-eye";
    });
  }

  // Quick-Fill Credentials Helper
  if (quickFillBtn && adminIdInput && adminPasswordInput) {
    quickFillBtn.addEventListener("click", () => {
      adminIdInput.value = "admin";
      adminPasswordInput.value = "admin123";
      hideMessage();
      adminPasswordInput.focus();
    });
  }

  function showMessage(text, type = "error") {
    if (!authMsgBox || !msgText || !msgIcon) return;
    authMsgBox.className = `auth-msg-box ${type}`;
    msgText.textContent = text;
    msgIcon.className = type === "success" ? "fas fa-check-circle" : "fas fa-exclamation-circle";
  }

  function hideMessage() {
    if (authMsgBox) authMsgBox.className = "auth-msg-box";
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessage();

    const username = adminIdInput.value.trim();
    const password = adminPasswordInput.value.trim();

    if (!username || !password) {
      showMessage("Please provide both admin username and password.", "error");
      return;
    }

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Authenticating to Gateway...</span>';
    }

    try {
      const loginUrl = window.getApiUrl ? window.getApiUrl("/api/admin/login") : "/api/admin/login";
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showMessage(data.message || "Invalid administrative credentials.", "error");
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerHTML = '<i class="fas fa-terminal"></i> <span class="btn-text">Authenticate to Gateway</span>';
        }
        return;
      }

      // Store tokens and admin username
      localStorage.setItem("adminToken", data.token);
      localStorage.setItem("adminUser", data.admin?.username || username);

      showMessage("Credentials verified. Access granted! Launching console...", "success");

      setTimeout(() => {
        window.location.replace("management.html");
      }, 500);

    } catch (err) {
      console.error("Management auth error:", err);
      showMessage("Unable to connect to authentication gateway. Please check network connection.", "error");
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-terminal"></i> <span class="btn-text">Authenticate to Gateway</span>';
      }
    }
  });
});
