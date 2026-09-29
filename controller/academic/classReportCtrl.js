const mongoose = require("mongoose");
const AsyncHandler = require("express-async-handler");
const ClassReport = require("../../models/Academy/ClassReport");
const ClassLevel = require("../../models/Academy/ClassLevel");
const Subject = require("../../models/Academy/Subject");
const Teacher = require("../../models/Staff/Teacher");
const Admin = require("../../models/Staff/admin");
const Notification = require("../../models/Staff/Notification");

//@desc Teacher create and submit weekly class performance report
//@route POST /api/v1/class-reports
//@access Private (Teacher only)
exports.createClassReportCtrl = AsyncHandler(async (req, res) => {
    const {
        classLevel,
        subject,
        academicTerm,
        academicYear,
        weekNumber,
        weekStartDate,
        weekEndDate,
        title,
        summary,
        totalStudents,
        attendanceRate,
        passRate,
        averageScore,
        topPerformers,
        studentsNeedingSupport,
        topicsCovered,
        challenges,
        recommendations,
    } = req.body;

    const teacher = await Teacher.findById(req.userAuth?._id);
    if (!teacher) {
        return res.status(404).json({
            status: "failed",
            message: "Teacher profile not found",
        });
    }

    if (!summary || !summary.trim()) {
        return res.status(400).json({
            status: "failed",
            message: "Weekly summary of class performance is required",
        });
    }

    const weekNum = Number(weekNumber) || 1;

    // 1. Safely resolve classLevel (handle both ObjectId and string name e.g. "Level 100")
    let resolvedClassId = null;
    let resolvedClassName = "Class";

    const candidateClass = classLevel || teacher.classLevel;
    if (candidateClass) {
        if (typeof candidateClass === "object" && candidateClass?._id) {
            resolvedClassId = candidateClass._id;
            resolvedClassName = candidateClass.name?.trim() || "Class";
        } else if (mongoose.Types.ObjectId.isValid(candidateClass)) {
            const foundClass = await ClassLevel.findById(candidateClass);
            if (foundClass) {
                resolvedClassId = foundClass._id;
                resolvedClassName = foundClass.name?.trim() || "Class";
            } else {
                resolvedClassId = candidateClass;
            }
        } else if (typeof candidateClass === "string" && candidateClass.trim()) {
            const trimmedClass = candidateClass.trim();
            const foundClass = await ClassLevel.findOne({
                name: { $regex: trimmedClass, $options: "i" }
            });
            if (foundClass) {
                resolvedClassId = foundClass._id;
                resolvedClassName = foundClass.name?.trim() || trimmedClass;
            } else {
                resolvedClassName = trimmedClass;
            }
        }
    }

    // 2. Safely resolve subject (handle both ObjectId and string name e.g. "Mathematics")
    let resolvedSubjectId = null;
    let resolvedSubjectName = "";

    const candidateSubject = subject || teacher.subject;
    if (candidateSubject) {
        if (typeof candidateSubject === "object" && candidateSubject?._id) {
            resolvedSubjectId = candidateSubject._id;
            resolvedSubjectName = candidateSubject.name?.trim() || "";
        } else if (mongoose.Types.ObjectId.isValid(candidateSubject)) {
            const foundSub = await Subject.findById(candidateSubject);
            if (foundSub) {
                resolvedSubjectId = foundSub._id;
                resolvedSubjectName = foundSub.name?.trim() || "";
            } else {
                resolvedSubjectId = candidateSubject;
            }
        } else if (typeof candidateSubject === "string" && candidateSubject.trim()) {
            const trimmedSub = candidateSubject.trim();
            const foundSub = await Subject.findOne({
                name: { $regex: trimmedSub, $options: "i" }
            });
            if (foundSub) {
                resolvedSubjectId = foundSub._id;
                resolvedSubjectName = foundSub.name?.trim() || trimmedSub;
            } else {
                resolvedSubjectName = trimmedSub;
            }
        }
    }

    // 3. Resolve academic term & year if valid ObjectIds
    let resolvedTermId = null;
    if (academicTerm && mongoose.Types.ObjectId.isValid(academicTerm)) {
        resolvedTermId = academicTerm;
    }
    let resolvedYearId = null;
    if (academicYear && mongoose.Types.ObjectId.isValid(academicYear)) {
        resolvedYearId = academicYear;
    }

    const reportTitle =
        title?.trim() ||
        `Week ${weekNum} Performance Report - ${resolvedClassName}${resolvedSubjectName ? ` (${resolvedSubjectName})` : ""}`;

    const report = await ClassReport.create({
        teacher: teacher._id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
        classLevel: resolvedClassId,
        classLevelName: resolvedClassName,
        subject: resolvedSubjectId,
        subjectName: resolvedSubjectName,
        academicTerm: resolvedTermId,
        academicYear: resolvedYearId,
        weekNumber: weekNum,
        weekStartDate: weekStartDate ? new Date(weekStartDate) : null,
        weekEndDate: weekEndDate ? new Date(weekEndDate) : null,
        title: reportTitle,
        summary: summary.trim(),
        totalStudents: Number(totalStudents) || 0,
        attendanceRate: Number(attendanceRate) || 100,
        passRate: Number(passRate) || 0,
        averageScore: Number(averageScore) || 0,
        topPerformers: topPerformers || "",
        studentsNeedingSupport: studentsNeedingSupport || "",
        topicsCovered: topicsCovered || "",
        challenges: challenges || "",
        recommendations: recommendations || "",
        status: "unread",
        isRead: false,
    });

    // Notify all Admins that a new weekly class performance report has been submitted
    try {
        const admins = await Admin.find().select("_id name");
        if (admins && admins.length > 0) {
            const adminNotifications = admins.map((adm) => ({
                recipient: adm._id,
                recipientModel: "Admin",
                recipientRole: "admin",
                sender: teacher._id,
                senderModel: "Teacher",
                senderName: teacher.name,
                title: `New Weekly Class Report (Week ${weekNum})`,
                message: `Teacher ${teacher.name} has submitted the weekly performance report for ${resolvedClassName}.`,
                type: "weekly_report_submitted",
                relatedId: report._id,
                link: "/admin/class-reports",
                isRead: false,
            }));
            await Notification.insertMany(adminNotifications);
        }
    } catch (notifErr) {
        console.error("Failed to generate admin notification on class report submit:", notifErr);
    }

    res.status(201).json({
        status: "success",
        message: "Weekly class performance report submitted to administration successfully",
        data: report,
    });
});

