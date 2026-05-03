router.post("/", async (req, res) => {
  const { tripId, seatId, userId } = req.body;

  const expire = new Date(Date.now() + 10 * 60 * 1000);

  await db.query(
    `
 INSERT INTO SeatReservations
 (TripID,SeatID,UserID,ExpireAt,Status)
 VALUES(?,?,?,?,?)
 `,
    [tripId, seatId, userId, expire, "Holding"],
  );

  res.json({ message: "Seat reserved" });
});
