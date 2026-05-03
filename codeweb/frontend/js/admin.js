document.addEventListener("DOMContentLoaded", async () => {
  // 1. Verify Admin Auth
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");

  if (!token || !userStr) {
    window.location.href = "../login.html";
    return;
  }

  const user = JSON.parse(userStr);
  if (user.role !== "Admin") {
    alert(
      "Bạn không có quyền truy cập trang này. Đang chuyển hướng về trang chủ.",
    );
    window.location.href = "../index.html";
    return;
  }

  // 2. Setup Logout
  document.getElementById("adminLogoutBtn").addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "../login.html";
  });

  // 3. Fetch Dashboard Data
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    // Fetch Stats
    const statsRes = await fetch(
      "http://localhost:5000/api/admin/dashboard-stats",
      {
        headers,
      },
    );
    if (statsRes.status === 401 || statsRes.status === 403)
      throw new Error("Unauthorized");

    const statsData = await statsRes.json();
    if (statsRes.ok) {
      const formattedRev = new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
      }).format(statsData.totalRevenue);
      document.getElementById("totalRevenue").textContent = formattedRev;
      document.getElementById("ticketsSold").textContent =
        statsData.ticketsSold.toLocaleString("vi-VN");
      document.getElementById("activeTrips").textContent =
        statsData.activeTrips;
      document.getElementById("totalOperators").textContent =
        statsData.totalOperators;
    }

    // Fetch Recent Bookings
    const bookingsRes = await fetch(
      "http://localhost:5000/api/admin/recent-bookings",
      { headers },
    );
    const bookingsData = await bookingsRes.json();

    if (bookingsRes.ok) {
      const tbody = document.getElementById("recentBookingsTable");
      tbody.innerHTML = "";

      bookingsData.forEach((b) => {
        const date = new Date(b.bookingDate).toLocaleDateString("vi-VN");
        const price = new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
        }).format(b.totalPrice);
        let badgeClass = "";
        let statusText = "";
        let actionBtn = "";

        // STATUS
        if (b.status === "Paid") {
          badgeClass = "badge-success";
          statusText = "Đã thanh toán";
        } else if (b.status === "Pending") {
          badgeClass = "badge-warning";
          statusText = "Chờ xử lý";
        } else if (b.status === "Cancelled") {
          badgeClass = "badge-danger";
          statusText = "Đã huỷ";
        }

        // BUTTON
        if (b.status === "Pending") {
          actionBtn = `
        <button onclick="markAsPaid(${b.id})"
        style="border:none; background:var(--primary-color); color:white; padding:5px 10px; border-radius:4px; cursor:pointer;">
        Thu tiền
        </button>
    `;
        } else {
          actionBtn = `
        <button disabled style="opacity:0.5; cursor:not-allowed;">
        Xong
        </button>
    `;
        }

        // if (b.status === "Paid") {
        //   badgeClass = "badge-success";
        //   statusText = "Đã thanh toán";
        //   actionBtn = `<button title="Xem chi tiết" style="border:none; background:transparent; color:var(--text-light); cursor:not-allowed;"><i class="fa-solid fa-check-circle"></i> Xong</button>`;
        // }

        // if (b.status === "Paid") {
        //   badgeClass = "badge-success";
        //   statusText = "Đã thanh toán";
        // } else if (b.status === "Pending") {
        //   badgeClass = "badge-warning";
        //   statusText = "Chờ xử lý";
        // } else if (b.status === "Cancelled") {
        //   badgeClass = "badge-danger";
        //   statusText = "Đã huỷ";
        // }

        tbody.innerHTML += `
                    <tr>
                        <td style="font-family: monospace; font-weight: 600;">VXA-${10000 + b.id}</td>
                        <td>${b.customerName} <br><small style="color:var(--text-light)">${b.customerPhone}</small></td>
                        <td>${b.route}</td>
                        <td>${date}</td>
                        <td style="font-weight: 600;">${price}</td>
                        <td><span class="badge ${badgeClass}">${statusText}</span></td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
      });
    }
  } catch (err) {
    console.error("Failed to fetch admin data", err);
    if (err.message === "Unauthorized") {
      window.location.href = "../login.html";
    }
  }
});

// Global function to mark booking as paid
window.markAsPaid = async function (id) {
  if (
    !confirm(
      "Xác nhận đã nhận tiền thanh toán cho đơn này? Doanh thu sẽ được cập nhật.",
    )
  )
    return;

  const token = localStorage.getItem("token");
  try {
    const res = await fetch(
      `http://localhost:5000/api/admin/bookings/${id}/pay`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();

    if (res.ok) {
      alert("Thành công: " + data.message);
      window.location.reload(); // Reload to fetch fresh stats
    } else {
      alert("Lỗi: " + data.message);
    }
  } catch (err) {
    console.error(err);
    alert("Có lỗi xảy ra khi cập nhật.");
  }
};

