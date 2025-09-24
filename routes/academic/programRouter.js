const express = require("express");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createProgramCtrl, fetchProgramsCtrl, fetchProgramCtrl, updateProgramCtrl, deleteProgramCtrl } = require("../../controller/academic/programCtrl");
const programRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);

// chaining
programRouter
.route("/")
.post(isLoggedIn, isAdmin, createProgramCtrl)
.get(isLoggedIn, isAdmin, fetchProgramsCtrl)


programRouter
.route("/:id")
.get(isLoggedIn, isAdmin, fetchProgramCtrl)
.put(isLoggedIn, isAdmin, updateProgramCtrl)
.delete(isLoggedIn, isAdmin, deleteProgramCtrl)

// programRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// programRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// programRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = programRouter;