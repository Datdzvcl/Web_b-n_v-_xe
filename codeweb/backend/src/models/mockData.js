// Temporary mock data for UI testing

const mockData = {
    operators: [
        { id: 1, name: "Phương Trang", rating: 4.8 },
        { id: 2, name: "Thành Bưởi", rating: 4.7 },
        { id: 3, name: "Futa Buslines", rating: 4.9 }
    ],
    buses: [
        { id: 1, operatorId: 1, type: "Limousine 34 giường", licensePlate: "51B-123.45" },
        { id: 2, operatorId: 2, type: "Xe giường nằm 40 chỗ", licensePlate: "51B-678.90" }
    ],
    trips: [
        {
            id: 1,
            operator: "Phương Trang",
            busType: "Limousine 34 giường",
            departureLocation: "TPHCM", // Or Bến xe Miền Đông
            arrivalLocation: "Đà Lạt",
            departureTime: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // Tomorrow
            arrivalTime: new Date(Date.now() + 1000 * 60 * 60 * 31).toISOString(),
            price: 300000,
            availableSeats: 20
        },
        {
            id: 2,
            operator: "Thành Bưởi",
            busType: "Xe giường nằm 40 chỗ",
            departureLocation: "TPHCM",
            arrivalLocation: "Nha Trang",
            departureTime: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(), // Day after tomorrow
            arrivalTime: new Date(Date.now() + 1000 * 60 * 60 * 56).toISOString(),
            price: 250000,
            availableSeats: 15
        },
        {
            id: 3,
            operator: "Futa Buslines",
            busType: "Limousine Vip",
            departureLocation: "Đà Nẵng",
            arrivalLocation: "Hà Nội",
            departureTime: new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(),
            arrivalTime: new Date(Date.now() + 1000 * 60 * 60 * 88).toISOString(),
            price: 450000,
            availableSeats: 10
        }
    ],
    bookings: []
};

module.exports = mockData;