//@desc Teacher get all their submitted class reports
//@route GET /api/v1/class-reports/teacher
//@access Private (Teacher only)
exports.getTeacherClassReportsCtrl = AsyncHandler(async (req, res) => {
    const teacherId = req.userAuth?._id;
    const { status, weekNumber } = req.query;

    const filter = { teacher: teacherId };
    if (status && status !== "all") {
        filter.status = status;
    }
    if (weekNumber && weekNumber !== "all") {
        filter.weekNumber = Number(weekNumber);
    }

    const reports = await ClassReport.find(filter)
        .populate("classLevel subject academicTerm academicYear")
        .sort({ createdAt: -1 });

    const unreadCount = await ClassReport.countDocuments({
        teacher: teacherId,
        status: "unread",
    });

    const readCount = await ClassReport.countDocuments({
        teacher: teacherId,
        status: "read",
    });

    res.status(200).json({
        status: "success",
        data: {
            reports,
            totalReports: reports.length,
            unreadCount,
            readCount,
        }
    });
});

//@desc Admin get all class reports organized by Read / Unread
//@route GET /api/v1/class-reports/admin
//@access Private (Admin only)
exports.getAllClassReportsAdminCtrl = AsyncHandler(async (req, res) => {
    const { status, classLevel, teacher, weekNumber, search } = req.query;

    const baseFilter = {};
    if (classLevel && classLevel !== "all") {
        if (mongoose.Types.ObjectId.isValid(classLevel)) {
            baseFilter.$or = [
                { classLevel: classLevel },
                { classLevelName: classLevel },
            ];
        } else {
            baseFilter.classLevelName = { $regex: classLevel.trim(), $options: "i" };
        }
    }
    if (teacher && teacher !== "all") {
        if (mongoose.Types.ObjectId.isValid(teacher)) {
            baseFilter.teacher = teacher;
        } else {
            baseFilter.teacherName = { $regex: teacher.trim(), $options: "i" };
        }
    }
    if (weekNumber && weekNumber !== "all") {
        baseFilter.weekNumber = Number(weekNumber);
    }
    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), "i");
        baseFilter.$or = [
            { title: regex },
            { teacherName: regex },
            { classLevelName: regex },
            { subjectName: regex },
            { summary: regex }
        ];
    }

    // Specific status query if requested
    let filter = { ...baseFilter };
    if (status && status !== "all") {
        filter.status = status;
    }

    const reports = await ClassReport.find(filter)
        .populate("teacher", "name email teacherId subject")
        .populate("classLevel", "name")
        .populate("subject", "name")
        .populate("readBy", "name email")
        .sort({ createdAt: -1 });

    // Separate unread and read lists for categorized display
    const unreadReports = reports.filter(r => r.status === "unread" || !r.isRead);
    const readReports = reports.filter(r => r.status === "read" || r.isRead);

    // Global counts matching filters
    const totalUnreadCount = await ClassReport.countDocuments({ ...baseFilter, status: "unread" });
    const totalReadCount = await ClassReport.countDocuments({ ...baseFilter, status: "read" });

    res.status(200).json({
        status: "success",
        data: {
            reports,
            unreadReports,
            readReports,
            unreadCount: totalUnreadCount,
            readCount: totalReadCount,
            totalCount: totalUnreadCount + totalReadCount,
        }
    });
});

