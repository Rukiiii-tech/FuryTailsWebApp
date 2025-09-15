// sales-reports.js
import {
  db,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  updateDoc,
} from "./firebase-config.js";

import { showGenericModal } from "./modal_handler.js";

// Global variable to store all fetched and processed sales data for filtering
let allProcessedSalesData = [];

// DOM elements
const salesTableBody = document.getElementById("salesTableBody");
const statusFilter = document.getElementById("statusFilter");
const checkoutFilter = document.getElementById("checkoutFilter");
const dateFilter = document.getElementById("dateFilter");
const refreshSalesBtn = document.getElementById("refreshSalesBtn");
const customDateInputs = document.getElementById("customDateInputs");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");

/**
 * Determines the pet size category based on its weight in kilograms, using the updated chart.
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
  return "N/A";
}

/**
 * Calculates the total amount, down payment, and balance for a booking based on pet size.
 * @param {object} bookingData - The booking data from Firestore.
 * @returns {object} An object containing totalAmount, downPayment, and balance.
 */
function calculateSalesAmounts(bookingData) {
  let totalAmount = 0;
  let petWeight = parseFloat(bookingData.petInformation?.petWeight);
  let petSize = getPetSizeCategory(petWeight);

  // Pricing based on updated pet size categories
  const sizePrices = {
    Small: 500,
    Medium: 600,
    Large: 700,
    XL: 800,
    XXL: 900,
    "N/A": 0,
  };

  if (bookingData.serviceType === "Boarding") {
    let dailyPrice = sizePrices[petSize] || 0;
    const checkInDateStr =
      bookingData.boardingDetails?.checkInDate || bookingData.date;
    const checkOutDateStr = bookingData.boardingDetails?.checkOutDate;

    if (checkInDateStr && checkOutDateStr) {
      const checkInDate = new Date(checkInDateStr);
      const checkOutDate = new Date(checkOutDateStr);
      const diffTime = Math.abs(checkOutDate.getTime() - checkInDate.getTime());
      const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      totalAmount = dailyPrice * Math.max(1, daysDiff);
    } else {
      totalAmount = 0;
    }
  } else if (bookingData.serviceType === "Grooming") {
    totalAmount = sizePrices[petSize] || 0;
  }

  let actualDownPayment = parseFloat(
    bookingData.paymentDetails?.downPaymentAmount
  );
  if (isNaN(actualDownPayment)) {
    actualDownPayment = 0;
  }

  let balance = totalAmount - actualDownPayment;

  if (
    bookingData.status === "Checked-Out" ||
    bookingData.status === "Completed"
  ) {
    balance = 0;
  }

  return { totalAmount, downPayment: actualDownPayment, balance, petSize };
}

