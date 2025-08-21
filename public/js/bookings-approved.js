// js/bookings-approved.js
import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, doc, getDoc, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import { showGenericModal, initializeModalCloseListeners } from "./modal_handler.js";

// Global variables
let allApprovedBookingsData = {};
let currentStatusFilter = "All"; // Default filter to show all approved bookings

// Test Firebase imports
console.log("Testing Firebase imports in bookings-approved.js:");
console.log("db:", db);
console.log("doc function:", typeof doc);
console.log("updateDoc function:", typeof updateDoc);

// DOM elements
const approvedBookingsTableBody = document.getElementById("approvedBookingsTableBody");
const statusFilter = document.getElementById("statusFilter");
const refreshButton = document.getElementById("refreshBookingsBtn");

// Check if required elements exist
if (!approvedBookingsTableBody) {
  console.error("approvedBookingsTableBody not found!");
}

if (!refreshButton) {
  console.error("refreshButton not found! Please add a button with id='refreshBookingsBtn' in your HTML.");
}

// Event listeners
if (refreshButton) {
  refreshButton.addEventListener("click", () => {
    renderApprovedBookingsTable();
  });
}

if (statusFilter) {
  statusFilter.addEventListener("change", () => {
    currentStatusFilter = statusFilter.value;
    console.log("Status filter changed to:", currentStatusFilter);
    renderApprovedBookingsTable();
  });
}



/**
 * Fetches all approved booking documents from the "bookings" collection in Firestore.
 * This function retrieves bookings with status "Approved", "Completed", or "Checked-Out".
 * 
 * @returns {Promise<Array>} Array of approved booking objects
 */
const fetchApprovedBookingsFromFirestore = async () => {
  try {
    console.log("Fetching approved bookings from Firestore...");
    
    // Query for approved, accepted, completed, and checked-out bookings
    // Include "Accepted" status as it's commonly used when pending bookings are approved
    const approvedBookingsQuery = query(
      collection(db, "bookings"),
      where("status", "in", ["Approved", "Accepted", "Completed", "Checked-Out"])
    );
    
    const querySnapshot = await getDocs(approvedBookingsQuery);
    console.log("Approved bookings query snapshot size:", querySnapshot.size);
    
    const bookings = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log("=== RAW BOOKING DATA ===");
      console.log("Document ID:", doc.id);
      console.log("Status:", data.status);
      console.log("Pet Information:", data.petInformation);
      console.log("Owner Information:", data.ownerInformation);
      console.log("Service Type:", data.serviceType);
      console.log("Date:", data.date);
      console.log("All data fields:", Object.keys(data));
      console.log("========================");
      bookings.push({ id: doc.id, ...data });
    });
    
    console.log("Approved bookings fetched:", bookings);
    return bookings;
  } catch (error) {
    console.error("Error fetching approved bookings:", error);
    return [];
  }
};

/**
 * Apply filters to approved bookings data
 * @param {Array} bookings - Array of all approved bookings
 * @returns {Array} Filtered bookings based on current filter
 */
const applyFilters = (bookings) => {
  let filteredBookings = bookings;
  
  // Apply status filter
  if (currentStatusFilter !== "All") {
    filteredBookings = bookings.filter(
      (booking) => booking.status === currentStatusFilter
    );
  }
  
  return filteredBookings;
};

/**
 * Renders the approved bookings table based on the current filter and fetched data.
 * Fetches all approved bookings, then filters them locally before rendering.
 */
