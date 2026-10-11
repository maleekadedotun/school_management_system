const express = require("express");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const roleRestriction = require("../../middlewares/roleRestriction");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");
const isStudentLogin = require("../../middlewares/isStudentLogin");
const isStudent = require("../../middlewares/isStudent");

const Teacher = require("../../models/Staff/Teacher");
const Admin = require("../../models/Staff/admin");

const {
  createLessonNoteCtrl,
  getTeacherLessonNotesCtrl,
  getAdminLessonNotesCtrl,
  getLessonNoteByIdCtrl,
  updateLessonNoteCtrl,
  submitForReviewCtrl,
  reviewLessonNoteCtrl,
  sendToStudentsCtrl,
  getStudentLessonNotesCtrl,
  deleteLessonNoteCtrl,
} = require("../../controller/academic/lessonNoteCtrl");

const lessonNoteRouter = express.Router();

// Teacher routes
lessonNoteRouter.post(
  "/",
  isAuthenticated(Teacher),
  roleRestriction("teacher"),
  createLessonNoteCtrl
);

lessonNoteRouter.get(
  "/teacher",
  isAuthenticated(Teacher),
  roleRestriction("teacher"),
  getTeacherLessonNotesCtrl
);

lessonNoteRouter.patch(
  "/:id/submit-for-review",
  isAuthenticated(Teacher),
  roleRestriction("teacher"),
  submitForReviewCtrl
);

lessonNoteRouter.patch(
  "/:id/send-to-students",
  isAnyUserAuth,
  sendToStudentsCtrl
);

// Admin review routes
lessonNoteRouter.get(
  "/admin",
  isAuthenticated(Admin),
  roleRestriction("admin"),
  getAdminLessonNotesCtrl
);

lessonNoteRouter.patch(
  "/:id/review",
  isAuthenticated(Admin),
  roleRestriction("admin"),
  reviewLessonNoteCtrl
);

// Student route: view approved notes
lessonNoteRouter.get(
  "/student",
  isStudentLogin,
  isStudent,
  getStudentLessonNotesCtrl
);

// General CRUD
lessonNoteRouter.get("/:id", isAnyUserAuth, getLessonNoteByIdCtrl);
lessonNoteRouter.put("/:id", isAnyUserAuth, updateLessonNoteCtrl);
lessonNoteRouter.delete("/:id", isAnyUserAuth, deleteLessonNoteCtrl);

module.exports = lessonNoteRouter;
