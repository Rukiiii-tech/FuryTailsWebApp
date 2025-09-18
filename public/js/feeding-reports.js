import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  Timestamp,
  startAfter,
  limit,
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import {
  showGenericModal,
  hideGenericModal,
  initializeModalCloseListeners,
} from "./modal_handler.js";

let allFeedingReportsData = {};
let lastVisible = null; // Stores the last document of the current page for pagination
let firstVisible = null; // Stores the first document of the current page
let currentPage = 1;
const REPORTS_PER_PAGE = 10;

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

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageInfoSpan = document.getElementById("pageInfo");

  // Event Listeners for pagination buttons
  if (prevPageBtn) {
    prevPageBtn.addEventListener("click", () => navigatePage(-1));
  }
  if (nextPageBtn) {
    nextPageBtn.addEventListener("click", () => navigatePage(1));
  }

  const navigatePage = (direction) => {
    if (direction === 1 && nextPageBtn.disabled) return;
    if (direction === -1 && prevPageBtn.disabled) return;
    currentPage += direction;
    renderFeedingReportsTable();
  };

  const fetchFeedingReports = async (lastDoc, direction = 1) => {
    try {
      console.log(`Fetching feeding reports for page ${currentPage}...`);
      const feedingReportsRef = collection(db, "feedingHistory");
      let baseQuery = query(feedingReportsRef, orderBy("scheduledAt", "desc"));

      if (lastDoc) {
        if (direction === 1) {
          baseQuery = query(baseQuery, startAfter(lastDoc));
        } else if (direction === -1) {
          // To go backward, we need to reverse the order and then reverse the results
          baseQuery = query(
            collection(db, "feedingHistory"),
            orderBy("scheduledAt", "asc"),
            startAfter(lastDoc)
          );
        }
      }

      const paginatedQuery = query(baseQuery, limit(REPORTS_PER_PAGE));
      const querySnapshot = await getDocs(paginatedQuery);

      let feedingReports = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        feedingReports.push({ id: doc.id, ...data });
      });

      // If navigating backward, reverse the array to maintain correct order
      if (direction === -1) {
        feedingReports.reverse();
      }

      console.log("Query snapshot size:", querySnapshot.size);
      console.log("Final feeding reports array:", feedingReports);

      // Update the lastVisible and firstVisible documents for the next/prev queries
      firstVisible = querySnapshot.docs[0];
      lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

      return feedingReports;
    } catch (error) {
      console.error("Error fetching feeding reports:", error);
      return [];
    }
  };

  const renderFeedingReportsTable = async () => {
    const feedingTableBody = document.getElementById("feedingTableBody");
    feedingTableBody.innerHTML =
      '<tr><td colspan="7" style="text-align: center; padding: 20px;">Loading feeding reports...</td></tr>';

    let lastDoc = null;
    if (currentPage > 1) {
      // Find the last visible doc of the previous page
      const previousPagesQuery = query(
        collection(db, "feedingHistory"),
        orderBy("scheduledAt", "desc"),
        limit((currentPage - 1) * REPORTS_PER_PAGE)
      );
      const previousSnapshot = await getDocs(previousPagesQuery);
      if (!previousSnapshot.empty) {
        lastDoc = previousSnapshot.docs[previousSnapshot.docs.length - 1];
      }
    }

    const feedingReports = await fetchFeedingReports(lastDoc);

    // Check if there's a next page by querying for one more document
    const nextPageCheckQuery = query(
      collection(db, "feedingHistory"),
      orderBy("scheduledAt", "desc"),
      startAfter(lastVisible),
      limit(1)
    );
    const nextPageSnapshot = await getDocs(nextPageCheckQuery);

    const hasNextPage = !nextPageSnapshot.empty;
    const hasPrevPage = currentPage > 1;

    // Update button states and page info
    prevPageBtn.disabled = !hasPrevPage;
    nextPageBtn.disabled = !hasNextPage;
    pageInfoSpan.textContent = `Page ${currentPage}`;

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

      const displayFoodType = report.foodBrand || "N/A";
      const displayRoomType = report.roomType || report.roomNumber || "N/A";
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
   */
  const attachFeedingReportListeners = () => {
    document.querySelectorAll(".btn-view").forEach((btn) => {
      btn.removeEventListener("click", handleViewDetailsClick);
    });
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

    let displayActualFeedingTimeForModal = displayFeedingScheduleTimeForModal;
    const displayFoodTypeForModal = reportData.foodBrand || "N/A";
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
