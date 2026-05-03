const GO_API = "http://localhost:8080/api/go";
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

const authHeaders = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const BUS_TYPES = {
  sleeper: { label: "Xe giường nằm", capacity: 40 },
  limousine: { label: "Limousine", capacity: 22 },
};

let drivers = [];
let buses = [];
let trips = [];
let currentSeats = [];
let editingTripId = null;
let tripFilters = { date: "", type: "", keyword: "" };
let revenueChart = null;

document.addEventListener("DOMContentLoaded", () => {
  if (!token || !user || user.role !== "Operator" || isTokenExpired(token)) {
    clearSessionAndRedirect();
    return;
  }

  renderUserInfo();
  document.getElementById("logoutBtn").addEventListener("click", logout);
  bindNavigation();
  bindForms();
  loadAll();
});

function bindNavigation() {
  document.querySelectorAll(".portal-menu a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      switchSection(link.dataset.section);
    });
  });
}

function renderUserInfo() {
  const name = user.fullName || "Nhà xe";
  const email = user.email || "operator@vexeaz.com";
  document.getElementById("userInfo").innerHTML = `
    <div class="portal-user">
      <div class="portal-user-text">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(email)}</span>
      </div>
      <div class="portal-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div>
    </div>
  `;
}

function switchSection(section) {
  const link = document.querySelector(`.portal-menu a[data-section="${section}"]`);
  if (!link) return;

  document.querySelectorAll(".portal-menu a").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".portal-section").forEach((item) => item.classList.remove("active"));
  link.classList.add("active");
  document.getElementById(`section-${section}`).classList.add("active");
  document.getElementById("pageTitle").textContent = link.textContent.trim();

  if (section === "trips") {
    renderCloneTripOptions();
  }
  if (section === "reports") {
    loadRevenueReport();
  }
}

function bindForms() {
  document.getElementById("busType").addEventListener("change", (event) => {
    document.getElementById("busCapacity").value = BUS_TYPES[event.target.value]?.capacity || 40;
  });

  document.getElementById("busForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const layoutType = value("busType");
    const body = {
      licensePlate: value("busPlate"),
      busType: BUS_TYPES[layoutType]?.label || "Xe khách",
      capacity: Number(value("busCapacity")),
      layoutType,
    };

    const data = await request("/operator/buses", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!data) return;

    showMessage("Đã thêm xe và tạo sơ đồ ghế mặc định");
    event.target.reset();
    document.getElementById("busCapacity").value = BUS_TYPES.sleeper.capacity;
    await Promise.all([loadDashboard(), loadBuses()]);
  });

  document.getElementById("seatBus").addEventListener("change", (event) => {
    loadSeatMap(event.target.value);
  });

  document.getElementById("generateSeatMapBtn").addEventListener("click", () => {
    currentSeats = generateSeatLayout(value("seatLayoutType"), Number(value("seatCapacity")));
    renderSeatMap();
  });

  document.getElementById("saveSeatMapBtn").addEventListener("click", saveSeatMap);

  document.getElementById("tripBus").addEventListener("change", () => {
    if (!editingTripId) setTripSeatsFromBus();
  });

  document.getElementById("tripForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = tripPayload();
    const path = editingTripId ? `/operator/trips/${editingTripId}` : "/operator/trips";
    const method = editingTripId ? "PUT" : "POST";

    const data = await request(path, {
      method,
      body: JSON.stringify(body),
    });
    if (!data) return;

    showMessage(editingTripId ? "Đã cập nhật lịch và giá vé" : "Đã tạo chuyến xe");
    resetTripForm();
    await Promise.all([loadDashboard(), loadTrips()]);
  });

  document.getElementById("cancelTripEditBtn").addEventListener("click", resetTripForm);

  document.getElementById("operatorTripFilterBtn")?.addEventListener("click", () => {
    tripFilters = {
      date: value("operatorTripFilterDate"),
      type: value("operatorTripFilterType").toLowerCase(),
      keyword: value("operatorTripSearch").toLowerCase(),
    };
    renderTripsTable();
  });

  document.getElementById("operatorTripResetBtn")?.addEventListener("click", () => {
    document.getElementById("operatorTripFilterDate").value = "";
    document.getElementById("operatorTripFilterType").value = "";
    document.getElementById("operatorTripSearch").value = "";
    tripFilters = { date: "", type: "", keyword: "" };
    renderTripsTable();
  });

  document.getElementById("cloneTripForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const tripId = value("cloneTripSource");
    const startDate = value("cloneStartDate");
    const endDate = value("cloneEndDate");
    if (!tripId) {
      showMessage("Vui lòng chọn chuyến gốc để nhân bản");
      return;
    }
    if (!startDate || !endDate) {
      showMessage("Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc");
      return;
    }
    if (endDate < startDate) {
      showMessage("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu");
      return;
    }

    const data = await request(`/operator/trips/${tripId}/clone`, {
      method: "POST",
      body: JSON.stringify({
        frequency: value("cloneFrequency"),
        startDate,
        endDate,
      }),
    });
    if (!data) return;

    showMessage(`Đã nhân bản ${data.created || 0} chuyến mới từ ${dateOnly(startDate)} đến ${dateOnly(endDate)}`);
    await Promise.all([loadDashboard(), loadTrips()]);
  });

  document.getElementById("driverForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = {
      fullName: value("driverName"),
      email: value("driverEmail"),
      phone: value("driverPhone"),
      licenseNumber: value("driverLicense"),
    };

    const data = await request("/operator/drivers", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!data) return;

    showMessage(`Tạo tài xế thành công. Mật khẩu mặc định: ${data.defaultPassword}`);
    event.target.reset();
    await Promise.all([loadDashboard(), loadDrivers(), loadTrips()]);
  });

  document.getElementById("revenueReportForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadRevenueReport();
  });
}

