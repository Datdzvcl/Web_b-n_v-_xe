const { sql, poolPromise } = require("./src/config/db");

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFutureDate() {
  const now = new Date();
  const days = randomInt(1, 30);
  const hours = randomInt(5, 22);
  const minutes = randomInt(0, 1) * 30;

  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function seedTrips() {
  try {
    const pool = await poolPromise;

    for (let i = 1; i <= 24; i++) {
      const departure = randomFutureDate();
      const arrival = new Date(
        departure.getTime() + randomInt(6, 18) * 60 * 60 * 1000,
      );
      const price = randomInt(200000, 600000);
      const availableSeats = randomInt(5, 36);

      await pool
        .request()
        .input("departureTime", sql.DateTime, departure)
        .input("arrivalTime", sql.DateTime, arrival)
        .input("price", sql.Decimal(18, 2), price)
        .input("availableSeats", sql.Int, availableSeats).query(`
          INSERT INTO Trips (DepartureTime, ArrivalTime, Price, AvailableSeats)
          VALUES (@departureTime, @arrivalTime, @price, @availableSeats)
        `);

      console.log(`Created trip ${i}`);
    }

    console.log("Done seeding trips");
    process.exit(0);
  } catch (err) {
    console.error("Seed trips error:", err);
    process.exit(1);
  }
}

seedTrips();