// Load sales data from 'bookings' collection
async function loadSalesData() {
  try {
    salesTableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 20px;">
          Loading transaction data...
        </td>
      </tr>
    `;

    console.log("Fetching transaction data from bookings collection...");

    const bookingsRef = collection(db, "bookings");
    const q = query(
      bookingsRef,
      where("status", "in", [
        "Approved",
        "Rejected",
        "Completed",
        "Checked-Out",
      ]),
      orderBy("timestamp", "desc")
    );
    const querySnapshot = await getDocs(q);

    console.log(
      "Query successful. Number of transaction records found:",
      querySnapshot.size
    );

    let fetchedSales = [];
    const ownerBookingCounts = new Map();
    let transactionCounter = querySnapshot.size;

    querySnapshot.forEach((doc) => {
      const bookingData = doc.data();
      const { totalAmount, downPayment, balance, petSize } =
        calculateSalesAmounts(bookingData);

      const customerName = bookingData.ownerInformation
        ? `${bookingData.ownerInformation.firstName || ""} ${bookingData.ownerInformation.lastName || ""}`.trim()
        : "N/A";

      let accurateSaleDate = "N/A";
      if (
        bookingData.serviceType === "Boarding" &&
        bookingData.boardingDetails?.checkInDate
      ) {
        accurateSaleDate = bookingData.boardingDetails.checkInDate;
      } else if (
        bookingData.serviceType === "Grooming" &&
        bookingData.groomingDetails?.groomingCheckInDate
      ) {
        accurateSaleDate = bookingData.groomingDetails.groomingCheckInDate;
      } else if (bookingData.timestamp) {
        accurateSaleDate = new Date(
          bookingData.timestamp.toDate()
        ).toISOString();
      }

      ownerBookingCounts.set(
        customerName,
        (ownerBookingCounts.get(customerName) || 0) + 1
      );

      const isCheckedOut =
        bookingData.status === "Checked-Out" ||
        bookingData.status === "Completed";
      const checkoutStatus = isCheckedOut ? "Checked Out" : "Not Checked Out";

      let paymentStatus = bookingData.paymentDetails?.paymentStatus || "Unpaid";
      if (isCheckedOut) {
        paymentStatus = "Paid";
      }

      fetchedSales.push({
        id: doc.id,
        transactionID: transactionCounter,
        customerName: customerName,
        serviceType: bookingData.serviceType || "N/A",
        totalAmount: totalAmount,
        downPayment: downPayment,
        balance: balance,
        paymentMethod: bookingData.paymentDetails?.method || "N/A",
        date: accurateSaleDate,
        status: bookingData.status || "N/A",
        petSize: petSize,
        paymentStatus: paymentStatus,
        checkoutStatus: checkoutStatus,
        isCheckedOut: isCheckedOut,
        fullBookingData: bookingData,
      });

      transactionCounter--;
    });

    allProcessedSalesData = fetchedSales.map((sale) => ({
      ...sale,
      ownerBookingCount: ownerBookingCounts.get(sale.customerName) || 0,
    }));

    await autoUpdatePaymentStatusForCheckedOutBookings(fetchedSales);

    displaySalesData(allProcessedSalesData);
  } catch (error) {
    console.error("Error loading sales data from bookings collection:", error);
    salesTableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 20px; color: red;">
          Error loading transaction data. Please check the browser console for details (F12).
        </td>
      </tr>
    `;
  }
}

