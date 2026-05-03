package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/denisenkom/go-mssqldb"
)

type app struct {
	db        *sql.DB
	jwtSecret []byte
}

type authUser struct {
	ID   int
	Role string
}

type tripInput struct {
	BusID             int     `json:"busId"`
	DepartureLocation string  `json:"departureLocation"`
	ArrivalLocation   string  `json:"arrivalLocation"`
	DepartureTime     string  `json:"departureTime"`
	ArrivalTime       string  `json:"arrivalTime"`
	Price             float64 `json:"price"`
	AvailableSeats    int     `json:"availableSeats"`
	DriverID          *int    `json:"driverId"`
}

type driverInput struct {
	FullName      string `json:"fullName"`
	Email         string `json:"email"`
	Phone         string `json:"phone"`
	LicenseNumber string `json:"licenseNumber"`
	UserID        *int   `json:"userId"`
}

type busInput struct {
	LicensePlate string `json:"licensePlate"`
	BusType      string `json:"busType"`
	Capacity     int    `json:"capacity"`
	LayoutType   string `json:"layoutType"`
}

type cloneTripInput struct {
	Frequency string `json:"frequency"`
	Count     int    `json:"count"`
	StartDate string `json:"startDate"`
	EndDate   string `json:"endDate"`
}

type seatDefinition struct {
	Label    string `json:"label"`
	Row      int    `json:"row"`
	Column   int    `json:"column"`
	Deck     string `json:"deck"`
	SeatType string `json:"seatType"`
	Status   string `json:"status"`
}

type seatMapInput struct {
	LayoutType string           `json:"layoutType"`
	Seats      []seatDefinition `json:"seats"`
}

func main() {
	loadEnv("../backend/.env")
	loadEnv(".env")

	connString := os.Getenv("DB_CONNECTION_STRING")
	if connString == "" {
		log.Fatal("Missing DB_CONNECTION_STRING")
	}
	connString = normalizeSQLServerConnString(connString)

	db, err := sql.Open("sqlserver", connString)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Fatal(err)
	}

	api := &app{
		db:        db,
		jwtSecret: []byte(envOrDefault("JWT_SECRET", "secret")),
	}

	schemaCtx, schemaCancel := context.WithTimeout(context.Background(), 10*time.Second)
	if err := api.ensureRuntimeSchema(schemaCtx); err != nil {
		schemaCancel()
		log.Fatal(err)
	}
	schemaCancel()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/go/health", api.health)
	mux.HandleFunc("GET /api/go/operator/dashboard", api.withAuth("Operator", api.operatorDashboard))
	mux.HandleFunc("GET /api/go/operator/trips", api.withAuth("Operator", api.operatorTrips))
	mux.HandleFunc("POST /api/go/operator/trips", api.withAuth("Operator", api.createOperatorTrip))
	mux.HandleFunc("PUT /api/go/operator/trips/{id}", api.withAuth("Operator", api.updateOperatorTrip))
	mux.HandleFunc("POST /api/go/operator/trips/{id}/clone", api.withAuth("Operator", api.cloneOperatorTrip))
	mux.HandleFunc("PUT /api/go/operator/trips/{id}/assign-driver", api.withAuth("Operator", api.assignDriverToTrip))
	mux.HandleFunc("GET /api/go/operator/bookings", api.withAuth("Operator", api.operatorBookings))
	mux.HandleFunc("GET /api/go/operator/revenue", api.withAuth("Operator", api.operatorRevenueReport))
	mux.HandleFunc("GET /api/go/operator/buses", api.withAuth("Operator", api.operatorBuses))
	mux.HandleFunc("POST /api/go/operator/buses", api.withAuth("Operator", api.createOperatorBus))
	mux.HandleFunc("GET /api/go/operator/buses/{id}/seats", api.withAuth("Operator", api.operatorBusSeats))
	mux.HandleFunc("PUT /api/go/operator/buses/{id}/seats", api.withAuth("Operator", api.updateOperatorBusSeats))
	mux.HandleFunc("GET /api/go/operator/drivers", api.withAuth("Operator", api.operatorDrivers))
	mux.HandleFunc("POST /api/go/operator/drivers", api.withAuth("Operator", api.createOperatorDriver))
	mux.HandleFunc("GET /api/go/driver/trips", api.withAuth("Driver", api.driverTrips))
	mux.HandleFunc("PUT /api/go/driver/trips/{id}/status", api.withAuth("Driver", api.updateDriverTripStatus))

	port := envOrDefault("GO_PORT", "8080")
	log.Printf("Go API running at http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, cors(mux)))
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *app) ensureRuntimeSchema(ctx context.Context) error {
	_, err := a.db.ExecContext(ctx, `
		IF OBJECT_ID('dbo.BusSeats', 'U') IS NULL
		BEGIN
			CREATE TABLE dbo.BusSeats (
				SeatID INT IDENTITY(1,1) PRIMARY KEY,
				BusID INT NOT NULL,
				SeatLabel VARCHAR(20) NOT NULL,
				SeatRow INT NOT NULL,
				SeatColumn INT NOT NULL,
				Deck NVARCHAR(30) NOT NULL DEFAULT N'Tang chinh',
				SeatType NVARCHAR(30) NOT NULL DEFAULT N'Ghe',
				Status VARCHAR(20) NOT NULL DEFAULT 'Active',
				CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
				CONSTRAINT FK_BusSeats_Buses FOREIGN KEY (BusID) REFERENCES dbo.Buses(BusID),
				CONSTRAINT UQ_BusSeats_Bus_Label UNIQUE (BusID, SeatLabel),
				CONSTRAINT CK_BusSeats_Status CHECK (Status IN ('Active', 'Blocked')),
				CONSTRAINT CK_BusSeats_Position CHECK (SeatRow > 0 AND SeatColumn > 0)
			);
		END;
	`)
	return err
}

