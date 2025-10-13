const express = require("express");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { createYearGroupCtrl, fetchYearsGroupCtrl, fetchYearGroupCtrl, updateYearGroupCtrl, deleteYearGroupCtrl } = require("../../controller/academic/yearGroupCtrl");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const yearGroupRouter = express.Router();

// academicYearRouter.post("/",isLoggedIn, isAdmin, createAcademicYearCtrl);
// academicYearRouter.get("/", isLoggedIn, isAdmin, fetchAcademicYearsCtrl);
// chaining
yearGroupRouter
.route("/")
.post(isAuthenticated(Admin), isAdmin, createYearGroupCtrl)
.get(isAuthenticated(Admin), isAdmin, fetchYearsGroupCtrl)


yearGroupRouter
.route("/:id")
.get(isAuthenticated(Admin), isAdmin, fetchYearGroupCtrl)
.put(isAuthenticated(Admin), isAdmin, updateYearGroupCtrl)
.delete(isAuthenticated(Admin), isAdmin, deleteYearGroupCtrl)

// yearGroupRouter.get("/:id",isLoggedIn, isAdmin, fetchAcademicYearCtrl);
// yearGroupRouter.put("/:id", isLoggedIn, isAdmin, updateAcademicYearCtrl);
// yearGroupRouter.delete("/:id", isLoggedIn, isAdmin, deleteAcademicYearCtrl);

module.exports = yearGroupRouter;