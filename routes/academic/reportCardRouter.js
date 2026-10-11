const express = require("express");
const {
    getClassSubjectSheetCtrl,
    getClassSubjectsProgressCtrl,
    saveClassSubjectResultsCtrl,
    updateSingleSubjectResultCtrl,
    calculateClassReportCardsCtrl,
    getClassReportCardsCtrl,
    getClassReportCardsOverviewCtrl,
    submitClassReportCardsCtrl,
    updateTeacherCommentCtrl,
    approveClassReportCardsCtrl,
    rejectClassReportCardsCtrl,
    publishClassReportCardsCtrl,
    updateAdminCommentCtrl,
    getAdminReportCardOverviewCtrl,
    getStudentPublishedReportCardsCtrl,
    getStudentTermReportCardCtrl,
    getStudentLatestReportCardCtrl,
    getSingleReportCardByIdCtrl,
    getStudentExistingSubjectResultsCtrl,
    getStudentFullReportCardCtrl,
    saveStudentMultiSubjectResultsCtrl,
} = require("../../controller/academic/reportCardCtrl");

const isStudentLogin = require("../../middlewares/isStudentLogin");
const isStudent = require("../../middlewares/isStudent");
const isAdmin = require("../../middlewares/isAdmin");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const Admin = require("../../models/Staff/admin");

const reportCardRouter = express.Router();

// --- TEACHER & ADMIN SHARED ROUTES ---
// Dynamic single student full report card (generated directly from subject results)
reportCardRouter.get("/student/:studentId/full-report", isTeacherLogin, isTeacher, getStudentFullReportCardCtrl);

// Student multi-subject results entry & fetch
reportCardRouter.get("/student/:studentId/subjects", isTeacherLogin, isTeacher, getStudentExistingSubjectResultsCtrl);
reportCardRouter.post("/student/save-subjects", isTeacherLogin, isTeacher, saveStudentMultiSubjectResultsCtrl);

// Class Subject Result Sheet (Shared Class Result Sheet - Section 2, 3, 11)
reportCardRouter.get("/class/:classLevelId/subject-sheet", isTeacherLogin, isTeacher, getClassSubjectSheetCtrl);

// Class Subjects Progress Overview (Section 12, 13)
reportCardRouter.get("/class/:classLevelId/subjects-progress", isTeacherLogin, isTeacher, getClassSubjectsProgressCtrl);

// Class Results Overview (Section 2: Mode B - Table of all students in class with live submitted/pending subject status)
reportCardRouter.get("/class/:classLevelId/overview", isTeacherLogin, isTeacher, getClassReportCardsOverviewCtrl);

// Save / Batch enter class subject results (Section 4, 5, 9, 25)
reportCardRouter.post("/subject-results", isTeacherLogin, isTeacher, saveClassSubjectResultsCtrl);

// Single subject result update
reportCardRouter.patch("/subject-results/:resultId", isTeacherLogin, isTeacher, updateSingleSubjectResultCtrl);

// Calculate / generate class report cards
reportCardRouter.post("/calculate-class", isTeacherLogin, isTeacher, calculateClassReportCardsCtrl);

// Get class report cards
reportCardRouter.get("/class/:classLevelId", isTeacherLogin, isTeacher, getClassReportCardsCtrl);

// Teacher submit class results to admin
reportCardRouter.post("/class/submit", isTeacherLogin, isTeacher, submitClassReportCardsCtrl);

// Teacher update comment on report card
reportCardRouter.patch("/:id/teacher-comment", isTeacherLogin, isTeacher, updateTeacherCommentCtrl);
reportCardRouter.patch("/teacher-comment", isTeacherLogin, isTeacher, updateTeacherCommentCtrl);

// --- ADMIN SPECIFIC ROUTES ---
// Admin overview of all classes and terms
reportCardRouter.get("/admin/overview", isAuthenticated(Admin), isAdmin, getAdminReportCardOverviewCtrl);

// Admin approve class report cards
reportCardRouter.patch("/class/approve", isAuthenticated(Admin), isAdmin, approveClassReportCardsCtrl);

// Admin reject class report cards
reportCardRouter.patch("/class/reject", isAuthenticated(Admin), isAdmin, rejectClassReportCardsCtrl);

// Admin publish class report cards (releases to students)
reportCardRouter.patch("/class/publish", isAuthenticated(Admin), isAdmin, publishClassReportCardsCtrl);

// Admin update principal comment and promotion status
reportCardRouter.patch("/:id/admin-comment", isAuthenticated(Admin), isAdmin, updateAdminCommentCtrl);

// --- STUDENT SPECIFIC ROUTES ---
// Student view latest published report card (Section 21 & 26)
reportCardRouter.get("/student/report-card", isStudentLogin, isStudent, getStudentLatestReportCardCtrl);

// Student get all published report cards
reportCardRouter.get("/student/my-report-cards", isStudentLogin, isStudent, getStudentPublishedReportCardsCtrl);

// Student view specific term report card
reportCardRouter.get("/student/term/:termId", isStudentLogin, isStudent, getStudentTermReportCardCtrl);

// Single report card detail by ID (Teacher or Admin)
reportCardRouter.get("/:id", isTeacherLogin, isTeacher, getSingleReportCardByIdCtrl);

module.exports = reportCardRouter;

