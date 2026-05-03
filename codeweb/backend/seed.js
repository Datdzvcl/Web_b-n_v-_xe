const bcrypt = require("bcryptjs");
const { sql, poolPromise } = require("./src/config/db");

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDateInLast60Days() {
  const now = new Date();
  const daysAgo = randomInt(0, 60);
  const hoursAgo = randomInt(0, 23);
  const minsAgo = randomInt(0, 59);
  return new Date(
    now.getTime() - ((daysAgo * 24 + hoursAgo) * 60 + minsAgo) * 60 * 1000,
  );
}

const names = [
  "Nguyễn Văn An",
  "Trần Thị Bình",
  "Lê Văn Cường",
  "Phạm Thị Dung",
  "Hoàng Văn Đức",
  "Đỗ Thị Hạnh",
  "Bùi Văn Hùng",
  "Vũ Thị Lan",
  "Ngô Văn Minh",
  "Đặng Thị Nga",
  "Phan Văn Nam",
  "Hồ Thị Oanh",
  "Trịnh Văn Phúc",
  "Đinh Thị Quỳnh",
  "Lý Văn Sơn",
  "Mai Thị Trang",
  "Tô Văn Tuấn",
  "Chu Thị Vân",
  "Lương Văn Việt",
  "Cao Thị Xuân",
  "Nguyễn Văn Bảo",
  "Trần Thị Chi",
  "Lê Văn Duy",
  "Phạm Thị Giang",
  "Hoàng Văn Hải",
  "Đỗ Thị Hòa",
  "Bùi Văn Khánh",
  "Vũ Thị Lý",
  "Ngô Văn Long",
  "Đặng Thị Mai",
  "Phan Văn Nghĩa",
  "Hồ Thị Nhung",
  "Trịnh Văn Phong",
  "Đinh Thị Quyên",
  "Lý Văn Sang",
  "Mai Thị Thảo",
  "Tô Văn Thắng",
  "Chu Thị Thủy",
  "Lương Văn Trọng",
  "Cao Thị Yến",
  "Nguyễn Văn Ánh",
  "Trần Thị Bích",
  "Lê Văn Công",
  "Phạm Thị Diệu",
  "Hoàng Văn Dũng",
  "Đỗ Thị Hồng",
  "Bùi Văn Hào",
  "Vũ Thị Kim",
  "Ngô Văn Lâm",
  "Đặng Thị Loan",
  "Phan Văn Mạnh",
  "Hồ Thị My",
  "Trịnh Văn Nam",
  "Đinh Thị Oanh",
  "Lý Văn Phú",
  "Mai Thị Phương",
  "Tô Văn Quang",
  "Chu Thị Quy",
  "Lương Văn Tài",
  "Cao Thị Thanh",
  "Nguyễn Văn Chí",
  "Trần Thị Cúc",
  "Lê Văn Đạt",
  "Phạm Thị Đào",
  "Hoàng Văn Điệp",
  "Đỗ Thị Hà",
  "Bùi Văn Hiếu",
  "Vũ Thị Hương",
  "Ngô Văn Khôi",
  "Đặng Thị Lệ",
  "Phan Văn Lộc",
  "Hồ Thị Ly",
  "Trịnh Văn Ngọc",
  "Đinh Thị Nhàn",
  "Lý Văn Phước",
  "Mai Thị Phúc",
  "Tô Văn Sơn",
  "Chu Thị Tuyết",
  "Lương Văn Vinh",
  "Cao Thị Yến",
  "Nguyễn Văn Dương",
  "Trần Thị Duyên",
  "Lê Văn Hưng",
  "Phạm Thị Huyền",
  "Hoàng Văn Khang",
  "Đỗ Thị Linh",
  "Bùi Văn Nam",
  "Vũ Thị Như",
  "Ngô Văn Phát",
  "Đặng Thị Quỳnh",
  "Phan Văn Tâm",
  "Hồ Thị Trang",
  "Trịnh Văn Tuấn",
  "Đinh Thị Vân",
  "Lý Văn Việt",
];

async function getTripMap(pool) {
  const rs = await pool.request().query(`
    SELECT TripID, Price, AvailableSeats
    FROM Trips
    ORDER BY TripID
  `);
  return rs.recordset;
}

