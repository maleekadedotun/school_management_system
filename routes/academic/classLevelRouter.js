const express = require("express");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createClassLevelCtrl, fetchClassLevelsCtrl, fetchClassLevelCtrl, updateClassLevelCtrl, deleteClassLevelCtrl } = require("../../controller/academic/classLevelCtrl");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const classLevelRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);

// chaining
classLevelRouter
.route("/")
.post(isAuthenticated(Admin), isAdmin, createClassLevelCtrl)
.get(isAuthenticated(Admin), isAdmin, fetchClassLevelsCtrl)


classLevelRouter
.route("/:id")
.get(isAuthenticated(Admin), isAdmin, fetchClassLevelCtrl)
.put(isAuthenticated(Admin), isAdmin, updateClassLevelCtrl)
.delete(isAuthenticated(Admin), isAdmin, deleteClassLevelCtrl)

// classLevelRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// classLevelRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// classLevelRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = classLevelRouter;