const renderApprovedBookingsTable = async () => {
  try {
    const allFetchedBookings = await fetchApprovedBookingsFromFirestore();
    let filteredBookings = allFetchedBookings;
    
    // Apply filters
    filteredBookings = applyFilters(allFetchedBookings);
    console.log("=== FILTERING DEBUG ===");
    console.log("All fetched bookings:", allFetchedBookings.length);
    console.log("After filtering:", filteredBookings.length);
    console.log("Current status filter:", currentStatusFilter);
    console.log("Filtered bookings:", filteredBookings);
    console.log("======================");
    
    // Clear and populate table
    const approvedBookingsTableBody = document.getElementById("approvedBookingsTableBody");
    approvedBookingsTableBody.innerHTML = ""; // Clear existing rows
    
    if (filteredBookings.length === 0) {
      // If no approved bookings found, show a helpful message and suggest checking the database
      approvedBookingsTableBody.innerHTML = `
        <tr>
          <td colspan='9' style='text-align: center; padding: 20px;'>
            <div style='margin-bottom: 10px;'>No ${currentStatusFilter.toLowerCase()} approved bookings found.</div>
            <div style='font-size: 12px; color: #666;'>
              This could mean:<br>
              • No bookings have been approved yet<br>
              • All bookings are still pending<br>
              • Check the "Pending Bookings" page to approve some bookings
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    // Sort bookings: today's bookings first, then by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    filteredBookings.sort((a, b) => {
      // Get check-in dates for comparison
      let dateA = null;
      let dateB = null;
      
      if (a.date) {
        try {
          dateA = a.date.toDate();
        } catch (e) {
          dateA = new Date(a.date);
        }
      }
      
      if (b.date) {
        try {
          dateB = b.date.toDate();
        } catch (e) {
          dateB = new Date(b.date);
        }
      }
      
      // Check if either is today
      const aIsToday = dateA && dateA >= today && dateA < new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const bIsToday = dateB && dateB >= today && dateB < new Date(today.getTime() + 24 * 60 * 60 * 1000);
      
      // Today's bookings first
      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;
      
      // Then sort by date (most recent first)
      if (dateA && dateB) {
        return dateB - dateA;
      }
      
      return 0;
    });
    
    // Store data globally for view details functionality
    const tempBookingsData = {};
    
    filteredBookings.forEach((booking) => {
      const row = document.createElement("tr");
      
      // Debug: Log all available fields for this booking
      console.log("=== BOOKING DEBUG ===");
      console.log("Booking ID:", booking.id);
      console.log("Available fields:", Object.keys(booking));
      console.log("Status:", booking.status);
      console.log("Pet Information:", booking.petInformation);
      console.log("Pet Name:", booking.petInformation?.petName);
      console.log("Owner Information:", booking.ownerInformation);
      console.log("Owner First Name:", booking.ownerInformation?.firstName);
      console.log("Owner Last Name:", booking.ownerInformation?.lastName);
      console.log("Service Type:", booking.serviceType);
      console.log("Date:", booking.date);
      console.log("Full booking data:", booking);
      console.log("===================");
      
      // Format check-in date using the actual 'date' field from the database
      let checkInDate = 'N/A';
      let isToday = false;
      
      if (booking.date) {
        try {
          const date = booking.date.toDate();
          checkInDate = date.toLocaleDateString();
          isToday = date >= today && date < new Date(today.getTime() + 24 * 60 * 60 * 1000);
        } catch (e) {
          // If it's not a Firestore timestamp, try as regular date
          try {
            const date = new Date(booking.date);
            checkInDate = date.toLocaleDateString();
            isToday = date >= today && date < new Date(today.getTime() + 24 * 60 * 60 * 1000);
          } catch (e2) {
            checkInDate = 'N/A';
          }
        }
      }
      
      // Try to get check-out date from boarding details for duration calculation
      let checkOutDate = null;
      if (booking.boardingDetails?.checkOutDate) {
        try {
          checkOutDate = new Date(booking.boardingDetails.checkOutDate);
        } catch (e) {
          checkOutDate = null;
        }
      }
      
      // Format duration
      let duration = 'N/A';
      if (booking.duration) {
        duration = `${booking.duration} days`;
      } else if (booking.numberOfDays) {
        duration = `${booking.numberOfDays} days`;
      } else if (checkOutDate && checkInDate !== 'N/A') {
        try {
          const checkIn = new Date(checkInDate);
          const checkOut = checkOutDate;
          const diffTime = Math.abs(checkOut - checkIn);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          duration = `${diffDays} days`;
        } catch (e) {
          duration = 'N/A';
        }
      }
      
      // Create status badge
      const statusBadge = `<span class="status-badge status-${booking.status.toLowerCase().replace('-', '')}">${booking.status}</span>`;
      
      // Get customer information using the actual field names from the database
      const petName = booking.petInformation?.petName || 'N/A';
      const ownerName = booking.ownerInformation ? `${booking.ownerInformation.firstName || ""} ${booking.ownerInformation.lastName || ""}`.trim() : 'N/A';
      const serviceType = booking.serviceType || 'N/A';
      const roomType = booking.boardingDetails?.selectedRoomType || 'N/A';
      
      // Add today indicator and highlight row if it's today's booking
      const todayIndicator = isToday ? ' <span style="background: #ffb64a; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 5px;">TODAY</span>' : '';
      const rowStyle = isToday ? 'background-color: #fff3e0 !important; font-weight: 500;' : '';
      
      row.innerHTML = `
        <td style="${rowStyle}">${booking.bookingId || booking.id}</td>
        <td style="${rowStyle}">${petName}${todayIndicator}</td>
        <td style="${rowStyle}">${ownerName}</td>
        <td style="${rowStyle}">${serviceType}</td>
        <td style="${rowStyle}">${roomType}</td>
        <td style="${rowStyle}">${checkInDate}</td>
        <td style="${rowStyle}">${duration}</td>
        <td style="${rowStyle}">${statusBadge}</td>
        <td style="${rowStyle}">
          <button class="action-btn btn-view" onclick="viewApprovedBookingDetails('${booking.id}')">View</button>
          <button class="action-btn btn-checkout" onclick="handleCheckoutClick('${booking.id}')">Checkout</button>
        </td>
      `;
      
      approvedBookingsTableBody.appendChild(row);
      
      // Store booking data for view details
      tempBookingsData[booking.id] = booking;
    });
    
    allApprovedBookingsData = tempBookingsData; // Update global data reference for view details
    
    // Add summary row
    const summaryRow = document.createElement("tr");
    summaryRow.style.backgroundColor = "#f8f9fa";
    summaryRow.innerHTML = `
      <td colspan="9" style="text-align: center; padding: 15px; font-weight: bold; color: #666;">
        Total Approved Bookings: ${filteredBookings.length} | 
        Today's Bookings: ${filteredBookings.filter(b => {
          if (b.date) {
            try {
              const date = b.date.toDate ? b.date.toDate() : new Date(b.date);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return date >= today && date < new Date(today.getTime() + 24 * 60 * 60 * 1000);
            } catch (e) {
              return false;
            }
          }
          return false;
        }).length}
      </td>
    `;
    approvedBookingsTableBody.appendChild(summaryRow);
    
  } catch (error) {
    console.error("Error rendering approved bookings table:", error);
    const approvedBookingsTableBody = document.getElementById("approvedBookingsTableBody");
    approvedBookingsTableBody.innerHTML = `<tr><td colspan='9' style='text-align: center; padding: 20px; color: red;'>Error loading approved bookings</td></tr>`;
  }
};

/**
 * View detailed information for a specific approved booking
 * @param {string} bookingId - The ID of the booking to view
 */
window.viewApprovedBookingDetails = async function(bookingId) {
  try {
    const booking = allApprovedBookingsData[bookingId];
    
    if (!booking) {
      console.error("Booking data not found for ID:", bookingId);
      return;
    }
    
    // Format dates using the actual 'date' field from the database
    let checkInDate = 'N/A';
    let checkOutDate = 'N/A';
    
    if (booking.date) {
      try {
        checkInDate = new Date(booking.date.toDate()).toLocaleDateString();
      } catch (e) {
        checkInDate = new Date(booking.date).toLocaleDateString();
      }
    }
    
    // Try to get check-out date from boarding details
    if (booking.boardingDetails?.checkOutDate) {
      try {
        checkOutDate = new Date(booking.boardingDetails.checkOutDate).toLocaleDateString();
      } catch (e) {
        checkOutDate = 'N/A';
      }
    }
    
    // Get customer information using the actual field names from the database
    const petName = booking.petInformation?.petName || 'N/A';
    const ownerName = booking.ownerInformation ? `${booking.ownerInformation.firstName || ""} ${booking.ownerInformation.lastName || ""}`.trim() : 'N/A';
    const serviceType = booking.serviceType || 'N/A';
    const roomType = booking.boardingDetails?.selectedRoomType || 'N/A';
    const duration = booking.duration ? `${booking.duration} days` : 
                   (booking.numberOfDays ? `${booking.numberOfDays} days` : 'N/A');
    
    // Create modal content
    const modalContent = `
      <div class="info-section">
        <h3>Customer & Booking Information</h3>
        
        <div class="info-section" style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <h4 style="color: #ffb64a; margin-bottom: 15px;">Customer Details</h4>
          <div class="info-group">
            <label>Owner Information:</label>
            <span>${ownerName}</span>
          </div>
          <div class="info-group">
            <label>Pet Information:</label>
            <span>${petName}</span>
          </div>
          <div class="info-group">
            <label>User ID:</label>
            <span>${booking.userId || 'N/A'}</span>
          </div>
        </div>
        
        <div class="info-section" style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <h4 style="color: #ffb64a; margin-bottom: 15px;">Service Details</h4>
          <div class="info-group">
            <label>Booking ID:</label>
            <span>${booking.bookingId || booking.id}</span>
          </div>
          <div class="info-group">
            <label>Service Type:</label>
            <span>${serviceType}</span>
          </div>
          <div class="info-group">
            <label>Room Type:</label>
            <span>${roomType}</span>
          </div>
          <div class="info-group">
            <label>Check-in Date:</label>
            <span>${checkInDate}</span>
          </div>
          <div class="info-group">
            <label>Check-out Date:</label>
            <span>${checkOutDate}</span>
          </div>
          <div class="info-group">
            <label>Duration:</label>
            <span>${duration}</span>
          </div>
          <div class="info-group">
            <label>Status:</label>
            <span style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${booking.status}</span>
          </div>
        </div>
        
        <div class="info-section" style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <h4 style="color: #ffb64a; margin-bottom: 15px;">Payment Information</h4>
          <div class="info-group">
            <label>Total Amount:</label>
            <span>₱${booking.totalAmount || 'N/A'}</span>
          </div>
          <div class="info-group">
            <label>Down Payment:</label>
            <span>₱${booking.downPayment || 'N/A'}</span>
          </div>
          <div class="info-group">
            <label>Balance:</label>
            <span>₱${booking.balance || 'N/A'}</span>
          </div>
          <div class="info-group">
            <label>Payment Method:</label>
            <span>${booking.paymentMethod || 'N/A'}</span>
          </div>
        </div>
        
        <div class="info-section" style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <h4 style="color: #ffb64a; margin-bottom: 15px;">Additional Information</h4>
          <div class="info-group">
            <label>Admin Notes:</label>
            <span>${booking.adminNotes || 'No notes available'}</span>
          </div>
          <div class="info-group">
            <label>Boarding Details:</label>
            <span>${booking.boardingDetails || 'None'}</span>
          </div>
          <div class="info-group">
            <label>Grooming Details:</label>
            <span>${booking.groomingDetails || 'None'}</span>
          </div>
          <div class="info-group">
            <label>Feeding Details:</label>
            <span>${booking.feedingDetails || 'None'}</span>
          </div>
          <div class="info-group">
            <label>Vaccination Record:</label>
            <span>${booking.vaccinationRecord || 'None'}</span>
          </div>
          <div class="info-group">
            <label>Time:</label>
            <span>${booking.time || 'N/A'}</span>
          </div>
          <div class="info-group">
            <label>Timestamp:</label>
            <span>${booking.timestamp ? new Date(booking.timestamp.toDate()).toLocaleString() : 'N/A'}</span>
          </div>
          <div class="info-group">
            <label>Updated At:</label>
            <span>${booking.updatedAt ? new Date(booking.updatedAt.toDate()).toLocaleString() : 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
    
    // Show modal
    showGenericModal("Approved Booking Details", modalContent);
    
  } catch (error) {
    console.error("Error viewing approved booking details:", error);
    alert("Error loading booking details. Please try again.");
  }
};

