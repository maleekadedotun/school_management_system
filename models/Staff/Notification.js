const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "recipientModel",
        },
        recipientModel: {
            type: String,
            required: true,
            enum: ["Admin", "Teacher", "Student"],
            default: "Admin",
        },
        recipientRole: {
            type: String,
            enum: ["admin", "teacher", "student"],
            required: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "senderModel",
        },
        senderModel: {
            type: String,
            enum: ["Admin", "Teacher", "Student"],
        },
        senderName: {
            type: String,
            default: "System",
        },
        title: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: [
                "weekly_report_submitted",
                "weekly_report_read",
                "exam_result",
                "general",
            ],
            default: "general",
        },
        relatedId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        link: {
            type: String,
            default: "",
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
