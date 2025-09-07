const express = require("express");
const { getAllAdminCtrl, getAdminProfileCtrl, updateAdminCtrl, deleteAdminCtrl, adminSuspendTeacherCtrl, adminUnSuspendTeacherCtrl, adminUnWithdrawTeacherCtrl, adminPublishExamResultCtrl, adminWithdrawTeacherCtrl, adminUnPublishExamResultCtrl, adminRegisterCtrl, adminLoginCtrl } = require("../../controller/staff/adminCtrl");
const isLoggedIn = require("../../middlewares/isLoggedin");
const isAdmin = require("../../middlewares/isAdmin");

const adminRouter = express.Router();

// Admin registered
adminRouter.post("/register", adminRegisterCtrl);
//login admin
adminRouter.post("/login", adminLoginCtrl);

// get all admin
adminRouter.get("/", isLoggedIn, getAllAdminCtrl);

// get single admin
adminRouter.get("/profile", isLoggedIn, isAdmin, getAdminProfileCtrl);

// update admin
adminRouter.put("/update", isLoggedIn, isAdmin, updateAdminCtrl);

// delete admin
adminRouter.delete("/delete/:id", deleteAdminCtrl);

// admin suspend teacher
adminRouter.put("/teacher/suspend/:id", adminSuspendTeacherCtrl);

// admin unsuspend teacher
adminRouter.put("/teacher/unsuspend/:id", adminUnSuspendTeacherCtrl);

// admin withdraw teacher
adminRouter.put("/teacher/withdraw/:id", adminWithdrawTeacherCtrl);

// admin unwithdraw teacher
adminRouter.put("/teacher/unwithdraw/:id", adminUnWithdrawTeacherCtrl);

// Admin publishing exam results
adminRouter.put("/teacher/publish/exam/:id", adminPublishExamResultCtrl);

// Admin unpublishing exam results
adminRouter.put("/teacher/unpublish/exam/:id", adminUnPublishExamResultCtrl);


module.exports = adminRouter;