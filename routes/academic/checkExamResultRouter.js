const express = require("express");
const {
  checkExamResultsCtrl,
  fetchExamResultsCtrl,
  adminToggleExamResult,
  getAllExamResultsAdminCtrl,
  getStudentResultsAdminCtrl,
  fetchTeacherClassResultsCtrl,
  teacherEnterExamResultCtrl,
  teacherTogglePublishResultCtrl,
} = require("../../controller/academic/examResultsCtrl");
const isStudentLogin = require("../../middlewares/isStudentLogin");
const isStudent = require("../../middlewares/isStudent");
const isAdmin = require("../../middlewares/isAdmin");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const Admin = require("../../models/Staff/admin");

const checkExamResultsRouter = express.Router();

checkExamResultsRouter.get("/admin", isAuthenticated(Admin), isAdmin, getAllExamResultsAdminCtrl);
checkExamResultsRouter.get("/admin/student/:studentId", isAuthenticated(Admin), isAdmin, getStudentResultsAdminCtrl);
checkExamResultsRouter.get("/teacher/student/:studentId", isTeacherLogin, isTeacher, getStudentResultsAdminCtrl);
checkExamResultsRouter.get("/teacher/class-results", isTeacherLogin, isTeacher, fetchTeacherClassResultsCtrl);
checkExamResultsRouter.post("/teacher/enter-result", isTeacherLogin, isTeacher, teacherEnterExamResultCtrl);
checkExamResultsRouter.post("/admin/enter-result", isAuthenticated(Admin), isAdmin, teacherEnterExamResultCtrl);
checkExamResultsRouter.put("/:id/teacher-toggle-publish", isTeacherLogin, isTeacher, teacherTogglePublishResultCtrl);
checkExamResultsRouter.post("/:id/teacher-toggle-publish", isTeacherLogin, isTeacher, teacherTogglePublishResultCtrl);
checkExamResultsRouter.put("/teacher/publish/:id", isTeacherLogin, isTeacher, teacherTogglePublishResultCtrl);
checkExamResultsRouter.get("/", isStudentLogin, isStudent, fetchExamResultsCtrl);
checkExamResultsRouter.get("/:id/checking", isStudentLogin, isStudent, checkExamResultsCtrl);
checkExamResultsRouter.put("/:id/admin-toggle-publish", isAuthenticated(Admin), isAdmin, adminToggleExamResult);
checkExamResultsRouter.post("/:id/admin-toggle-publish", isAuthenticated(Admin), isAdmin, adminToggleExamResult);
checkExamResultsRouter.put("/:id/publish", isAuthenticated(Admin), isAdmin, adminToggleExamResult);
checkExamResultsRouter.post("/:id/publish", isAuthenticated(Admin), isAdmin, adminToggleExamResult);
checkExamResultsRouter.put("/publish/:id", isAuthenticated(Admin), isAdmin, adminToggleExamResult);

module.exports = checkExamResultsRouter;