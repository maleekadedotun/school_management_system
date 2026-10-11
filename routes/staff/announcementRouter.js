const express = require("express");
const isAuthenticated = require("../../middlewares/isAuthenticated");
const isAdmin = require("../../middlewares/isAdmin");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");
const Admin = require("../../models/Staff/admin");

const {
  createAnnouncementCtrl,
  getAllAnnouncementsAdminCtrl,
  getActiveAnnouncementsCtrl,
  getAnnouncementByIdCtrl,
  updateAnnouncementCtrl,
  deleteAnnouncementCtrl,
  toggleAnnouncementStatusCtrl,
} = require("../../controller/staff/announcementCtrl");

const announcementRouter = express.Router();

// Active announcements for Marquee ticker (open to any authenticated user or general fallback)
announcementRouter.get("/active", getActiveAnnouncementsCtrl);

// Admin announcement management
announcementRouter.post("/", isAuthenticated(Admin), isAdmin, createAnnouncementCtrl);
announcementRouter.get("/", isAuthenticated(Admin), isAdmin, getAllAnnouncementsAdminCtrl);
announcementRouter.get("/:id", isAnyUserAuth, getAnnouncementByIdCtrl);
announcementRouter.put("/:id", isAuthenticated(Admin), isAdmin, updateAnnouncementCtrl);
announcementRouter.delete("/:id", isAuthenticated(Admin), isAdmin, deleteAnnouncementCtrl);
announcementRouter.patch("/:id/status", isAuthenticated(Admin), isAdmin, toggleAnnouncementStatusCtrl);

module.exports = announcementRouter;
