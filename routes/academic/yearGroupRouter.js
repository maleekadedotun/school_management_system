const express = require("express");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createYearGroupCtrl, fetchYearsGroupCtrl, fetchYearGroupCtrl, updateYearGroupCtrl, deleteYearGroupCtrl } = require("../../controller/academic/yearGroupCtrl");
const yearGroupRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);
// chaining
yearGroupRouter
.route("/")
.post(isLoggedIn, isAdmin, createYearGroupCtrl)
.get(isLoggedIn, isAdmin, fetchYearsGroupCtrl)


yearGroupRouter
.route("/:id")
.get(isLoggedIn, isAdmin, fetchYearGroupCtrl)
.put(isLoggedIn, isAdmin, updateYearGroupCtrl)
.delete(isLoggedIn, isAdmin, deleteYearGroupCtrl)

// yearGroupRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// yearGroupRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// yearGroupRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = yearGroupRouter;