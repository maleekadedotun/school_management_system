const AsyncHandler = require("express-async-handler");
const Attendance = require("../../models/Academy/Attendance");
const Student = require("../../models/Academy/Student");
const Teacher = require("../../models/Staff/Teacher");

// Helper to normalize date to YYYY-MM-DD format
const formatDateString = (dateInput) => {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
};

//@desc Mark or update student attendance
//@route POST /api/v1/attendance/mark
//@access Private (Teacher & Admin)
exports.markAttendanceCtrl = AsyncHandler(async (req, res) => {
  const { date, classLevel, subject, academicTerm, academicYear, records, notes } = req.body;
  const teacherId = req.userAuth?._id;

  if (!classLevel) {
    return res.status(400).json({
      status: "failed",
      message: "Class level is required to mark attendance.",
    });
  }

  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      status: "failed",
      message: "Attendance records array cannot be empty.",
    });
  }

  const parsedDate = date ? new Date(date) : new Date();
  const dateString = formatDateString(parsedDate);
  const normalizedSubject = (subject || "").trim();
  const normalizedClassLevel = (classLevel || "").trim();

  // Calculate attendance summary
  const total = records.length;
  let present = 0;
  let absent = 0;
  let late = 0;
  let excused = 0;

  records.forEach((rec) => {
    const status = (rec.status || "Present").trim();
    if (status === "Present") present++;
    else if (status === "Absent") absent++;
    else if (status === "Late") late++;
    else if (status === "Excused") excused++;
  });

  const effectiveAttended = present + late;
  const attendanceRate = total > 0 ? Math.round((effectiveAttended / total) * 100) : 100;

  const summary = {
    total,
    present,
    absent,
    late,
    excused,
    attendanceRate,
  };

  // Find existing register for this teacher, class, subject, and day (Upsert)
  const filter = {
    teacher: teacherId,
    classLevel: normalizedClassLevel,
    subject: normalizedSubject,
    dateString,
  };

  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const existingAttendance = await Attendance.findOne(filter);

  // 🔒 5-Hour Lockout Enforcement:
  // If an attendance register already exists and 5 hours have elapsed since first submission,
  // modifications are strictly prohibited for teachers!
  if (existingAttendance && req.userAuth?.role !== "admin") {
    const initialTime = existingAttendance.firstSubmittedAt || existingAttendance.createdAt;
    const elapsedMs = Date.now() - new Date(initialTime).getTime();

    if (elapsedMs > FIVE_HOURS_MS) {
      const hoursAgo = Math.floor(elapsedMs / (60 * 60 * 1000));
      const minsAgo = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
      return res.status(403).json({
        status: "failed",
        isLocked: true,
        message: `Attendance register for ${dateString} was submitted ${hoursAgo}h ${minsAgo}m ago and is locked. In accordance with school regulations, attendance records cannot be edited after 5 hours.`,
      });
    }
  }

  const updateData = {
    date: parsedDate,
    dateString,
    classLevel: normalizedClassLevel,
    subject: normalizedSubject,
    academicTerm: academicTerm || "1st Term",
    academicYear: academicYear || "",
    teacher: teacherId,
    records,
    summary,
    notes: notes || "",
    ...(existingAttendance ? {} : { firstSubmittedAt: new Date() }),
  };

  const attendanceDoc = await Attendance.findOneAndUpdate(filter, updateData, {
    new: true,
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  }).populate({
    path: "records.student",
    select: "name email StudentId currentClassLevel program",
    populate: { path: "program", select: "name code" },
  });

  const docObj = attendanceDoc.toObject();
  docObj.isLocked = false;
  docObj.remainingSeconds = FIVE_HOURS_MS / 1000;

  res.status(200).json({
    status: "Success",
    message: `Attendance marked successfully for ${dateString}! (${present}/${total} present - ${attendanceRate}%)`,
    data: docObj,
  });
});

//@desc Fetch attendance register by date and class/subject
//@route GET /api/v1/attendance/date
//@access Private (Teacher & Admin)
exports.getAttendanceByDateCtrl = AsyncHandler(async (req, res) => {
  const { date, classLevel, subject } = req.query;
  const teacherId = req.userAuth?._id;

  const dateString = formatDateString(date);
  const query = {
    dateString,
  };

  // If teacher, scope to their records (unless admin)
  if (req.userAuth?.role !== "admin") {
    query.teacher = teacherId;
  }

  if (classLevel) {
    query.classLevel = (classLevel || "").trim();
  }

  if (subject) {
    query.subject = (subject || "").trim();
  }

  const attendanceDoc = await Attendance.findOne(query)
    .populate({
      path: "records.student",
      select: "name email StudentId currentClassLevel program isSuspended isWithDrawn",
      populate: { path: "program", select: "name code" },
    })
    .populate("teacher", "name email teacherId");

  let isLocked = false;
  let remainingSeconds = 0;
  let lockExpiresAt = null;

  if (attendanceDoc) {
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    const initialTime = attendanceDoc.firstSubmittedAt || attendanceDoc.createdAt;
    const elapsedMs = Date.now() - new Date(initialTime).getTime();
    lockExpiresAt = new Date(new Date(initialTime).getTime() + FIVE_HOURS_MS);

    if (elapsedMs >= FIVE_HOURS_MS) {
      isLocked = true;
      remainingSeconds = 0;
    } else {
      isLocked = false;
      remainingSeconds = Math.round((FIVE_HOURS_MS - elapsedMs) / 1000);
    }
  }

  let resultData = null;
  if (attendanceDoc) {
    resultData = attendanceDoc.toObject();
    resultData.isLocked = isLocked;
    resultData.remainingSeconds = remainingSeconds;
    resultData.lockExpiresAt = lockExpiresAt;
  }

  res.status(200).json({
    status: "Success",
    message: attendanceDoc
      ? "Attendance register found"
      : "No attendance register logged yet for this date",
    data: resultData,
  });
});

