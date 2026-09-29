const AsyncHandler = require("express-async-handler");
const Notification = require("../../models/Staff/Notification");

//@desc Get current user notifications
//@route GET /api/v1/notifications
//@access Private (Admin, Teacher, Student)
exports.getUserNotificationsCtrl = AsyncHandler(async (req, res) => {
    const userId = req.userAuth?._id;
    const userRole = (req.userAuth?.role || "admin").toLowerCase();

    // Condition: targeted to this specific user ID OR sent to all users with this role
    const query = {
        $or: [
            { recipient: userId },
            { recipientRole: userRole }
        ]
    };

    const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(50);

    const unreadCount = await Notification.countDocuments({
        ...query,
        isRead: false,
    });

    res.status(200).json({
        status: "success",
        data: {
            notifications,
            unreadCount,
            totalCount: notifications.length,
        }
    });
});

//@desc Mark single notification as read
//@route PATCH /api/v1/notifications/:id/read
//@access Private
exports.markNotificationAsReadCtrl = AsyncHandler(async (req, res) => {
    const notification = await Notification.findByIdAndUpdate(
        req.params.id,
        {
            isRead: true,
            readAt: new Date(),
        },
        { new: true }
    );

    if (!notification) {
        return res.status(404).json({
            status: "failed",
            message: "Notification not found",
        });
    }

    res.status(200).json({
        status: "success",
        message: "Notification marked as read",
        data: notification,
    });
});

//@desc Mark all notifications for user as read
//@route PATCH /api/v1/notifications/mark-all-read
//@access Private
exports.markAllNotificationsAsReadCtrl = AsyncHandler(async (req, res) => {
    const userId = req.userAuth?._id;
    const userRole = (req.userAuth?.role || "admin").toLowerCase();

    const query = {
        $or: [
            { recipient: userId },
            { recipientRole: userRole }
        ],
        isRead: false,
    };

    await Notification.updateMany(query, {
        isRead: true,
        readAt: new Date(),
    });

    res.status(200).json({
        status: "success",
        message: "All notifications marked as read",
    });
});
