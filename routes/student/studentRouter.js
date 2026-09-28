const express = require("express");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const {
  adminRegisterStudent,
  studentLogin,
  studentForgotPasswordCtrl,
  studentResetPasswordCtrl,
  fetchStudentProfile,
  fetchAllStudentsAdmin,
  fetchStudentAdmin,
  updateStudentCtrl,
  adminUpdateStudentCtrl,
  studentWriteExamCtrl,
  fetchTeacherClassStudentsCtrl,
  fetchStudentEnrolledSubjectsCtrl,
  studentEnrollSubjectCtrl,
  studentUnenrollSubjectCtrl,
  fetchStudentClassExamsCtrl
} = require("../../controller/student/studentCtrl");
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
studentRoute.post("/forgot-password", studentForgotPasswordCtrl);
studentRoute.post("/reset-password", studentResetPasswordCtrl);
studentRoute.post("/reset-password/:token", studentResetPasswordCtrl);
studentRoute.get("/teacher", isTeacherLogin, isTeacher, fetchTeacherClassStudentsCtrl);
studentRoute.get("/teacher/class-students", isTeacherLogin, isTeacher, fetchTeacherClassStudentsCtrl);
studentRoute.get("/admin", isAuthenticated(Admin), roleRestriction("admin"), fetchAllStudentsAdmin);
studentRoute.get("/:studentID/admin", isAuthenticated(Admin), roleRestriction("admin"), fetchStudentAdmin);
studentRoute.route("/profile")
  .get(isAuthenticated(Student), roleRestriction("student"), fetchStudentProfile)
  .put(isAuthenticated(Student), roleRestriction("student"), fetchStudentProfile);

// Enrolled subjects from 100L to Final
studentRoute.get("/enrolled-subjects", isAuthenticated(Student), roleRestriction("student"), fetchStudentEnrolledSubjectsCtrl);
studentRoute.post("/enroll-subject", isAuthenticated(Student), roleRestriction("student"), studentEnrollSubjectCtrl);
studentRoute.delete("/unenroll-subject/:subjectId", isAuthenticated(Student), roleRestriction("student"), studentUnenrollSubjectCtrl);

// Student Exams (filtered by class, offered subject, assigned teacher)
studentRoute.get("/exams", isAuthenticated(Student), roleRestriction("student"), fetchStudentClassExamsCtrl);
studentRoute.post("/exams/:examID/write", isAuthenticated(Student), roleRestriction("student"), studentWriteExamCtrl);
studentRoute.post("/write-exam/:examID", isAuthenticated(Student), roleRestriction("student"), studentWriteExamCtrl);

studentRoute.put("/update", isAuthenticated(Student), roleRestriction("student"), updateStudentCtrl);
studentRoute.put("/update/", isAuthenticated(Student), roleRestriction("student"), updateStudentCtrl);
studentRoute.put("/:studentID/update/admin", isAuthenticated(Admin), roleRestriction("admin"), adminUpdateStudentCtrl);



module.exports = studentRoute;