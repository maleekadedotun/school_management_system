const express = require("express");
const {
    createAssignmentCtrl,
    getAssignmentsCtrl,
    getMyAssignmentsCtrl,
    getEligibleTeachersCtrl,
    getSingleAssignmentCtrl,
    updateAssignmentCtrl,
    toggleStatusCtrl,
    deleteAssignmentCtrl,
} = require("../../controller/academic/classTeacherAssignmentCtrl");

const isAdmin = require("../../middlewares/isAdmin");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const isTeacherLogin = require("../../middlewares/isTeacherLogin");
const isTeacher = require("../../middlewares/isTeacher");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");
const Admin = require("../../models/Staff/admin");

const classTeacherAssignmentRouter = express.Router();

// Eligible teachers from database for assignment dropdown (must come before /:id)
classTeacherAssignmentRouter.get(
    "/eligible-teachers",
    isAnyUserAuth,
    getEligibleTeachersCtrl
);

// Teacher's own active assignments (must come before /:id)
classTeacherAssignmentRouter.get(
    "/my-assignments",
    isTeacherLogin,
    isTeacher,
    getMyAssignmentsCtrl
);

// Admin listing of all assignments
classTeacherAssignmentRouter.get(
    "/",
    isAuthenticated(Admin),
    isAdmin,
    getAssignmentsCtrl
);

// Admin create new assignment
classTeacherAssignmentRouter.post(
    "/",
    isAuthenticated(Admin),
    isAdmin,
    createAssignmentCtrl
);

// Get single assignment
classTeacherAssignmentRouter.get(
    "/:id",
    isAnyUserAuth,
    getSingleAssignmentCtrl
);

// Admin update assignment
classTeacherAssignmentRouter.put(
    "/:id",
    isAuthenticated(Admin),
    isAdmin,
    updateAssignmentCtrl
);

// Admin toggle active / inactive status
classTeacherAssignmentRouter.patch(
    "/:id/status",
    isAuthenticated(Admin),
    isAdmin,
    toggleStatusCtrl
);

// Admin delete assignment
classTeacherAssignmentRouter.delete(
    "/:id",
    isAuthenticated(Admin),
    isAdmin,
    deleteAssignmentCtrl
);

module.exports = classTeacherAssignmentRouter;
