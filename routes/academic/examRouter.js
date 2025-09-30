const express = require("express");
isTeacher = require("../../middlewares/isTeacher");
isTeacherLogin = require("../../middlewares/isTeacherLogin");

const {createExamCtrl, fetchAllExamsCtrl, fetchExamCtrl, updateExamCtrl} = require("../../controller/academic/examCtrl")
const ExamRouter = express.Router();

ExamRouter.route("/").post(isTeacherLogin, isTeacher, createExamCtrl);
ExamRouter.route("/").get(isTeacherLogin, isTeacher, fetchAllExamsCtrl);
ExamRouter.route("/:id").get(isTeacherLogin, isTeacher, fetchExamCtrl);
ExamRouter.route("/:id/update/teacher").put(isTeacherLogin, isTeacher, updateExamCtrl);

module.exports = ExamRouter;
