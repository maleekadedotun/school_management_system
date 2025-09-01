const express = require("express");
const morgan = require("morgan");
const adminRouter = require("../routes/staff/adminRouter");

const app = express();
// middlewares
app.use(morgan("dev"))
app.use(express.json())

// routes
app.use("/api/v1/admin", adminRouter)

module.exports = app;