func (a *app) operatorDashboard(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	row := a.db.QueryRowContext(r.Context(), `
		SELECT
			(SELECT COUNT(*)
			 FROM Trips t
			 JOIN Buses b ON b.BusID = t.BusID
			 WHERE b.OperatorID = @p1) AS totalTrips,
			(SELECT COUNT(*)
			 FROM Buses b
			 WHERE b.OperatorID = @p1) AS totalBuses,
			(SELECT COUNT(*)
			 FROM Drivers d
			 WHERE d.OperatorID = @p1) AS totalDrivers,
			(SELECT COUNT(*)
			 FROM Bookings bk
			 JOIN Trips t ON t.TripID = bk.TripID
			 JOIN Buses b ON b.BusID = t.BusID
			 WHERE b.OperatorID = @p1) AS totalBookings,
			(SELECT ISNULL(SUM(bk.TotalPrice), 0)
			 FROM Bookings bk
			 JOIN Trips t ON t.TripID = bk.TripID
			 JOIN Buses b ON b.BusID = t.BusID
			 WHERE b.OperatorID = @p1 AND bk.PaymentStatus = 'Paid') AS paidRevenue
	`, operatorID)

	var totalTrips, totalBuses, totalDrivers, totalBookings int
	var paidRevenue float64
	if err := row.Scan(&totalTrips, &totalBuses, &totalDrivers, &totalBookings, &paidRevenue); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"operatorId":    operatorID,
		"totalTrips":    totalTrips,
		"totalBuses":    totalBuses,
		"totalDrivers":  totalDrivers,
		"totalBookings": totalBookings,
		"paidRevenue":   paidRevenue,
	})
}

func (a *app) operatorTrips(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	rows, err := a.db.QueryContext(r.Context(), `
		SELECT
			t.TripID, t.DepartureLocation, t.ArrivalLocation, t.DepartureTime,
			t.ArrivalTime, t.Price, t.AvailableSeats, t.Status,
			b.BusID, b.LicensePlate, b.BusType, b.Capacity,
			d.DriverID, u.FullName
		FROM Trips t
		JOIN Buses b ON b.BusID = t.BusID
		LEFT JOIN Drivers d ON d.DriverID = t.DriverID
		LEFT JOIN Users u ON u.UserID = d.UserID
		WHERE b.OperatorID = @p1
		ORDER BY t.DepartureTime DESC
	`, operatorID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()

	var trips []map[string]any
	for rows.Next() {
		var driverID sql.NullInt64
		var driverName sql.NullString
		var tripID, busID, seats, capacity int
		var dep, arr, status, plate, busType string
		var depTime, arrTime time.Time
		var price float64
		if err := rows.Scan(&tripID, &dep, &arr, &depTime, &arrTime, &price, &seats, &status, &busID, &plate, &busType, &capacity, &driverID, &driverName); err != nil {
			writeError(w, err)
			return
		}
		trips = append(trips, map[string]any{
			"id":                tripID,
			"busId":             busID,
			"licensePlate":      plate,
			"busType":           busType,
			"capacity":          capacity,
			"departureLocation": dep,
			"arrivalLocation":   arr,
			"departureTime":     depTime,
			"arrivalTime":       arrTime,
			"price":             price,
			"availableSeats":    seats,
			"status":            status,
			"driverId":          nullableInt(driverID),
			"driverName":        nullableString(driverName),
		})
	}

	writeJSON(w, http.StatusOK, trips)
}

func (a *app) createOperatorTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	var input tripInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Body không hợp lệ"})
		return
	}
	depTime, err := parseTime(input.DepartureTime)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "departureTime không hợp lệ"})
		return
	}
	arrTime, err := parseTime(input.ArrivalTime)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "arrivalTime không hợp lệ"})
		return
	}
	if !arrTime.After(depTime) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Giờ đến phải sau giờ khởi hành"})
		return
	}
	if input.Price <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Giá vé phải lớn hơn 0"})
		return
	}

	if err := a.ensureBusBelongsToOperator(r.Context(), input.BusID, operatorID); err != nil {
		writeError(w, err)
		return
	}
	capacity, err := a.busCapacity(r.Context(), input.BusID, operatorID)
	if err != nil {
		writeError(w, err)
		return
	}
	availableSeats := input.AvailableSeats
	if availableSeats <= 0 {
		availableSeats = capacity
	}
	if availableSeats > capacity {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Số ghế trống không được lớn hơn số ghế của xe"})
		return
	}
	if input.DriverID != nil {
		if err := a.ensureDriverBelongsToOperator(r.Context(), *input.DriverID, operatorID); err != nil {
			writeError(w, err)
			return
		}
	}

	var tripID int
	err = a.db.QueryRowContext(r.Context(), `
		INSERT INTO Trips (BusID, DepartureLocation, ArrivalLocation, DepartureTime, ArrivalTime, Price, AvailableSeats, Status, DriverID)
		OUTPUT inserted.TripID
		VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, 'Scheduled', @p8)
	`, input.BusID, input.DepartureLocation, input.ArrivalLocation, depTime, arrTime, input.Price, availableSeats, nullableParam(input.DriverID)).Scan(&tripID)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"message": "Tạo chuyến xe thành công", "tripId": tripID})
}