async function seed() {
  try {
    const pool = await poolPromise;
    if (!pool) {
      throw new Error("Cannot connect to database");
    }

    console.log("🚀 Start seeding...");

    const trips = await getTripMap(pool);
    if (!trips.length) {
      throw new Error("Bảng Trips đang trống. Hãy seed Trips trước.");
    }

    // Xóa theo thứ tự khóa ngoại
    await pool.request().query(`
      DELETE FROM TicketSeats;
      DELETE FROM Bookings;
      DELETE FROM Users;

      DBCC CHECKIDENT ('TicketSeats', RESEED, 0);
      DBCC CHECKIDENT ('Bookings', RESEED, 0);
      DBCC CHECKIDENT ('Users', RESEED, 0);
    `);

    console.log("🗑️ Cleared TicketSeats, Bookings, Users");

    const createdUsers = [];

    // 1 admin
    {
      const fullName = "Admin System";
      const username = normalizeName(fullName);
      const email = `${username}@gmail.com`;
      const phone = "0999999999";
      const rawPassword = `${username}123`;
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      const rs = await pool
        .request()
        .input("fullName", sql.NVarChar, fullName)
        .input("email", sql.VarChar, email)
        .input("phone", sql.VarChar, phone)
        .input("passwordHash", sql.VarChar, passwordHash)
        .input("role", sql.VarChar, "Admin").query(`
          INSERT INTO Users (FullName, Email, Phone, PasswordHash, Role, CreatedAt)
          OUTPUT inserted.UserID
          VALUES (@fullName, @email, @phone, @passwordHash, @role, GETDATE())
        `);

      createdUsers.push({
        userId: rs.recordset[0].UserID,
        fullName,
        email,
        phone,
        rawPassword,
        role: "Admin",
      });
    }

    // 99 customer = tổng 100 user
    for (let i = 1; i <= 99; i++) {
      const baseName = names[(i - 1) % names.length];
      const fullName = baseName;
      const username = normalizeName(fullName);
      const email = `${username}${i}@gmail.com`;
      const phone = `0${randomInt(300000000, 999999999)}`;
      const rawPassword = `${username}${i}123`;
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      const rs = await pool
        .request()
        .input("fullName", sql.NVarChar, fullName)
        .input("email", sql.VarChar, email)
        .input("phone", sql.VarChar, phone)
        .input("passwordHash", sql.VarChar, passwordHash)
        .input("role", sql.VarChar, "Customer").query(`
          INSERT INTO Users (FullName, Email, Phone, PasswordHash, Role, CreatedAt)
          OUTPUT inserted.UserID
          VALUES (@fullName, @email, @phone, @passwordHash, @role, GETDATE())
        `);

      createdUsers.push({
        userId: rs.recordset[0].UserID,
        fullName,
        email,
        phone,
        rawPassword,
        role: "Customer",
      });

      if (i % 20 === 0) {
        console.log(`👤 Created ${i + 1} users...`);
      }
    }

    console.log(`✅ Created ${createdUsers.length} users`);

    // 120 bookings => 100+
    const paymentMethods = ["VNPay"];
    const paymentStatuses = ["Pending", "Paid", "Cancelled"];
    const createdBookings = [];

    for (let i = 0; i < 120; i++) {
      const user = pick(createdUsers);
      const trip = pick(trips);

      const maxSeats = Math.max(1, Math.min(4, trip.AvailableSeats || 4));
      const totalSeats = randomInt(1, maxSeats);
      const totalPrice = Number(trip.Price) * totalSeats;
      const paymentMethod = pick(paymentMethods);
      const paymentStatus = pick(paymentStatuses);
      const bookingDate = randomDateInLast60Days();

      const rs = await pool
        .request()
        .input("tripId", sql.Int, trip.TripID)
        .input("userId", sql.Int, user.userId)
        .input("customerName", sql.NVarChar, user.fullName)
        .input("customerPhone", sql.VarChar, user.phone)
        .input("customerEmail", sql.VarChar, user.email)
        .input("totalSeats", sql.Int, totalSeats)
        .input("totalPrice", sql.Decimal(18, 2), totalPrice)
        .input("paymentMethod", sql.VarChar, paymentMethod)
        .input("paymentStatus", sql.VarChar, paymentStatus)
        .input("bookingDate", sql.DateTime, bookingDate).query(`
          INSERT INTO Bookings
          (
            TripID, UserID, CustomerName, CustomerPhone, CustomerEmail,
            TotalSeats, TotalPrice, PaymentMethod, PaymentStatus, BookingDate
          )
          OUTPUT inserted.BookingID
          VALUES
          (
            @tripId, @userId, @customerName, @customerPhone, @customerEmail,
            @totalSeats, @totalPrice, @paymentMethod, @paymentStatus, @bookingDate
          )
        `);

      const bookingId = rs.recordset[0].BookingID;
      createdBookings.push({ bookingId, totalSeats });

      for (let s = 1; s <= totalSeats; s++) {
        const seatLabel = `A${s}`;
        await pool
          .request()
          .input("bookingId", sql.Int, bookingId)
          .input("seatLabel", sql.VarChar, seatLabel)
          .input(
            "qrCode",
            sql.NVarChar(sql.MAX),
            `QR-${bookingId}-${seatLabel}`,
          ).query(`
            INSERT INTO TicketSeats (BookingID, SeatLabel, QRCode)
            VALUES (@bookingId, @seatLabel, @qrCode)
          `);
      }

      if ((i + 1) % 20 === 0) {
        console.log(`🧾 Created ${i + 1} bookings...`);
      }
    }

    console.log(`✅ Created ${createdBookings.length} bookings`);

    console.log("🎉 Seed completed successfully");
    console.log("Ví dụ đăng nhập:");
    console.log(`- ${createdUsers[0].email} / ${createdUsers[0].rawPassword}`);
    console.log(`- ${createdUsers[1].email} / ${createdUsers[1].rawPassword}`);
    console.log(`- ${createdUsers[2].email} / ${createdUsers[2].rawPassword}`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
}

seed();
