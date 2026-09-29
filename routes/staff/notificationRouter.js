const express = require("express");
const {
    getUserNotificationsCtrl,
    markNotificationAsReadCtrl,
    markAllNotificationsAsReadCtrl,
} = require("../../controller/staff/notificationCtrl");
const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");

const notificationRouter = express.Router();

// Get current user's notifications + unread count
notificationRouter.get("/", isAnyUserAuth, getUserNotificationsCtrl);

// Mark all as read
notificationRouter.patch("/mark-all-read", isAnyUserAuth, markAllNotificationsAsReadCtrl);

// Mark single notification as read
notificationRouter.patch("/:id/read", isAnyUserAuth, markNotificationAsReadCtrl);

module.exports = notificationRouter;