// ================= ADMIN SPA LOGIC =================
const token = localStorage.getItem("token");
const headers = { Authorization: `Bearer ${token}` };

// 1. Navigation
const sections = {
  "menu-dashboard": { id: "sec-dashboard", title: "Bảng Điều Khiển" },
  "menu-trips": {
    id: "sec-trips",
    title: "Quản lý Chuyến Xe",
    load: loadTrips,
  },
  "menu-operators": {
    id: "sec-operators",
    title: "Quản lý Nhà Xe",
    load: loadOperators,
  },
  "menu-users": {
    id: "sec-users",
    title: "Quản lý Khách Hàng",
    load: loadUsers,
  },
  "menu-stats": {
    id: "sec-stats",
    title: "Thống kê",
    load: loadStats, // 👈 QUAN TRỌNG
  },
};

Object.keys(sections).forEach((menuId) => {
  const menuEl = document.getElementById(menuId);
  if (menuEl) {
    menuEl.addEventListener("click", (e) => {
      e.preventDefault();
      // Update active sidebar
      document
        .querySelectorAll(".sidebar-menu a")
        .forEach((el) => el.classList.remove("active"));
      menuEl.classList.add("active");

      // Hide all sections, show target
      document
        .querySelectorAll(".content-section")
        .forEach((el) => el.classList.remove("active"));
      document.getElementById(sections[menuId].id).classList.add("active");

      // Update Title
      document.getElementById("pageTitle").textContent = sections[menuId].title;

      // Load data if available
      if (sections[menuId].load) {
        sections[menuId].load();
      }
    });
  }
});

// 2. Modals
window.showModal = function (id) {
  document.getElementById(id).classList.add("flex");
};
window.closeModal = function (id) {
  document.getElementById(id).classList.remove("flex");
};

// 3. Load & Render Data
// async function loadTrips() {
//   try {
//     const res = await fetch("http://localhost:5000/api/admin/trips", {
//       headers,
//     });
//     const data = await res.json();
//     const tbody = document.getElementById("tripsTableBody");
//     tbody.innerHTML = "";
//     data.forEach((t) => {
//       const dep = new Date(t.DepartureTime).toLocaleString("vi-VN");
//       const price = new Intl.NumberFormat("vi-VN", {
//         style: "currency",
//         currency: "VND",
//       }).format(t.Price);
//       tbody.innerHTML += `
//                 <tr>
//                     <td>IDX-${t.TripID}</td>
//                     <td><b>${t.OperatorName}</b></td>
//                     <td>${t.LicensePlate}</td>
//                     <td>${t.DepartureLocation} - ${t.ArrivalLocation}</td>
//                     <td>${dep}</td>
//                     <td>${price}</td>
//                     <td>${t.AvailableSeats}</td>
//                     <td>
//                         <button class="btn-sm btn-danger" onclick="deleteTrip(${t.TripID})"><i class="fa-solid fa-trash"></i> Xóa</button>
//                     </td>
//                 </tr>
//             `;
//     });
//   } catch (err) {
//     console.error(err);
//   }
// }

// --- TRIPS PAGINATION STATE ---
let tripsCurrentPage = 1;
const TRIPS_PAGE_SIZE = 15;
let tripsCurrentFilters = { date: "", type: "", partner: "" };