func (a *app) updateOperatorTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	tripID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "trip id không hợp lệ"})
		return
	}

	var input tripInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Body không hợp lệ"})
		return
	}
	depTime, err := parseTime(input.DepartureTime)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "departureTime không hợp lệ"})
		return
	}
	arrTime, err := parseTime(input.ArrivalTime)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "arrivalTime không hợp lệ"})
		return
	}
	if !arrTime.After(depTime) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Giờ đến phải sau giờ khởi hành"})
		return
	}
	if input.Price <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Giá vé phải lớn hơn 0"})
		return
	}
	if err := a.ensureTripBelongsToOperator(r.Context(), tripID, operatorID); err != nil {
		writeError(w, err)
		return
	}
	if err := a.ensureBusBelongsToOperator(r.Context(), input.BusID, operatorID); err != nil {
		writeError(w, err)
		return
	}
	capacity, err := a.busCapacity(r.Context(), input.BusID, operatorID)
	if err != nil {
		writeError(w, err)
		return
	}
	availableSeats := input.AvailableSeats
	if availableSeats <= 0 {
		availableSeats = capacity
	}
	if availableSeats > capacity {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Số ghế trống không được lớn hơn số ghế của xe"})
		return
	}
	if input.DriverID != nil {
		if err := a.ensureDriverBelongsToOperator(r.Context(), *input.DriverID, operatorID); err != nil {
			writeError(w, err)
			return
		}
	}

	result, err := a.db.ExecContext(r.Context(), `
		UPDATE Trips
		SET BusID = @p1,
			DepartureLocation = @p2,
			ArrivalLocation = @p3,
			DepartureTime = @p4,
			ArrivalTime = @p5,
			Price = @p6,
			AvailableSeats = @p7,
			DriverID = @p8
		WHERE TripID = @p9
	`, input.BusID, input.DepartureLocation, input.ArrivalLocation, depTime, arrTime, input.Price, availableSeats, nullableParam(input.DriverID), tripID)
	if err != nil {
		writeError(w, err)
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Không tìm thấy chuyến xe"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Cập nhật lịch và giá vé thành công"})
}

func (a *app) cloneOperatorTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	tripID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "trip id không hợp lệ"})
		return
	}

	var input cloneTripInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Body không hợp lệ"})
		return
	}

	intervalDays := 0
	switch strings.ToLower(strings.TrimSpace(input.Frequency)) {
	case "day", "daily":
		intervalDays = 1
	case "week", "weekly":
		intervalDays = 7
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Chỉ hỗ trợ nhân bản theo ngày hoặc theo tuần"})
		return
	}

	var source struct {
		BusID             int
		DepartureLocation string
		ArrivalLocation   string
		DepartureTime     time.Time
		ArrivalTime       time.Time
		Price             float64
		AvailableSeats    int
		DriverID          sql.NullInt64
	}
	err = a.db.QueryRowContext(r.Context(), `
		SELECT t.BusID, t.DepartureLocation, t.ArrivalLocation, t.DepartureTime,
			t.ArrivalTime, t.Price, t.AvailableSeats, t.DriverID
		FROM Trips t
		JOIN Buses b ON b.BusID = t.BusID
		WHERE t.TripID = @p1 AND b.OperatorID = @p2
	`, tripID, operatorID).Scan(
		&source.BusID,
		&source.DepartureLocation,
		&source.ArrivalLocation,
		&source.DepartureTime,
		&source.ArrivalTime,
		&source.Price,
		&source.AvailableSeats,
		&source.DriverID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Chuyến xe không thuộc nhà xe của bạn"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}

	targetDepartures, err := cloneTargetDepartures(input, source.DepartureTime, intervalDays)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}
	duration := source.ArrivalTime.Sub(source.DepartureTime)
	if duration <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Thời gian chuyến gốc không hợp lệ"})
		return
	}

	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback()

	createdIDs := make([]int, 0, len(targetDepartures))
	for _, departureTime := range targetDepartures {
		arrivalTime := departureTime.Add(duration)

		var newTripID int
		err := tx.QueryRowContext(r.Context(), `
			INSERT INTO Trips (BusID, DepartureLocation, ArrivalLocation, DepartureTime, ArrivalTime, Price, AvailableSeats, Status, DriverID)
			OUTPUT inserted.TripID
			VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, 'Scheduled', @p8)
		`,
			source.BusID,
			source.DepartureLocation,
			source.ArrivalLocation,
			departureTime,
			arrivalTime,
			source.Price,
			source.AvailableSeats,
			nullableNullInt64Param(source.DriverID),
		).Scan(&newTripID)
		if err != nil {
			writeError(w, err)
			return
		}
		createdIDs = append(createdIDs, newTripID)
	}

	if err := tx.Commit(); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"message":    "Nhân bản lịch trình thành công",
		"created":    len(createdIDs),
		"createdIds": createdIDs,
	})
}

