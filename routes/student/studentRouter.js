const express = require("express");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { adminRegisterStudent, studentLogin, fetchStudentProfile, fetchAllStudentsAdmin, fetchStudentAdmin, updateStudentCtrl } = require("../../controller/student/studentCtrl");
const isStudentLogin = require("../../middlewares/isStudentLogin");
const isStudent = require("../../middlewares/isStudent");



const studentRoute = express.Router();

studentRoute.post("/admin/register", isLoggedIn, isAdmin, adminRegisterStudent);
studentRoute.post("/login", studentLogin);
studentRoute.get("/admin", isLoggedIn, isAdmin, fetchAllStudentsAdmin);
studentRoute.get("/:studentID/admin", isLoggedIn, isAdmin, fetchStudentAdmin);
studentRoute.put("/profile", isStudentLogin, isStudent, fetchStudentProfile);
studentRoute.put("/update/", isStudentLogin, isStudent, updateStudentCtrl);



module.exports = studentRoute