const express = require("express");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createSubjectCtrl, fetchSubjectsCtrl, fetchSubjectCtrl, updateSubjectCtrl, deleteSubjectCtrl } = require("../../controller/academic/subjectCtrl");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const subjectRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);
subjectRouter.post("/:programID", isAuthenticated(Admin), isAdmin, createSubjectCtrl)
subjectRouter
.route("/")
.get(fetchSubjectsCtrl)

subjectRouter
.route("/:id")
.get(fetchSubjectCtrl)
.put(isAuthenticated(Admin), isAdmin, updateSubjectCtrl)
.delete(isAuthenticated(Admin), isAdmin, deleteSubjectCtrl)

// subjectRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// subjectRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// subjectRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = subjectRouter;