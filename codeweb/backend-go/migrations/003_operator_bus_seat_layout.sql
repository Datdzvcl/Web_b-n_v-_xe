/* Chạy sau 001_operator_driver_flow.sql.
   Mục tiêu: lưu sơ đồ ghế vật lý cho từng xe của nhà xe. */

IF OBJECT_ID('dbo.BusSeats', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BusSeats (
        SeatID INT IDENTITY(1,1) PRIMARY KEY,
        BusID INT NOT NULL,
        SeatLabel VARCHAR(20) NOT NULL,
        SeatRow INT NOT NULL,
        SeatColumn INT NOT NULL,
        Deck NVARCHAR(30) NOT NULL DEFAULT N'Tầng chính',
        SeatType NVARCHAR(30) NOT NULL DEFAULT N'Ghế',
        Status VARCHAR(20) NOT NULL DEFAULT 'Active',
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_BusSeats_Buses FOREIGN KEY (BusID) REFERENCES dbo.Buses(BusID),
        CONSTRAINT UQ_BusSeats_Bus_Label UNIQUE (BusID, SeatLabel),
        CONSTRAINT CK_BusSeats_Status CHECK (Status IN ('Active', 'Blocked')),
        CONSTRAINT CK_BusSeats_Position CHECK (SeatRow > 0 AND SeatColumn > 0)
    );
END;
