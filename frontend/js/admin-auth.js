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
    console.error("Admin login form not found");
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

      console.log("📦 Admin login response data:", data);

      if (!res.ok) {
        console.error("❌ Admin login failed:", data.message);
        showMessage(data.message || "Invalid admin credentials", "error");
        return;
      }

      console.log("✅ Admin login successful!");
      console.log("🎫 Storing admin token securely");

      // ✅ Store admin JWT
      localStorage.setItem("adminToken", data.token);

      console.log("✅ Admin token stored in localStorage");
      console.log("🔍 Verifying token storage successful");

      showMessage("Admin login successful", "success");

      // Small delay for UX, then redirect
      console.log("⏳ Redirecting to admin dashboard in 600ms...");
      setTimeout(() => {
        console.log("🔄 Redirecting now to admin-dashboard.html");
        window.location.replace("admin-dashboard.html");
      }, 600);

    } catch (err) {
      console.error("Admin login error:", err);
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
