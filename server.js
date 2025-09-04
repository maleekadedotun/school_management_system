const http = require("http")
require("dotenv").config()
const dbConnect = require("./config/dbConnect")
const app = require("./app/app")
const PORT = process.env.PORT || 2020
//==middleware=====
// app.use(morgan("dev"))

const server = http.createServer(app)
server.listen(PORT, console.log(`server is running on port ${PORT}`))




// sch-management-password