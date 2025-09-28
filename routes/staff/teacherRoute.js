const express = require("express");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { adminRegisterTeacher, teacherLogin, fetchAllTeachersAdmin, fetchTeacherAdmin, fetchTeacherProfile, updateTeacherCtrl, adminUpdateTeacherCtrl } = require("../../controller/staff/teacherCtrl");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");


const teacherRoute = express.Router();

teacherRoute.post("/admin/register", isLoggedIn, isAdmin, adminRegisterTeacher);
teacherRoute.post("/login", teacherLogin);
teacherRoute.get("/admin", isLoggedIn, isAdmin, fetchAllTeachersAdmin);
teacherRoute.get("/profile", isTeacherLogin, isTeacher, fetchTeacherProfile);
teacherRoute.get("/:teacherID/admin", isLoggedIn, isAdmin, fetchTeacherAdmin);
teacherRoute.put("/:teacherID/update/profile", isTeacherLogin, isTeacher, updateTeacherCtrl);
teacherRoute.put("/:teacherID/update/admin", isLoggedIn, isAdmin, adminUpdateTeacherCtrl);


module.exports = teacherRoute