// Display sales data in table
function displaySalesData(salesData) {
  if (salesData.length === 0) {
    salesTableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 20px;">
          No transaction data found.
        </td>
      </tr>
    `;
    return;
  }

  salesTableBody.innerHTML = salesData
    .map(
      (sale) => `
    <tr>
      <td>${sale.transactionID}</td>
      <td>${sale.customerName}</td>
      <td>${sale.serviceType}</td>
      <td>${sale.petSize}</td>
      <td>₱${sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>₱${sale.downPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${
        sale.isCheckedOut
          ? '<span style="color: #28a745; font-weight: bold;">₱0.00 (Paid)</span>'
          : `₱${sale.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }</td>
      <td>${sale.paymentMethod}</td>
      <td>${formatDate(sale.date)}</td>
      <td>
        <span class="status-badge status-${(sale.paymentStatus || "unpaid").toLowerCase()}">${sale.paymentStatus || "Unpaid"}</span>
      </td>
      <td>
        <span class="status-badge ${sale.isCheckedOut ? "status-checked-out" : "status-not-checked-out"}">
          ${sale.checkoutStatus}
        </span>
      </td>
    </tr>
  `
    )
    .join("");

  addSalesSummary(salesData);
}

// Format date
function formatDate(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Handle date filter change to show/hide custom date inputs
function handleDateFilterChange() {
  const dateValue = dateFilter.value;

  if (dateValue === "custom") {
    customDateInputs.style.display = "block";
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    startDate.value = firstDay.toISOString().split("T")[0];
    endDate.value = lastDay.toISOString().split("T")[0];
  } else {
    customDateInputs.style.display = "none";
  }

  applyFilters();
}

// Filter sales data from the globally stored `allProcessedSalesData`
function filterSalesData() {
  applyFilters();
}

// Apply filters to sales data
function applyFilters() {
  const statusValue = statusFilter.value;
  const checkoutValue = checkoutFilter.value;
  const dateValue = dateFilter.value;

  let filteredData = [...allProcessedSalesData];

  if (statusValue !== "All") {
    filteredData = filteredData.filter((sale) => sale.status === statusValue);
  }

  if (checkoutValue !== "All") {
    filteredData = filteredData.filter(
      (sale) => sale.checkoutStatus === checkoutValue
    );
  }

  if (dateValue !== "all") {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    let filterStartDate = todayStart;
    let filterEndDate = todayEnd;

    switch (dateValue) {
      case "today":
        break;
      case "tomorrow":
        filterStartDate = new Date(todayStart);
        filterStartDate.setDate(todayStart.getDate() + 1);
        filterEndDate = new Date(todayEnd);
        filterEndDate.setDate(todayEnd.getDate() + 1);
        break;
      case "week":
        filterStartDate = todayStart;
        filterEndDate = new Date(todayEnd);
        filterEndDate.setDate(todayEnd.getDate() + 6);
        break;
      case "month":
        filterStartDate = new Date(todayStart);
        filterStartDate.setMonth(todayStart.getMonth() - 1);
        break;
      case "year":
        filterStartDate = new Date(todayStart);
        filterStartDate.setFullYear(todayStart.getFullYear() - 1);
        break;
      case "custom":
        const startDateValue = startDate.value;
        const endDateValue = endDate.value;

        if (startDateValue && endDateValue) {
          filterStartDate = new Date(startDateValue);
          filterStartDate.setHours(0, 0, 0, 0);
          filterEndDate = new Date(endDateValue);
          filterEndDate.setHours(23, 59, 59, 999);
        } else {
          return;
        }
        break;
    }

    filteredData = filteredData.filter((sale) => {
      const saleDate = new Date(sale.date);
      if (isNaN(saleDate.getTime())) {
        return false;
      }
      return saleDate >= filterStartDate && saleDate <= filterEndDate;
    });
  }

  displaySalesData(filteredData);
}

// View sale details
window.viewSaleDetails = function (saleId) {
  const sale = allProcessedSalesData.find((s) => s.id === saleId);
  if (!sale) {
    console.error("Sale not found for ID:", saleId);
    return;
  }

  const modalHeader = document.getElementById("modalHeader");
  const modalBody = document.getElementById("modalBody");

  modalHeader.textContent = `Sales Details - ${sale.transactionID}`;

  const bookingData = sale.fullBookingData;

  let detailsHtml = `
    <div class="user-details">
      <div class="info-section">
        <h3>Transaction Information</h3>
        <div class="info-group">
          <label>Transaction ID:</label>
          <span>${sale.transactionID}</span>
        </div>
        <div class="info-group">
          <label>Customer Name:</label>
          <span>${sale.customerName}</span>
        </div>
        <div class="info-group">
          <label>Service Type:</label>
          <span>${sale.serviceType}</span>
        </div>
        <div class="info-group">
          <label>Total Amount:</label>
          <span>₱${sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="info-group">
          <label>Down Payment:</label>
          <span>₱${sale.downPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="info-group">
          <label>Balance Due:</label>
          <span>₱${sale.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="info-group">
          <label>Payment Method:</label>
          <span>${sale.paymentMethod}</span>
        </div>
        <div class="info-group">
          <label>Date:</label>
          <span>${formatDate(sale.date)}</span>
        </div>
        <div class="info-group">
          <label>Booking Status:</label>
          <span class="status-badge status-${(sale.status || "pending").toLowerCase()}">${sale.status || "Pending"}</span>
        </div>
        <div class="info-group">
          <label>Payment Status:</label>
          <span class="status-badge status-${(sale.paymentStatus || "unpaid").toLowerCase()}">${sale.paymentStatus || "Unpaid"}</span>
        </div>
      </div>
  `;

  if (bookingData) {
    detailsHtml += `
      <div class="info-section">
        <h3>Owner Information</h3>
        <div class="info-group">
          <label>Owner Name:</label>
          <span>${sale.customerName}</span>
        </div>
        <div class="info-group">
          <label>Total Bookings by Owner:</label>
          <span>${sale.ownerBookingCount}</span>
        </div>
        <div class="info-group">
          <label>Email:</label>
          <span>${bookingData.ownerInformation?.email || "N/A"}</span>
        </div>
        <div class="info-group">
          <label>Contact No.:</label>
          <span>${bookingData.ownerInformation?.contactNo || "N/A"}</span>
        </div>
        <div class="info-group">
          <label>Address:</label>
          <span>${bookingData.ownerInformation?.address || "N/A"}</span>
        </div>
      </div>

      <div class="info-section">
        <h3>Pet Information</h3>
        <div class="info-group">
          <label>Pet Name:</label>
          <span>${bookingData.petInformation?.petName || "N/A"}</span>
        </div>
        <div class="info-group">
          <label>Pet Type:</label>
          <span>${bookingData.petInformation?.petType || "N/A"}</span>
        </div>
        <div class="info-group">
          <label>Pet Breed:</label>
          <span>${bookingData.petInformation?.petBreed || "N/A"}</span>
        </div>
        <div class="info-group">
          <label>Pet Size:</label>
          <span>${sale.petSize}</span>
        </div>
        <div class="info-group">
          <label>Pet Weight:</label>
          <span>${bookingData.petInformation?.petWeight || "N/A"} kg</span>
        </div>
        ${
          bookingData.serviceType === "Boarding"
            ? `
        <div class="info-group">
          <label>Pet Age:</label>
          <span>${bookingData.petInformation?.petAge || "N/A"}</span>
        </div>
        `
            : `
        <div class="info-group">
          <label>Pet Gender:</label>
          <span>${bookingData.petInformation?.petGender || "N/A"}</span>
        </div>
        <div class="info-group">
          <label>Date of Birth:</label>
          <span>${formatDate(bookingData.petInformation?.dateOfBirth) || "N/A"}</span>
        </div>
        <div class="info-group">
          <label>Colors/Markings:</label>
          <span>${bookingData.petInformation?.petColorsMarkings || "N/A"}</span>
        </div>
        `
        }
      </div>
      `;

    if (bookingData.serviceType === "Boarding") {
      detailsHtml += `
          <div class="info-section">
            <h3>Boarding Details</h3>
            <div class="info-group">
              <label>Check-in Date:</label>
              <span>${formatDate(bookingData.boardingDetails?.checkInDate) || "N/A"}</span>
            </div>
            <div class="info-group">
              <label>Check-out Date:</label>
              <span>${formatDate(bookingData.boardingDetails?.checkOutDate) || "N/A"}</span>
            </div>
            <div class="info-group">
              <label>Room Type:</label>
              <span>${bookingData.boardingDetails?.selectedRoomType || "N/A"}</span>
            </div>
            <div class="info-group">
              <label>Boarding Waiver Agreed:</label>
              <span>${bookingData.boardingDetails?.boardingWaiverAgreed ? "Yes" : "No"}</span>
            </div>
          </div>

          <div class="info-section">
            <h3>Feeding Details</h3>
            <div class="info-group">
              <label>Food Brand:</label>
              <span>${bookingData.feedingDetails?.foodBrand || "N/A"}</span>
            </div>
            <div class="info-group">
              <label>Number of Meals:</label>
              <span>${bookingData.feedingDetails?.numberOfMeals || "N/A"}</span>
            </div>
            <div class="info-group">
              <label>Morning Feeding:</label>
              <span>${bookingData.feedingDetails?.morningFeeding ? `Yes (${bookingData.feedingDetails?.morningTime || "N/A"})` : "No"}</span>
            </div>
            <div class="info-group">
              <label>Afternoon Feeding:</label>
              <span>${bookingData.feedingDetails?.afternoonFeeding ? `Yes (${bookingData.feedingDetails?.afternoonTime || "N/A"})` : "No"}</span>
            </div>
            <div class="info-group">
              <label>Evening Feeding:</label>
              <span>${bookingData.feedingDetails?.eveningFeeding ? `Yes (${bookingData.feedingDetails?.eveningTime || "N/A"})` : "No"}</span>
            </div>
          </div>

          <div class="info-section">
            <h3>Payment Details</h3>
            <div class="info-group">
              <label>Method:</label>
              <span>${bookingData.paymentDetails?.method || "N/A"}</span>
            </div>
            <div class="info-group">
              <label>Account No.:</label>
              <span>${bookingData.paymentDetails?.accountNumber || "N/A"}</span>
            </div>
            <div class="info-group">
              <label>Account Name:</label>
              <span>${bookingData.paymentDetails?.accountName || "N/A"}</span>
            </div>
            ${
              bookingData.paymentDetails?.receiptImageUrl
                ? `
            <div class="info-group">
              <label>Receipt:</label>
              <img src="${bookingData.paymentDetails.receiptImageUrl}" alt="Payment Receipt" style="max-width:100%; height:auto;">
            </div>
            `
                : ""
            }
          </div>
          `;
    } else if (bookingData.serviceType === "Grooming") {
      detailsHtml += `
          <div class="info-section">
            <h3>Grooming Details</h3>
            <div class="info-group">
              <label>Grooming Date:</label>
              <span>${formatDate(bookingData.groomingDetails?.groomingCheckInDate) || "N/A"}</span>
            </div>
            <div class="info-group">
              <label>Grooming Waiver Agreed:</label>
              <span>${bookingData.groomingDetails?.groomingWaiverAgreed ? "Yes" : "No"}</span>
            </div>
          </div>
          `;
    }

    let adminNotesArray = [];
    if (bookingData.adminNotes) {
      if (Array.isArray(bookingData.adminNotes)) {
        adminNotesArray = bookingData.adminNotes;
      } else if (typeof bookingData.adminNotes === "string") {
        adminNotesArray = [this.adminNotes];
      }
    }
    detailsHtml += `
      <div class="info-section">
        <h3>Admin Notes</h3>
        <p style="white-space: pre-wrap;">${adminNotesArray.join("\n") || "No notes provided."}</p>
      </div>
      `;
  }

  detailsHtml += `</div>`;

  modalBody.innerHTML = detailsHtml;

  const modal = document.getElementById("detailsModal");
  const overlay = document.getElementById("overlay");
  modal.style.display = "block";
  overlay.style.display = "block";
};

statusFilter.addEventListener("change", applyFilters);
checkoutFilter.addEventListener("change", applyFilters);
dateFilter.addEventListener("change", handleDateFilterChange);
refreshSalesBtn.addEventListener("click", loadSalesData);
startDate.addEventListener("change", applyFilters);
endDate.addEventListener("change", applyFilters);

document.addEventListener("DOMContentLoaded", function () {
  loadSalesData();
});

window.refreshSalesReports = loadSalesData;

async function autoUpdatePaymentStatusForCheckedOutBookings(fetchedSales) {
  try {
    const bookingsToUpdate = fetchedSales.filter(
      (sale) =>
        sale.isCheckedOut &&
        sale.fullBookingData.paymentDetails?.paymentStatus !== "Paid"
    );

    if (bookingsToUpdate.length > 0) {
      console.log(
        `Found ${bookingsToUpdate.length} checked-out bookings that need payment status update`
      );

      for (const sale of bookingsToUpdate) {
        try {
          const bookingRef = doc(db, "bookings", sale.id);
          await updateDoc(bookingRef, {
            "paymentDetails.paymentStatus": "Paid",
          });
          console.log(
            `Updated payment status to "Paid" for booking ${sale.id}`
          );
        } catch (error) {
          console.error(
            `Failed to update payment status for booking ${sale.id}:`,
            error
          );
        }
      }

      console.log("Auto-update of payment status completed");
    }
  } catch (error) {
    console.error("Error in auto-updating payment status:", error);
  }
}

function addSalesSummary(salesData) {
  const totalRevenue = salesData.reduce(
    (sum, sale) => sum + sale.totalAmount,
    0
  );
  const totalDownPayments = salesData.reduce(
    (sum, sale) => sum + sale.downPayment,
    0
  );
  const totalBalances = salesData.reduce((sum, sale) => sum + sale.balance, 0);
  const totalCollected = totalDownPayments + (totalRevenue - totalBalances);
  const totalOutstanding = totalBalances;

  const checkedOutCount = salesData.filter((sale) => sale.isCheckedOut).length;
  const pendingCount = salesData.filter((sale) => !sale.isCheckedOut).length;
  const paidCount = salesData.filter(
    (sale) => sale.paymentStatus === "Paid"
  ).length;
  const unpaidCount = salesData.filter(
    (sale) => sale.paymentStatus === "Unpaid"
  ).length;

  const summaryHTML = `
    <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
      <h3 style="color: #333; margin-bottom: 20px; border-bottom: 2px solid #ffb64a; padding-bottom: 10px;">Financial Summary</h3>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px;">
        <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #28a745;">
          <h4 style="color: #28a745; margin: 0 0 10px 0;">Total Revenue</h4>
          <p style="font-size: 1.5em; font-weight: bold; margin: 0; color: #333;">₱${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #17a2b8;">
          <h4 style="color: #17a2b8; margin: 0 0 10px 0;">Total Collected</h4>
          <p style="font-size: 1.5em; font-weight: bold; margin: 0; color: #333;">₱${totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #dc3545;">
          <h4 style="color: #dc3545; margin: 0 0 10px 0;">Outstanding Balance</h4>
          <p style="font-size: 1.5em; font-weight: bold; margin: 0; color: #333;">₱${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #ffc107;">
          <h4 style="color: #ffc107; margin: 0 0 10px 0;">Collection Rate</h4>
          <p style="font-size: 1.5em; font-weight: bold; margin: 0; color: #333;">${totalRevenue > 0 ? ((totalCollected / totalRevenue) * 100).toFixed(1) : 0}%</p>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
        <div style="text-align: center; padding: 10px; background: white; border-radius: 6px;">
          <h5 style="color: #28a745; margin: 0 0 5px 0;">Checked Out</h5>
          <p style="font-size: 1.2em; font-weight: bold; margin: 0; color: #333;">${checkedOutCount}</p>
        </div>
        
        <div style="text-align: center; padding: 10px; background: white; border-radius: 6px;">
          <h5 style="color: #ffc107; margin: 0 0 5px 0;">Pending</h5>
          <p style="font-size: 1.2em; font-weight: bold; margin: 0; color: #333;">${pendingCount}</p>
        </div>
        
        <div style="text-align: center; padding: 10px; background: white; border-radius: 6px;">
          <h5 style="color: #28a745; margin: 0 0 5px 0;">Paid</h5>
          <p style="font-size: 1.2em; font-weight: bold; margin: 0; color: #333;">${paidCount}</p>
        </div>
        
        <div style="text-align: center; padding: 10px; background: white; border-radius: 6px;">
          <h5 style="color: #dc3545; margin: 0 0 5px 0;">Unpaid</h5>
          <p style="font-size: 1.2em; font-weight: bold; margin: 0; color: #333;">${unpaidCount}</p>
        </div>
      </div>
      
      <div style="margin-top: 15px; padding: 10px; background: #e8f5e9; border-radius: 6px; border-left: 4px solid #28a745;">
        <p style="margin: 0; color: #2e7d32; font-size: 0.9em;">
          <strong>Note:</strong> Checked-out bookings are automatically marked as "Paid" and their balance is set to ₱0.00
        </p>
      </div>
    </div>
  `;

  const tableContainer = document.querySelector(".table-container");
  if (tableContainer) {
    const existingSummary = tableContainer.nextElementSibling;
    if (existingSummary && existingSummary.style.marginTop === "30px") {
      existingSummary.remove();
    }
    tableContainer.insertAdjacentHTML("afterend", summaryHTML);
  }
}
