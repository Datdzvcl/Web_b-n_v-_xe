-- Run this script in SQL Server Management Studio (SSMS) 
-- Ensure you are using the correct database
-- USE VeXeAZ_DB;
-- GO

-- 1. Insert more Operators
INSERT INTO Operators (Name, Description, ContactPhone, Email)
VALUES 
(N'Hải Vân', N'Chất lượng Limousine hàng đầu miền Bắc', '19006763', 'contact@haivan.com'),
(N'Sao Việt', N'Xe giường nằm cao cấp tuyến HN - Sapa', '19006746', 'info@saoviet.com'),
(N'Hoàng Long', N'Bắc Nam, An toàn là bạn', '02253920920', 'hoanglong@xekhach.com');
GO

-- 2. Insert more Buses for the existing and new operators
-- Note: Assuming previous ID max was 2. If you start fresh, IDs may vary.
-- We will use subqueries to find OperatorID by name dynamically.
INSERT INTO Buses (OperatorID, LicensePlate, Capacity, BusType)
VALUES 
((SELECT OperatorID FROM Operators WHERE Name = N'Phương Trang'), '51F-11223', 34, N'Giường nằm 34 chỗ'),
((SELECT OperatorID FROM Operators WHERE Name = N'Thành Bưởi'), '51G-44556', 22, N'Limousine Phòng 22 chỗ'),
((SELECT OperatorID FROM Operators WHERE Name = N'Hải Vân'), '29B-99887', 34, N'Limousine VIP 34 chỗ'),
((SELECT OperatorID FROM Operators WHERE Name = N'Sao Việt'), '24B-66778', 40, N'Giường nằm 40 chỗ');
GO

-- 3. Insert more Trips
INSERT INTO Trips (BusID, DepartureLocation, ArrivalLocation, DepartureTime, ArrivalTime, Price, AvailableSeats, Status)
VALUES 
-- Phương Trang (BusID dynamic lookup)
((SELECT TOP 1 BusID FROM Buses WHERE LicensePlate = '51F-11223'), N'TPHCM', N'Cần Thơ', DATEADD(day, 1, GETDATE()), DATEADD(day, 1, DATEADD(hour, 4, GETDATE())), 165000, 34, 'Scheduled'),
((SELECT TOP 1 BusID FROM Buses WHERE LicensePlate = '51F-11223'), N'TPHCM', N'Đà Lạt', DATEADD(day, 2, GETDATE()), DATEADD(day, 2, DATEADD(hour, 8, GETDATE())), 300000, 34, 'Scheduled'),

-- Thành Bưởi
((SELECT TOP 1 BusID FROM Buses WHERE LicensePlate = '51G-44556'), N'TPHCM', N'Đà Lạt', DATEADD(day, 1, GETDATE()), DATEADD(day, 1, DATEADD(hour, 6, GETDATE())), 420000, 22, 'Scheduled'),

-- Hải Vân
((SELECT TOP 1 BusID FROM Buses WHERE LicensePlate = '29B-99887'), N'Hà Nội', N'Sapa', DATEADD(day, 1, GETDATE()), DATEADD(day, 1, DATEADD(hour, 6, GETDATE())), 350000, 34, 'Scheduled'),

-- Sao Việt
((SELECT TOP 1 BusID FROM Buses WHERE LicensePlate = '24B-66778'), N'Hà Nội', N'Sapa', DATEADD(day, 3, GETDATE()), DATEADD(day, 3, DATEADD(hour, 6, GETDATE())), 280000, 40, 'Scheduled');
GO

-- 4. Insert some Mock Bookings (To show up on Dashboard)
-- Select a valid TripID dynamically
DECLARE @Trip1 INT = (SELECT TOP 1 TripID FROM Trips WHERE ArrivalLocation = N'Đà Lạt' AND Price = 300000);
DECLARE @Trip2 INT = (SELECT TOP 1 TripID FROM Trips WHERE ArrivalLocation = N'Sapa' AND Price = 350000);

IF @Trip1 IS NOT NULL
BEGIN
    INSERT INTO Bookings (TripID, UserID, CustomerName, CustomerPhone, TotalSeats, TotalPrice, PaymentStatus, BookingDate)
    VALUES 
    (@Trip1, NULL, N'Đinh Văn E', '0911223344', 2, 600000, 'Paid', DATEADD(day, -1, GETDATE())),
    (@Trip1, NULL, N'Phan Thị F', '0988776655', 1, 300000, 'Pending', GETDATE());
END

IF @Trip2 IS NOT NULL
BEGIN
    INSERT INTO Bookings (TripID, UserID, CustomerName, CustomerPhone, TotalSeats, TotalPrice, PaymentStatus, BookingDate)
    VALUES 
    (@Trip2, NULL, N'Hoàng Trọng G', '0901020304', 3, 1050000, 'Paid', DATEADD(hour, -5, GETDATE()));
END
GO
