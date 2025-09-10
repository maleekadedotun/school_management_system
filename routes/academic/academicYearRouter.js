const express = require("express");
const { createAcademicYearCtrl, fetchAcademicYearsCtrl, fetchAcademicYearCtrl, updateAcademicYearCtrl, deleteAcademicYearCtrl } = require("../../controller/academic/academicYearCtrl");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const academicYearRouter = express.Router();

academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);

// chaining
academicYearRouter
.route("/")
.get(isLoggedIn, isAdmin, createAcademicYearCtrl)
.post(isLoggedIn, isAdmin, createAcademicYearCtrl)


academicYearRouter
.route("/:id")
.get(isLoggedIn, isAdmin, fetchAcademicYearCtrl)
.put(isLoggedIn, isAdmin, updateAcademicYearCtrl)
.delete(isLoggedIn, isAdmin, deleteAcademicYearCtrl)

// academicYearRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// academicYearRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// academicYearRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = academicYearRouter;