const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ===== API Routes =====
app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/admin", require("./src/routes/admin"));
app.use("/api/seats", require("./src/routes/seats"));
app.use("/api", require("./src/routes/api"));

// ===== Serve Frontend =====
// phục vụ file tĩnh từ thư mục frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// route trang chủ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`Server running at: http://localhost:${PORT}`);
});