async function loadTrips(page = 1) {
  tripsCurrentPage = page;

  const params = new URLSearchParams({
    page,
    limit: TRIPS_PAGE_SIZE,
  });
  if (tripsCurrentFilters.date) params.append("date", tripsCurrentFilters.date);
  if (tripsCurrentFilters.type) params.append("type", tripsCurrentFilters.type);
  if (tripsCurrentFilters.partner)
    params.append("partner", tripsCurrentFilters.partner);

  try {
    const res = await fetch(
      `http://localhost:5000/api/admin/trips?${params.toString()}`,
      { headers },
    );
    const json = await res.json();
    renderTripsTable(json.data);
    renderTripsPagination(json.pagination, loadTrips);
  } catch (err) {
    console.error(err);
  }
}

function renderTripsTable(data) {
  const tbody = document.getElementById("tripsTableBody");
  tbody.innerHTML = "";

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#888; padding:30px;">Không có dữ liệu</td></tr>`;
    return;
  }

  data.forEach((t) => {
    const dep = new Date(t.DepartureTime).toLocaleString("vi-VN");
    const price = new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(t.Price);
    tbody.innerHTML += `
      <tr>
        <td>IDX-${t.TripID}</td>
        <td><b>${t.OperatorName || t.operator || ""}</b></td>
        <td>${t.LicensePlate || ""}</td>
        <td>${t.DepartureLocation} - ${t.ArrivalLocation}</td>
        <td>${dep}</td>
        <td>${price}</td>
        <td>${t.AvailableSeats}</td>
        <td>
          <button class="btn-sm btn-danger" onclick="deleteTrip(${t.TripID})">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        </td>
      </tr>
    `;
  });
}

function renderTripsPagination(pagination, onPageChange) {
  const old = document.getElementById("tripsPager");
  if (old) old.remove();

  if (!pagination || pagination.totalPages <= 1) return;

  const { page, totalPages, total, limit } = pagination;

  const wrapper = document.createElement("div");
  wrapper.id = "tripsPager";
  wrapper.style.cssText =
    "display:flex; align-items:center; justify-content:space-between; margin-top:16px; flex-wrap:wrap; gap:8px;";

  // Thông tin tổng
  const info = document.createElement("span");
  info.style.cssText = "color:#6b7280; font-size:0.85rem;";
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  info.textContent = `Hiển thị ${from}–${to} / ${total} chuyến`;

  // Nhóm nút
  const btnGroup = document.createElement("div");
  btnGroup.style.cssText = "display:flex; gap:4px; align-items:center;";

  const makeBtn = (label, disabled, active, onClick) => {
    const btn = document.createElement("button");
    btn.innerHTML = label;
    btn.disabled = disabled;
    btn.style.cssText = [
      "padding:6px 12px",
      "border-radius:6px",
      "font-size:0.85rem",
      `cursor:${disabled ? "not-allowed" : "pointer"}`,
      `border:1px solid ${active ? "#ff6600" : "#d1d5db"}`,
      `background:${active ? "#ff6600" : "white"}`,
      `color:${active ? "white" : disabled ? "#d1d5db" : "#374151"}`,
      `font-weight:${active ? "700" : "400"}`,
      "transition:all 0.15s",
    ].join(";");
    if (!disabled && !active) {
      btn.onmouseenter = () => {
        btn.style.borderColor = "#ff6600";
        btn.style.color = "#ff6600";
      };
      btn.onmouseleave = () => {
        btn.style.borderColor = "#d1d5db";
        btn.style.color = "#374151";
      };
    }
    if (!disabled) btn.addEventListener("click", onClick);
    return btn;
  };

  btnGroup.appendChild(
    makeBtn("&#8249; Trước", page <= 1, false, () => onPageChange(page - 1)),
  );

  getPageNumbers(page, totalPages).forEach((p) => {
    if (p === "...") {
      const dots = document.createElement("span");
      dots.textContent = "…";
      dots.style.cssText = "padding:6px 4px; color:#9ca3af; font-size:0.85rem;";
      btnGroup.appendChild(dots);
    } else {
      btnGroup.appendChild(
        makeBtn(p, false, p === page, () => onPageChange(p)),
      );
    }
  });

  btnGroup.appendChild(
    makeBtn("Sau &#8250;", page >= totalPages, false, () =>
      onPageChange(page + 1),
    ),
  );

  wrapper.appendChild(info);
  wrapper.appendChild(btnGroup);

  document.querySelector("#sec-trips .table-container").after(wrapper);
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3)
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

