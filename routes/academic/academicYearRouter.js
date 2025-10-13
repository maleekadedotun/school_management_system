const express = require("express");
const { createAcademicYearCtrl, fetchAcademicYearsCtrl, fetchAcademicYearCtrl, updateAcademicYearCtrl, deleteAcademicYearCtrl } = require("../../controller/academic/academicYearCtrl");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const academicYearRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);

// chaining
academicYearRouter
.route("/")
.post(isAuthenticated(Admin), isAdmin, createAcademicYearCtrl)
.get(isAuthenticated(Admin), isAdmin, fetchAcademicYearsCtrl)


academicYearRouter
.route("/:id")
.get(isAuthenticated(Admin), isAdmin, fetchAcademicYearCtrl)
.put(isAuthenticated(Admin), isAdmin, updateAcademicYearCtrl)
.delete(isAuthenticated(Admin), isAdmin, deleteAcademicYearCtrl)

// academicYearRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// academicYearRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// academicYearRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = academicYearRouter;