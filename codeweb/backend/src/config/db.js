const sql = require("mssql/msnodesqlv8");
require("dotenv").config();

const config = {
  connectionString: process.env.DB_CONNECTION_STRING,
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log("Connected to SQL Server with Windows Authentication!");
    return pool;
  })
  .catch((err) => {
    console.error("Database Connection Failed:", err);
    return null;
  });

module.exports = {
  sql,
  poolPromise,
};