async function loadOperators() {
  try {
    const res = await fetch("http://localhost:5000/api/admin/operators", {
      headers,
    });
    const data = await res.json();
    const tbody = document.getElementById("operatorsTableBody");
    tbody.innerHTML = "";
    data.forEach((o) => {
      tbody.innerHTML += `
                <tr>
                    <td>OP-${o.OperatorID}</td>
                    <td><b>${o.Name}</b></td>
                    <td>${o.Description || ""}</td>
                    <td>${o.ContactPhone}</td>
                    <td>${o.Email}</td>
                    <td>
                        <button class="btn-sm btn-danger" onclick="deleteOperator(${o.OperatorID})"><i class="fa-solid fa-trash"></i> Xóa</button>
                    </td>
                </tr>
            `;
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadUsers() {
  try {
    const res = await fetch("http://localhost:5000/api/admin/users", {
      headers,
    });
    const data = await res.json();
    const tbody = document.getElementById("usersTableBody");
    tbody.innerHTML = "";
    data.forEach((u) => {
      const date = new Date(u.CreatedAt).toLocaleDateString("vi-VN");
      const roleBadge =
        u.Role === "Admin"
          ? '<span class="badge badge-success">Admin</span>'
          : '<span class="badge badge-warning">Khách hàng</span>';
      tbody.innerHTML += `
                <tr>
                    <td>USR-${u.UserID}</td>
                    <td><b>${u.FullName}</b></td>
                    <td>${u.Email}</td>
                    <td>${u.Phone}</td>
                    <td>${roleBadge}</td>
                    <td>${date}</td>
                    <td>
                        ${u.Role !== "Admin" ? `<button class="btn-sm btn-danger" onclick="deleteUser(${u.UserID})"><i class="fa-solid fa-trash"></i> Xóa</button>` : ""}
                    </td>
                </tr>
            `;
    });
  } catch (err) {
    console.error(err);
  }
}

// 4. Delete Functions
window.deleteTrip = async function (id) {
  if (!confirm("Bạn có chắc chắn muốn xóa chuyến xe này?")) return;
  try {
    const res = await fetch("http://localhost:5000/api/admin/trips/" + id, {
      method: "DELETE",
      headers,
    });
    if (res.ok) loadTrips(tripsCurrentPage);
    else alert("Không thể xóa chuyến: " + (await res.json()).message);
  } catch (err) {
    console.error(err);
  }
};

window.deleteOperator = async function (id) {
  if (
    !confirm(
      "Bạn có chắc chắn muốn xóa nhà xe này? Sẽ gây lỗi nếu nhà xe đang có Chuyến xe trực thuộc.",
    )
  )
    return;
  try {
    const res = await fetch("http://localhost:5000/api/admin/operators/" + id, {
      method: "DELETE",
      headers,
    });
    if (res.ok) loadOperators();
    else alert("Lỗi: " + (await res.json()).message);
  } catch (err) {
    console.error(err);
  }
};

window.deleteUser = async function (id) {
  if (!confirm("Xóa tài khoản khách hàng này?")) return;
  try {
    const res = await fetch("http://localhost:5000/api/admin/users/" + id, {
      method: "DELETE",
      headers,
    });
    if (res.ok) loadUsers();
    else alert("Lỗi: " + (await res.json()).message);
  } catch (err) {
    console.error(err);
  }
};

// 5. Submit Forms
document
  .getElementById("formOperator")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      Name: document.getElementById("opName").value,
      Description: document.getElementById("opDesc").value,
      ContactPhone: document.getElementById("opPhone").value,
      Email: document.getElementById("opEmail").value,
    };
    try {
      const res = await fetch("http://localhost:5000/api/admin/operators", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        closeModal("operatorModal");
        document.getElementById("formOperator").reset();
        loadOperators();
        alert("Thêm nhà xe thành công!");
      } else {
        alert("Lỗi khi thêm nhà xe");
      }
    } catch (err) {
      console.error(err);
    }
  });

document.getElementById("formTrip")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    BusID: document.getElementById("trBus").value,
    DepartureLocation: document.getElementById("trDep").value,
    ArrivalLocation: document.getElementById("trArr").value,
    DepartureTime: document.getElementById("trDepTime").value,
    ArrivalTime: document.getElementById("trArrTime").value,
    Price: document.getElementById("trPrice").value,
    AvailableSeats: document.getElementById("trSeats").value,
  };
  try {
    const res = await fetch("http://localhost:5000/api/admin/trips", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      closeModal("tripModal");
      document.getElementById("formTrip").reset();
      loadTrips();
      alert("Thêm chuyến xe thành công!");
    } else {
      alert("Lỗi: Mã ID xe không hợp lệ. Vui lòng kiểm tra lại");
    }
  } catch (err) {
    console.error(err);
  }
});

