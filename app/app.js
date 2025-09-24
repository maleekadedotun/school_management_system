const express = require("express");
const morgan = require("morgan");
const adminRouter = require("../routes/staff/adminRouter");
const {globalErrorHandler, notFoundErr} = require("../middlewares/globalErrorHandler");
const academicYearRouter = require("../routes/academic/academicYearRouter");
const academicTermRouter = require("../routes/academic/academicTermRouter");
const classLevelRouter = require("../routes/academic/classLevelRouter");
const programRouter = require("../routes/academic/programRouter");
const subjectRouter = require("../routes/academic/subjectRouter");
const yearGroupRouter = require("../routes/academic/yearGroupRouter");
// const academicTermRouter = require("../routes/academic/academicTermRouter");

const app = express();
// middlewares
app.use(morgan("dev"));
app.use(express.json());

// app.use((req, res, next) =>{
//     console.log(`${req.method} & ${req.originalUrl}`);
//     next();  
// });

// let user = {
//     name: "john Doe",
//     isLogin: true,
//     isAdmin: true,
// }

// const isLogin = (req, res, next) =>{
//     if (user.isLogin) {
//         next()
//     } else {
//       res.status(401).json({message: "Unauthorized"})  
//     }
// }

// const isAdmin = (req, res, next) =>{
//     if (user.isAdmin) {
//         next()
//     } else {
//       res.status(401).json({message: "Unauthorized you are not an Admin"})  
//     }
// }

// app.use(isLogin, isAdmin)
// routes
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/academic-years", academicYearRouter);
app.use("/api/v1/academic-terms", academicTermRouter);
app.use("/api/v1/class-levels", classLevelRouter);
app.use("/api/v1/programs", programRouter);
app.use("/api/v1/subjects", subjectRouter);
app.use("/api/v1/years-group", yearGroupRouter);

// error middleware
app.use(notFoundErr)
app.use(globalErrorHandler)

module.exports = app;