func (a *app) assignDriverToTrip(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	tripID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "trip id không hợp lệ"})
		return
	}

	var body struct {
		DriverID int `json:"driverId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.DriverID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "driverId không hợp lệ"})
		return
	}
	if err := a.ensureTripBelongsToOperator(r.Context(), tripID, operatorID); err != nil {
		writeError(w, err)
		return
	}
	if err := a.ensureDriverBelongsToOperator(r.Context(), body.DriverID, operatorID); err != nil {
		writeError(w, err)
		return
	}

	result, err := a.db.ExecContext(r.Context(), `UPDATE Trips SET DriverID = @p1 WHERE TripID = @p2`, body.DriverID, tripID)
	if err != nil {
		writeError(w, err)
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Không tìm thấy chuyến xe"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Đã gán tài xế cho chuyến"})
}

func (a *app) operatorBookings(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	rows, err := a.db.QueryContext(r.Context(), `
		SELECT
			bk.BookingID, bk.CustomerName, bk.CustomerPhone, bk.TotalSeats,
			bk.TotalPrice, bk.PaymentStatus, bk.BookingDate,
			t.DepartureLocation, t.ArrivalLocation
		FROM Bookings bk
		JOIN Trips t ON t.TripID = bk.TripID
		JOIN Buses b ON b.BusID = t.BusID
		WHERE b.OperatorID = @p1
		ORDER BY bk.BookingDate DESC
	`, operatorID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()

	var bookings []map[string]any
	for rows.Next() {
		var id, seats int
		var name, phone, status, dep, arr string
		var total float64
		var bookingDate time.Time
		if err := rows.Scan(&id, &name, &phone, &seats, &total, &status, &bookingDate, &dep, &arr); err != nil {
			writeError(w, err)
			return
		}
		bookings = append(bookings, map[string]any{
			"id":            id,
			"customerName":  name,
			"customerPhone": phone,
			"totalSeats":    seats,
			"totalPrice":    total,
			"status":        status,
			"bookingDate":   bookingDate,
			"route":         dep + " - " + arr,
		})
	}

	writeJSON(w, http.StatusOK, bookings)
}

func (a *app) operatorRevenueReport(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	query := r.URL.Query()
	groupBy := strings.ToLower(strings.TrimSpace(query.Get("groupBy")))
	if groupBy == "period" {
		groupBy = "date"
	}
	if groupBy == "" {
		groupBy = "trip"
	}
	if groupBy != "trip" && groupBy != "bus" && groupBy != "date" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Kiểu báo cáo không hợp lệ"})
		return
	}

	whereClause, args, err := revenueWhereClause(operatorID, query.Get("from"), query.Get("to"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}

	summaryQuery := fmt.Sprintf(`
		SELECT COUNT(bk.BookingID), ISNULL(SUM(bk.TotalSeats), 0), ISNULL(SUM(bk.TotalPrice), 0)
		FROM Bookings bk
		JOIN Trips t ON t.TripID = bk.TripID
		JOIN Buses b ON b.BusID = t.BusID
		%s
	`, whereClause)

	var paidBookings, seatsSold int
	var paidRevenue float64
	if err := a.db.QueryRowContext(r.Context(), summaryQuery, args...).Scan(&paidBookings, &seatsSold, &paidRevenue); err != nil {
		writeError(w, err)
		return
	}

	var items []map[string]any
	switch groupBy {
	case "trip":
		items, err = a.revenueByTrip(r.Context(), whereClause, args)
	case "bus":
		items, err = a.revenueByBus(r.Context(), whereClause, args)
	case "date":
		items, err = a.revenueByDate(r.Context(), whereClause, args)
	}
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"groupBy": groupBy,
		"filters": map[string]string{
			"from": query.Get("from"),
			"to":   query.Get("to"),
		},
		"summary": map[string]any{
			"paidBookings": paidBookings,
			"seatsSold":    seatsSold,
			"paidRevenue":  paidRevenue,
		},
		"items": items,
	})
}

func (a *app) revenueByTrip(ctx context.Context, whereClause string, args []any) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			t.TripID,
			t.DepartureLocation,
			t.ArrivalLocation,
			t.DepartureTime,
			b.LicensePlate,
			COUNT(bk.BookingID) AS paidBookings,
			ISNULL(SUM(bk.TotalSeats), 0) AS seatsSold,
			ISNULL(SUM(bk.TotalPrice), 0) AS revenue
		FROM Bookings bk
		JOIN Trips t ON t.TripID = bk.TripID
		JOIN Buses b ON b.BusID = t.BusID
		%s
		GROUP BY t.TripID, t.DepartureLocation, t.ArrivalLocation, t.DepartureTime, b.LicensePlate
		ORDER BY revenue DESC, t.DepartureTime DESC
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var tripID, paidBookings, seatsSold int
		var departureLocation, arrivalLocation, licensePlate string
		var departureTime time.Time
		var revenue float64
		if err := rows.Scan(&tripID, &departureLocation, &arrivalLocation, &departureTime, &licensePlate, &paidBookings, &seatsSold, &revenue); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{
			"tripId":            tripID,
			"departureLocation": departureLocation,
			"arrivalLocation":   arrivalLocation,
			"departureTime":     departureTime,
			"licensePlate":      licensePlate,
			"paidBookings":      paidBookings,
			"seatsSold":         seatsSold,
			"revenue":           revenue,
		})
	}
	return items, rows.Err()
}

func (a *app) revenueByBus(ctx context.Context, whereClause string, args []any) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			b.BusID,
			b.LicensePlate,
			b.BusType,
			b.Capacity,
			COUNT(bk.BookingID) AS paidBookings,
			ISNULL(SUM(bk.TotalSeats), 0) AS seatsSold,
			ISNULL(SUM(bk.TotalPrice), 0) AS revenue
		FROM Bookings bk
		JOIN Trips t ON t.TripID = bk.TripID
		JOIN Buses b ON b.BusID = t.BusID
		%s
		GROUP BY b.BusID, b.LicensePlate, b.BusType, b.Capacity
		ORDER BY revenue DESC, b.BusID DESC
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var busID, capacity, paidBookings, seatsSold int
		var licensePlate, busType string
		var revenue float64
		if err := rows.Scan(&busID, &licensePlate, &busType, &capacity, &paidBookings, &seatsSold, &revenue); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{
			"busId":        busID,
			"licensePlate": licensePlate,
			"busType":      busType,
			"capacity":     capacity,
			"paidBookings": paidBookings,
			"seatsSold":    seatsSold,
			"revenue":      revenue,
		})
	}
	return items, rows.Err()
}

func (a *app) revenueByDate(ctx context.Context, whereClause string, args []any) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT
			CAST(bk.BookingDate AS date) AS bookingDay,
			COUNT(bk.BookingID) AS paidBookings,
			ISNULL(SUM(bk.TotalSeats), 0) AS seatsSold,
			ISNULL(SUM(bk.TotalPrice), 0) AS revenue
		FROM Bookings bk
		JOIN Trips t ON t.TripID = bk.TripID
		JOIN Buses b ON b.BusID = t.BusID
		%s
		GROUP BY CAST(bk.BookingDate AS date)
		ORDER BY bookingDay DESC
	`, whereClause), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var bookingDay time.Time
		var paidBookings, seatsSold int
		var revenue float64
		if err := rows.Scan(&bookingDay, &paidBookings, &seatsSold, &revenue); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{
			"date":         bookingDay.Format("2006-01-02"),
			"paidBookings": paidBookings,
			"seatsSold":    seatsSold,
			"revenue":      revenue,
		})
	}
	return items, rows.Err()
}

