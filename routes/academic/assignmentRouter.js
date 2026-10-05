const express = require("express");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const isStudentLogin = require("../../middlewares/isStudentLogin");
const isStudent = require("../../middlewares/isStudent");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");

const {
  createAssignmentCtrl,
  getAllAssignmentsCtrl,
  getAssignmentByIdCtrl,
  updateAssignmentCtrl,
  deleteAssignmentCtrl,
  submitAssignmentCtrl,
  getAssignmentSubmissionsCtrl,
  gradeSubmissionCtrl,
  getStudentSubmissionsCtrl,
  publishAssignmentCtrl,
  getTeacherAssignmentsCtrl,
  getStudentAssignmentsCtrl,
} = require("../../controller/academic/assignmentCtrl");

const assignmentRouter = express.Router();

// Student specific routes
assignmentRouter.get("/student/my-submissions", isStudentLogin, isStudent, getStudentSubmissionsCtrl);
assignmentRouter.get("/student", isStudentLogin, isStudent, getStudentAssignmentsCtrl);
assignmentRouter.post("/:id/submit", isStudentLogin, isStudent, submitAssignmentCtrl);

// Teacher specific routes
assignmentRouter.get("/teacher", isTeacherLogin, isTeacher, getTeacherAssignmentsCtrl);
assignmentRouter.patch("/:id/publish", isTeacherLogin, isTeacher, publishAssignmentCtrl);
assignmentRouter.get("/:id/submissions", isTeacherLogin, isTeacher, getAssignmentSubmissionsCtrl);
assignmentRouter.put("/submissions/:submissionId/grade", isTeacherLogin, isTeacher, gradeSubmissionCtrl);

// Base CRUD routes
assignmentRouter
  .route("/")
  .post(isTeacherLogin, isTeacher, createAssignmentCtrl)
  .get(isAnyUserAuth, getAllAssignmentsCtrl);

assignmentRouter
  .route("/:id")
  .get(isAnyUserAuth, getAssignmentByIdCtrl)
  .put(isTeacherLogin, isTeacher, updateAssignmentCtrl)
  .delete(isTeacherLogin, isTeacher, deleteAssignmentCtrl);

module.exports = assignmentRouter;
