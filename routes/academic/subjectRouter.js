const express = require("express");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createSubjectCtrl, fetchSubjectsCtrl, fetchSubjectCtrl, updateSubjectCtrl, deleteSubjectCtrl } = require("../../controller/academic/subjectCtrl");
const subjectRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);
subjectRouter.post("/:programID", isLoggedIn, isAdmin, createSubjectCtrl)
// chaining
subjectRouter
.route("/")
// .post(isLoggedIn, isAdmin, createSubjectCtrl)
.get(isLoggedIn, isAdmin, fetchSubjectsCtrl)


subjectRouter
.route("/:id")
.get(isLoggedIn, isAdmin, fetchSubjectCtrl)
.put(isLoggedIn, isAdmin, updateSubjectCtrl)
.delete(isLoggedIn, isAdmin, deleteSubjectCtrl)

// subjectRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// subjectRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// subjectRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = subjectRouter;