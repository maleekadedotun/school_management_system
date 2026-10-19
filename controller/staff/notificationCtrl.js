const AsyncHandler = require("express-async-handler");
const Notification = require("../../models/Staff/Notification");
const Parent = require("../../models/Staff/Parent");

//@desc Get current user notifications
//@route GET /api/v1/notifications
//@access Private (Admin, Teacher, Student, Parent)
exports.getUserNotificationsCtrl = AsyncHandler(async (req, res) => {
    const userId = req.userAuth?._id;
    const userRole = (req.userAuth?.role || "admin").toLowerCase();

    let query;
    if (userRole === "parent") {
        const parentDoc = await Parent.findById(userId);
        const childrenIds = (parentDoc?.children || []).map((id) => id.toString());

        // Parent should see notifications directly targeted to them, role "parent",
        // student broadcast notifications showing on student dashboard,
        // OR notifications sent to any of their linked children
        query = {
            $or: [
                { recipient: userId },
                { recipientRole: "parent" },
                { recipientRole: "student" },
                ...(childrenIds.length > 0
                    ? [{ recipient: { $in: childrenIds } }]
                    : [])
            ]
        };
    } else {
        // Condition: targeted to this specific user ID OR sent to all users with this role
        query = {
            $or: [
                { recipient: userId },
                { recipientRole: userRole }
            ]
        };
    }

    const notifications = await Notification.find(query)
        .populate("recipient", "name StudentId studentId currentClassLevel email")
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

    let query;
    if (userRole === "parent") {
        const parentDoc = await Parent.findById(userId);
        const childrenIds = (parentDoc?.children || []).map((id) => id.toString());

        query = {
            $or: [
                { recipient: userId },
                { recipientRole: "parent" },
                { recipientRole: "student" },
                ...(childrenIds.length > 0
                    ? [{ recipient: { $in: childrenIds } }]
                    : [])
            ],
            isRead: false,
        };
    } else {
        query = {
            $or: [
                { recipient: userId },
                { recipientRole: userRole }
            ],
            isRead: false,
        };
    }

    await Notification.updateMany(query, {
        isRead: true,
        readAt: new Date(),
    });

    res.status(200).json({
        status: "success",
        message: "All notifications marked as read",
    });
});
