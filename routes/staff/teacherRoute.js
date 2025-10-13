const express = require("express");
// const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");
const { adminRegisterTeacher, teacherLogin, fetchAllTeachersAdmin, fetchTeacherAdmin, fetchTeacherProfile, updateTeacherCtrl, adminUpdateTeacherCtrl } = require("../../controller/staff/teacherCtrl");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const advanceResults = require("../../middlewares/advanceResults");
const Teacher = require("../../models/Staff/Teacher");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const Admin = require("../../models/Staff/admin");
const roleRestriction = require("../../middlewares/roleRestriction");


const teacherRoute = express.Router();

teacherRoute.post("/admin/register", isAuthenticated(Admin), isAdmin, adminRegisterTeacher);
teacherRoute.post("/login", teacherLogin);

teacherRoute.get("/admin", isAuthenticated(Admin), isAdmin,
advanceResults(Teacher, {
    path: "examsCreated",
    populate: {
        path: "questions",
    }
}),
fetchAllTeachersAdmin);

teacherRoute.get("/profile", isAuthenticated(Teacher), roleRestriction("teacher"), fetchTeacherProfile);
teacherRoute.get("/:teacherID/admin", isAuthenticated(Admin), roleRestriction("admin"), fetchTeacherAdmin);
teacherRoute.put("/:teacherID/update/profile", isAuthenticated(Teacher), roleRestriction("teacher"), updateTeacherCtrl);
teacherRoute.put("/:teacherID/update/admin", isAuthenticated(Admin), roleRestriction("admin"), adminUpdateTeacherCtrl);


module.exports = teacherRoute