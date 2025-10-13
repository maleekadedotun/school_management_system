const express = require("express");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createAcademicTermCtrl, fetchAcademicTermsCtrl, fetchAcademicTermCtrl, updateAcademicTermCtrl, deleteAcademicTermCtrl } = require("../../controller/academic/academicTermCtrl");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const academicTermRouter = express.Router();

// academicTermRouter.post("/",isLoggedIn, isAdmin, createAcademicTermCtrl);
// academicTermRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);

// chaining
academicTermRouter
.route("/")
.post(isAuthenticated(Admin), isAdmin, createAcademicTermCtrl)
.get(isAuthenticated(Admin), isAdmin, fetchAcademicTermsCtrl)


academicTermRouter
.route("/:id")
.get(isAuthenticated(Admin), isAdmin, fetchAcademicTermCtrl)
.put(isAuthenticated(Admin), isAdmin, updateAcademicTermCtrl)
.delete(isAuthenticated(Admin), isAdmin, deleteAcademicTermCtrl)

// academicTermRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// academicTermRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// academicTermRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = academicTermRouter;