/**
 * Handles the checkout button click for approved bookings
 * @param {string} bookingId - The ID of the booking to checkout
 */
window.handleCheckoutClick = async function(bookingId) {
  console.log("Checkout button clicked for booking:", bookingId);
  try {
    const booking = allApprovedBookingsData[bookingId];
    
    if (!booking) {
      console.error("Booking data not found for ID:", bookingId);
      alert("Booking data not found!");
      return;
    }

    // Calculate balance using the same logic as the main bookings page
    const { totalAmount, downPayment, balance } = calculateBookingAmounts(booking);
    
    // Get customer name
    const customerName = booking.ownerInformation ? 
      `${booking.ownerInformation.firstName || ""} ${booking.ownerInformation.lastName || ""}`.trim() : 
      "N/A";

    // Create modal content with enhanced styling
    const modalContent = `
      <div class="modal-section" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="color: #333; margin-bottom: 15px; border-bottom: 2px solid #ffb64a; padding-bottom: 10px;">🐾 Pet Checkout Information</h3>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Booking ID:</strong> <span style="font-weight: normal; color: #666;">${bookingId}</span></div>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Customer Name:</strong> <span style="font-weight: normal; color: #666;">${customerName}</span></div>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Pet Name:</strong> <span style="font-weight: normal; color: #666;">${booking.petInformation?.petName || "N/A"}</span></div>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Service Type:</strong> <span style="font-weight: normal; color: #666;">${booking.serviceType || "N/A"}</span></div>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Room Type:</strong> <span style="font-weight: normal; color: #666;">${booking.boardingDetails?.selectedRoomType || "N/A"}</span></div>
      </div>

      <div class="modal-section" style="background: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
        <h3 style="color: #856404; margin-bottom: 15px; border-bottom: 2px solid #ffc107; padding-bottom: 10px;">💰 Payment Summary</h3>
        <div class="info-item" style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 5px;">
          <strong style="color: #333;">Total Amount:</strong> 
          <span style="font-weight: bold; color: #28a745; font-size: 1.1em; float: right;">₱${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="info-item" style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 5px;">
          <strong style="color: #333;">Down Payment Paid:</strong> 
          <span style="font-weight: bold; color: #17a2b8; font-size: 1.1em; float: right;">₱${downPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="info-item" style="margin-bottom: 15px; padding: 15px; background: #f8d7da; border-radius: 5px; border: 2px solid #dc3545;">
          <strong style="color: #721c24; font-size: 1.2em;">BALANCE DUE:</strong> 
          <span style="font-weight: bold; color: #dc3545; font-size: 1.3em; float: right;">₱${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="info-item" style="margin-bottom: 10px; padding: 10px; background: white; border-radius: 5px;">
          <strong style="color: #333;">Payment Method:</strong> 
          <span style="font-weight: normal; color: #666; float: right;">${booking.paymentDetails?.method || "N/A"}</span>
        </div>
      </div>

      <div class="modal-section" style="background: #e2e3e5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="color: #495057; margin-bottom: 15px; border-bottom: 2px solid #6c757d; padding-bottom: 10px;">📅 Stay Information</h3>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Check-in Date:</strong> <span style="font-weight: normal; color: #666;">${booking.boardingDetails?.checkInDate || booking.date || "N/A"}</span></div>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Check-out Date:</strong> <span style="font-weight: normal; color: #666;">${booking.boardingDetails?.checkOutDate || "N/A"}</span></div>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Pet Size Category:</strong> <span style="font-weight: normal; color: #666;">${getPetSizeCategory(parseFloat(booking.petInformation?.petWeight))}</span></div>
        <div class="info-item" style="margin-bottom: 10px;"><strong>Pet Weight:</strong> <span style="font-weight: normal; color: #666;">${booking.petInformation?.petWeight || "N/A"} kg</span></div>
      </div>

      <div class="modal-section" style="background: #d1ecf1; padding: 20px; border-radius: 8px; text-align: center;">
        <h3 style="color: #0c5460; margin-bottom: 15px;">✅ Ready for Checkout</h3>
        <p style="color: #0c5460; font-size: 1.1em; margin: 0;">Please collect the remaining balance of <strong style="color: #dc3545;">₱${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> from the customer.</p>
        <p style="color: #28a745; font-weight: bold; margin: 10px 0; font-size: 0.9em;">⚠️ Note: Confirming checkout will mark the payment as "Paid" and set the balance to ₱0.00</p>
        <div style="margin-top: 20px;">
          <button id="confirmCheckoutBtn" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 1.1em; font-weight: bold; cursor: pointer; margin-right: 10px;">
            ✅ Confirm Checkout
          </button>
          <button id="cancelCheckoutBtn" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 1.1em; font-weight: bold; cursor: pointer;">
            ❌ Cancel
          </button>
        </div>
      </div>
    `;

    // Get modal elements
    const modal = document.getElementById("detailsModal");
    const modalContentDiv = document.getElementById("modalBody");
    
    console.log("Modal elements found:", {
      modal: !!modal,
      modalContentDiv: !!modalContentDiv
    });
    
    if (modal && modalContentDiv) {
      // Update modal content
      modalContentDiv.innerHTML = modalContent;
      
      // Show modal
      modal.style.display = "flex";
      document.getElementById("overlay").style.display = "block";
      
      // Update modal title
      const modalHeader = modal.querySelector("#modalHeader");
      if (modalHeader) {
        modalHeader.textContent = `Pet Checkout - ${customerName}`;
      }
      
      // Add close functionality
      const closeBtn = modal.querySelector("#modalCloseBtn");
      const closeFooterBtn = modal.querySelector("#modalCloseBtnFooter");
      const overlay = document.getElementById("overlay");
      
      const closeModal = () => {
        modal.style.display = "none";
        overlay.style.display = "none";
      };
      
      if (closeBtn) closeBtn.onclick = closeModal;
      if (closeFooterBtn) closeFooterBtn.onclick = closeModal;
      if (overlay) overlay.onclick = closeModal;
      
      // Add checkout button event listeners
      const confirmCheckoutBtn = document.getElementById("confirmCheckoutBtn");
      const cancelCheckoutBtn = document.getElementById("cancelCheckoutBtn");
      
      if (confirmCheckoutBtn) {
        confirmCheckoutBtn.onclick = async () => {
          try {
            console.log("Checkout button clicked for booking:", bookingId);
            await handleConfirmCheckout(bookingId, booking);
            closeModal();
          } catch (error) {
            console.error("Error confirming checkout:", error);
            console.error("Full error object:", error);
            alert(`Error confirming checkout: ${error.message || 'Unknown error occurred'}`);
          }
        };
      }
      
      if (cancelCheckoutBtn) {
        cancelCheckoutBtn.onclick = closeModal;
      }
      
    } else {
      alert("Modal elements not found!");
    }
    
  } catch (error) {
    console.error("Error showing checkout modal:", error);
    alert("Error loading checkout information. Please try again.");
  }
};

