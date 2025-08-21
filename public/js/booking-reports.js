// js/booking-reports.js
import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import {
  showGenericModal,
  hideGenericModal,
  initializeModalCloseListeners,
} from "./modal_handler.js";

document.addEventListener("DOMContentLoaded", async () => {
  const reportsTableBody = document.getElementById("reportsTableBody");
  const statusFilterSelect = document.getElementById("statusFilter");
  const refreshButton = document.getElementById("refreshReportsBtn");
  
  if (!reportsTableBody) {
    console.error("reportsTableBody not found!");
    return;
  }

  let currentStatusFilter = "All"; // Default filter to show all processed bookings

  // Event listener for the status filter dropdown
  if (statusFilterSelect) {
    statusFilterSelect.addEventListener("change", (e) => {
      currentStatusFilter = e.target.value;
      fetchBookingReports(); // Re-fetch reports when filter changes
    });
  }

  // Event listener for the refresh button
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      fetchBookingReports(); // Re-fetch reports when refresh button is clicked
    });
  }

  // Initialize modal close listeners for the detailsModal
  const detailsModal = document.getElementById("detailsModal");
  if (detailsModal) {
    initializeModalCloseListeners(
      detailsModal,
      "modalCloseBtn",
      "modalCloseBtnFooter"
    );
  }

  // Use event delegation for the view details button
  document.body.addEventListener("click", async (event) => {
    if (event.target.matches(".btn-view")) {
      const bookingId = event.target.dataset.id;
      await viewReportDetails(bookingId); // Call function to show details in modal
    }
  });

  async function fetchBookingReports() {
    try {
      reportsTableBody.innerHTML =
        '<tr><td colspan="8" style="text-align: center; padding: 20px;">Loading booking reports...</td></tr>';
      const bookingsCollectionRef = collection(db, "bookings");
      
      // Apply filter based on current selection
      let q;
      if (currentStatusFilter === "All") {
        // Show both approved and rejected bookings (processed bookings)
        q = query(
          bookingsCollectionRef, 
          where("status", "in", ["Approved", "Rejected"])
        );
      } else {
        // Show only the selected status
        q = query(bookingsCollectionRef, where("status", "==", currentStatusFilter));
      }
      
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        const filterText = currentStatusFilter === "All" ? "processed" : currentStatusFilter.toLowerCase();
        reportsTableBody.innerHTML =
          `<tr><td colspan="8" style="text-align: center;">No ${filterText} booking reports found.</td></tr>`;
        return;
      }

      reportsTableBody.innerHTML = "";

      let reportCounter = 1;
      for (const docSnapshot of querySnapshot.docs) {
        const data = docSnapshot.data();
        const bookingId = docSnapshot.id;
        // Show all processed bookings (both boarding and grooming)
        if (!data.status) continue;

        const owner = data.ownerInformation || {};
        const pet = data.petInformation || {};
        const boarding = data.boardingDetails || {};

        let ownerFullName = "N/A";
        if (data.userId) {
          try {
            const userDoc = await getDoc(doc(db, "users", data.userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              ownerFullName =
                `${userData.firstName || ""} ${userData.lastName || ""}`.trim();
            }
          } catch (userError) {
            console.warn(
              `Could not fetch owner for user ID ${data.userId}:`,
              userError
            );
            ownerFullName = `User ID: ${data.userId}`;
          }
        }

        let durationDays = "N/A";
        let roomType = "N/A";
        
        // Handle both boarding and grooming services
        if (data.serviceType === "Boarding" && boarding.checkInDate && boarding.checkOutDate) {
          const checkIn = new Date(boarding.checkInDate);
          const checkOut = new Date(boarding.checkOutDate);
          const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
          durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          roomType = boarding.selectedRoomType || "N/A";
        } else if (data.serviceType === "Grooming") {
          durationDays = "1 day";
          roomType = "Grooming Service";
        }

        const row = `
                    <tr>
                        <td>RPT${String(reportCounter++).padStart(3, "0")}</td>
                        <td>${bookingId}</td>
                        <td>${pet.petName || "N/A"}</td>
                        <td>${ownerFullName}</td>
                        <td>${roomType}</td>
                        <td>${durationDays !== "N/A" ? `${durationDays} day${durationDays > 1 ? "s" : ""}` : "N/A"}</td>
                        <td><span class="status-badge status-${data.status ? data.status.toLowerCase().replace(" ", "-") : "unknown"}">${data.status || "N/A"}</span></td>
                        <td>
                          <button class="action-btn btn-view" data-id="${bookingId}">View</button>
                        </td>
                    </tr>
                `;
        reportsTableBody.innerHTML += row;
      }
    } catch (error) {
      let errorMsg = "Error loading reports. Check console for details.";
      if (error.code && error.code.includes("failed-precondition")) {
        errorMsg =
          "A Firestore index may be missing. Please check your Firebase console and create the required index.";
      }
      console.error("Error fetching booking reports:", error);
      reportsTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: red;">${errorMsg}</td></tr>`;
    }
  }

  fetchBookingReports();

  // Helper to format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    if (isNaN(date)) return dateString; // Return original if invalid date
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Helper to format time
  const formatTime = (timeString) => {
    if (!timeString) return "N/A";
    return timeString; // Assuming time is already in a displayable format (e.g., "HH:MM AM/PM")
  };

  // Helper to format weight
  const formatWeight = (weight) => {
    if (typeof weight === "number") {
      return `${weight} kg`;
    }
    return weight ? `${weight} kg` : "N/A";
  };

  // Function to display ALL booking details in the modal
  async function viewReportDetails(bookingId) {
    const bookingRef = doc(db, "bookings", bookingId);
    let bookingSnap;
    try {
      bookingSnap = await getDoc(bookingRef);
    } catch (err) {
      console.error("Error fetching booking from Firestore:", err);
      alert("Error fetching booking details: " + err.message);
      return;
    }

    if (!bookingSnap.exists()) {
      console.log("Booking data not found in Firestore for ID: " + bookingId);
      alert("Booking details not found.");
      return;
    }

    const booking = bookingSnap.data();
    console.log("Full Booking Details for Report:", booking); // Log full data for debugging

    const modalHeader = document.getElementById("modalHeader");
    const modalBody = document.getElementById("modalBody");
    const detailsModal = document.getElementById("detailsModal"); // Get modal reference

    modalHeader.textContent = `Booking Details: ${bookingId}`;

    const pet = booking.petInformation || {};
    const owner = booking.ownerInformation || {};
    const boarding = booking.boardingDetails || {};
    const feeding = booking.feedingDetails || {};
    const payment = booking.paymentDetails || {};
    const grooming = booking.groomingDetails || {}; // For grooming specific details

    let modalContent = `
      <div class="report-info">
        <div class="info-section">
          <h3>Owner Information</h3>
          <div class="info-group"><label>Name</label><span>${owner.firstName || ""} ${owner.lastName || "" || "N/A"}</span></div>
          <div class="info-group"><label>Email</label><span>${owner.email || "N/A"}</span></div>
          <div class="info-group"><label>Contact No.</label><span>${owner.contactNo || "N/A"}</span></div>
          <div class="info-group"><label>Address</label><span>${owner.address || "N/A"}</span></div>
        </div>

        <div class="info-section">
          <h3>Pet Information</h3>
          <div class="info-group"><label>Pet Name</label><span>${pet.petName || "N/A"}</span></div>
          <div class="info-group"><label>Pet Type</label><span>${pet.petType || "N/A"}</span></div>
          <div class="info-group"><label>Pet Breed</label><span>${pet.petBreed || "N/A"}</span></div>
          <div class="info-group"><label>Pet Gender</label><span>${pet.petGender || "N/A"}</span></div>
          <div class="info-group"><label>Pet Weight</label><span>${formatWeight(pet.petWeight)}</span></div>
          <div class="info-group"><label>Birthdate</label><span>${formatDate(pet.dateOfBirth) || "N/A"}</span></div>
          <div class="info-group"><label>Colors/Markings</label><span>${pet.petColorsMarkings || "N/A"}</span></div>
        </div>
    `;

    // Conditional content based on serviceType
    if (booking.serviceType === "Boarding") {
      modalContent += `
        <div class="info-section">
          <h3>Boarding Details</h3>
          <div class="info-group"><label>Check-in Date</label><span>${formatDate(boarding.checkInDate) || "N/A"}</span></div>
          <div class="info-group"><label>Check-out Date</label><span>${formatDate(boarding.checkOutDate) || "N/A"}</span></div>
          <div class="info-group"><label>Specific Time</label><span>${formatTime(booking.time) || "N/A"}</span></div>
          <div class="info-group"><label>Room Type</label><span>${boarding.selectedRoomType || "N/A"}</span></div>
          <div class="info-group"><label>Boarding Waiver</label><span>${boarding.boardingWaiverAgreed ? "Agreed" : "Not Agreed"}</span></div>
          <div class="info-group"><label>Vaccination Status</label><span>${pet.vaccinationStatus || "N/A"}</span></div>
          ${
            booking.vaccinationRecord && booking.vaccinationRecord.imageUrl
              ? `
          <div class="info-group"><label>Vaccination Proof</label><img src="${booking.vaccinationRecord.imageUrl}" alt="Vaccination Proof"></div>
          `
              : ""
          }
        </div>

        <div class="info-section">
          <h3>Feeding Details</h3>
          <div class="info-group"><label>Food Brand</label><span>${feeding.foodBrand || "N/A"}</span></div>
          <div class="info-group"><label>Number of Meals</label><span>${feeding.numberOfMeals || "N/A"}</span></div>
          <div class="info-group"><label>Morning Feeding</label><span>${feeding.morningFeeding ? `Yes (${formatTime(feeding.morningTime)})` : "No"}</span></div>
          <div class="info-group"><label>Afternoon Feeding</label><span>${feeding.afternoonFeeding ? `Yes (${formatTime(feeding.afternoonTime)})` : "No"}</span></div>
          <div class="info-group"><label>Evening Feeding</label><span>${feeding.eveningFeeding ? `Yes (${formatTime(feeding.eveningTime)})` : "No"}</span></div>
        </div>

        <div class="info-section">
          <h3>Payment Details</h3>
          <div class="info-group"><label>Method</label><span>${payment.method || "N/A"}</span></div>
          <div class="info-group"><label>Account No.</label><span>${payment.accountNumber || "N/A"}</span></div>
          <div class="info-group"><label>Account Name</label><span>${payment.accountName || "N/A"}</span></div>
          ${
            payment.receiptImageUrl
              ? `
          <div class="info-group"><label>Receipt</label><img src="${payment.receiptImageUrl}" alt="Payment Receipt"></div>
          `
              : ""
          }
        </div>
      `;
    } else if (booking.serviceType === "Grooming") {
      modalContent += `
        <div class="info-section">
          <h3>Grooming Details</h3>
          <div class="info-group"><label>Grooming Date</label><span>${formatDate(grooming.groomingCheckInDate) || "N/A"}</span></div>
          <div class="info-group"><label>Specific Time</label><span>${formatTime(booking.time) || "N/A"}</span></div>
          <div class="info-group"><label>Grooming Waiver</label><span>${grooming.groomingWaiverAgreed ? "Agreed" : "Not Agreed"}</span></div>
        </div>
      `;
    }

    modalContent += `
        <div class="info-section">
          <h3>Booking Status & Notes</h3>
          <div class="info-group"><label>Status</label><span>${booking.status || "N/A"}</span></div>
          <div class="info-group"><label>Admin Notes</label><span>${booking.adminNotes || "N/A"}</span></div>
          <div class="info-group"><label>Submitted On</label><span>${booking.timestamp ? formatDate(new Date(booking.timestamp.toDate()).toISOString().split("T")[0]) + " " + formatTime(new Date(booking.timestamp.toDate()).toLocaleTimeString()) : "N/A"}</span></div>
          ${booking.updatedAt ? `<div class="info-group"><label>Last Updated</label><span>${formatDate(new Date(booking.updatedAt.toDate()).toISOString().split("T")[0]) + " " + formatTime(new Date(booking.updatedAt.toDate()).toLocaleTimeString())}</span></div>` : ""}
        </div>
      </div>
    `;

    modalBody.innerHTML = modalContent;
    showGenericModal(detailsModal); // Show the populated modal
  }
});
