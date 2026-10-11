const express = require("express");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const roleRestriction = require("../../middlewares/roleRestriction");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isStudentLogin = require("../../middlewares/isStudentLogin");
const Admin = require("../../models/Staff/admin");

const {
  createTimetableCtrl,
  getAllTimetablesCtrl,
  getSingleTimetableCtrl,
  updateTimetableCtrl,
  deleteTimetableCtrl,
  getTeacherTimetableCtrl,
  getStudentTimetableCtrl,
  publishTimetableCtrl,
} = require("../../controller/academic/timetableCtrl");

const timetableRouter = express.Router();

// Student personalized timetable (filtered to student's program, class & offered subjects only)
timetableRouter.get("/student/my-timetable", isStudentLogin, getStudentTimetableCtrl);

// Teacher timetable (shows teacher's own schedule & all subjects for selected class)
timetableRouter.get("/teacher/schedule", isTeacherLogin, getTeacherTimetableCtrl);

// Admin Timetable Management CRUD
timetableRouter.post(
  "/",
  isAuthenticated(Admin),
  roleRestriction("admin"),
  createTimetableCtrl
);

// Publish or unpublish timetable school-wide
timetableRouter.put(
  "/publish",
  isAuthenticated(Admin),
  roleRestriction("admin"),
  publishTimetableCtrl
);

timetableRouter.get("/", isAnyUserAuth, getAllTimetablesCtrl);
timetableRouter.get("/:id", isAnyUserAuth, getSingleTimetableCtrl);

timetableRouter.put(
  "/:id",
  isAuthenticated(Admin),
  roleRestriction("admin"),
  updateTimetableCtrl
);

timetableRouter.delete(
  "/:id",
  isAuthenticated(Admin),
  roleRestriction("admin"),
  deleteTimetableCtrl
);

module.exports = timetableRouter;