/**
 * Handles the confirmation of checkout for a booking
 * @param {string} bookingId - The ID of the booking to checkout
 * @param {object} booking - The booking data
 */
async function handleConfirmCheckout(bookingId, booking) {
  try {
    console.log("Confirming checkout for booking:", bookingId);
    console.log("Booking data:", booking);
    
    if (!bookingId) {
      throw new Error("Booking ID is required");
    }
    
    if (!booking) {
      throw new Error("Booking data is required");
    }
    
    // Update the booking status to "Checked-Out"
    try {
      const bookingRef = doc(db, "bookings", bookingId);
      console.log("Updating booking:", bookingId, "to status: Checked-Out");
      console.log("Booking reference:", bookingRef);
      console.log("Database instance:", db);
      
      // Update both status and payment details
      const updateData = {
        status: "Checked-Out",
        updatedAt: new Date()
      };
      
      // Also update payment status to "Paid" since customer has checked out
      if (booking.paymentDetails) {
        updateData.paymentDetails = {
          ...booking.paymentDetails,
          paymentStatus: "Paid"
        };
      } else {
        updateData.paymentDetails = {
          paymentStatus: "Paid"
        };
      }
      
      await updateDoc(bookingRef, updateData);
      console.log("Booking updated successfully");
    } catch (firebaseError) {
      console.error("Firebase update error:", firebaseError);
      console.error("Error code:", firebaseError.code);
      console.error("Error message:", firebaseError.message);
      throw new Error(`Firebase update failed: ${firebaseError.message} (Code: ${firebaseError.code})`);
    }
    
    // Show success message
    alert("✅ Checkout confirmed successfully! The booking status has been updated to 'Checked-Out' and payment status has been marked as 'Paid'.");
    
    // Refresh the table to reflect the changes
    await renderApprovedBookingsTable();
    
    // Refresh sales reports if we're on the sales reports page
    if (window.refreshSalesReports) {
      window.refreshSalesReports();
    }
    
  } catch (error) {
    console.error("Error confirming checkout:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Calculates the total amount, down payment, and balance for a booking.
 * @param {object} bookingData - The booking data from Firestore.
 * @returns {object} An object containing totalAmount, downPayment, and balance.
 */
function calculateBookingAmounts(bookingData) {
  let totalAmount = 0;
  let petWeight = parseFloat(bookingData.petInformation?.petWeight);
  let petSize = getPetSizeCategory(petWeight);

  // Pricing based on pet size categories
  const sizePrices = {
    Small: 500,
    Medium: 600,
    Large: 700,
    XL: 800,
    XXL: 900,
    "N/A": 0,
  };

  if (bookingData.serviceType === "Boarding") {
    // Base price per day depends on pet size
    let dailyPrice = sizePrices[petSize] || 0;

    // Calculate total based on number of days
    const checkInDateStr = bookingData.boardingDetails?.checkInDate || bookingData.date;
    const checkOutDateStr = bookingData.boardingDetails?.checkOutDate;

    if (checkInDateStr && checkOutDateStr) {
      const checkInDate = new Date(checkInDateStr);
      const checkOutDate = new Date(checkOutDateStr);
      const diffTime = Math.abs(checkOutDate.getTime() - checkInDate.getTime());
      const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      totalAmount = dailyPrice * Math.max(1, daysDiff); // Ensure at least 1 day
    } else {
      totalAmount = 0; // If dates are missing, total is 0
    }
  } else if (bookingData.serviceType === "Grooming") {
    // Grooming price also depends on pet size
    totalAmount = sizePrices[petSize] || 0;
  }

  // Get downPayment from bookingData.paymentDetails.downPaymentAmount if available, otherwise default to 0
  let actualDownPayment = parseFloat(bookingData.paymentDetails?.downPaymentAmount);
  if (isNaN(actualDownPayment)) {
    actualDownPayment = 0; // Default to 0 if not a valid number or not provided
  }

  // Balance is always totalAmount minus the actualDownPayment
  const balance = totalAmount - actualDownPayment;

  return { totalAmount, downPayment: actualDownPayment, balance, petSize };
}

/**
 * Determines the pet size category based on its weight in kilograms.
 * @param {number} weightKg - The pet's weight in kilograms.
 * @returns {string} The pet size category (Small, Medium, Large, XL, XXL).
 */
function getPetSizeCategory(weightKg) {
  if (typeof weightKg !== "number" || isNaN(weightKg)) {
    return "N/A";
  }
  if (weightKg < 10) return "Small";
  if (weightKg >= 11 && weightKg <= 26) return "Medium";
  if (weightKg >= 27 && weightKg <= 34) return "Large";
  if (weightKg >= 34 && weightKg <= 38) return "XL";
  if (weightKg > 38) return "XXL";
  return "N/A"; // Fallback for weights outside defined ranges
}

// Initial load of approved bookings table
renderApprovedBookingsTable();
