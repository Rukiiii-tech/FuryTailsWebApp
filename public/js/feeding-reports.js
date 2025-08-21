import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import {
  showGenericModal,
  hideGenericModal,
  initializeModalCloseListeners,
} from "./modal_handler.js";

let allFeedingReportsData = {};

document.addEventListener("DOMContentLoaded", async () => {
  const feedingTableBody = document.getElementById("feedingTableBody");
  if (!feedingTableBody) {
    console.error("feedingTableBody not found!");
    return;
  }

  // Initialize modal close listeners once, for the detailsModal
  const modal = document.getElementById("detailsModal");
  if (modal) {
    initializeModalCloseListeners(
      modal,
      "modalCloseBtn",
      "modalCloseBtnFooter"
    );
  }

  const fetchFeedingReports = async () => {
    try {
      console.log(
        "Fetching feeding reports from 'feedingHistory' collection..."
      );
      const feedingReportsQuery = query(
        collection(db, "feedingHistory"),
        orderBy("scheduledAt", "desc")
      );
      const querySnapshot = await getDocs(feedingReportsQuery);
      console.log("Query snapshot size:", querySnapshot.size);
      const feedingReports = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        feedingReports.push({ id: doc.id, ...data });
      });
      console.log("Final feeding reports array:", feedingReports);
      return feedingReports;
    } catch (error) {
      console.error("Error fetching feeding reports:", error);
      return [];
    }
  };

  const renderFeedingReportsTable = async () => {
    const feedingReports = await fetchFeedingReports();
    const feedingTableBody = document.getElementById("feedingTableBody");
    feedingTableBody.innerHTML = "";

    if (feedingReports.length === 0) {
      feedingTableBody.innerHTML =
        "<tr><td colspan='7' style='text-align: center; padding: 20px;'>No feeding reports found.</td></tr>";
      return;
    }

    const tempFeedingReportsData = {};
    feedingReports.forEach((report) => {
      tempFeedingReportsData[report.id] = report;
      const row = document.createElement("tr");

      // Determine feeding time display: list specificTimes, fallback to scheduledAt/timestamp
      let displayFeedingTime = "N/A";
      if (
        report.specificTimes &&
        Array.isArray(report.specificTimes) &&
        report.specificTimes.length > 0
      ) {
        displayFeedingTime = `<ul>${report.specificTimes.map((item) => `<li>${item.time || "N/A"}</li>`).join("")}</ul>`;
      } else if (report.scheduledAt instanceof Timestamp) {
        displayFeedingTime = new Date(
          report.scheduledAt.toDate()
        ).toLocaleString();
      } else if (report.timestamp instanceof Timestamp) {
        displayFeedingTime = new Date(
          report.timestamp.toDate()
        ).toLocaleString();
      } else if (report.schedule && report.schedule.time) {
        displayFeedingTime = report.schedule.time;
      }

      // Determine food type display (using foodBrand from Firestore)
      const displayFoodType = report.foodBrand || "N/A";

      // Room Type - will be N/A if not in Firestore, assuming 'roomType' field or falling back to 'roomNumber'
      const displayRoomType = report.roomType || report.roomNumber || "N/A";

      // Status - will be N/A if not in Firestore
      const displayStatus = report.status || "N/A";

      row.innerHTML = `
        <td>${report.id}</td>
        <td>${report.petName || "N/A"}</td>
        <td>${displayRoomType}</td>
        <td>${displayFoodType}</td>
        <td>${displayFeedingTime}</td>
        <td><span class="status-badge status-${displayStatus.toLowerCase().replace(" ", "-")}">${displayStatus}</span></td>
        <td>
          <button class="action-btn btn-view" data-id="${report.id}">View</button>
        </td>
      `;
      feedingTableBody.appendChild(row);
    });
    allFeedingReportsData = tempFeedingReportsData;

    attachFeedingReportListeners();
  };

  /**
   * Attaches event listeners for the "View Details" buttons.
   * This ensures listeners are re-attached after the table is re-rendered.
   */
  const attachFeedingReportListeners = () => {
    // Remove existing listeners to prevent duplicates
    document.querySelectorAll(".btn-view").forEach((btn) => {
      btn.removeEventListener("click", handleViewDetailsClick);
    });

    // Attach new listeners
    document.querySelectorAll(".btn-view").forEach((btn) => {
      btn.addEventListener("click", handleViewDetailsClick);
    });
  };

  const handleViewDetailsClick = async (e) => {
    const reportId = e.target.getAttribute("data-id");
    viewFeedingReportDetails(reportId);
  };

  renderFeedingReportsTable();

  async function viewFeedingReportDetails(reportId) {
    let reportData = allFeedingReportsData[reportId];

    if (!reportData) {
      console.log(
        `Feeding report ID ${reportId} not in cache, fetching from Firestore.`
      );
      const reportRef = doc(db, "feedingHistory", reportId);
      try {
        const reportSnap = await getDoc(reportRef);
        if (!reportSnap.exists()) {
          console.log(
            "Feeding report data not found in Firestore for ID: " + reportId
          );
          alert("Feeding report not found.");
          return;
        }
        reportData = reportSnap.data();
        allFeedingReportsData[reportId] = reportData;
        console.log("Feeding report data fetched from Firestore:", reportData);
      } catch (err) {
        console.error("Error fetching feeding report from Firestore:", err);
        alert("Error fetching feeding report details: " + err.message);
        return;
      }
    } else {
      console.log("Feeding report data found in cache:", reportData);
    }

    const modal = document.getElementById("detailsModal");
    const modalHeader = document.getElementById("modalHeader");
    const modalBody = document.getElementById("modalBody");

    modalHeader.textContent = `Feeding Report: ${reportId}`;

    // Determine Feeding Schedule Time display for modal: list specificTimes, fallback to scheduledAt/timestamp
    let displayFeedingScheduleTimeForModal = "N/A";
    if (
      reportData.specificTimes &&
      Array.isArray(reportData.specificTimes) &&
      reportData.specificTimes.length > 0
    ) {
      displayFeedingScheduleTimeForModal = `<ul>${reportData.specificTimes.map((item) => `<li>${item.time || "N/A"}</li>`).join("")}</ul>`;
    } else if (reportData.scheduledAt instanceof Timestamp) {
      displayFeedingScheduleTimeForModal = new Date(
        reportData.scheduledAt.toDate()
      ).toLocaleString();
    } else if (reportData.timestamp instanceof Timestamp) {
      displayFeedingScheduleTimeForModal = new Date(
        reportData.timestamp.toDate()
      ).toLocaleString();
    } else if (reportData.schedule && reportData.schedule.time) {
      displayFeedingScheduleTimeForModal = reportData.schedule.time;
    }

    // Determine Actual Feeding Time display for modal: uses the same logic as schedule time for simplicity
    let displayActualFeedingTimeForModal = displayFeedingScheduleTimeForModal;

    // Determine food type display (using foodBrand from Firestore)
    const displayFoodTypeForModal = reportData.foodBrand || "N/A";

    // Room Type for modal details
    const displayRoomTypeForModal =
      reportData.roomType || reportData.roomNumber || "N/A";

    modalBody.innerHTML = `
        <div class="info-section">
          <div class="info-group">
            <label>Booking ID</label>
            <span>${reportData.bookingId || "N/A"}</span>
          </div>
          <div class="info-group">
            <label>Pet Name</label>
            <span>${reportData.petName || "N/A"}</span>
          </div>
          <div class="info-group">
            <label>Owner Name</label>
            <span>${reportData.ownerName || "N/A"}</span>
          </div>
          <div class="info-group">
            <label>Pet ID</label>
            <span>${reportData.petId || "N/A"}</span>
          </div>
          <div class="info-group">
            <label>User ID</label>
            <span>${reportData.userId || "N/A"}</span>
          </div>
          <div class="info-group">
            <label>Room Type</label>
            <span>${displayRoomTypeForModal}</span>
          </div>
          <div class="info-group">
            <label>Food Type</label>
            <span>${displayFoodTypeForModal}</span>
          </div>
          <div class="info-group">
            <label>Feeding Schedule Time</label>
            <span>${displayFeedingScheduleTimeForModal}</span>
          </div>
          <div class="info-group">
            <label>Actual Feeding Time</label>
            <span>${displayActualFeedingTimeForModal}</span>
          </div>
          <div class="info-group">
            <label>Notes</label>
            <span style="white-space: pre-wrap;">${reportData.notes || "No notes provided."}</span>
          </div>
          <div class="info-group">
            <label>Status</label>
            <span>${reportData.status || "N/A"}</span>
          </div>
          <div class="info-group">
            <label>Picture Taken</label>
            ${reportData.picture ? `<img src="${reportData.picture}" alt="Feeding Picture" style="max-width:100%; height:auto;">` : `<span>No picture provided.</span>`}
          </div>
        </div>
      `;
    showGenericModal(modal);
  }
});