// document
//   .getElementById("btnViewAllBookings")
//   ?.addEventListener("click", async () => {
//     // 1. Đổi section
//     document
//       .querySelectorAll(".content-section")
//       .forEach((el) => el.classList.remove("active"));
//     document.getElementById("sec-bookings").classList.add("active");

//     document.getElementById("pageTitle").textContent = "Tất cả giao dịch";

//     // 2. Gọi API
//     try {
//       const res = await fetch("http://localhost:5000/api/admin/bookings", {
//         headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
//       });

//       const data = await res.json();

//       // ✅ LƯU DATA (cho filter dùng)
//       window.allBookingsData = data;

//       // ✅ GỌI HÀM RENDER CHUẨN
//       renderAllBookings(data);
//     } catch (err) {
//       console.error(err);
//       alert("Lỗi load dữ liệu");
//     }
//   });

document
  .getElementById("btnViewAllBookings")
  ?.addEventListener("click", async () => {
    document
      .querySelectorAll(".content-section")
      .forEach((el) => el.classList.remove("active"));

    document.getElementById("sec-bookings").classList.add("active");
    document.getElementById("pageTitle").textContent = "Tất cả giao dịch";

    await loadAllBookings(); // ✅ gọi chuẩn
  });

function renderAllBookings(data) {
  const filter = document.getElementById("bookingFilter").value;
  const tbody = document.getElementById("allBookingsTable");
  tbody.innerHTML = "";

  let filtered = data;

  if (filter !== "all") {
    filtered = data.filter((b) => b.status === filter);
  }

  filtered.forEach((b) => {
    const date = new Date(b.bookingDate).toLocaleDateString("vi-VN");
    const price = new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(b.totalPrice);

    let badgeClass = "";
    let statusText = "";
    let actionBtn = "";

    // ✅ STATUS
    if (b.status === "Paid") {
      badgeClass = "badge-success";
      statusText = "Đã thanh toán";
    } else if (b.status === "Pending") {
      badgeClass = "badge-warning";
      statusText = "Chờ xử lý";

      // ✅ NÚT THU TIỀN
      actionBtn = `
        <button onclick="markAsPaid(${b.id})"
        style="border:none; background:var(--primary-color); color:white; padding:5px 10px; border-radius:4px; cursor:pointer;">
        Thu tiền
        </button>
      `;
    } else if (b.status === "Cancelled") {
      badgeClass = "badge-danger";
      statusText = "Đã huỷ";
    }

    // fallback
    if (!actionBtn) {
      actionBtn = `<button disabled style="opacity:0.5;">Xong</button>`;
    }

    tbody.innerHTML += `
      <tr>
        <td>VXA-${10000 + b.id}</td>
        <td>${b.customerName}</td>
        <td>${b.route}</td>
        <td>${date}</td>
        <td>${price}</td>
        <td><span class="badge ${badgeClass}">${statusText}</span></td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });
}

document.getElementById("bookingFilter")?.addEventListener("change", () => {
  renderAllBookings(window.allBookingsData);
});
document.getElementById("backToDashboard")?.addEventListener("click", () => {
  document
    .querySelectorAll(".content-section")
    .forEach((el) => el.classList.remove("active"));

  document.getElementById("sec-dashboard").classList.add("active");
  document.getElementById("pageTitle").textContent = "Bảng Điều Khiển";

  location.reload(); // ✅ reload lại dashboard
});

async function loadAllBookings() {
  try {
    const res = await fetch("http://localhost:5000/api/admin/bookings", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    const data = await res.json();
    window.allBookingsData = data;
    renderAllBookings(data);
  } catch (err) {
    console.error(err);
    alert("Lỗi load dữ liệu");
  }
}

async function loadStats() {
  const type = document.getElementById("statType").value || "date";
  const group = document.getElementById("statGroup").value || "customer";
  const date = document.getElementById("statDate").value || "";

  try {
    const res = await fetch(
      `http://localhost:5000/api/admin/stats?type=${type}&group=${group}&date=${date}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      },
    );

    const data = await res.json();

    const bookings = Array.isArray(data) ? data : data.bookings;

    if (!bookings) {
      alert("API chưa trả dữ liệu đúng!");
      console.log("API trả về:", data);
      return;
    }

    renderStats(data);
  } catch (err) {
    console.error(err);
    alert("Lỗi load thống kê");
  }
}

