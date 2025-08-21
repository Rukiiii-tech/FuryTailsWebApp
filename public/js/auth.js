// js/auth.js
import {
  auth,
  db,
  onAuthStateChanged,
  getDoc,
  doc,
  loginUser,
} from "./firebase-config.js";

async function checkAdminStatus(user) {
  if (!user) {
    return false;
  }
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      return userData.role === "admin";
    }
    return false;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  const currentPage = window.location.pathname.split("/").pop();

  if (user) {
    const isAdmin = await checkAdminStatus(user);
    if (isAdmin) {
      if (currentPage === "index.html" || currentPage === "") {
        window.location.href = "dashboard.html";
      }
    } else {
      if (currentPage !== "index.html") {
        alert("Access Denied: You do not have administrator privileges.");
        await auth.signOut();
        window.location.href = "index.html";
      }
    }
  } else {
    if (
      currentPage !== "index.html" &&
      currentPage !== "forgot-password.html"
    ) {
      window.location.href = "index.html";
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = loginForm.email.value;
      const password = loginForm.password.value;

      const loginButton = loginForm.querySelector('button[type="submit"]');
      if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent = "Logging in...";
      }

      const result = await loginUser(email, password);

      if (loginButton) {
        loginButton.disabled = false;
        loginButton.textContent = "Login";
      }

      if (result.success) {
        // Redirection is handled by onAuthStateChanged listener
      } else {
        alert(result.error);
      }
    });
  }
});
