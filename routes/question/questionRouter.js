const express = require("express");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const { createQuestion, fetchAllQuestionsCtrl, fetchQuestionCtrl, updateQuestionCtrl } = require("../../controller/academic/questionCtrl");


const questionRouter = express.Router();

questionRouter.get("/", isTeacherLogin, isTeacher, fetchAllQuestionsCtrl);
questionRouter.post("/:examID/", isTeacherLogin, isTeacher, createQuestion);
questionRouter.get("/:id", isTeacherLogin, isTeacher, fetchQuestionCtrl);
questionRouter.put("/:id", isTeacherLogin, isTeacher, updateQuestionCtrl);



module.exports = questionRouter;