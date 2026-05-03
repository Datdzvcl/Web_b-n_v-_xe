const express = require("express");
const router = express.Router();
const db = require("../config/db");

/*
GET seat map
*/
router.get("/:tripId", async (req, res) => {
  const tripId = req.params.tripId;

  try {
    const bus = await db.query(
      `
      SELECT BusID FROM Trips WHERE TripID = ?
    `,
      [tripId],
    );

    const busId = bus.recordset[0].BusID;

    const seats = await db.query(
      `
      SELECT SeatLabel FROM Seats
      WHERE BusID = ?
    `,
      [busId],
    );

    const bookedSeats = await db.query(
      `
      SELECT SeatLabel
      FROM TicketSeats
      JOIN Bookings ON Bookings.BookingID = TicketSeats.BookingID
      WHERE TripID = ?
      AND PaymentStatus='Paid'
    `,
      [tripId],
    );

    res.json({
      seats: seats.recordset,
      booked: bookedSeats.recordset,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
