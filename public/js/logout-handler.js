// js/logout-handler.js

import { auth, logoutUser } from "./firebase-config.js";

// Handle logout process
async function handleLogout() {
  const result = await logoutUser();
  if (result.success) {
    window.location.href = "index.html"; // Redirect to login page on successful logout
  } else {
    console.error("Logout failed:", result.error);
    alert(
      result.error ||
        "Failed to logout: " +
          (result.error ? result.error.message : "Unknown error")
    );
  }
}

// Initialize logout functionality
export function initializeLogout() {
  const logoutButton = document.getElementById("logoutButton");

  if (!logoutButton) {
    console.error(
      "Logout button not found! Cannot initialize logout functionality."
    );
    return;
  }

  // Attach event listener to the main Logout button in the sidebar
  logoutButton.addEventListener("click", (e) => {
    e.preventDefault(); // Prevent default link behavior
    console.log("Logout button clicked. Proceeding with logout.");

    // Direct logout without confirmation modal
    handleLogout();
  });

  // Ensure user is logged in - redirects to index.html if not authenticated
  auth.onAuthStateChanged((user) => {
    const currentPage = window.location.pathname.split("/").pop();
    if (!user && currentPage !== "index.html" && currentPage !== "") {
      console.log("User not authenticated. Redirecting to index.html.");
      window.location.href = "index.html";
    }
  });
}