func (a *app) operatorBuses(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	rows, err := a.db.QueryContext(r.Context(), `
		SELECT b.BusID, b.LicensePlate, b.Capacity, b.BusType, COUNT(bs.SeatID) AS SeatCount
		FROM Buses b
		LEFT JOIN BusSeats bs ON bs.BusID = b.BusID
		WHERE b.OperatorID = @p1
		GROUP BY b.BusID, b.LicensePlate, b.Capacity, b.BusType
		ORDER BY b.BusID DESC
	`, operatorID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()

	var buses []map[string]any
	for rows.Next() {
		var id, capacity, seatCount int
		var plate, busType string
		if err := rows.Scan(&id, &plate, &capacity, &busType, &seatCount); err != nil {
			writeError(w, err)
			return
		}
		buses = append(buses, map[string]any{
			"id":           id,
			"licensePlate": plate,
			"capacity":     capacity,
			"busType":      busType,
			"seatCount":    seatCount,
		})
	}

	writeJSON(w, http.StatusOK, buses)
}

func (a *app) createOperatorBus(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	var input busInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Body không hợp lệ"})
		return
	}
	input.LicensePlate = strings.ToUpper(strings.TrimSpace(input.LicensePlate))
	input.BusType = strings.TrimSpace(input.BusType)
	if input.LicensePlate == "" || input.BusType == "" || input.Capacity <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Vui lòng nhập biển số, loại xe và số ghế"})
		return
	}

	layoutType := normalizeLayoutType(input.LayoutType, input.BusType)
	seats := defaultSeatLayout(layoutType, input.Capacity)

	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback()

	var busID int
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO Buses (OperatorID, LicensePlate, Capacity, BusType)
		OUTPUT inserted.BusID
		VALUES (@p1, @p2, @p3, @p4)
	`, operatorID, input.LicensePlate, input.Capacity, input.BusType).Scan(&busID)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := insertBusSeats(r.Context(), tx, busID, seats); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"message":   "Tạo xe và sơ đồ ghế thành công",
		"busId":     busID,
		"seatCount": len(seats),
	})
}

func (a *app) operatorBusSeats(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	busID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "bus id không hợp lệ"})
		return
	}

	var plate, busType string
	var capacity int
	err = a.db.QueryRowContext(r.Context(), `
		SELECT LicensePlate, BusType, Capacity
		FROM Buses
		WHERE BusID = @p1 AND OperatorID = @p2
	`, busID, operatorID).Scan(&plate, &busType, &capacity)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Xe không thuộc nhà xe của bạn"})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}

	rows, err := a.db.QueryContext(r.Context(), `
		SELECT SeatLabel, SeatRow, SeatColumn, Deck, SeatType, Status
		FROM BusSeats
		WHERE BusID = @p1
		ORDER BY
			CASE WHEN Deck = N'Tầng dưới' THEN 1 WHEN Deck = N'Tầng trên' THEN 2 ELSE 3 END,
			SeatRow,
			SeatColumn,
			SeatLabel
	`, busID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()

	var seats []seatDefinition
	for rows.Next() {
		var seat seatDefinition
		if err := rows.Scan(&seat.Label, &seat.Row, &seat.Column, &seat.Deck, &seat.SeatType, &seat.Status); err != nil {
			writeError(w, err)
			return
		}
		seats = append(seats, seat)
	}
	generated := false
	if len(seats) == 0 {
		generated = true
		seats = defaultSeatLayout(normalizeLayoutType("", busType), capacity)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"bus": map[string]any{
			"id":           busID,
			"licensePlate": plate,
			"busType":      busType,
			"capacity":     capacity,
		},
		"layoutType": normalizeLayoutType("", busType),
		"generated":  generated,
		"seats":      seats,
	})
}

func (a *app) updateOperatorBusSeats(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	busID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "bus id không hợp lệ"})
		return
	}
	if err := a.ensureBusBelongsToOperator(r.Context(), busID, operatorID); err != nil {
		writeError(w, err)
		return
	}

	var input seatMapInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Body không hợp lệ"})
		return
	}
	seats := input.Seats
	if len(seats) == 0 {
		capacity, err := a.busCapacity(r.Context(), busID, operatorID)
		if err != nil {
			writeError(w, err)
			return
		}
		seats = defaultSeatLayout(normalizeLayoutType(input.LayoutType, ""), capacity)
	}
	if err := validateSeats(seats); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}

	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(r.Context(), `DELETE FROM BusSeats WHERE BusID = @p1`, busID); err != nil {
		writeError(w, err)
		return
	}
	if err := insertBusSeats(r.Context(), tx, busID, seats); err != nil {
		writeError(w, err)
		return
	}
	if _, err := tx.ExecContext(r.Context(), `UPDATE Buses SET Capacity = @p1 WHERE BusID = @p2`, len(seats), busID); err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":   "Cập nhật sơ đồ ghế thành công",
		"seatCount": len(seats),
	})
}

func (a *app) operatorDrivers(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	rows, err := a.db.QueryContext(r.Context(), `
		SELECT d.DriverID, d.UserID, u.FullName, u.Email, u.Phone, d.LicenseNumber, d.Status
		FROM Drivers d
		JOIN Users u ON u.UserID = d.UserID
		WHERE d.OperatorID = @p1
		ORDER BY d.DriverID DESC
	`, operatorID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()

	var drivers []map[string]any
	for rows.Next() {
		var driverID, driverUserID int
		var fullName, email, phone, licenseNumber, status string
		if err := rows.Scan(&driverID, &driverUserID, &fullName, &email, &phone, &licenseNumber, &status); err != nil {
			writeError(w, err)
			return
		}
		drivers = append(drivers, map[string]any{
			"id":            driverID,
			"userId":        driverUserID,
			"fullName":      fullName,
			"email":         email,
			"phone":         phone,
			"licenseNumber": licenseNumber,
			"status":        status,
		})
	}

	writeJSON(w, http.StatusOK, drivers)
}

func (a *app) createOperatorDriver(w http.ResponseWriter, r *http.Request, user authUser) {
	operatorID, err := a.operatorIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	var input driverInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Body không hợp lệ"})
		return
	}
	if strings.TrimSpace(input.LicenseNumber) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Vui lòng nhập số bằng lái"})
		return
	}

	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeError(w, err)
		return
	}
	defer tx.Rollback()

	userID := 0
	if input.UserID != nil {
		userID = *input.UserID
		if err := setUserRole(r.Context(), tx, userID, "Driver"); err != nil {
			writeError(w, err)
			return
		}
	} else {
		if strings.TrimSpace(input.FullName) == "" || strings.TrimSpace(input.Email) == "" || strings.TrimSpace(input.Phone) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Vui lòng nhập fullName, email, phone hoặc truyền userId"})
			return
		}
		err := tx.QueryRowContext(r.Context(), `
			INSERT INTO Users (FullName, Email, Phone, PasswordHash, Role)
			OUTPUT inserted.UserID
			VALUES (@p1, @p2, @p3, @p4, 'Driver')
		`, input.FullName, input.Email, input.Phone, "driver123").Scan(&userID)
		if err != nil {
			writeError(w, err)
			return
		}
	}

	var driverID int
	err = tx.QueryRowContext(r.Context(), `
		INSERT INTO Drivers (UserID, OperatorID, LicenseNumber, Status)
		OUTPUT inserted.DriverID
		VALUES (@p1, @p2, @p3, 'Active')
	`, userID, operatorID, input.LicenseNumber).Scan(&driverID)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"message":         "Tạo tài xế thành công",
		"driverId":        driverID,
		"userId":          userID,
		"defaultPassword": "driver123",
	})
}

func (a *app) driverTrips(w http.ResponseWriter, r *http.Request, user authUser) {
	driverID, err := a.driverIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	rows, err := a.db.QueryContext(r.Context(), `
		SELECT
			t.TripID, t.DepartureLocation, t.ArrivalLocation, t.DepartureTime,
			t.ArrivalTime, t.Price, t.AvailableSeats, t.Status,
			b.LicensePlate, b.BusType, o.Name
		FROM Trips t
		JOIN Buses b ON b.BusID = t.BusID
		JOIN Operators o ON o.OperatorID = b.OperatorID
		WHERE t.DriverID = @p1
		ORDER BY t.DepartureTime DESC
	`, driverID)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()

	var trips []map[string]any
	for rows.Next() {
		var id, seats int
		var dep, arr, status, plate, busType, operatorName string
		var depTime, arrTime time.Time
		var price float64
		if err := rows.Scan(&id, &dep, &arr, &depTime, &arrTime, &price, &seats, &status, &plate, &busType, &operatorName); err != nil {
			writeError(w, err)
			return
		}
		trips = append(trips, map[string]any{
			"id":                id,
			"operatorName":      operatorName,
			"licensePlate":      plate,
			"busType":           busType,
			"departureLocation": dep,
			"arrivalLocation":   arr,
			"departureTime":     depTime,
			"arrivalTime":       arrTime,
			"price":             price,
			"availableSeats":    seats,
			"status":            status,
		})
	}

	writeJSON(w, http.StatusOK, trips)
}

func (a *app) updateDriverTripStatus(w http.ResponseWriter, r *http.Request, user authUser) {
	driverID, err := a.driverIDByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	tripID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "trip id không hợp lệ"})
		return
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Body không hợp lệ"})
		return
	}
	if !allowedTripStatus(body.Status) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Status chỉ nhận Scheduled, On-going, Completed, Cancelled"})
		return
	}

	result, err := a.db.ExecContext(r.Context(), `UPDATE Trips SET Status = @p1 WHERE TripID = @p2 AND DriverID = @p3`, body.Status, tripID, driverID)
	if err != nil {
		writeError(w, err)
		return
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Không tìm thấy chuyến được phân công"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Cập nhật trạng thái chuyến thành công"})
}

func (a *app) withAuth(requiredRole string, next func(http.ResponseWriter, *http.Request, authUser)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := a.authenticate(r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": err.Error()})
			return
		}
		if user.Role != requiredRole && user.Role != "Admin" {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Không có quyền truy cập"})
			return
		}
		next(w, r, user)
	}
}

func (a *app) authenticate(r *http.Request) (authUser, error) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if header == "" {
		return authUser{}, errors.New("Thiếu token")
	}
	token := strings.TrimPrefix(header, "Bearer ")
	token = strings.TrimPrefix(token, "bearer ")

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return authUser{}, errors.New("Token không hợp lệ")
	}

	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, a.jwtSecret)
	mac.Write([]byte(signingInput))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return authUser{}, errors.New("Token không hợp lệ")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return authUser{}, errors.New("Token không hợp lệ")
	}
	var payload map[string]any
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return authUser{}, errors.New("Token không hợp lệ")
	}

	idFloat, ok := payload["id"].(float64)
	if !ok {
		return authUser{}, errors.New("Token thiếu user id")
	}
	role, ok := payload["role"].(string)
	if !ok {
		return authUser{}, errors.New("Token thiếu role")
	}
	if exp, ok := payload["exp"].(float64); ok && int64(exp) < time.Now().Unix() {
		return authUser{}, errors.New("Token đã hết hạn")
	}

	return authUser{ID: int(idFloat), Role: role}, nil
}

func (a *app) operatorIDByUser(ctx context.Context, userID int) (int, error) {
	var operatorID int
	err := a.db.QueryRowContext(ctx, `SELECT OperatorID FROM OperatorUsers WHERE UserID = @p1`, userID).Scan(&operatorID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, httpError{status: http.StatusForbidden, message: "Tài khoản chưa được gán nhà xe"}
	}
	return operatorID, err
}

func (a *app) driverIDByUser(ctx context.Context, userID int) (int, error) {
	var driverID int
	err := a.db.QueryRowContext(ctx, `SELECT DriverID FROM Drivers WHERE UserID = @p1 AND Status = 'Active'`, userID).Scan(&driverID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, httpError{status: http.StatusForbidden, message: "Tài khoản chưa được gán hồ sơ tài xế"}
	}
	return driverID, err
}

func (a *app) ensureBusBelongsToOperator(ctx context.Context, busID, operatorID int) error {
	var exists int
	err := a.db.QueryRowContext(ctx, `SELECT 1 FROM Buses WHERE BusID = @p1 AND OperatorID = @p2`, busID, operatorID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return httpError{status: http.StatusForbidden, message: "Xe không thuộc nhà xe của bạn"}
	}
	return err
}

func (a *app) busCapacity(ctx context.Context, busID, operatorID int) (int, error) {
	var capacity int
	err := a.db.QueryRowContext(ctx, `SELECT Capacity FROM Buses WHERE BusID = @p1 AND OperatorID = @p2`, busID, operatorID).Scan(&capacity)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, httpError{status: http.StatusForbidden, message: "Xe không thuộc nhà xe của bạn"}
	}
	return capacity, err
}

func (a *app) ensureTripBelongsToOperator(ctx context.Context, tripID, operatorID int) error {
	var exists int
	err := a.db.QueryRowContext(ctx, `
		SELECT 1
		FROM Trips t
		JOIN Buses b ON b.BusID = t.BusID
		WHERE t.TripID = @p1 AND b.OperatorID = @p2
	`, tripID, operatorID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return httpError{status: http.StatusForbidden, message: "Chuyến xe không thuộc nhà xe của bạn"}
	}
	return err
}

func (a *app) ensureDriverBelongsToOperator(ctx context.Context, driverID, operatorID int) error {
	var exists int
	err := a.db.QueryRowContext(ctx, `SELECT 1 FROM Drivers WHERE DriverID = @p1 AND OperatorID = @p2 AND Status = 'Active'`, driverID, operatorID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return httpError{status: http.StatusForbidden, message: "Tài xế không thuộc nhà xe của bạn"}
	}
	return err
}

func setUserRole(ctx context.Context, tx *sql.Tx, userID int, role string) error {
	result, err := tx.ExecContext(ctx, `UPDATE Users SET Role = @p1 WHERE UserID = @p2`, role, userID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return httpError{status: http.StatusNotFound, message: "Không tìm thấy user"}
	}
	return nil
}

func cloneTargetDepartures(input cloneTripInput, sourceDeparture time.Time, intervalDays int) ([]time.Time, error) {
	startRaw := strings.TrimSpace(input.StartDate)
	endRaw := strings.TrimSpace(input.EndDate)

	if startRaw == "" && endRaw == "" {
		if input.Count <= 0 || input.Count > 60 {
			return nil, errors.New("Số lần nhân bản phải từ 1 đến 60")
		}
		targets := make([]time.Time, 0, input.Count)
		for i := 1; i <= input.Count; i++ {
			targets = append(targets, sourceDeparture.AddDate(0, 0, intervalDays*i))
		}
		return targets, nil
	}

	if startRaw == "" || endRaw == "" {
		return nil, errors.New("Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc")
	}

	startDate, err := parseReportDate(startRaw)
	if err != nil {
		return nil, errors.New("Ngày bắt đầu không hợp lệ")
	}
	endDate, err := parseReportDate(endRaw)
	if err != nil {
		return nil, errors.New("Ngày kết thúc không hợp lệ")
	}
	if endDate.Before(startDate) {
		return nil, errors.New("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu")
	}

	currentDate := startDate
	if intervalDays == 7 {
		offset := (int(sourceDeparture.Weekday()) - int(startDate.Weekday()) + 7) % 7
		currentDate = startDate.AddDate(0, 0, offset)
	}

	targets := make([]time.Time, 0)
	for !currentDate.After(endDate) {
		departure := time.Date(
			currentDate.Year(),
			currentDate.Month(),
			currentDate.Day(),
			sourceDeparture.Hour(),
			sourceDeparture.Minute(),
			sourceDeparture.Second(),
			sourceDeparture.Nanosecond(),
			sourceDeparture.Location(),
		)
		if !sameCalendarDate(departure, sourceDeparture) {
			targets = append(targets, departure)
		}
		if len(targets) > 120 {
			return nil, errors.New("Khoảng ngày nhân bản quá dài, tối đa 120 chuyến mỗi lần")
		}
		currentDate = currentDate.AddDate(0, 0, intervalDays)
	}

	if len(targets) == 0 {
		return nil, errors.New("Không có ngày phù hợp để nhân bản trong khoảng đã chọn")
	}
	return targets, nil
}

func sameCalendarDate(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

func revenueWhereClause(operatorID int, fromDate, toDate string) (string, []any, error) {
	clauses := []string{"b.OperatorID = @p1", "bk.PaymentStatus = 'Paid'"}
	args := []any{operatorID}

	if strings.TrimSpace(fromDate) != "" {
		start, err := parseReportDate(fromDate)
		if err != nil {
			return "", nil, errors.New("Ngày bắt đầu không hợp lệ")
		}
		args = append(args, start)
		clauses = append(clauses, fmt.Sprintf("bk.BookingDate >= @p%d", len(args)))
	}
	if strings.TrimSpace(toDate) != "" {
		end, err := parseReportDate(toDate)
		if err != nil {
			return "", nil, errors.New("Ngày kết thúc không hợp lệ")
		}
		args = append(args, end.AddDate(0, 0, 1))
		clauses = append(clauses, fmt.Sprintf("bk.BookingDate < @p%d", len(args)))
	}

	if strings.TrimSpace(fromDate) != "" && strings.TrimSpace(toDate) != "" {
		start, _ := parseReportDate(fromDate)
		end, _ := parseReportDate(toDate)
		if end.Before(start) {
			return "", nil, errors.New("Ngày kết thúc phải sau ngày bắt đầu")
		}
	}

	return "WHERE " + strings.Join(clauses, " AND "), args, nil
}

func parseReportDate(value string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(value))
}

func parseTime(value string) (time.Time, error) {
	layouts := []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04", "2006-01-02 15:04"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, value); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid time")
}

func allowedTripStatus(status string) bool {
	switch status {
	case "Scheduled", "On-going", "Completed", "Cancelled":
		return true
	default:
		return false
	}
}

func normalizeLayoutType(value, busType string) string {
	raw := strings.ToLower(strings.TrimSpace(value + " " + busType))
	switch {
	case strings.Contains(raw, "limousine"), strings.Contains(raw, "vip"):
		return "limousine"
	case strings.Contains(raw, "giường"), strings.Contains(raw, "giuong"), strings.Contains(raw, "sleeper"), strings.Contains(raw, "nằm"), strings.Contains(raw, "nam"):
		return "sleeper"
	case strings.Contains(raw, "ghế"), strings.Contains(raw, "ghe"), strings.Contains(raw, "seat"):
		return "seat"
	default:
		return "seat"
	}
}

func defaultSeatLayout(layoutType string, capacity int) []seatDefinition {
	if capacity <= 0 {
		return nil
	}
	switch normalizeLayoutType(layoutType, "") {
	case "sleeper":
		lowerCount := (capacity + 1) / 2
		upperCount := capacity - lowerCount
		seats := make([]seatDefinition, 0, capacity)
		seats = append(seats, buildSeatDeck(lowerCount, "D", "Tầng dưới", "Giường", []int{1, 3, 5})...)
		seats = append(seats, buildSeatDeck(upperCount, "T", "Tầng trên", "Giường", []int{1, 3, 5})...)
		return seats
	case "limousine":
		return buildSeatDeck(capacity, "VIP", "Tầng chính", "Ghế VIP", []int{1, 3, 5})
	default:
		return buildSeatDeck(capacity, "G", "Tầng chính", "Ghế ngồi", []int{1, 2, 4, 5})
	}
}

func buildSeatDeck(count int, prefix, deck, seatType string, columns []int) []seatDefinition {
	if count <= 0 {
		return nil
	}
	seats := make([]seatDefinition, 0, count)
	for i := 0; i < count; i++ {
		seats = append(seats, seatDefinition{
			Label:    fmt.Sprintf("%s%02d", prefix, i+1),
			Row:      i/len(columns) + 1,
			Column:   columns[i%len(columns)],
			Deck:     deck,
			SeatType: seatType,
			Status:   "Active",
		})
	}
	return seats
}

func validateSeats(seats []seatDefinition) error {
	if len(seats) == 0 {
		return errors.New("Sơ đồ ghế phải có ít nhất 1 ghế")
	}
	seen := map[string]struct{}{}
	for _, seat := range seats {
		label := strings.TrimSpace(seat.Label)
		if label == "" {
			return errors.New("Mã ghế không được trống")
		}
		if seat.Row <= 0 || seat.Column <= 0 {
			return errors.New("Vị trí hàng/cột của ghế không hợp lệ")
		}
		if _, ok := seen[label]; ok {
			return fmt.Errorf("Mã ghế %s bị trùng", label)
		}
		seen[label] = struct{}{}
	}
	return nil
}

func insertBusSeats(ctx context.Context, tx *sql.Tx, busID int, seats []seatDefinition) error {
	if err := validateSeats(seats); err != nil {
		return err
	}
	for _, seat := range seats {
		label := strings.TrimSpace(seat.Label)
		deck := strings.TrimSpace(seat.Deck)
		if deck == "" {
			deck = "Tầng chính"
		}
		seatType := strings.TrimSpace(seat.SeatType)
		if seatType == "" {
			seatType = "Ghế"
		}
		status := strings.TrimSpace(seat.Status)
		if status != "Blocked" {
			status = "Active"
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO BusSeats (BusID, SeatLabel, SeatRow, SeatColumn, Deck, SeatType, Status)
			VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7)
		`, busID, label, seat.Row, seat.Column, deck, seatType, status); err != nil {
			return err
		}
	}
	return nil
}