const STATS_PAGE_SIZE = 10;
let statsCurrentPage = 1;
let statsAllBookings = [];

function renderStats(data) {
  statsAllBookings = data.bookings;
  statsCurrentPage = 1;

  // SUMMARY
  const summary = document.getElementById("statsSummary");
  summary.innerHTML = `
    <div class="stat-card">
      <div class="stat-info">
        <h4>DOANH THU</h4>
        <h2>${formatMoney(data.totalRevenue)}</h2>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-info">
        <h4>SỐ ĐƠN</h4>
        <h2>${data.totalBookings}</h2>
      </div>
    </div>
  `;

  renderChart(data.chart);
  renderStatsTable();
}

function renderStatsTable(page) {
  const tbody = document.getElementById("statsTable");
  const total = statsAllBookings.length;
  const totalPages = Math.ceil(total / STATS_PAGE_SIZE);
  if (page !== undefined) statsCurrentPage = page; // ✅ cập nhật trước khi tính
  const start = (statsCurrentPage - 1) * STATS_PAGE_SIZE; // đúng trang rồi
  const pageData = statsAllBookings.slice(start, start + STATS_PAGE_SIZE);

  tbody.innerHTML = "";

  pageData.forEach((b) => {
    let badgeClass = "";
    let statusText = "";

    if (b.PaymentStatus === "Paid") {
      badgeClass = "badge-success";
      statusText = "Đã thanh toán";
    } else if (b.PaymentStatus === "Pending") {
      badgeClass = "badge-warning";
      statusText = "Chờ xử lý";
    } else if (b.PaymentStatus === "Cancelled") {
      badgeClass = "badge-danger";
      statusText = "Đã huỷ";
    }

    tbody.innerHTML += `
      <tr>
        <td>#${b.BookingID}</td>
        <td>${b.CustomerName}</td>
        <td>${b.route}</td>
        <td>${formatMoney(b.TotalPrice)}</td>
        <td><span class="badge ${badgeClass}">${statusText}</span></td>
      </tr>
    `;
  });

  // // Phân trang
  // const existingPager = document.getElementById("statsPager");
  // if (existingPager) existingPager.remove();

  // if (totalPages <= 1) return;

  // const pager = document.createElement("div");
  // pager.id = "statsPager";
  // pager.style.cssText =
  //   "display:flex; gap:8px; justify-content:center; margin-top:15px; flex-wrap:wrap;";

  // for (let i = 1; i <= totalPages; i++) {
  //   const btn = document.createElement("button");
  //   btn.textContent = i;
  //   btn.style.cssText = `
  //     padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color);
  //     cursor: pointer; font-weight: 600;
  //     background: ${i === statsCurrentPage ? "var(--primary-color)" : "white"};
  //     color: ${i === statsCurrentPage ? "white" : "var(--text-dark)"};
  //   `;
  //   btn.addEventListener("click", () => {
  //     statsCurrentPage = i;
  //     renderStatsTable();
  //   });
  //   pager.appendChild(btn);
  renderStatsPagination({
    total,
    page: statsCurrentPage,
    limit: STATS_PAGE_SIZE,
    totalPages,
  });
  // }

  // document.querySelector("#sec-stats .table-container").appendChild(pager);
}

