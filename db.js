const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

module.exports = pool;

pool.connect()
  .then(() => console.log("Database connected"))
  .catch(err => {
    console.error("DB connection error:", err);
    process.exit(1);
  });