func nullableInt(v sql.NullInt64) any {
	if v.Valid {
		return v.Int64
	}
	return nil
}

func nullableString(v sql.NullString) any {
	if v.Valid {
		return v.String
	}
	return nil
}

func nullableParam(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableNullInt64Param(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}

type httpError struct {
	status  int
	message string
}

func (e httpError) Error() string {
	return e.message
}

func writeError(w http.ResponseWriter, err error) {
	var he httpError
	if errors.As(err, &he) {
		writeJSON(w, he.status, map[string]string{"message": he.message})
		return
	}
	log.Println(err)
	if strings.EqualFold(os.Getenv("APP_ENV"), "production") {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Lỗi server"})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Lỗi server: " + err.Error()})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func loadEnv(file string) {
	path, err := filepath.Abs(file)
	if err != nil {
		return
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(content), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if os.Getenv(key) == "" {
			os.Setenv(key, strings.TrimSpace(value))
		}
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func normalizeSQLServerConnString(value string) string {
	parts := strings.Split(value, ";")
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		key, rawValue, ok := strings.Cut(item, "=")
		if ok && strings.EqualFold(strings.TrimSpace(key), "Driver") {
			continue
		}
		if ok {
			key = strings.TrimSpace(key)
			if strings.EqualFold(strings.ReplaceAll(key, " ", ""), "Trusted_Connection") {
				if isTruthySQLValue(rawValue) {
					item = "Integrated Security=SSPI"
				} else {
					continue
				}
				kept = append(kept, item)
				continue
			}
			if normalized, changed := normalizeSQLBoolValue(key, rawValue); changed {
				item = key + "=" + normalized
			}
		}
		kept = append(kept, item)
	}
	return strings.Join(kept, ";")
}

func isTruthySQLValue(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "yes", "true", "sspi":
		return true
	default:
		return false
	}
}

func normalizeSQLBoolValue(key, value string) (string, bool) {
	switch strings.ToLower(strings.ReplaceAll(strings.TrimSpace(key), " ", "")) {
	case "encrypt", "trustservercertificate", "disableretry":
	default:
		return value, false
	}

	switch strings.ToLower(strings.TrimSpace(value)) {
	case "yes":
		return "true", true
	case "no":
		return "false", true
	default:
		return value, false
	}
}
