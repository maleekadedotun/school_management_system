const express = require("express");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createClassLevelCtrl, fetchClassLevelsCtrl, fetchClassLevelCtrl, updateClassLevelCtrl, deleteClassLevelCtrl } = require("../../controller/academic/classLevelCtrl");
const classLevelRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);

// chaining
classLevelRouter
.route("/")
.post(isLoggedIn, isAdmin, createClassLevelCtrl)
.get(isLoggedIn, isAdmin, fetchClassLevelsCtrl)


classLevelRouter
.route("/:id")
.get(isLoggedIn, isAdmin, fetchClassLevelCtrl)
.put(isLoggedIn, isAdmin, updateClassLevelCtrl)
.delete(isLoggedIn, isAdmin, deleteClassLevelCtrl)

// classLevelRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// classLevelRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// classLevelRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = classLevelRouter;