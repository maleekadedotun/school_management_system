const express = require("express");
const { checkExamResultsCtrl, fetchExamResultsCtrl, adminToggleExamResult } = require("../../controller/academic/examResultsCtrl");
const isStudentLogin = require("../../middlewares/isStudentLogin");
const isStudent = require("../../middlewares/isStudent");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");

const checkExamResultsRouter = express.Router();

checkExamResultsRouter.get("/", isStudentLogin, isStudent, fetchExamResultsCtrl);
checkExamResultsRouter.get("/:id/checking",isStudentLogin, isStudent, checkExamResultsCtrl);
checkExamResultsRouter.put("/:id/admin-toggle-publish",isAuthenticated(Admin), isAdmin, adminToggleExamResult);

module.exports = checkExamResultsRouter