//@desc Get teacher attendance history list
//@route GET /api/v1/attendance/history
//@access Private (Teacher & Admin)
exports.getTeacherAttendanceHistoryCtrl = AsyncHandler(async (req, res) => {
  const { classLevel, subject, startDate, endDate, limit = 50 } = req.query;
  const teacherId = req.userAuth?._id;

  const query = {};
  if (req.userAuth?.role !== "admin") {
    query.teacher = teacherId;
  }

  if (classLevel) {
    query.classLevel = classLevel.trim();
  }

  if (subject) {
    query.subject = subject.trim();
  }

  if (startDate || endDate) {
    query.dateString = {};
    if (startDate) query.dateString.$gte = formatDateString(startDate);
    if (endDate) query.dateString.$lte = formatDateString(endDate);
  }

  const history = await Attendance.find(query)
    .populate({
      path: "records.student",
      select: "name StudentId currentClassLevel",
    })
    .populate("teacher", "name email teacherId")
    .sort({ dateString: -1, createdAt: -1 })
    .limit(parseInt(limit));

  res.status(200).json({
    status: "Success",
    message: "Attendance history retrieved successfully",
    results: history.length,
    data: history,
  });
});

//@desc Get overall attendance statistics & metrics
//@route GET /api/v1/attendance/stats
//@access Private (Teacher & Admin)
exports.getAttendanceStatsCtrl = AsyncHandler(async (req, res) => {
  const teacherId = req.userAuth?._id;
  const { classLevel } = req.query;

  const matchQuery = {};
  if (req.userAuth?.role !== "admin") {
    matchQuery.teacher = teacherId;
  }
  if (classLevel) {
    matchQuery.classLevel = classLevel.trim();
  }

  const allRegisters = await Attendance.find(matchQuery).sort({ dateString: -1 });

  let totalSessions = allRegisters.length;
  let aggregateTotalStudents = 0;
  let aggregatePresent = 0;
  let aggregateAbsent = 0;
  let aggregateLate = 0;
  let aggregateExcused = 0;

  allRegisters.forEach((att) => {
    const s = att.summary || {};
    aggregateTotalStudents += s.total || 0;
    aggregatePresent += s.present || 0;
    aggregateAbsent += s.absent || 0;
    aggregateLate += s.late || 0;
    aggregateExcused += s.excused || 0;
  });

  const overallRate =
    aggregateTotalStudents > 0
      ? Math.round(((aggregatePresent + aggregateLate) / aggregateTotalStudents) * 100)
      : 100;

  // Recent 7 days activity
  const recentLogs = allRegisters.slice(0, 7).map((r) => ({
    _id: r._id,
    dateString: r.dateString,
    classLevel: r.classLevel,
    subject: r.subject,
    summary: r.summary,
  }));

  res.status(200).json({
    status: "Success",
    message: "Attendance statistics calculated successfully",
    data: {
      totalSessions,
      aggregateTotalStudents,
      aggregatePresent,
      aggregateAbsent,
      aggregateLate,
      aggregateExcused,
      overallRate,
      recentLogs,
    },
  });
});

//@desc Delete attendance register
//@route DELETE /api/v1/attendance/:id
//@access Private (Teacher & Admin)
exports.deleteAttendanceCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const teacherId = req.userAuth?._id;

  const query = { _id: id };
  if (req.userAuth?.role !== "admin") {
    query.teacher = teacherId;
  }

  const sessionDoc = await Attendance.findOne(query);
  if (!sessionDoc) {
    return res.status(404).json({
      status: "failed",
      message: "Attendance session not found or you do not have permission to delete it.",
    });
  }

  // 🔒 Lockout enforcement on delete
  if (req.userAuth?.role !== "admin") {
    const initialTime = sessionDoc.firstSubmittedAt || sessionDoc.createdAt;
    const elapsedMs = Date.now() - new Date(initialTime).getTime();
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    if (elapsedMs > FIVE_HOURS_MS) {
      return res.status(403).json({
        status: "failed",
        isLocked: true,
        message: "This attendance record was submitted more than 5 hours ago and is locked. It cannot be deleted.",
      });
    }
  }

  await sessionDoc.deleteOne();

  res.status(200).json({
    status: "Success",
    message: "Attendance register deleted successfully",
    data: sessionDoc,
  });
});
