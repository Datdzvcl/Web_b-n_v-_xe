# Go API cho luồng nhà xe và tài xế

Backend Go này chạy song song với backend Node hiện tại, dùng chung SQL Server và `JWT_SECRET`.

## Chạy migration

Chạy lần lượt 2 file:

```sql
codeweb/backend-go/migrations/001_operator_driver_flow.sql
codeweb/backend-go/migrations/002_seed_operator_driver_accounts.sql
codeweb/backend-go/migrations/003_operator_bus_seat_layout.sql
```

File `001` tạo quan hệ user-nhà xe và hồ sơ tài xế. File `002` thêm tài khoản mẫu cho các nhà xe trong bộ lọc và tài xế tương ứng.

Tài khoản nhà xe:

```text
operator.phuongtrang@gmail.com / operator123
operator.thanhbuoi@gmail.com / operator123
operator.futabuslines@gmail.com / operator123
```

Tài khoản tài xế:

```text
driver.phuongtrang1@gmail.com / driver123
driver.thanhbuoi1@gmail.com / driver123
driver.futabuslines1@gmail.com / driver123
```

## Chạy API

```bash
cd codeweb/backend-go
go mod tidy
go run .
```

Mặc định chạy ở `http://localhost:8080`. Có thể đổi bằng biến `GO_PORT`.

## Endpoint chính

- `GET /api/go/operator/dashboard`
- `GET /api/go/operator/trips`
- `POST /api/go/operator/trips`
- `PUT /api/go/operator/trips/{id}/assign-driver`
- `GET /api/go/operator/bookings`
- `GET /api/go/operator/buses`
- `POST /api/go/operator/buses`
- `GET /api/go/operator/buses/{id}/seats`
- `PUT /api/go/operator/buses/{id}/seats`
- `GET /api/go/operator/drivers`
- `POST /api/go/operator/drivers`
- `GET /api/go/driver/trips`
- `PUT /api/go/driver/trips/{id}/status`

Header auth dùng token đăng nhập hiện tại:

```http
Authorization: Bearer <token>
```

## Giao diện thao tác

- Nhà xe: `http://localhost:5000/operator.html`
- Tài xế: `http://localhost:5000/driver.html`

Sau khi login ở `login.html`, hệ thống tự chuyển:

- `Admin` -> `admin/index.html`
- `Operator` -> `operator.html`
- `Driver` -> `driver.html`
