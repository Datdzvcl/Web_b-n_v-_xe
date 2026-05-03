/* Chạy file này trên database QLBanVeXe trước khi chạy Go API.
   Mục tiêu: thêm quan hệ user-nhà xe, hồ sơ tài xế và gán tài xế vào chuyến. */

DECLARE @constraintName SYSNAME;
DECLARE @dropConstraintSql NVARCHAR(MAX);

SELECT @constraintName = cc.name
FROM sys.check_constraints cc
JOIN sys.columns c ON c.object_id = cc.parent_object_id
WHERE cc.parent_object_id = OBJECT_ID('dbo.Users')
  AND c.name = 'Role'
  AND cc.definition LIKE '%Customer%'
  AND cc.definition LIKE '%Admin%'
  AND cc.definition LIKE '%Operator%';

IF @constraintName IS NOT NULL
BEGIN
    SET @dropConstraintSql = N'ALTER TABLE dbo.Users DROP CONSTRAINT ' + QUOTENAME(@constraintName);
    EXEC sp_executesql @dropConstraintSql;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Users_Role_Extended'
      AND parent_object_id = OBJECT_ID('dbo.Users')
)
BEGIN
    ALTER TABLE dbo.Users
    ADD CONSTRAINT CK_Users_Role_Extended
    CHECK (Role IN ('Customer', 'Admin', 'Operator', 'Driver'));
END;

IF OBJECT_ID('dbo.OperatorUsers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.OperatorUsers (
        OperatorUserID INT IDENTITY(1,1) PRIMARY KEY,
        OperatorID INT NOT NULL,
        UserID INT NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_OperatorUsers_Operators FOREIGN KEY (OperatorID) REFERENCES dbo.Operators(OperatorID),
        CONSTRAINT FK_OperatorUsers_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT UQ_OperatorUsers_User UNIQUE (UserID)
    );
END;

IF OBJECT_ID('dbo.Drivers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Drivers (
        DriverID INT IDENTITY(1,1) PRIMARY KEY,
        UserID INT NOT NULL,
        OperatorID INT NOT NULL,
        LicenseNumber VARCHAR(50) NOT NULL,
        Status VARCHAR(20) NOT NULL DEFAULT 'Active',
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_Drivers_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT FK_Drivers_Operators FOREIGN KEY (OperatorID) REFERENCES dbo.Operators(OperatorID),
        CONSTRAINT UQ_Drivers_User UNIQUE (UserID),
        CONSTRAINT CK_Drivers_Status CHECK (Status IN ('Active', 'Inactive'))
    );
END;

IF COL_LENGTH('dbo.Trips', 'DriverID') IS NULL
BEGIN
    ALTER TABLE dbo.Trips ADD DriverID INT NULL;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_Trips_Drivers'
      AND parent_object_id = OBJECT_ID('dbo.Trips')
)
BEGIN
    ALTER TABLE dbo.Trips
    ADD CONSTRAINT FK_Trips_Drivers FOREIGN KEY (DriverID) REFERENCES dbo.Drivers(DriverID);
END;

/* Ví dụ gán tài khoản Operator hiện có với nhà xe:
   UPDATE dbo.Users SET Role = 'Operator' WHERE Email = 'operator@gmail.com';
   INSERT INTO dbo.OperatorUsers (OperatorID, UserID)
   SELECT 1, UserID FROM dbo.Users WHERE Email = 'operator@gmail.com';
*/
