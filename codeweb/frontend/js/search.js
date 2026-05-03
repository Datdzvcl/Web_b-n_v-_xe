let allTrips = []; // Store the full fetched trips

document.addEventListener("DOMContentLoaded", () => {
  // Nav Auth logic is handled by main.js globally already
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const date = params.get("date") || "";

  const searchTitle = document.getElementById("searchTitle");
  const searchSubTitle = document.getElementById("searchSubTitle");

  if (from || to) {
    searchTitle.textContent = `${from || "Bất kỳ"} ➔ ${to || "Bất kỳ"}`;
    searchSubTitle.textContent = `Ngày đi: ${date || "Tất cả các ngày"}`;
  } else {
    searchTitle.textContent = "Tất cả chuyến xe";
  }

  fetchTrips(from, to, date);

  // Setup filter listeners
  document.querySelectorAll(".filter-chk").forEach((chk) => {
    chk.addEventListener("change", applyFilters);
  });
});

async function fetchTrips(from, to, date) {
  const resultsContainer = document.getElementById("resultsContainer");
  try {
    let query = [];
    if (from) query.push(`from=${encodeURIComponent(from)}`);
    if (to) query.push(`to=${encodeURIComponent(to)}`);
    if (date) query.push(`date=${encodeURIComponent(date)}`);
    const queryString = query.length > 0 ? `?${query.join("&")}` : "";

    const response = await fetch(
      `http://localhost:5000/api/trips${queryString}`,
    );
    if (!response.ok) throw new Error("Máy chủ không phản hồi");

    allTrips = await response.json();

    if (allTrips.length === 0) {
      resultsContainer.innerHTML = `<div class="error-msg">Không tìm thấy chuyến xe nào phù hợp với tìm kiếm của bạn.</div>`;
      return;
    }

    renderTrips(allTrips);
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu chuyến xe:", error);
    resultsContainer.innerHTML = `
            <div class="error-msg">
                <i class="fa-solid fa-triangle-exclamation fa-2x" style="margin-bottom: 10px;"></i><br>
                Không thể lấy dữ liệu từ Backend API.<br>
                Vui lòng đảm bảo server Node.js đang chạy ở cổng 5000.
            </div>`;
  }
}

function applyFilters() {
  const selectedBusTypes = Array.from(
    document.querySelectorAll(".filter-bus:checked"),
  ).map((cb) => cb.value.toLowerCase());
  const selectedOperators = Array.from(
    document.querySelectorAll(".filter-op:checked"),
  ).map((cb) => cb.value.toLowerCase());

  const filtered = allTrips.filter((trip) => {
    let passBus = true;
    let passOp = true;

    if (selectedBusTypes.length > 0) {
      passBus = selectedBusTypes.some((type) =>
        trip.busType.toLowerCase().includes(type),
      );
    }
    if (selectedOperators.length > 0) {
      passOp = selectedOperators.some((op) =>
        trip.operator.toLowerCase().includes(op),
      );
    }

    return passBus && passOp;
  });

  if (filtered.length === 0) {
    document.getElementById("resultsContainer").innerHTML =
      `<div class="error-msg">Không có chuyến xe nào khớp với bộ lọc.</div>`;
  } else {
    renderTrips(filtered);
  }
}

function renderTrips(trips) {
  const resultsContainer = document.getElementById("resultsContainer");
  resultsContainer.innerHTML = "";

  trips.forEach((trip) => {
    const tripId = trip.id || trip.TripID || trip.tripId;

    const departureTime = trip.departureTime || trip.DepartureTime;
    const arrivalTime = trip.arrivalTime || trip.ArrivalTime;
    const price = trip.price || trip.Price;
    const departureLocation =
      trip.departureLocation ||
      trip.DepartureLocation ||
      trip.fromLocation ||
      "Chưa rõ";
    const arrivalLocation =
      trip.arrivalLocation ||
      trip.ArrivalLocation ||
      trip.toLocation ||
      "Chưa rõ";
    const operator =
      trip.operator || trip.OperatorName || trip.BusOperator || "Chưa rõ";
    const busType = trip.busType || trip.BusType || "Chưa rõ";
    const availableSeats = trip.availableSeats ?? trip.AvailableSeats ?? 0;

    const depTime = departureTime
      ? new Date(departureTime).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Chưa có giờ đi";

    const arrTime = arrivalTime
      ? new Date(arrivalTime).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Chưa có giờ đến";

    const formattedPrice = price
      ? new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
        }).format(Number(price))
      : "Chưa có giá";

    const card = document.createElement("div");
    card.className = "trip-card";
    card.innerHTML = `
      <div class="trip-info">
        <div>
          <div class="trip-time">${depTime}</div>
          <small style="color:var(--text-light); font-weight: 500;">${departureLocation}</small>
        </div>
        <div>
          <i class="fa-solid fa-arrow-right" style="color:#cbd5e1;"></i>
        </div>
        <div>
          <div class="trip-time" style="color:var(--text-dark)">${arrTime}</div>
          <small style="color:var(--text-light); font-weight: 500;">${arrivalLocation}</small>
        </div>
        <div class="trip-details" style="margin-left: 10px; border-left: 2px solid var(--border-color); padding-left: 20px;">
          <h4>${operator}</h4>
          <p style="color:var(--text-light); font-size:0.95rem;">${busType}</p>
          <p style="color:#10b981; font-size:0.95rem; margin-top:8px; font-weight: 600;">
            <i class="fa-solid fa-couch"></i> Còn ${availableSeats} chỗ
          </p>
        </div>
      </div>
      <div class="trip-action">
        <span class="price">${formattedPrice}</span>
        <button class="btn btn-primary book-btn" onclick="bookTrip(${tripId})">Chọn Chuyến</button>
      </div>
    `;
    resultsContainer.appendChild(card);
  });
}

function bookTrip(tripId) {
  if (!tripId) {
    alert("Không tìm thấy mã chuyến xe.");
    return;
  }
  window.location.href = `booking.html?tripId=${tripId}`;
}
