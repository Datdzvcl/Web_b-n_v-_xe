const GO_API = "http://localhost:8080/api/go";
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

document.addEventListener("DOMContentLoaded", () => {
  if (!token || !user || user.role !== "Driver" || isTokenExpired(token)) {
    clearSessionAndRedirect();
    return;
  }

  document.getElementById("userInfo").textContent = user.fullName || "Tài xế";
  document.getElementById("logoutBtn").addEventListener("click", logout);
  loadTrips();
});

async function loadTrips() {
  const trips = (await request("/driver/trips")) || [];
  const tbody = document.getElementById("driverTripsTable");
  tbody.innerHTML = trips.length
    ? trips
        .map(
          (trip) => `
            <tr>
              <td>CX-${trip.id}</td>
              <td>${escapeHtml(trip.operatorName)}</td>
              <td>${escapeHtml(trip.departureLocation)} - ${escapeHtml(trip.arrivalLocation)}</td>
              <td>${escapeHtml(trip.licensePlate)}<br><small>${escapeHtml(trip.busType)}</small></td>
              <td>${dateTime(trip.departureTime)}</td>
              <td><span class="portal-badge ${badgeClass(trip.status)}">${escapeHtml(trip.status)}</span></td>
              <td>${statusControl(trip)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="7" class="portal-empty">Chưa có chuyến được phân công</td></tr>`;
}

function statusControl(trip) {
  const statuses = ["Scheduled", "On-going", "Completed", "Cancelled"];
  return `
    <select data-trip-id="${trip.id}" onchange="updateTripStatus(this)" style="min-width: 150px; padding: 8px">
      ${statuses.map((status) => `<option value="${status}" ${trip.status === status ? "selected" : ""}>${status}</option>`).join("")}
    </select>
  `;
}

window.updateTripStatus = async function (select) {
  const tripId = select.dataset.tripId;
  const data = await request(`/driver/trips/${tripId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status: select.value }),
  });
  if (data) {
    showMessage("Cập nhật trạng thái chuyến thành công");
    await loadTrips();
  }
};

async function request(path, options = {}) {
  try {
    const res = await fetch(`${GO_API}${path}`, { headers, ...options });
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

function dateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN");
}

function badgeClass(status) {
  if (status === "Completed") return "success";
  if (status === "Scheduled" || status === "On-going") return "warning";
  return "danger";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
