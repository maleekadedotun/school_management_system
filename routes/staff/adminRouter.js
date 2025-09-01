const express = require("express");
const { registerCtrl, loginCtrl, getAllAdminCtrl, getSingleAdminCtrl, updateAdminCtrl, deleteAdminCtrl, adminSuspendTeacherCtrl, adminUnSuspendTeacherCtrl, adminUnWithdrawTeacherCtrl, adminPublishExamResultCtrl, adminWithdrawTeacherCtrl, adminUnPublishExamResultCtrl } = require("../../controller/staff/adminCtrl");

const adminRouter = express.Router();

// Admin registered
adminRouter.post("/register", registerCtrl);
//login admin
adminRouter.post("/login", loginCtrl);

// get all admin
adminRouter.get("/", getAllAdminCtrl);

// get single admin
adminRouter.get("/:id", getSingleAdminCtrl);

// update admin
adminRouter.put("/update/:id", updateAdminCtrl);

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