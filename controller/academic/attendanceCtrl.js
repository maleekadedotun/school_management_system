const AsyncHandler = require("express-async-handler");
const Attendance = require("../../models/Academy/Attendance");
const Student = require("../../models/Academy/Student");
const Teacher = require("../../models/Staff/Teacher");
const Parent = require("../../models/Staff/Parent");

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

//@desc Get student's personal attendance summary (Read-Only)
//@route GET /api/v1/attendance/student/my-attendance
//@access Private (Student, Admin)
exports.getStudentAttendanceSummaryCtrl = AsyncHandler(async (req, res) => {
  const user = req.userAuth;
  const studentId = user.role === "student" ? user._id : (req.query.studentId || user._id);

  const studentDoc = await Student.findById(studentId).select("name email StudentId currentClassLevel program");
  if (!studentDoc) {
    return res.status(404).json({
      status: "failed",
      message: "Student record not found",
    });
  }

  // Find all attendance sessions containing this student
  const registers = await Attendance.find({ "records.student": studentId })
    .populate("teacher", "name email teacherId")
    .sort({ dateString: -1, createdAt: -1 });

  let presentDays = [];
  let absentDays = [];
  let lateDays = [];
  let excusedDays = [];
  let allRecords = [];

  registers.forEach((reg) => {
    const studentRec = reg.records.find(
      (r) => r.student && r.student.toString() === studentId.toString()
    );
    if (studentRec) {
      const item = {
        _id: reg._id,
        date: reg.date,
        dateString: reg.dateString,
        classLevel: reg.classLevel,
        subject: reg.subject || "General / Morning Roll Call",
        academicTerm: reg.academicTerm,
        academicYear: reg.academicYear,
        teacher: reg.teacher ? { _id: reg.teacher._id, name: reg.teacher.name, email: reg.teacher.email } : null,
        status: studentRec.status,
        remarks: studentRec.remarks || "",
      };

      allRecords.push(item);
      if (studentRec.status === "Present") presentDays.push(item);
      else if (studentRec.status === "Absent") absentDays.push(item);
      else if (studentRec.status === "Late") lateDays.push(item);
      else if (studentRec.status === "Excused") excusedDays.push(item);
    }
  });

  const totalSessions = allRecords.length;
  const presentCount = presentDays.length;
  const absentCount = absentDays.length;
  const lateCount = lateDays.length;
  const excusedCount = excusedDays.length;
  const attendanceRate =
    totalSessions > 0
      ? Math.round(((presentCount + lateCount) / totalSessions) * 100)
      : 100;

  res.status(200).json({
    status: "Success",
    message: "Student attendance summary fetched successfully",
    data: {
      student: studentDoc,
      summary: {
        totalSessions,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        attendanceRate,
      },
      presentDays,
      absentDays,
      lateDays,
      excusedDays,
      allRecords,
    },
  });
});

//@desc Get parent child's attendance summary (Read-Only)
//@route GET /api/v1/attendance/parent/child-attendance
//@access Private (Parent, Admin)
exports.getParentChildAttendanceSummaryCtrl = AsyncHandler(async (req, res) => {
  const user = req.userAuth;
  let childrenList = [];
  let targetChildId = req.query.studentId;

  if (user.role === "parent") {
    const parentDoc = await Parent.findById(user._id).populate(
      "children",
      "name email StudentId currentClassLevel program"
    );

    if (!parentDoc) {
      return res.status(404).json({
        status: "failed",
        message: "Parent profile not found",
      });
    }

    childrenList = parentDoc.children || [];
    if (childrenList.length === 0) {
      return res.status(200).json({
        status: "Success",
        message: "No children currently linked to this parent account",
        data: {
          children: [],
          activeChild: null,
          summary: {
            totalSessions: 0,
            presentCount: 0,
            absentCount: 0,
            lateCount: 0,
            excusedCount: 0,
            attendanceRate: 100,
          },
          presentDays: [],
          absentDays: [],
          lateDays: [],
          excusedDays: [],
          allRecords: [],
        },
      });
    }

    if (!targetChildId) {
      targetChildId = childrenList[0]._id.toString();
    } else {
      const isLinked = childrenList.some(
        (c) => c._id.toString() === targetChildId.toString()
      );
      if (!isLinked) {
        return res.status(403).json({
          status: "failed",
          message: "Access denied: Specified student is not linked to your parent account",
        });
      }
    }
  } else if (user.role === "admin") {
    if (!targetChildId) {
      const anyStudent = await Student.findOne().select("name email StudentId currentClassLevel program");
      if (!anyStudent) {
        return res.status(404).json({
          status: "failed",
          message: "No students exist in system",
        });
      }
      targetChildId = anyStudent._id.toString();
    }
    const student = await Student.findById(targetChildId).select("name email StudentId currentClassLevel program");
    childrenList = student ? [student] : [];
  } else {
    return res.status(403).json({
      status: "failed",
      message: "Access denied: Unauthorized role",
    });
  }

  const activeChild = childrenList.find(
    (c) => c._id.toString() === targetChildId.toString()
  ) || (await Student.findById(targetChildId).select("name email StudentId currentClassLevel program"));

  const registers = await Attendance.find({ "records.student": targetChildId })
    .populate("teacher", "name email teacherId")
    .sort({ dateString: -1, createdAt: -1 });

  let presentDays = [];
  let absentDays = [];
  let lateDays = [];
  let excusedDays = [];
  let allRecords = [];

  registers.forEach((reg) => {
    const studentRec = reg.records.find(
      (r) => r.student && r.student.toString() === targetChildId.toString()
    );
    if (studentRec) {
      const item = {
        _id: reg._id,
        date: reg.date,
        dateString: reg.dateString,
        classLevel: reg.classLevel,
        subject: reg.subject || "General / Morning Roll Call",
        academicTerm: reg.academicTerm,
        academicYear: reg.academicYear,
        teacher: reg.teacher ? { _id: reg.teacher._id, name: reg.teacher.name, email: reg.teacher.email } : null,
        status: studentRec.status,
        remarks: studentRec.remarks || "",
      };

      allRecords.push(item);
      if (studentRec.status === "Present") presentDays.push(item);
      else if (studentRec.status === "Absent") absentDays.push(item);
      else if (studentRec.status === "Late") lateDays.push(item);
      else if (studentRec.status === "Excused") excusedDays.push(item);
    }
  });

  const totalSessions = allRecords.length;
  const presentCount = presentDays.length;
  const absentCount = absentDays.length;
  const lateCount = lateDays.length;
  const excusedCount = excusedDays.length;
  const attendanceRate =
    totalSessions > 0
      ? Math.round(((presentCount + lateCount) / totalSessions) * 100)
      : 100;

  res.status(200).json({
    status: "Success",
    message: "Child attendance summary fetched successfully",
    data: {
      children: childrenList,
      activeChild,
      summary: {
        totalSessions,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        attendanceRate,
      },
      presentDays,
      absentDays,
      lateDays,
      excusedDays,
      allRecords,
    },
  });
});