//@desc Get single class performance report
//@route GET /api/v1/class-reports/:id
//@access Private (Admin or Teacher)
exports.getSingleClassReportCtrl = AsyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
            status: "failed",
            message: "Invalid class report ID",
        });
    }

    const report = await ClassReport.findById(req.params.id)
        .populate("teacher", "name email teacherId subject")
        .populate("classLevel", "name")
        .populate("subject", "name")
        .populate("readBy", "name email");

    if (!report) {
        return res.status(404).json({
            status: "failed",
            message: "Class report not found",
        });
    }

    res.status(200).json({
        status: "success",
        data: report,
    });
});

//@desc Admin mark class report as read and notify the teacher
//@route PATCH /api/v1/class-reports/:id/read
//@access Private (Admin only)
exports.markReportAsReadAdminCtrl = AsyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
            status: "failed",
            message: "Invalid class report ID",
        });
    }

    const report = await ClassReport.findById(req.params.id);
    if (!report) {
        return res.status(404).json({
            status: "failed",
            message: "Class report not found",
        });
    }

    const admin = req.userAuth;
    const adminName = admin?.name || "Administration";
    const feedback = req.body.adminFeedback || "";

    const wasUnread = !report.isRead || report.status === "unread";

    report.isRead = true;
    report.status = "read";
    report.readAt = new Date();
    report.readBy = admin?._id || null;
    report.readByName = adminName;
    if (feedback.trim()) {
        report.adminFeedback = feedback.trim();
        report.adminFeedbackAt = new Date();
    }

    await report.save();

    // Notify the Teacher that Admin has read and reviewed their report
    if (wasUnread || feedback.trim()) {
        try {
            await Notification.create({
                recipient: report.teacher,
                recipientModel: "Teacher",
                recipientRole: "teacher",
                sender: admin?._id,
                senderModel: "Admin",
                senderName: adminName,
                title: "Weekly Class Report Reviewed by Admin",
                message: `Admin ${adminName} has opened and read your Week ${report.weekNumber} Class Performance Report for ${report.classLevelName}.${feedback.trim() ? ` Feedback: "${feedback.trim()}"` : ""}`,
                type: "weekly_report_read",
                relatedId: report._id,
                link: "/teacher/weekly-reports",
                isRead: false,
            });
        } catch (notifErr) {
            console.error("Failed to notify teacher on report read:", notifErr);
        }
    }

    res.status(200).json({
        status: "success",
        message: "Report marked as read and teacher notified successfully",
        data: report,
    });
});

//@desc Delete class report
//@route DELETE /api/v1/class-reports/:id
//@access Private (Admin or report owner Teacher)
exports.deleteClassReportCtrl = AsyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
            status: "failed",
            message: "Invalid class report ID",
        });
    }

    const report = await ClassReport.findById(req.params.id);
    if (!report) {
        return res.status(404).json({
            status: "failed",
            message: "Class report not found",
        });
    }

    // Role check: Only admin or the authoring teacher can delete
    const isOwner = report.teacher.toString() === req.userAuth?._id?.toString();
    const isAdminUser = req.userAuth?.role === "admin";

    if (!isOwner && !isAdminUser) {
        return res.status(403).json({
            status: "failed",
            message: "You are not authorized to delete this report",
        });
    }

    await ClassReport.findByIdAndDelete(req.params.id);

    res.status(200).json({
        status: "success",
        message: "Class performance report deleted successfully",
    });
});
