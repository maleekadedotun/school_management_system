const express = require("express");
const parentRouter = express.Router();
const {
  parentRegisterCtrl,
  parentLoginCtrl,
  getParentProfileCtrl,
  getParentDashboardCtrl,
  linkStudentToParentCtrl,
  getAllParentsCtrl,
} = require("../../controller/staff/parentCtrl");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");
const roleRestriction = require("../../middlewares/roleRestriction");

// Public routes
parentRouter.post("/login", parentLoginCtrl);

// Authenticated Parent & Admin routes
parentRouter.get(
  "/dashboard",
  isAnyUserAuth,
  roleRestriction("parent", "admin"),
  getParentDashboardCtrl
);

parentRouter.get(
  "/profile",
  isAnyUserAuth,
  roleRestriction("parent", "admin"),
  getParentProfileCtrl
);

parentRouter.post(
  "/link-student",
  isAnyUserAuth,
  roleRestriction("parent", "admin"),
  linkStudentToParentCtrl
);

// Admin-only parent management & registration
parentRouter.post(
  "/register",
  isAnyUserAuth,
  roleRestriction("admin"),
  parentRegisterCtrl
);

parentRouter.get(
  "/",
  isAnyUserAuth,
  roleRestriction("admin"),
  getAllParentsCtrl
);

module.exports = parentRouter;
