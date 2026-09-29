const express = require("express");
const {
    createClassReportCtrl,
    getTeacherClassReportsCtrl,
    getAllClassReportsAdminCtrl,
    getSingleClassReportCtrl,
    markReportAsReadAdminCtrl,
    deleteClassReportCtrl,
} = require("../../controller/academic/classReportCtrl");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const roleRestriction = require("../../middlewares/roleRestriction");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");
const Teacher = require("../../models/Staff/Teacher");
const Admin = require("../../models/Staff/admin");

const classReportRouter = express.Router();

// Teacher creates weekly class performance report
classReportRouter.post(
    "/",
    isAuthenticated(Teacher),
    roleRestriction("teacher"),
    createClassReportCtrl
);

// Teacher gets all their submitted reports
classReportRouter.get(
    "/teacher",
    isAuthenticated(Teacher),
    roleRestriction("teacher"),
    getTeacherClassReportsCtrl
);

// Admin gets all reports organized by Read / Unread
classReportRouter.get(
    "/admin",
    isAuthenticated(Admin),
    roleRestriction("admin"),
    getAllClassReportsAdminCtrl
);

// Single report details (Admin or Teacher)
classReportRouter.get(
    "/:id",
    isAnyUserAuth,
    getSingleClassReportCtrl
);

// Admin marks report as read (and notifies teacher)
classReportRouter.patch(
    "/:id/read",
    isAuthenticated(Admin),
    roleRestriction("admin"),
    markReportAsReadAdminCtrl
);

// Delete report (Admin or Author Teacher)
classReportRouter.delete(
    "/:id",
    isAnyUserAuth,
    deleteClassReportCtrl
);

module.exports = classReportRouter;
