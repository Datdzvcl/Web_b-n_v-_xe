document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const tripId = params.get("tripId");

  if (!tripId) {
    alert("Lỗi: Không tìm thấy chuyến xe.");
    window.location.href = "search.html";
    return;
  }

  let currentTrip = null;
  let selectedSeats = [];

  // Fetch Trip details
  fetch(`http://localhost:5000/api/trips/${tripId}`)
    .then((res) => {
      if (!res.ok) throw new Error("Chuyến xe không tồn tại");
      return res.json();
    })
    .then((trip) => {
      currentTrip = trip;
      document.getElementById("loading").style.display = "none";
      document.getElementById("bookingMainContent").style.display = "flex";

      renderTripSummary(trip);
      renderSeatMap();

      // Handle Continue button
      document
        .getElementById("btnContinue")
        .addEventListener("click", () => submitBooking(trip.id));
    })
    .catch((err) => {
      console.error(err);
      alert("Đã xảy ra lỗi khi lấy thông tin chuyến xe.");
      window.location.href = "search.html";
    });

  function renderTripSummary(trip) {
    document.getElementById("summaryRoute").textContent =
      `${trip.departureLocation} ➔ ${trip.arrivalLocation}`;
    const depDate = new Date(trip.departureTime);
    document.getElementById("summaryDate").textContent =
      depDate.toLocaleDateString("vi-VN");
    document.getElementById("summaryTime").textContent =
      depDate.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    document.getElementById("summaryOperator").textContent = trip.operator;
    document.getElementById("summaryBusType").textContent = trip.busType;

    const formattedPrice = new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(trip.price);
    document.getElementById("summaryPrice").textContent = formattedPrice;
  }

  function renderSeatMap() {
    // Create a mock 4-column seat map (e.g., A1, A2, B1, B2)
    const seatMap = document.getElementById("seatMap");
    seatMap.innerHTML = "";

    const rows = 10;
    const alphabet = "ABCDEFGHIJ";

    for (let i = 0; i < rows; i++) {
      // Left block
      createSeatBtn(alphabet[i] + "1", seatMap);
      createSeatBtn(alphabet[i] + "2", seatMap);
      // Right block
      createSeatBtn(alphabet[i] + "3", seatMap);
      createSeatBtn(alphabet[i] + "4", seatMap);
    }
  }

  function createSeatBtn(seatLabel, container) {
    const seatBtn = document.createElement("div");
    seatBtn.className = "seat";
    seatBtn.textContent = seatLabel;
    seatBtn.dataset.label = seatLabel;

    // Randomly mock booked seats
    if (Math.random() < 0.2) {
      seatBtn.classList.add("booked");
    } else {
      seatBtn.addEventListener("click", () => toggleSeat(seatBtn));
    }
    container.appendChild(seatBtn);
  }

  function toggleSeat(seatBtn) {
    const label = seatBtn.dataset.label;
    if (seatBtn.classList.contains("selected")) {
      seatBtn.classList.remove("selected");
      selectedSeats = selectedSeats.filter((s) => s !== label);
    } else {
      if (selectedSeats.length >= 6) {
        Swal.fire({
          icon: "warning",
          title: "Giới hạn",
          text: "Bạn chỉ được chọn tối đa 6 ghế cho mỗi lần đặt.",
        });
        return;
      }
      seatBtn.classList.add("selected");
      selectedSeats.push(label);
    }
    updateSummary();
  }

  seat.addEventListener("click", async function () {
    const seatLabel = this.innerText;

    // ghế đã đặt thì không cho click
    if (this.classList.contains("booked")) return;

    // chọn ghế
    this.classList.toggle("selected");

    // gọi API giữ ghế
    await fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tripId: tripId,
        seatLabel: seatLabel,
      }),
    });
  });

  function updateSummary() {
    const seatsText =
      selectedSeats.length > 0 ? selectedSeats.join(", ") : "Chưa chọn";
    document.getElementById("summarySeats").textContent = seatsText;

    const total = currentTrip.price * selectedSeats.length;
    const formattedTotal = new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(total);
    document.getElementById("summaryTotal").textContent = formattedTotal;
  }

  async function submitBooking(tripId) {
    if (selectedSeats.length === 0) {
      Swal.fire("Chú ý", "Vui lòng chọn ít nhất 1 chỗ ngồi", "info");
      return;
    }

    const fullName = document.getElementById("fullName").value.trim();
    const phone = document.getElementById("phone").value.trim();

    if (!fullName || !phone) {
      Swal.fire(
        "Lỗi",
        "Vui lòng điền đầy đủ họ tên và số điện thoại.",
        "error",
      );
      return;
    }

    // Call mock API to create booking
    try {
      const reqBody = {
        tripId: tripId,
        customerName: fullName,
        customerPhone: phone,
        seats: selectedSeats,
      };

      const res = await fetch("http://localhost:5000/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) throw new Error("Booking failed");

      const data = await res.json();

      // Navigate to payment page and pass booking ID
      window.location.href = `payment.html?bookingId=${data.booking.id}`;
    } catch (error) {
      console.error(error);
      Swal.fire(
        "Lỗi Hệ Thống",
        "Đã xảy ra lỗi khi tạo đơn hàng. Vui lòng thử lại.",
        "error",
      );
    }
  }
});
