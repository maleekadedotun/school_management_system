const AsyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Announcement = require("../../models/Staff/Announcement");
const Admin = require("../../models/Staff/admin");
const Teacher = require("../../models/Staff/Teacher");
const Student = require("../../models/Academy/Student");
const verifyToken = require("../../utils/verifyToken");

// Priority sort weight
const PRIORITY_ORDER = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
};

//@desc Create a new announcement (Admin only)
//@route POST /api/v1/announcements
//@access Private (Admin)
exports.createAnnouncementCtrl = AsyncHandler(async (req, res) => {
  const { title, message, targetAudience, priority, category, status, expiresAt } = req.body;

  if (!title || !title.trim()) {
    res.status(400);
    throw new Error("Announcement title is required");
  }

  if (!message || !message.trim()) {
    res.status(400);
    throw new Error("Announcement message content is required");
  }

  const validAudiences = ["teacher", "student", "general"];
  const audience = (targetAudience || "general").toLowerCase().trim();
  if (!validAudiences.includes(audience)) {
    res.status(400);
    throw new Error("Target audience must be 'teacher', 'student', or 'general'");
  }

  const adminUser = await Admin.findById(req.userAuth?._id);

  const announcement = await Announcement.create({
    title: title.trim(),
    message: message.trim(),
    targetAudience: audience,
    priority: priority || "medium",
    category: category || "general",
    status: status || "active",
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdBy: req.userAuth?._id,
    createdByName: adminUser?.name || "School Administration",
  });

  res.status(201).json({
    status: "Success",
    message: `Announcement published for ${audience === "general" ? "all (Teachers & Students)" : audience + "s"}`,
    data: announcement,
  });
});

//@desc Get all announcements (Admin table view with filters)
//@route GET /api/v1/announcements
//@access Private (Admin)
exports.getAllAnnouncementsAdminCtrl = AsyncHandler(async (req, res) => {
  const { targetAudience, status, priority, search } = req.query;

  const filter = {};

  if (targetAudience && targetAudience !== "all") {
    filter.targetAudience = targetAudience.toLowerCase();
  }

  if (status && status !== "all") {
    filter.status = status.toLowerCase();
  }

  if (priority && priority !== "all") {
    filter.priority = priority.toLowerCase();
  }

  if (search && search.trim()) {
    filter.$or = [
      { title: { $regex: search.trim(), $options: "i" } },
      { message: { $regex: search.trim(), $options: "i" } },
      { createdByName: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const rawList = await Announcement.find(filter)
    .populate("createdBy", "name email role")
    .sort({ createdAt: -1 })
    .lean();

  // Metrics
  const total = rawList.length;
  const teacherCount = rawList.filter((a) => a.targetAudience === "teacher").length;
  const studentCount = rawList.filter((a) => a.targetAudience === "student").length;
  const generalCount = rawList.filter((a) => a.targetAudience === "general").length;
  const activeCount = rawList.filter((a) => a.status === "active").length;

  res.status(200).json({
    status: "Success",
    count: total,
    metrics: {
      total,
      teacherCount,
      studentCount,
      generalCount,
      activeCount,
    },
    data: rawList,
  });
});

//@desc Get active announcements for Marquee ticker (Teacher, Student, Admin)
//@route GET /api/v1/announcements/active
//@access Public / Private (Adaptive by user role)
exports.getActiveAnnouncementsCtrl = AsyncHandler(async (req, res) => {
  // Determine role from req.userAuth or authorization header or query param
  let userRole = req.userAuth?.role || req.query.role;

  if (!userRole && req.headers?.authorization) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      if (token) {
        const decoded = verifyToken(token);
        if (decoded?.id) {
          const adminCheck = await Admin.findById(decoded.id).select("role");
          if (adminCheck) userRole = adminCheck.role;
          else {
            const teacherCheck = await Teacher.findById(decoded.id).select("role");
            if (teacherCheck) userRole = teacherCheck.role;
            else {
              const studentCheck = await Student.findById(decoded.id).select("role");
              if (studentCheck) userRole = studentCheck.role;
            }
          }
        }
      }
    } catch {
      // Ignore token decode failure and fallback to general
    }
  }

  const filter = {
    status: "active",
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  };

  // Filter based on target role:
  // If teacher -> teacher announcements + general announcements
  // If student -> student announcements + general announcements
  // If admin -> all active announcements
  // Default / anonymous -> general announcements
  if (userRole === "teacher") {
    filter.targetAudience = { $in: ["teacher", "general"] };
  } else if (userRole === "student") {
    filter.targetAudience = { $in: ["student", "general"] };
  } else if (userRole === "admin") {
    // Admin sees all
    if (req.query.targetAudience && req.query.targetAudience !== "all") {
      filter.targetAudience = req.query.targetAudience;
    }
  } else {
    filter.targetAudience = "general";
  }

  const announcements = await Announcement.find(filter).lean();

  // Sort by priority (urgent > high > medium > low), then latest date
  const sorted = announcements.sort((a, b) => {
    const pA = PRIORITY_ORDER[a.priority] || 99;
    const pB = PRIORITY_ORDER[b.priority] || 99;
    if (pA !== pB) return pA - pB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  res.status(200).json({
    status: "Success",
    count: sorted.length,
    role: userRole || "general",
    data: sorted,
  });
});

//@desc Get single announcement
//@route GET /api/v1/announcements/:id
//@access Private
exports.getAnnouncementByIdCtrl = AsyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id).populate(
    "createdBy",
    "name email role"
  );
  if (!announcement) {
    res.status(404);
    throw new Error("Announcement not found");
  }

  res.status(200).json({
    status: "Success",
    data: announcement,
  });
});

//@desc Update announcement (Admin only)
//@route PUT /api/v1/announcements/:id
//@access Private (Admin)
exports.updateAnnouncementCtrl = AsyncHandler(async (req, res) => {
  const { title, message, targetAudience, priority, category, status, expiresAt } = req.body;

  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    res.status(404);
    throw new Error("Announcement not found");
  }

  if (title) announcement.title = title.trim();
  if (message) announcement.message = message.trim();
  if (targetAudience) {
    const valid = ["teacher", "student", "general"];
    if (valid.includes(targetAudience.toLowerCase())) {
      announcement.targetAudience = targetAudience.toLowerCase();
    }
  }
  if (priority) announcement.priority = priority;
  if (category) announcement.category = category;
  if (status) announcement.status = status;
  if (expiresAt !== undefined) {
    announcement.expiresAt = expiresAt ? new Date(expiresAt) : null;
  }

  await announcement.save();

  res.status(200).json({
    status: "Success",
    message: "Announcement updated successfully",
    data: announcement,
  });
});

//@desc Delete announcement (Admin only)
//@route DELETE /api/v1/announcements/:id
//@access Private (Admin)
exports.deleteAnnouncementCtrl = AsyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    res.status(404);
    throw new Error("Announcement not found");
  }

  await Announcement.findByIdAndDelete(req.params.id);

  res.status(200).json({
    status: "Success",
    message: "Announcement deleted successfully",
  });
});

//@desc Toggle announcement status between active and archived (Admin only)
//@route PATCH /api/v1/announcements/:id/status
//@access Private (Admin)
exports.toggleAnnouncementStatusCtrl = AsyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) {
    res.status(404);
    throw new Error("Announcement not found");
  }

  announcement.status = announcement.status === "active" ? "archived" : "active";
  await announcement.save();

  res.status(200).json({
    status: "Success",
    message: `Announcement marked as ${announcement.status}`,
    data: announcement,
  });
});
