const express = require("express");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const isAdmin = require("../../middlewares/isAdmin");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const { createQuestion, fetchAllQuestionsCtrl, fetchQuestionCtrl, updateQuestionCtrl, getAllQuestionsAdminCtrl } = require("../../controller/academic/questionCtrl");

const questionRouter = express.Router();

questionRouter.get("/admin", isAuthenticated(Admin), isAdmin, getAllQuestionsAdminCtrl);
questionRouter.get("/", isTeacherLogin, isTeacher, fetchAllQuestionsCtrl);
questionRouter.post("/:examID/", isTeacherLogin, isTeacher, createQuestion);
questionRouter.get("/:id", isTeacherLogin, isTeacher, fetchQuestionCtrl);
questionRouter.put("/:id", isTeacherLogin, isTeacher, updateQuestionCtrl);

module.exports = questionRouter;