const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../config/db");
const { auth, adminAuth } = require("../middleware/authMiddleware");

// Protect all admin routes
router.use(auth, adminAuth);

// @route GET /api/admin/dashboard-stats
// @desc Get dashboard statistics
router.get("/dashboard-stats", async (req, res) => {
  try {
    const pool = await poolPromise;
    const totalRevenueResult = await pool
      .request()
      .query(
        `SELECT SUM(TotalPrice) as totalRevenue FROM Bookings WHERE PaymentStatus = 'Paid'`,
      );

    const ticketsSoldResult = await pool
      .request()
      .query(
        `SELECT ISNULL(SUM(TotalSeats), 0) as ticketsSold FROM Bookings WHERE PaymentStatus = 'Paid'`,
      );

    const activeTripsResult = await pool
      .request()
      .query(
        `SELECT COUNT(*) as activeTrips FROM Trips WHERE Status IN ('Scheduled', 'On-going')`,
      );

    const operatorsResult = await pool
      .request()
      .query(`SELECT COUNT(*) as totalOperators FROM Operators`);

    res.json({
      totalRevenue: totalRevenueResult.recordset[0].totalRevenue || 0,
      ticketsSold: ticketsSoldResult.recordset[0].ticketsSold || 0,
      activeTrips: activeTripsResult.recordset[0].activeTrips || 0,
      totalOperators: operatorsResult.recordset[0].totalOperators || 0,
    });
  } catch (err) {
    console.error("Admin Stats error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route GET /api/admin/recent-bookings
// @desc Get recent bookings for dashboard
router.get("/recent-bookings", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
                SELECT TOP 10 
                    b.BookingID as id,
                    b.CustomerName as customerName,
                    b.CustomerPhone as customerPhone,
                    t.DepartureLocation + ' - ' + t.ArrivalLocation as route,
                    b.BookingDate as bookingDate,
                    b.TotalPrice as totalPrice,
                    b.PaymentStatus as status
                FROM Bookings b
                JOIN Trips t ON b.TripID = t.TripID
                ORDER BY b.BookingDate DESC
            `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Recent bookings error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// @route GET /api/admin/bookings
// @desc Get ALL bookings
router.get("/bookings", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
            SELECT 
                b.BookingID as id,
                b.CustomerName as customerName,
                b.CustomerPhone as customerPhone,
                t.DepartureLocation + ' - ' + t.ArrivalLocation as route,
                b.BookingDate as bookingDate,
                b.TotalPrice as totalPrice,
                b.PaymentStatus as status
            FROM Bookings b
            JOIN Trips t ON b.TripID = t.TripID
            ORDER BY b.BookingDate DESC
        `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Get all bookings error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- OPERATORS CRUD ---

// @route GET /api/admin/operators
router.get("/operators", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query("SELECT * FROM Operators ORDER BY OperatorID DESC");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// @route POST /api/admin/operators
router.post("/operators", async (req, res) => {
  const { Name, Description, ContactPhone, Email } = req.body;
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("name", sql.NVarChar, Name)
      .input("desc", sql.NVarChar, Description)
      .input("phone", sql.VarChar, ContactPhone)
      .input("email", sql.VarChar, Email)
      .query(
        `INSERT INTO Operators (Name, Description, ContactPhone, Email) VALUES (@name, @desc, @phone, @email)`,
      );
    res.status(201).json({ message: "Thêm nhà xe thành công" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi khi thêm nhà xe" });
  }
});

// @route DELETE /api/admin/operators/:id
router.delete("/operators/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Operators WHERE OperatorID = @id");
    res.json({ message: "Xoá nhà xe thành công" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Không thể xoá vì nhà xe đang có dữ liệu ràng buộc" });
  }
});

// --- TRIPS CRUD ---

// @route GET /api/admin/trips (list all)
router.get("/trips", async (req, res) => {
  try {
    const { page = 1, limit = 15, date, type, partner } = req.query;
    const pool = await poolPromise;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 15);
    const offset = (pageNum - 1) * limitNum;

    // Xây dựng WHERE clause theo filter
    let whereClause = "WHERE 1=1";
    if (date) whereClause += ` AND CAST(t.DepartureTime AS DATE) = @date`;
    if (type) whereClause += ` AND b.BusType LIKE @type`;
    if (partner) whereClause += ` AND o.Name LIKE @partner`;

    // Đếm tổng theo filter
    const countReq = pool.request();
    if (date) countReq.input("date", sql.VarChar, date);
    if (type) countReq.input("type", sql.NVarChar, `%${type}%`);
    if (partner) countReq.input("partner", sql.NVarChar, `%${partner}%`);

    const countResult = await countReq.query(`
      SELECT COUNT(*) as total
      FROM Trips t
      JOIN Buses b ON t.BusID = b.BusID
      JOIN Operators o ON b.OperatorID = o.OperatorID
      ${whereClause}
    `);
    const total = countResult.recordset[0].total;
    const totalPages = Math.ceil(total / limitNum);

    // Lấy dữ liệu theo trang + filter
    const dataReq = pool.request();
    if (date) dataReq.input("date", sql.VarChar, date);
    if (type) dataReq.input("type", sql.NVarChar, `%${type}%`);
    if (partner) dataReq.input("partner", sql.NVarChar, `%${partner}%`);
    dataReq.input("offset", sql.Int, offset);
    dataReq.input("limitRows", sql.Int, limitNum);

    const result = await dataReq.query(`
      SELECT t.*, b.LicensePlate, o.Name as OperatorName
      FROM Trips t
      JOIN Buses b ON t.BusID = b.BusID
      JOIN Operators o ON b.OperatorID = o.OperatorID
      ${whereClause}
      ORDER BY t.DepartureTime DESC
      OFFSET @offset ROWS FETCH NEXT @limitRows ROWS ONLY
    `);

    res.json({
      data: result.recordset,
      pagination: { total, page: pageNum, limit: limitNum, totalPages },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// @route POST /api/admin/trips
router.post("/trips", async (req, res) => {
  const {
    BusID,
    DepartureLocation,
    ArrivalLocation,
    DepartureTime,
    ArrivalTime,
    Price,
    AvailableSeats,
  } = req.body;
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("bus", sql.Int, BusID)
      .input("depLoc", sql.NVarChar, DepartureLocation)
      .input("arrLoc", sql.NVarChar, ArrivalLocation)
      .input("depTime", sql.DateTime, new Date(DepartureTime))
      .input("arrTime", sql.DateTime, new Date(ArrivalTime))
      .input("price", sql.Decimal, Price)
      .input("seats", sql.Int, AvailableSeats).query(`
                INSERT INTO Trips (BusID, DepartureLocation, ArrivalLocation, DepartureTime, ArrivalTime, Price, AvailableSeats, Status)
                VALUES (@bus, @depLoc, @arrLoc, @depTime, @arrTime, @price, @seats, 'Scheduled')
            `);
    res.status(201).json({ message: "Thêm chuyến xe thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi thêm chuyến xe" });
  }
});

// @route DELETE /api/admin/trips/:id
router.delete("/trips/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Trips WHERE TripID = @id");
    res.json({ message: "Xóa chuyến thành công" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi khi xóa chuyến xe" });
  }
});

// --- USERS CRUD ---

// @route GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query(
        "SELECT UserID, FullName, Email, Phone, Role, CreatedAt FROM Users ORDER BY CreatedAt DESC",
      );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// @route DELETE /api/admin/users/:id
router.delete("/users/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Users WHERE UserID = @id");
    res.json({ message: "Xóa người dùng thành công" });
  } catch (err) {
    res.status(500).json({ message: "Không thể xóa người dùng này" });
  }
});

// @route PUT /api/admin/bookings/:id/pay
// @desc Mark booking as paid
router.put("/bookings/:id/pay", async (req, res) => {
  try {
    const pool = await poolPromise;

    // 1. Kiểm tra trạng thái hiện tại
    const check = await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query(`SELECT PaymentStatus FROM Bookings WHERE BookingID = @id`);

    if (check.recordset.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy đơn" });
    }

    const currentStatus = check.recordset[0].PaymentStatus;

    // 2. Nếu đã Paid thì không update nữa
    if (currentStatus === "Paid") {
      return res.status(400).json({ message: "Đơn đã thanh toán rồi" });
    }

    // 3. Update
    await pool
      .request()
      .input("id", sql.Int, req.params.id)
      .query(
        `UPDATE Bookings SET PaymentStatus = 'Paid' WHERE BookingID = @id`,
      );

    res.json({ message: "Đã xác nhận thanh toán" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const { type, group, date } = req.query;
    const pool = await poolPromise;

    let dateFilter = "1=1";
    let dateParam = null;

    if (date) {
      dateParam = date;
      if (type === "date") {
        dateFilter = `CAST(b.BookingDate AS DATE) = CAST(@filterDate AS DATE)`;
      } else if (type === "month") {
        dateFilter = `MONTH(b.BookingDate) = MONTH(CAST(@filterDate AS DATE)) 
                      AND YEAR(b.BookingDate) = YEAR(CAST(@filterDate AS DATE))`;
      } else if (type === "year") {
        dateFilter = `YEAR(b.BookingDate) = YEAR(CAST(@filterDate AS DATE))`;
      }
    }

    // 🎯 SUMMARY
    const summaryRequest = pool.request();
    if (dateParam) summaryRequest.input("filterDate", sql.VarChar, dateParam);

    const summary = await summaryRequest.query(`
      SELECT 
        ISNULL(SUM(b.TotalPrice), 0) as totalRevenue,
        COUNT(*) as totalBookings
      FROM Bookings b
      WHERE ${dateFilter}
    `);

    // 🎯 LIST BOOKINGS
    const bookingsRequest = pool.request();
    if (dateParam) bookingsRequest.input("filterDate", sql.VarChar, dateParam);

    const bookings = await bookingsRequest.query(`
      SELECT 
        b.BookingID,
        b.CustomerName,
        b.TotalPrice,
        b.PaymentStatus,
        t.DepartureLocation + ' - ' + t.ArrivalLocation AS route
      FROM Bookings b
      JOIN Trips t ON b.TripID = t.TripID
      WHERE ${dateFilter}
      ORDER BY b.BookingDate DESC
    `);

    // 🎯 GROUP CHART
    let groupField = "";
    if (group === "customer") {
      groupField = "b.CustomerName";
    } else if (group === "bus") {
      groupField = "bus.BusType"; // JOIN Buses b đã có sẵn trong query
    } else {
      groupField = "b.CustomerName";
    }

    const chartRequest = pool.request();
    if (dateParam) chartRequest.input("filterDate", sql.VarChar, dateParam);

    const chart = await chartRequest.query(`
      SELECT 
        ${groupField} as label,
        SUM(b.TotalPrice) as value
      FROM Bookings b
      JOIN Trips t ON b.TripID = t.TripID
      JOIN Buses bus ON t.BusID = bus.BusID        -- ✅ Thêm dòng này
      WHERE ${dateFilter}
      GROUP BY ${groupField}
      ORDER BY value DESC
    `);

    // 🎯 RESPONSE
    res.json({
      totalRevenue: summary.recordset[0].totalRevenue || 0,
      totalBookings: summary.recordset[0].totalBookings || 0,
      bookings: bookings.recordset,
      chart: {
        labels: chart.recordset.map((x) => x.label),
        values: chart.recordset.map((x) => x.value),
      },
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;
