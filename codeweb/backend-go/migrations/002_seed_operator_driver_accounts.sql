/* Seed tai khoan mau cho nha xe va tai xe.
   Chay sau 001_operator_driver_flow.sql.
   Mat khau mac dinh:
   - Operator: operator123
   - Driver: driver123
*/

IF NOT EXISTS (SELECT 1 FROM dbo.Operators WHERE Name = N'Futa Buslines')
BEGIN
    INSERT INTO dbo.Operators (Name, Description, ContactPhone, Email)
    VALUES (N'Futa Buslines', N'Dich vu xe khach Futa Buslines', '19006067', 'futabuslines@futa.vn');
END;

DECLARE @OperatorSeed TABLE (
    OperatorName NVARCHAR(100) NOT NULL,
    FullName NVARCHAR(100) NOT NULL,
    Email VARCHAR(100) NOT NULL,
    Phone VARCHAR(20) NOT NULL
);

INSERT INTO @OperatorSeed (OperatorName, FullName, Email, Phone)
VALUES
    (N'Phương Trang', N'Tai khoan nha xe Phuong Trang', 'operator.phuongtrang@gmail.com', 'OP-PHUONGTRANG'),
    (N'Thành Bưởi', N'Tai khoan nha xe Thanh Buoi', 'operator.thanhbuoi@gmail.com', 'OP-THANHBUOI'),
    (N'Futa Buslines', N'Tai khoan nha xe Futa Buslines', 'operator.futabuslines@gmail.com', 'OP-FUTABUS');

INSERT INTO dbo.Users (FullName, Email, Phone, PasswordHash, Role)
SELECT s.FullName, s.Email, s.Phone, 'operator123', 'Operator'
FROM @OperatorSeed s
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.Users u
    WHERE u.Email = s.Email
);

UPDATE u
SET Role = 'Operator'
FROM dbo.Users u
JOIN @OperatorSeed s ON s.Email = u.Email
WHERE u.Role <> 'Operator';

UPDATE ou
SET OperatorID = op.OperatorID
FROM dbo.OperatorUsers ou
JOIN dbo.Users u ON u.UserID = ou.UserID
JOIN @OperatorSeed s ON s.Email = u.Email
CROSS APPLY (
    SELECT TOP 1 o.OperatorID
    FROM dbo.Operators o
    WHERE o.Name = s.OperatorName
    ORDER BY o.OperatorID
) op;

INSERT INTO dbo.OperatorUsers (OperatorID, UserID)
SELECT op.OperatorID, u.UserID
FROM @OperatorSeed s
JOIN dbo.Users u ON u.Email = s.Email
CROSS APPLY (
    SELECT TOP 1 o.OperatorID
    FROM dbo.Operators o
    WHERE o.Name = s.OperatorName
    ORDER BY o.OperatorID
) op
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.OperatorUsers ou
    WHERE ou.UserID = u.UserID
);

DECLARE @DriverSeed TABLE (
    OperatorName NVARCHAR(100) NOT NULL,
    FullName NVARCHAR(100) NOT NULL,
    Email VARCHAR(100) NOT NULL,
    Phone VARCHAR(20) NOT NULL,
    LicenseNumber VARCHAR(50) NOT NULL
);

INSERT INTO @DriverSeed (OperatorName, FullName, Email, Phone, LicenseNumber)
VALUES
    (N'Phương Trang', N'Tai xe Phuong Trang 01', 'driver.phuongtrang1@gmail.com', 'DRV-PT-01', 'GPLX-PT-001'),
    (N'Thành Bưởi', N'Tai xe Thanh Buoi 01', 'driver.thanhbuoi1@gmail.com', 'DRV-TB-01', 'GPLX-TB-001'),
    (N'Futa Buslines', N'Tai xe Futa Buslines 01', 'driver.futabuslines1@gmail.com', 'DRV-FUTA-01', 'GPLX-FUTA-001');

INSERT INTO dbo.Users (FullName, Email, Phone, PasswordHash, Role)
SELECT s.FullName, s.Email, s.Phone, 'driver123', 'Driver'
FROM @DriverSeed s
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.Users u
    WHERE u.Email = s.Email
);

UPDATE u
SET Role = 'Driver'
FROM dbo.Users u
JOIN @DriverSeed s ON s.Email = u.Email
WHERE u.Role <> 'Driver';

UPDATE d
SET OperatorID = op.OperatorID,
    LicenseNumber = s.LicenseNumber,
    Status = 'Active'
FROM dbo.Drivers d
JOIN dbo.Users u ON u.UserID = d.UserID
JOIN @DriverSeed s ON s.Email = u.Email
CROSS APPLY (
    SELECT TOP 1 o.OperatorID
    FROM dbo.Operators o
    WHERE o.Name = s.OperatorName
    ORDER BY o.OperatorID
) op;

INSERT INTO dbo.Drivers (UserID, OperatorID, LicenseNumber, Status)
SELECT u.UserID, op.OperatorID, s.LicenseNumber, 'Active'
FROM @DriverSeed s
JOIN dbo.Users u ON u.Email = s.Email
CROSS APPLY (
    SELECT TOP 1 o.OperatorID
    FROM dbo.Operators o
    WHERE o.Name = s.OperatorName
    ORDER BY o.OperatorID
) op
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.Drivers d
    WHERE d.UserID = u.UserID
);
