const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../config/db");
const QRCode = require("qrcode");

// --- Public Routes ---

// Get all trips (search)
// router.get('/trips', async (req, res) => {
//     try {
//         const pool = await poolPromise;
//         if (!pool) return res.status(500).json({ message: 'Database connecting error' });

//         const { from, to, date } = req.query;

//         let query = `
//             SELECT t.TripID as id,
//                    o.Name as operator,
//                    b.BusType as busType,
//                    t.DepartureLocation as departureLocation,
//                    t.ArrivalLocation as arrivalLocation,
//                    t.DepartureTime as departureTime,
//                    t.ArrivalTime as arrivalTime,
//                    t.Price as price,
//                    t.AvailableSeats as availableSeats
//             FROM Trips t
//             JOIN Buses b ON t.BusID = b.BusID
//             JOIN Operators o ON b.OperatorID = o.OperatorID
//             WHERE t.Status = 'Scheduled'
//         `;

//         const request = pool.request();

//         if (from) {
//             query += ` AND t.DepartureLocation LIKE @from`;
//             request.input('from', sql.NVarChar, `%${from}%`);
//         }
//         if (to) {
//             query += ` AND t.ArrivalLocation LIKE @to`;
//             request.input('to', sql.NVarChar, `%${to}%`);
//         }
//         if (date) {
//             query += ` AND CAST(t.DepartureTime AS DATE) = CAST(@date AS DATE)`;
//             request.input('date', sql.Date, date);
//         }

//         const result = await request.query(query);
//         res.json(result.recordset);
//     } catch (err) {
//         console.error('SQL error', err);
//         res.status(500).json({ message: 'Server error' });
//     }
// });

router.get("/trips", async (req, res) => {
  try {
    const { from, to, date, type, partner } = req.query;
    const pool = await poolPromise;

    const request = pool.request(); // ✅ phải ở trên

    let query = `
SELECT 
    t.TripID,
    t.DepartureLocation,
    t.ArrivalLocation,
    t.DepartureTime,
    t.ArrivalTime,
    t.Price,
    t.AvailableSeats,
    b.BusType,
    b.LicensePlate,
    o.Name as operator,
    o.Name as OperatorName
FROM Trips t
JOIN Buses b ON t.BusID = b.BusID
JOIN Operators o ON b.OperatorID = o.OperatorID
WHERE 1=1
`;

    if (from) {
      query += ` AND t.DepartureLocation LIKE @from`;
      request.input("from", sql.NVarChar, `%${from}%`);
    }
    if (to) {
      query += ` AND t.ArrivalLocation LIKE @to`;
      request.input("to", sql.NVarChar, `%${to}%`);
    }
    if (date) {
      query += ` AND CAST(t.DepartureTime AS DATE) = @date`;
      request.input("date", date);
    }

    if (type) {
      query += " AND b.BusType LIKE @type";
      request.input("type", `%${type}%`);
    }

    if (partner) {
      query += ` AND o.Name LIKE @partner`;
      request.input("partner", `%${partner}%`);
    }

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Get trip details
router.get("/trips/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    if (!pool)
      return res.status(500).json({ message: "Database connecting error" });

    const result = await pool.request().input("id", sql.Int, req.params.id)
      .query(`
                SELECT t.TripID as id, 
                       o.Name as operator, 
                       b.BusType as busType, 
                       t.DepartureLocation as departureLocation, 
                       t.ArrivalLocation as arrivalLocation, 
                       t.DepartureTime as departureTime, 
                       t.ArrivalTime as arrivalTime, 
                       t.Price as price, 
                       t.AvailableSeats as availableSeats
                FROM Trips t
                JOIN Buses b ON t.BusID = b.BusID
                JOIN Operators o ON b.OperatorID = o.OperatorID
                WHERE t.TripID = @id
            `);

    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.status(404).json({ message: "Trip not found" });
    }
  } catch (err) {
    console.error("SQL error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Create booking
router.post("/bookings", async (req, res) => {
  const { tripId, customerName, customerPhone, seats } = req.body;

  if (
    !tripId ||
    !customerName ||
    !customerPhone ||
    !seats ||
    seats.length === 0
  ) {
    return res
      .status(400)
      .json({ message: "Missing required fields or seats" });
  }

  try {
    const pool = await poolPromise;
    if (!pool)
      return res.status(500).json({ message: "Database connecting error" });

    // Start Transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Get Trip Info and Check capacity
      const tripRequest = new sql.Request(transaction);
      const tripResult = await tripRequest
        .input("tripId", sql.Int, tripId)
        .query(
          `SELECT Price, AvailableSeats FROM Trips WHERE TripID = @tripId AND Status = 'Scheduled'`,
        );

      if (tripResult.recordset.length === 0) {
        throw new Error("Trip not found or not available.");
      }

      const trip = tripResult.recordset[0];
      if (trip.AvailableSeats < seats.length) {
        throw new Error("Not enough available seats.");
      }

      const totalPrice = trip.Price * seats.length;

      // 2. Create Booking Record
      const bookingRequest = new sql.Request(transaction);
      const bookingResult = await bookingRequest
        .input("tripId", sql.Int, tripId)
        .input("name", sql.NVarChar, customerName)
        .input("phone", sql.VarChar, customerPhone)
        .input("totalSeats", sql.Int, seats.length)
        .input("totalPrice", sql.Decimal(18, 2), totalPrice).query(`
                    INSERT INTO Bookings (TripID, CustomerName, CustomerPhone, TotalSeats, TotalPrice)
                    OUTPUT inserted.BookingID
                    VALUES (@tripId, @name, @phone, @totalSeats, @totalPrice)
                `);

      const bookingId = bookingResult.recordset[0].BookingID;

      // 3. Insert specific seats
      for (const seat of seats) {
        // tạo QR code cho từng ghế
        const qrData = `Trip:${tripId}-Seat:${seat}-Booking:${bookingId}`;
        const qrCode = await QRCode.toDataURL(qrData);

        const seatRequest = new sql.Request(transaction);

        await seatRequest
          .input("bookingId", sql.Int, bookingId)
          .input("seatLabel", sql.VarChar, seat)
          .input("qrCode", sql.NVarChar, qrCode).query(`
      INSERT INTO TicketSeats (BookingID, SeatLabel, QRCode)
      VALUES (@bookingId, @seatLabel, @qrCode)
    `);
      }

      // 4. Update Available Seats in Trips
      const updateTripRequest = new sql.Request(transaction);
      await updateTripRequest
        .input("seatsUsed", sql.Int, seats.length)
        .input("tripId", sql.Int, tripId).query(`
                    UPDATE Trips 
                    SET AvailableSeats = AvailableSeats - @seatsUsed
                    WHERE TripID = @tripId
                `);

      // Commit transaction
      await transaction.commit();

      res.status(201).json({
        message: "Booking created successfully",
        booking: { id: bookingId, totalPrice, status: "Pending" },
      });
    } catch (err) {
      await transaction.rollback();
      throw err; // rethrow to be caught by outer catch
    }
  } catch (err) {
    console.error("Booking error", err);
    res
      .status(500)
      .json({ message: err.message || "Server error during booking" });
  }
});

router.get("/tickets/:bookingId", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("bookingId", sql.Int, req.params.bookingId).query(`
        SELECT SeatLabel, QRCode
        FROM TicketSeats
        WHERE BookingID = @bookingId
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

module.exports = router;
