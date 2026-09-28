const express = require("express");
const {
  markAttendanceCtrl,
  getAttendanceByDateCtrl,
  getTeacherAttendanceHistoryCtrl,
  getAttendanceStatsCtrl,
  deleteAttendanceCtrl,
} = require("../../controller/academic/attendanceCtrl");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");

const attendanceRouter = express.Router();

// Attendance endpoints protected by Teacher login & role
attendanceRouter.post("/mark", isTeacherLogin, isTeacher, markAttendanceCtrl);
attendanceRouter.get("/date", isTeacherLogin, isTeacher, getAttendanceByDateCtrl);
attendanceRouter.get("/history", isTeacherLogin, isTeacher, getTeacherAttendanceHistoryCtrl);
attendanceRouter.get("/stats", isTeacherLogin, isTeacher, getAttendanceStatsCtrl);
attendanceRouter.delete("/:id", isTeacherLogin, isTeacher, deleteAttendanceCtrl);

module.exports = attendanceRouter;
