async function loadSeatMap(tripId) {
  const res = await fetch(`/api/seats/${tripId}`);
  const data = await res.json();

  const seatContainer = document.getElementById("seatMap");

  seatContainer.innerHTML = "";

  data.seats.forEach((seat) => {
    const div = document.createElement("div");
    div.className = "seat";
    div.innerText = seat.SeatLabel;

    if (data.booked.find((s) => s.SeatLabel === seat.SeatLabel)) {
      div.classList.add("booked");
    } else {
      div.classList.add("available");
    }

    seatContainer.appendChild(div);
  });
}
