const express = require("express");
const isTeacher = require("../../middlewares/isTeacher");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isAdmin = require("../../middlewares/isAdmin");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");

const {
  createExamCtrl,
  fetchAllExamsCtrl,
  fetchExamCtrl,
  updateExamCtrl,
  deleteExamCtrl,
  getAllTeacherExamsAdminCtrl,
} = require("../../controller/academic/examCtrl");

const {
  adminPublishExamResultCtrl,
  adminUnPublishExamResultCtrl,
} = require("../../controller/staff/adminCtrl");

const {
  getAllExamResultsAdminCtrl,
  adminToggleExamResult,
} = require("../../controller/academic/examResultsCtrl");

const ExamRouter = express.Router();

// 1. Admin: View all exams created by each teacher (filtered by date, teacherId, teacher name)
ExamRouter.get("/admin/teacher-exams", isAuthenticated(Admin), isAdmin, getAllTeacherExamsAdminCtrl);

// 2. Admin: Access all student exam results in the school
ExamRouter.get("/admin/results", isAuthenticated(Admin), isAdmin, getAllExamResultsAdminCtrl);

// 3. Admin: Publish / Unpublish student exam results
ExamRouter.put("/:id/publish", isAuthenticated(Admin), isAdmin, adminPublishExamResultCtrl);
ExamRouter.put("/:id/unpublish", isAuthenticated(Admin), isAdmin, adminUnPublishExamResultCtrl);
ExamRouter.put("/publish/:id", isAuthenticated(Admin), isAdmin, adminPublishExamResultCtrl);
ExamRouter.put("/unpublish/:id", isAuthenticated(Admin), isAdmin, adminUnPublishExamResultCtrl);
ExamRouter.put("/:id/admin-toggle-publish", isAuthenticated(Admin), isAdmin, adminToggleExamResult);

// Exam general routes
ExamRouter.route("/").post(isTeacherLogin, isTeacher, createExamCtrl);
ExamRouter.route("/").get(fetchAllExamsCtrl);
ExamRouter.route("/:id").get(fetchExamCtrl);
ExamRouter.route("/:id").delete(isTeacherLogin, isTeacher, deleteExamCtrl);
ExamRouter.route("/:id/update/teacher").put(isTeacherLogin, isTeacher, updateExamCtrl);

module.exports = ExamRouter;