async function loadAll() {
  await Promise.all([loadDashboard(), loadDrivers(), loadBuses(), loadBookings()]);
  await loadTrips();
  if (buses.length) {
    await loadSeatMap(document.getElementById("seatBus").value || buses[0].id);
  }
}

async function loadDashboard() {
  const data = await request("/operator/dashboard");
  if (!data) return;

  document.getElementById("totalBuses").textContent = data.totalBuses || 0;
  document.getElementById("totalTrips").textContent = data.totalTrips || 0;
  document.getElementById("totalDrivers").textContent = data.totalDrivers || 0;
  document.getElementById("totalBookings").textContent = data.totalBookings || 0;
  document.getElementById("paidRevenue").textContent = money(data.paidRevenue || 0);
}

async function loadBuses() {
  const selectedTripBus = value("tripBus");
  const selectedSeatBus = value("seatBus");
  buses = (await request("/operator/buses")) || [];

  populateBusSelect("tripBus", selectedTripBus);
  populateBusSelect("seatBus", selectedSeatBus);
  renderBuses();
  if (!editingTripId) setTripSeatsFromBus();
}

function populateBusSelect(selectId, selectedValue) {
  const select = document.getElementById(selectId);
  if (!buses.length) {
    select.innerHTML = `<option value="">Chưa có xe</option>`;
    return;
  }

  select.innerHTML = buses
    .map(
      (bus) =>
        `<option value="${bus.id}" ${String(bus.id) === String(selectedValue) ? "selected" : ""}>${escapeHtml(bus.licensePlate)} - ${escapeHtml(bus.busType)} (${bus.capacity} chỗ)</option>`,
    )
    .join("");
}

