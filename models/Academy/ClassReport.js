const mongoose = require("mongoose");

const classReportSchema = new mongoose.Schema(
    {
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            required: true,
        },
        teacherName: {
            type: String,
            required: true,
        },
        teacherEmail: {
            type: String,
        },
        classLevel: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
            default: null,
            required: false,
        },
        classLevelName: {
            type: String,
            required: true,
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            default: null,
            required: false,
        },
        subjectName: {
            type: String,
        },
        academicTerm: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicTerm",
        },
        academicYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
        },
        weekNumber: {
            type: Number,
            required: true,
            min: 1,
            max: 52,
        },
        weekStartDate: {
            type: Date,
        },
        weekEndDate: {
            type: Date,
        },
        title: {
            type: String,
            required: true,
        },
        summary: {
            type: String,
            required: true,
        },
        totalStudents: {
            type: Number,
            default: 0,
        },
        attendanceRate: {
            type: Number,
            default: 100,
        },
        passRate: {
            type: Number,
            default: 0,
        },
        averageScore: {
            type: Number,
            default: 0,
        },
        topPerformers: {
            type: String,
            default: "",
        },
        studentsNeedingSupport: {
            type: String,
            default: "",
        },
        topicsCovered: {
            type: String,
            default: "",
        },
        challenges: {
            type: String,
            default: "",
        },
        recommendations: {
            type: String,
            default: "",
        },
        status: {
            type: String,
            enum: ["unread", "read"],
            default: "unread",
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
        readBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        readByName: {
            type: String,
            default: null,
        },
        adminFeedback: {
            type: String,
            default: "",
        },
        adminFeedbackAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for faster lookups
classReportSchema.index({ teacher: 1, createdAt: -1 });
classReportSchema.index({ status: 1, createdAt: -1 });
classReportSchema.index({ classLevel: 1, weekNumber: 1 });

const ClassReport = mongoose.model("ClassReport", classReportSchema);
module.exports = ClassReport;
