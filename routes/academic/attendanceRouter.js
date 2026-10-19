const express = require("express");
const {
  markAttendanceCtrl,
  getAttendanceByDateCtrl,
  getTeacherAttendanceHistoryCtrl,
  getAttendanceStatsCtrl,
  deleteAttendanceCtrl,
  getStudentAttendanceSummaryCtrl,
  getParentChildAttendanceSummaryCtrl,
} = require("../../controller/academic/attendanceCtrl");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");
const roleRestriction = require("../../middlewares/roleRestriction");

const attendanceRouter = express.Router();

// 1. Attendance MANAGEMENT (Exclusively in Teacher Portal)
attendanceRouter.post("/mark", isTeacherLogin, isTeacher, markAttendanceCtrl);
attendanceRouter.delete("/:id", isTeacherLogin, isTeacher, deleteAttendanceCtrl);
attendanceRouter.get("/date", isTeacherLogin, isTeacher, getAttendanceByDateCtrl);
attendanceRouter.get("/history", isTeacherLogin, isTeacher, getTeacherAttendanceHistoryCtrl);
attendanceRouter.get("/stats", isTeacherLogin, isTeacher, getAttendanceStatsCtrl);

// 2. READ-ONLY Attendance Summaries for Students & Parents
attendanceRouter.get(
  "/student/my-attendance",
  isAnyUserAuth,
  roleRestriction("student", "admin"),
  getStudentAttendanceSummaryCtrl
);

attendanceRouter.get(
  "/parent/child-attendance",
  isAnyUserAuth,
  roleRestriction("parent", "admin"),
  getParentChildAttendanceSummaryCtrl
);

module.exports = attendanceRouter;
