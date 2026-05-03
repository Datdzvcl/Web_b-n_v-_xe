-- Run this script in SQL Server Management Studio (SSMS) or equivalent
-- Make sure to select or create your Target Database first
-- CREATE DATABASE VeXeAZ_DB;
-- GO
-- USE VeXeAZ_DB;
-- GO

-- 1. Users Table
CREATE TABLE Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    FullName NVARCHAR(100) NOT NULL,
    Email VARCHAR(100) UNIQUE NOT NULL,
    Phone VARCHAR(20) UNIQUE NOT NULL,
    PasswordHash VARCHAR(255) NOT NULL,
    Role VARCHAR(20) DEFAULT 'Customer' CHECK(Role IN ('Customer', 'Admin', 'Operator')),
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

-- 2. Operators Table (Nhà Xe)
CREATE TABLE Operators (
    OperatorID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    ContactPhone VARCHAR(20) NOT NULL,
    Email VARCHAR(100)
);
GO

-- 3. Buses Table (Các xe thuộc nhà xe)
CREATE TABLE Buses (
    BusID INT IDENTITY(1,1) PRIMARY KEY,
    OperatorID INT NOT NULL FOREIGN KEY REFERENCES Operators(OperatorID),
    LicensePlate VARCHAR(20) UNIQUE NOT NULL,
    Capacity INT NOT NULL,
    BusType NVARCHAR(50) NOT NULL -- e.g., 'Limousine 34 giường', 'Ghế ngồi 45 chỗ'
);
GO

-- 4. Trips Table (Chuyến Xe)
CREATE TABLE Trips (
    TripID INT IDENTITY(1,1) PRIMARY KEY,
    BusID INT NOT NULL FOREIGN KEY REFERENCES Buses(BusID),
    DepartureLocation NVARCHAR(100) NOT NULL,
    ArrivalLocation NVARCHAR(100) NOT NULL,
    DepartureTime DATETIME NOT NULL,
    ArrivalTime DATETIME NOT NULL,
    Price DECIMAL(18,2) NOT NULL,
    AvailableSeats INT NOT NULL,
    Status VARCHAR(20) DEFAULT 'Scheduled' CHECK(Status IN ('Scheduled', 'Completed', 'Cancelled', 'On-going'))
);
GO

-- 5. Tickets/Bookings Table (Đơn Đặt Vé)
CREATE TABLE Bookings (
    BookingID INT IDENTITY(1,1) PRIMARY KEY,
    TripID INT NOT NULL FOREIGN KEY REFERENCES Trips(TripID),
    UserID INT NULL FOREIGN KEY REFERENCES Users(UserID), -- Optional for guests, but tied for auth users
    CustomerName NVARCHAR(100) NOT NULL,
    CustomerPhone VARCHAR(20) NOT NULL,
    CustomerEmail VARCHAR(100) NULL,
    TotalSeats INT NOT NULL,
    TotalPrice DECIMAL(18,2) NOT NULL,
    PaymentMethod VARCHAR(20) DEFAULT 'VNPay',
    PaymentStatus VARCHAR(20) DEFAULT 'Pending' CHECK(PaymentStatus IN ('Pending', 'Paid', 'Failed', 'Cancelled')),
    BookingDate DATETIME DEFAULT GETDATE()
);
GO

-- 6. Ticket Seats Table (Lưu Trữ Chỗ Ngồi Chi Tiết Cho Từng Vé)
CREATE TABLE TicketSeats (
    TicketSeatID INT IDENTITY(1,1) PRIMARY KEY,
    BookingID INT NOT NULL FOREIGN KEY REFERENCES Bookings(BookingID),
    SeatLabel VARCHAR(10) NOT NULL, -- e.g., 'A1', 'B2'
    CONSTRAINT UQ_Trip_Seat UNIQUE (BookingID, SeatLabel) -- Prevent double booking in same trip transaction roughly
);
GO

-- Insert Initial Mock Data
INSERT INTO Users (FullName, Email, Phone, PasswordHash, Role)
VALUES ('Admin', 'admin@vexeaz.com', '0999999999', 'hashed_password_here', 'Admin');

INSERT INTO Operators (Name, Description, ContactPhone, Email)
VALUES 
(N'Phương Trang', N'Dịch vụ xe khách hàng đầu', '19006067', 'phuongtrang@futa.vn'),
(N'Thành Bưởi', N'Limousine VIP', '19001900', 'cskh@thanhbuoi.vn');

INSERT INTO Buses (OperatorID, LicensePlate, Capacity, BusType)
VALUES 
(1, '51B-12345', 34, N'Limousine 34 giường'),
(2, '51B-67890', 40, N'Xe giường nằm 40 chỗ');

INSERT INTO Trips (BusID, DepartureLocation, ArrivalLocation, DepartureTime, ArrivalTime, Price, AvailableSeats, Status)
VALUES 
(1, N'TPHCM', N'Đà Lạt', DATEADD(day, 1, GETDATE()), DATEADD(day, 1, DATEADD(hour, 7, GETDATE())), 300000, 34, 'Scheduled'),
(2, N'TPHCM', N'Nha Trang', DATEADD(day, 2, GETDATE()), DATEADD(day, 2, DATEADD(hour, 8, GETDATE())), 250000, 40, 'Scheduled');
GO