function renderBuses() {
  const tbody = document.getElementById("busesTable");
  tbody.innerHTML = buses.length
    ? buses
        .map(
          (bus) => `
            <tr>
              <td>XE-${bus.id}</td>
              <td><strong>${escapeHtml(bus.licensePlate)}</strong></td>
              <td>${escapeHtml(bus.busType)}</td>
              <td>${bus.capacity}</td>
              <td>${bus.seatCount || 0}/${bus.capacity}</td>
              <td>
                <button class="portal-action-btn" type="button" onclick="openSeatMap(${bus.id})">
                  <i class="fa-solid fa-border-all"></i> Sơ đồ
                </button>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="6" class="portal-empty">Chưa có xe</td></tr>`;
}

async function loadDrivers() {
  drivers = (await request("/operator/drivers")) || [];
  const select = document.getElementById("tripDriver");
  select.innerHTML =
    `<option value="">Chưa gán</option>` +
    drivers.map((driver) => `<option value="${driver.id}">${escapeHtml(driver.fullName)} - ${escapeHtml(driver.licenseNumber)}</option>`).join("");

  const tbody = document.getElementById("driversTable");
  tbody.innerHTML = drivers.length
    ? drivers
        .map(
          (driver) => `
            <tr>
              <td>TX-${driver.id}</td>
              <td>${escapeHtml(driver.fullName)}</td>
              <td>${escapeHtml(driver.email)}</td>
              <td>${escapeHtml(driver.phone)}</td>
              <td>${escapeHtml(driver.licenseNumber)}</td>
              <td><span class="portal-badge success">${escapeHtml(statusText(driver.status))}</span></td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="6" class="portal-empty">Chưa có tài xế</td></tr>`;
}

async function loadTrips() {
  trips = (await request("/operator/trips")) || [];
  renderTripsTable();
  renderCloneTripOptions();
}

function renderTripsTable() {
  const visibleTrips = filteredTrips();
  const tbody = document.getElementById("tripsTable");
  tbody.innerHTML = visibleTrips.length
    ? visibleTrips
        .map(
          (trip) => `
            <tr>
              <td>CX-${trip.id}</td>
              <td>${escapeHtml(trip.departureLocation)} - ${escapeHtml(trip.arrivalLocation)}</td>
              <td>${escapeHtml(trip.licensePlate)}<br><small>${escapeHtml(trip.busType)}</small></td>
              <td>${escapeHtml(trip.driverName || "Chưa gán")}</td>
              <td>${dateTime(trip.departureTime)}</td>
              <td>${money(trip.price)}</td>
              <td>${trip.availableSeats}/${trip.capacity || trip.availableSeats}</td>
              <td><span class="portal-badge ${badgeClass(trip.status)}">${escapeHtml(statusText(trip.status))}</span></td>
              <td class="portal-actions">${tripControls(trip)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="9" class="portal-empty">Không có dữ liệu chuyến xe phù hợp</td></tr>`;
}

function filteredTrips() {
  return trips.filter((trip) => {
    if (tripFilters.date && dateInputValue(trip.departureTime) !== tripFilters.date) {
      return false;
    }
    if (tripFilters.type && !String(trip.busType || "").toLowerCase().includes(tripFilters.type)) {
      return false;
    }
    if (tripFilters.keyword) {
      const haystack = [
        trip.departureLocation,
        trip.arrivalLocation,
        trip.licensePlate,
        trip.driverName,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(tripFilters.keyword)) return false;
    }
    return true;
  });
}

function renderCloneTripOptions() {
  const select = document.getElementById("cloneTripSource");
  if (!select) return;
  if (!trips.length) {
    select.innerHTML = `<option value="">Chưa có chuyến để nhân bản</option>`;
    return;
  }

  select.innerHTML = trips
    .map((trip) => {
      const route = `${trip.departureLocation} - ${trip.arrivalLocation}`;
      const label = `CX-${trip.id} | ${route} | ${dateTime(trip.departureTime)}`;
      return `<option value="${trip.id}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

function tripControls(trip) {
  return `
    <button class="portal-action-btn" type="button" onclick="editTrip(${trip.id})">
      <i class="fa-solid fa-pen-to-square"></i> Sửa
    </button>
    ${driverAssignControl(trip)}
  `;
}

function driverAssignControl(trip) {
  if (!drivers.length) return "";
  return `
    <select data-trip-id="${trip.id}" onchange="assignDriver(this)" class="portal-inline-select">
      <option value="">Gán tài xế</option>
      ${drivers
        .map((driver) => `<option value="${driver.id}" ${Number(trip.driverId) === Number(driver.id) ? "selected" : ""}>${escapeHtml(driver.fullName)}</option>`)
        .join("")}
    </select>
  `;
}

window.editTrip = function (tripId) {
  const trip = trips.find((item) => Number(item.id) === Number(tripId));
  if (!trip) return;

  editingTripId = trip.id;
  document.getElementById("tripBus").value = trip.busId;
  document.getElementById("tripDriver").value = trip.driverId || "";
  document.getElementById("tripFrom").value = trip.departureLocation || "";
  document.getElementById("tripTo").value = trip.arrivalLocation || "";
  document.getElementById("tripDepartureTime").value = toDatetimeLocal(trip.departureTime);
  document.getElementById("tripArrivalTime").value = toDatetimeLocal(trip.arrivalTime);
  document.getElementById("tripPrice").value = Number(trip.price || 0);
  document.getElementById("tripSeats").value = Number(trip.availableSeats || 0);
  document.getElementById("tripSubmitBtn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Cập nhật lịch`;
  document.getElementById("cancelTripEditBtn").classList.remove("hidden");
  switchSection("trips");
};

window.assignDriver = async function (select) {
  if (!select.value) return;
  const tripId = select.dataset.tripId;
  const data = await request(`/operator/trips/${tripId}/assign-driver`, {
    method: "PUT",
    body: JSON.stringify({ driverId: Number(select.value) }),
  });
  if (!data) return;

  showMessage("Đã gán tài xế cho chuyến");
  await loadTrips();
};

function tripPayload() {
  const driverId = value("tripDriver");
  return {
    busId: Number(value("tripBus")),
    departureLocation: value("tripFrom"),
    arrivalLocation: value("tripTo"),
    departureTime: value("tripDepartureTime"),
    arrivalTime: value("tripArrivalTime"),
    price: Number(value("tripPrice")),
    availableSeats: Number(value("tripSeats")),
    driverId: driverId ? Number(driverId) : null,
  };
}

function resetTripForm() {
  editingTripId = null;
  document.getElementById("tripForm").reset();
  document.getElementById("tripSubmitBtn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Lưu lịch`;
  document.getElementById("cancelTripEditBtn").classList.add("hidden");
  populateBusSelect("tripBus", "");
  document.getElementById("tripDriver").value = "";
  setTripSeatsFromBus();
}

function setTripSeatsFromBus() {
  const busId = value("tripBus");
  const bus = buses.find((item) => String(item.id) === String(busId));
  if (bus) document.getElementById("tripSeats").value = bus.capacity || bus.seatCount || "";
}

async function loadBookings() {
  const bookings = (await request("/operator/bookings")) || [];
  const tbody = document.getElementById("bookingsTable");
  tbody.innerHTML = bookings.length
    ? bookings
        .map(
          (booking) => `
            <tr>
              <td>VXA-${10000 + Number(booking.id)}</td>
              <td>${escapeHtml(booking.customerName)}<br><small>${escapeHtml(booking.customerPhone)}</small></td>
              <td>${escapeHtml(booking.route)}</td>
              <td>${booking.totalSeats}</td>
              <td>${money(booking.totalPrice)}</td>
              <td><span class="portal-badge ${badgeClass(booking.status)}">${escapeHtml(statusText(booking.status))}</span></td>
              <td>${dateTime(booking.bookingDate)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="7" class="portal-empty">Chưa có đơn vé</td></tr>`;
}

async function loadRevenueReport() {
  const form = document.getElementById("revenueReportForm");
  if (!form) return;

  const params = new URLSearchParams();
  params.set("groupBy", value("reportGroupBy"));
  if (value("reportFrom") && value("reportTo") && value("reportTo") < value("reportFrom")) {
    showMessage("Ngày kết thúc thống kê phải sau hoặc bằng ngày bắt đầu");
    return;
  }
  if (value("reportFrom")) params.set("from", value("reportFrom"));
  if (value("reportTo")) params.set("to", value("reportTo"));

  const data = await request(`/operator/revenue?${params.toString()}`);
  if (!data) return;
  renderRevenueReport(data);
}

function renderRevenueReport(data) {
  const summary = data.summary || {};
  document.getElementById("reportRevenue").textContent = money(summary.paidRevenue || 0);
  document.getElementById("reportBookings").textContent = summary.paidBookings || 0;
  document.getElementById("reportSeats").textContent = summary.seatsSold || 0;

  const tbody = document.getElementById("revenueReportTable");
  const items = data.items || [];
  tbody.innerHTML = items.length
    ? items.map((item) => revenueReportRow(data.groupBy, item)).join("")
    : `<tr><td colspan="5" class="portal-empty">Chưa có doanh thu đã thanh toán trong khoảng thời gian này</td></tr>`;
  renderRevenueChart(data.groupBy, items);
}

function revenueReportRow(groupBy, item) {
  const groupLabel = revenueGroupLabel(groupBy, item);
  const detail = revenueGroupDetail(groupBy, item);
  return `
    <tr>
      <td><strong>${escapeHtml(groupLabel)}</strong></td>
      <td>${detail}</td>
      <td>${Number(item.paidBookings || 0).toLocaleString("vi-VN")}</td>
      <td>${Number(item.seatsSold || 0).toLocaleString("vi-VN")}</td>
      <td><strong>${money(item.revenue || 0)}</strong></td>
    </tr>
  `;
}

function revenueGroupLabel(groupBy, item) {
  if (groupBy === "bus") return `XE-${item.busId}`;
  if (groupBy === "date") return dateOnly(item.date);
  return `CX-${item.tripId}`;
}

function revenueGroupDetail(groupBy, item) {
  if (groupBy === "bus") {
    return `${escapeHtml(item.licensePlate)}<br><small>${escapeHtml(item.busType)} (${item.capacity} chỗ)</small>`;
  }
  if (groupBy === "date") {
    return "Doanh thu theo ngày đặt vé";
  }

  const route = `${item.departureLocation} - ${item.arrivalLocation}`;
  return `${escapeHtml(route)}<br><small>${escapeHtml(item.licensePlate)} - ${dateTime(item.departureTime)}</small>`;
}

function renderRevenueChart(groupBy, items) {
  const canvas = document.getElementById("revenueChart");
  if (!canvas || typeof Chart === "undefined") return;

  const chartItems = groupBy === "date" ? [...items].reverse() : items.slice(0, 12);
  const labels = chartItems.map((item) => revenueChartLabel(groupBy, item));
  const values = chartItems.map((item) => Number(item.revenue || 0));

  if (revenueChart) {
    revenueChart.destroy();
  }

  revenueChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Doanh thu",
          data: values,
          borderWidth: 1,
          backgroundColor: "#2563eb",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => money(value),
          },
        },
      },
    },
  });
}

function revenueChartLabel(groupBy, item) {
  if (groupBy === "bus") return item.licensePlate || `XE-${item.busId}`;
  if (groupBy === "date") return dateOnly(item.date);
  return `CX-${item.tripId}`;
}

window.openSeatMap = async function (busId) {
  switchSection("seatmap");
  document.getElementById("seatBus").value = busId;
  await loadSeatMap(busId);
};

async function loadSeatMap(busId) {
  if (!busId) {
    currentSeats = [];
    renderSeatMap();
    return;
  }

  const data = await request(`/operator/buses/${busId}/seats`);
  if (!data) return;

  currentSeats = (data.seats || []).map(normalizeSeat);
  document.getElementById("seatLayoutType").value = data.layoutType || inferLayoutType(data.bus?.busType);
  document.getElementById("seatCapacity").value = currentSeats.length || data.bus?.capacity || 0;
  renderSeatMap();
}

async function saveSeatMap() {
  const busId = value("seatBus");
  if (!busId) {
    showMessage("Vui lòng chọn xe");
    return;
  }
  if (!currentSeats.length) {
    currentSeats = generateSeatLayout(value("seatLayoutType"), Number(value("seatCapacity")));
  }

  const data = await request(`/operator/buses/${busId}/seats`, {
    method: "PUT",
    body: JSON.stringify({
      layoutType: value("seatLayoutType"),
      seats: currentSeats,
    }),
  });
  if (!data) return;

  showMessage("Đã lưu sơ đồ ghế");
  await Promise.all([loadBuses(), loadSeatMap(busId)]);
};

function renderSeatMap() {
  const preview = document.getElementById("seatMapPreview");
  if (!currentSeats.length) {
    preview.innerHTML = `<div class="portal-empty">Chưa có sơ đồ ghế</div>`;
    return;
  }

  const decks = [...new Set(currentSeats.map((seat) => seat.deck || "Tầng chính"))];
  preview.innerHTML = decks
    .map((deck) => {
      const deckSeats = currentSeats.filter((seat) => (seat.deck || "Tầng chính") === deck);
      const maxColumn = Math.max(...deckSeats.map((seat) => Number(seat.column || 1)));
      const seatsHtml = deckSeats
        .map((seat) => {
          const index = currentSeats.indexOf(seat);
          const blocked = seat.status === "Blocked";
          return `
            <button
              class="operator-seat ${blocked ? "blocked" : ""}"
              type="button"
              style="grid-row:${seat.row};grid-column:${seat.column};"
              onclick="toggleSeat(${index})"
              title="${blocked ? "Khóa ghế" : "Đang mở bán"}"
            >
              ${escapeHtml(seat.label)}
            </button>
          `;
        })
        .join("");

      return `
        <div class="seat-deck">
          <h4>${escapeHtml(deck)}</h4>
          <div class="operator-seat-grid" style="grid-template-columns: repeat(${maxColumn}, 44px);">
            ${seatsHtml}
          </div>
        </div>
      `;
    })
    .join("");
}

window.toggleSeat = function (index) {
  const seat = currentSeats[index];
  if (!seat) return;
  seat.status = seat.status === "Blocked" ? "Active" : "Blocked";
  renderSeatMap();
};

function generateSeatLayout(layoutType, capacity) {
  const count = Math.max(1, Number(capacity || 0));
  if (layoutType === "sleeper") {
    const lowerCount = Math.ceil(count / 2);
    const upperCount = count - lowerCount;
    return [
      ...buildSeatDeck(lowerCount, "D", "Tầng dưới", "Giường", [1, 3, 5]),
      ...buildSeatDeck(upperCount, "T", "Tầng trên", "Giường", [1, 3, 5]),
    ];
  }
  if (layoutType === "limousine") {
    return buildSeatDeck(count, "VIP", "Tầng chính", "Ghế VIP", [1, 3, 5]);
  }
  return buildSeatDeck(count, "G", "Tầng chính", "Ghế ngồi", [1, 2, 4, 5]);
}

function buildSeatDeck(count, prefix, deck, seatType, columns) {
  return Array.from({ length: count }, (_, index) => ({
    label: `${prefix}${String(index + 1).padStart(2, "0")}`,
    row: Math.floor(index / columns.length) + 1,
    column: columns[index % columns.length],
    deck,
    seatType,
    status: "Active",
  }));
}

function normalizeSeat(seat) {
  return {
    label: seat.label ?? seat.Label,
    row: Number(seat.row ?? seat.Row),
    column: Number(seat.column ?? seat.Column),
    deck: seat.deck ?? seat.Deck ?? "Tầng chính",
    seatType: seat.seatType ?? seat.SeatType ?? "Ghế",
    status: seat.status ?? seat.Status ?? "Active",
  };
}

function inferLayoutType(busType = "") {
  const raw = busType.toLowerCase();
  if (raw.includes("limousine") || raw.includes("vip")) return "limousine";
  if (raw.includes("giường") || raw.includes("giuong") || raw.includes("nằm")) return "sleeper";
  return "seat";
}

async function request(path, options = {}) {
  try {
    const res = await fetch(`${GO_API}${path}`, {
      ...options,
      headers: { ...authHeaders, ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      showMessage(data.message || "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      clearSessionAndRedirect(800);
      return null;
    }
    if (res.status === 403) {
      showMessage(data.message || "Không có quyền truy cập");
      return null;
    }
    if (!res.ok) {
      showMessage(data.message || "Có lỗi xảy ra");
      return null;
    }
    return data;
  } catch (error) {
    console.error(error);
    showMessage("Không kết nối được Go API. Hãy chạy backend-go ở cổng 8080.");
    return null;
  }
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function showMessage(message) {
  document.getElementById("message").textContent = message;
}

function logout(event) {
  if (event) event.preventDefault();
  clearSessionAndRedirect();
}

function clearSessionAndRedirect(delay = 0) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  const redirect = () => {
    window.location.href = "login.html";
  };
  if (delay > 0) {
    setTimeout(redirect, delay);
    return;
  }
  redirect();
}

function isTokenExpired(tokenValue) {
  try {
    const payloadPart = tokenValue.split(".")[1];
    if (!payloadPart) return true;

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));

    return Boolean(payload.exp && payload.exp * 1000 <= Date.now());
  } catch (error) {
    return true;
  }
}

function money(value) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(value || 0));
}

function dateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN");
}

function dateOnly(value) {
  if (!value) return "";
  const parts = String(value).slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return value;
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function badgeClass(status) {
  if (status === "Paid" || status === "Completed" || status === "Active") return "success";
  if (status === "Pending" || status === "Scheduled" || status === "On-going") return "warning";
  return "danger";
}

function statusText(status) {
  const labels = {
    Active: "Hoạt động",
    Inactive: "Ngừng hoạt động",
    Paid: "Đã thanh toán",
    Pending: "Chờ xử lý",
    Cancelled: "Đã hủy",
    Scheduled: "Đã lên lịch",
    "On-going": "Đang chạy",
    Completed: "Hoàn thành",
  };

  return labels[status] || status;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
