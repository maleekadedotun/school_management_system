const express = require("express");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createProgramCtrl, fetchProgramsCtrl, fetchProgramCtrl, updateProgramCtrl, deleteProgramCtrl } = require("../../controller/academic/programCtrl");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const programRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);

// chaining
programRouter
.route("/")
.post(isAuthenticated(Admin), isAdmin, createProgramCtrl)
.get(isAuthenticated(Admin), isAdmin, fetchProgramsCtrl)


programRouter
.route("/:id")
.get(isAuthenticated(Admin), isAdmin, fetchProgramCtrl)
.put(isAuthenticated(Admin), isAdmin, updateProgramCtrl)
.delete(isAuthenticated(Admin), isAdmin, deleteProgramCtrl)

// programRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// programRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// programRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = programRouter;