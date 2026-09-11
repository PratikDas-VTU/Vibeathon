document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("manageLoginForm");
  const msgEl = document.getElementById("manageMsg");
  const loginBtn = document.getElementById("loginBtn");

  function showMessage(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = type === "success" ? "#34d399" : "#f87171";
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("adminId").value.trim();
    const password = document.getElementById("adminPassword").value.trim();

    if (!username || !password) {
      showMessage("Please enter both username and password.", "error");
      return;
    }

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
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
          loginBtn.innerHTML = '<span class="btn-text">Authenticate to Console</span>';
        }
        return;
      }

      // Store credentials and session
      localStorage.setItem("adminToken", data.token);
      localStorage.setItem("adminUser", data.admin?.username || username);
      showMessage("Authentication successful. Redirecting to Management Console...", "success");

      setTimeout(() => {
        window.location.replace("management.html");
      }, 500);

    } catch (err) {
      console.error("Management auth error:", err);
      showMessage("Unable to connect to authentication server. Check network connection.", "error");
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span class="btn-text">Authenticate to Console</span>';
      }
    }
  });
});
