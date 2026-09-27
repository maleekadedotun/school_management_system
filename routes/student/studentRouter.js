const express = require("express");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { adminRegisterStudent, studentLogin, fetchStudentProfile, fetchAllStudentsAdmin, fetchStudentAdmin, updateStudentCtrl, adminUpdateStudentCtrl, studentWriteExamCtrl, fetchTeacherClassStudentsCtrl } = require("../../controller/student/studentCtrl");
const isStudentLogin = require("../../middlewares/isStudentLogin");
const isStudent = require("../../middlewares/isStudent");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const roleRestriction = require("../../middlewares/roleRestriction");
const Student = require("../../models/Academy/Student");

const studentRoute = express.Router();

studentRoute.post("/admin/register", isAuthenticated(Admin), isAdmin, adminRegisterStudent);
studentRoute.post("/login", studentLogin);
studentRoute.get("/teacher", isTeacherLogin, isTeacher, fetchTeacherClassStudentsCtrl);
studentRoute.get("/teacher/class-students", isTeacherLogin, isTeacher, fetchTeacherClassStudentsCtrl);
studentRoute.get("/admin", isAuthenticated(Admin), roleRestriction("admin"), fetchAllStudentsAdmin);
studentRoute.get("/:studentID/admin", isAuthenticated(Admin), roleRestriction("admin"), fetchStudentAdmin);
studentRoute.post("/exams/:examID/write", isAuthenticated(Student), roleRestriction("student"), studentWriteExamCtrl);
studentRoute.put("/profile", isAuthenticated(Student), roleRestriction("student"), fetchStudentProfile);
studentRoute.put("/update/", isAuthenticated(Student), roleRestriction("student"), updateStudentCtrl);
studentRoute.put("/:studentID/update/admin", isAuthenticated(Admin), roleRestriction("admin"), adminUpdateStudentCtrl);



module.exports = studentRoute;