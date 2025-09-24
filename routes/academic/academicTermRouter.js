const express = require("express");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createAcademicTermCtrl, fetchAcademicTermsCtrl, fetchAcademicTermCtrl, updateAcademicTermCtrl, deleteAcademicTermCtrl } = require("../../controller/academic/academicTermCtrl");
const academicTermRouter = express.Router();

// academicTermRouter.post("/",isLoggedIn, isAdmin, createAcademicTermCtrl);
// academicTermRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);

// chaining
academicTermRouter
.route("/")
.post(isLoggedIn, isAdmin, createAcademicTermCtrl)
.get(isLoggedIn, isAdmin, fetchAcademicTermsCtrl)


academicTermRouter
.route("/:id")
.get(isLoggedIn, isAdmin, fetchAcademicTermCtrl)
.put(isLoggedIn, isAdmin, updateAcademicTermCtrl)
.delete(isLoggedIn, isAdmin, deleteAcademicTermCtrl)

// academicTermRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// academicTermRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// academicTermRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = academicTermRouter;