function renderStatsPagination(pagination) {
  const old = document.getElementById("statsPager");
  if (old) old.remove();

  if (!pagination || pagination.totalPages <= 1) return;

  const { page, totalPages, total, limit } = pagination;

  const wrapper = document.createElement("div");
  wrapper.id = "statsPager";
  wrapper.style.cssText =
    "display:flex; align-items:center; justify-content:space-between; margin-top:16px; flex-wrap:wrap; gap:8px;";

  const info = document.createElement("span");
  info.style.cssText = "color:#6b7280; font-size:0.85rem;";
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  info.textContent = `Hiển thị ${from}–${to} / ${total} đơn`;

  const btnGroup = document.createElement("div");
  btnGroup.style.cssText = "display:flex; gap:4px; align-items:center;";

  const makeBtn = (label, disabled, active, onClick) => {
    const btn = document.createElement("button");
    btn.innerHTML = label;
    btn.disabled = disabled;
    btn.style.cssText = [
      "padding:6px 12px",
      "border-radius:6px",
      "font-size:0.85rem",
      "cursor:" + (disabled ? "not-allowed" : "pointer"),
      "border:1px solid " + (active ? "#ff6600" : "#d1d5db"),
      "background:" + (active ? "#ff6600" : "white"),
      "color:" + (active ? "white" : disabled ? "#d1d5db" : "#374151"),
      "font-weight:" + (active ? "700" : "400"),
      "transition:all 0.15s",
    ].join(";");
    if (!disabled && !active) {
      btn.onmouseenter = () => {
        btn.style.borderColor = "#ff6600";
        btn.style.color = "#ff6600";
      };
      btn.onmouseleave = () => {
        btn.style.borderColor = "#d1d5db";
        btn.style.color = "#374151";
      };
    }
    if (!disabled) btn.addEventListener("click", onClick);
    return btn;
  };

  btnGroup.appendChild(
    makeBtn("&#8249; Trước", page <= 1, false, () =>
      renderStatsTable(page - 1),
    ),
  );

  getPageNumbers(page, totalPages).forEach((p) => {
    if (p === "...") {
      const dots = document.createElement("span");
      dots.textContent = "…";
      dots.style.cssText = "padding:6px 4px; color:#9ca3af; font-size:0.85rem;";
      btnGroup.appendChild(dots);
    } else {
      btnGroup.appendChild(
        makeBtn(p, false, p === page, () => renderStatsTable(p)),
      );
    }
  });

  btnGroup.appendChild(
    makeBtn("Sau &#8250;", page >= totalPages, false, () =>
      renderStatsTable(page + 1),
    ),
  );

  wrapper.appendChild(info);
  wrapper.appendChild(btnGroup);

  document.querySelector("#sec-stats .table-container").after(wrapper);
}

let statsChart = null;

function renderChart(chartData) {
  const ctx = document.getElementById("statsChart");

  // Nếu đã có chart cũ thì xóa
  if (statsChart) {
    statsChart.destroy();
  }

  statsChart = new Chart(ctx, {
    type: "bar", // có thể đổi: line, pie
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "Doanh thu",
          data: chartData.values,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
        },
      },
    },
  });
}

function formatMoney(num) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(num);
}

document.getElementById("btnFilter").addEventListener("click", () => {
  tripsCurrentFilters = {
    date: document.getElementById("filterDate").value,
    type: document.getElementById("filterType").value,
    partner: document.getElementById("searchPartner").value.trim(),
  };
  loadTrips(1); // Reset về trang 1 khi lọc
});

document.getElementById("btnReset").addEventListener("click", () => {
  document.getElementById("filterDate").value = "";
  document.getElementById("filterType").value = "";
  document.getElementById("searchPartner").value = "";
  tripsCurrentFilters = { date: "", type: "", partner: "" };
  loadTrips(1);
});

function loadTripsFiltered(data) {
  const tbody = document.getElementById("tripsTableBody");
  tbody.innerHTML = "";

  data.forEach((t) => {
    const dep = new Date(t.DepartureTime).toLocaleString("vi-VN");

    const price = new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(t.Price);

    tbody.innerHTML += `
      <tr>
        <td>IDX-${t.TripID}</td>
        <td><b>${t.OperatorName}</b></td>
        <td>${t.LicensePlate || ""}</td>
        <td>${t.DepartureLocation} - ${t.ArrivalLocation}</td>
        <td>${dep}</td>
        <td>${price}</td>
        <td>${t.AvailableSeats}</td>
        <td>
          <button class="btn-sm btn-danger" onclick="deleteTrip(${t.TripID})">
            Xóa
          </button>
        </td>
      </tr>
    `;
  });
}
