function clearAdminSession() {
  localStorage.removeItem("adminToken");
  sessionStorage.clear();
  const pwd = document.getElementById("adminPassword");
  if (pwd) pwd.value = "";
}

clearAdminSession();

window.addEventListener("pageshow", () => {
  clearAdminSession();
});

document.addEventListener("DOMContentLoaded", () => {
  clearAdminSession();
  const form = document.getElementById("adminForm");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("adminId").value.trim();
    const password = document.getElementById("adminPassword").value.trim();

    if (!username || !password) {
      showMessage("Please enter admin credentials", "error");
      return;
    }

    try {
      const authFn = (typeof window !== "undefined" && window.safeAuthFetch)
        ? window.safeAuthFetch
        : async (endpoint, opts) => {
            const url = window.getApiUrl ? window.getApiUrl(endpoint) : endpoint;
            const r = await fetch(url, opts);
            let d = {};
            try { d = await r.json(); } catch(e) { d = { message: `HTTP ${r.status}` }; }
            return { res: r, data: d };
          };

      const { res, data } = await authFn(
        "/api/admin/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ username, password })
        },
        (statusText) => {
          showMessage(statusText, "info");
        }
      );

      if (!res.ok) {
        let errorMsg = data.message || data.error || "";
        if (typeof errorMsg === "string" && (errorMsg.includes("<") || errorMsg.includes(">") || errorMsg.toLowerCase().includes("internal server error"))) {
          errorMsg = "Authentication service is initializing. Please wait a moment and try again.";
        } else if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
          errorMsg = "Authentication gateway is waking up. Please retry in a few seconds.";
        }
        showMessage(errorMsg || "Invalid admin credentials", "error");
        return;
      }

      // S4/H-2: Store admin token in sessionStorage (tab-scoped, not persisted across restarts).
      // NOTE: HttpOnly Secure cookies would be stronger but require a backend auth-cookie endpoint.
      sessionStorage.setItem("adminToken", data.token);

      showMessage("Admin login successful", "success");

      setTimeout(() => {
        window.location.replace("admin-dashboard.html");
      }, 600);

    } catch (err) {
      if (!navigator.onLine) {
        showMessage("No internet connection detected. Please connect to Wi-Fi / Internet and try again.", "error");
      } else {
        showMessage("Unable to reach admin server. Please verify your connection and try again.", "error");
      }
    }
  });

  /* ======================
     UI MESSAGE HANDLER
     ====================== */
  function showMessage(text, type) {
    let msg = document.getElementById("adminMsg");

    if (!msg) {
      msg = document.createElement("div");
      msg.id = "adminMsg";
      msg.style.marginTop = "12px";
      msg.style.fontSize = "14px";
      form.appendChild(msg);
    }

    msg.textContent = text;
    msg.style.color = type === "success" ? "#4ade80" : "#f87171";
  }
});

