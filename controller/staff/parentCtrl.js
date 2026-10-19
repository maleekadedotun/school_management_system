const AsyncHandler = require("express-async-handler");
const Parent = require("../../models/Staff/Parent");
const Student = require("../../models/Academy/Student");
const ExamResults = require("../../models/Academy/ExamResults");
const Exam = require("../../models/Academy/Exam");
const Question = require("../../models/Academy/Question");
const StudentReportCard = require("../../models/Academy/StudentReportCard");
const StudentInvoice = require("../../models/Academy/StudentInvoice");
const FeeStructure = require("../../models/Academy/FeeStructure");
const Announcement = require("../../models/Staff/Announcement");
const Program = require("../../models/Academy/Program");
const Subject = require("../../models/Academy/Subject");
const ClassLevel = require("../../models/Academy/ClassLevel");
const AcademicTerm = require("../../models/Academy/AcademicTerm");
const AcademicYear = require("../../models/Academy/AcademicYear");
const Teacher = require("../../models/Staff/Teacher");
const generateToken = require("../../utils/generateToken");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");

//@desc Register a new parent (Admin or Self-Registration with student verification)
//@route POST /api/v1/parents/register
//@access Public or Private (Admin)
exports.parentRegisterCtrl = AsyncHandler(async (req, res) => {
  const { name, email, password, phone, studentIds = [], studentIdentifier } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Name, email, and password are required");
  }

  const existingParent = await Parent.findOne({ email: email.toLowerCase().trim() });
  if (existingParent) {
    res.status(400);
    throw new Error("A parent account with this email already exists");
  }

  // Link children if student IDs or identifiers provided
  let linkedChildren = [];
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    const students = await Student.find({ _id: { $in: studentIds } });
    linkedChildren = students.map((s) => s._id);
  } else if (studentIdentifier) {
    // Search by studentId or email
    const student = await Student.findOne({
      $or: [
        { studentId: studentIdentifier.trim() },
        { StudentId: studentIdentifier.trim() },
        { email: studentIdentifier.trim().toLowerCase() },
      ],
    });
    if (student) {
      linkedChildren.push(student._id);
    }
  }

  const parent = await Parent.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: await hashedPassword(password),
    phone: phone ? phone.trim() : "",
    children: linkedChildren,
  });

  // Also update child student documents to reference this parent
  if (linkedChildren.length > 0) {
    await Student.updateMany(
      { _id: { $in: linkedChildren } },
      { $set: { parent: parent._id, parentEmail: parent.email } }
    );
  }

  res.status(201).json({
    status: "success",
    message: "Parent registered successfully",
    data: {
      _id: parent._id,
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      role: parent.role,
      parentId: parent.parentId,
      children: parent.children,
    },
  });
});

//@desc Login parent
//@route POST /api/v1/parents/login
//@access Public
exports.parentLoginCtrl = AsyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const parent = await Parent.findOne({ email: email.toLowerCase().trim() }).populate({
    path: "children",
    select: "name email studentId StudentId currentClassLevel isWithDrawn isSuspended",
  });

  if (!parent) {
    return res.status(401).json({
      status: "failed",
      message: "Invalid email or password",
    });
  }

  if (parent.isSuspended) {
    return res.status(403).json({
      status: "failed",
      message: "Your parent account has been suspended. Please contact school administration.",
    });
  }

  const isMatched = await isPasswordMatched(password, parent.password);
  if (!isMatched) {
    return res.status(401).json({
      status: "failed",
      message: "Invalid email or password",
    });
  }

  const token = generateToken(parent._id);

  res.status(200).json({
    status: "success",
    message: "Parent logged in successfully",
    token,
    data: token, // for compatibility with project token conventions
    user: {
      _id: parent._id,
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      role: parent.role || "parent",
      parentId: parent.parentId,
      children: parent.children,
    },
  });
});

//@desc Get current authenticated parent profile with linked children
//@route GET /api/v1/parents/profile
//@access Private (Parent)
exports.getParentProfileCtrl = AsyncHandler(async (req, res) => {
  const parent = await Parent.findById(req.userAuth._id).populate({
    path: "children",
    select: "name email studentId StudentId currentClassLevel isWithDrawn isSuspended classLevels",
  });

  if (!parent) {
    res.status(404);
    throw new Error("Parent profile not found");
  }

  res.status(200).json({
    status: "success",
    data: parent,
  });
});

//@desc Link a student to a parent
//@route POST /api/v1/parents/link-student
//@access Private (Admin or Parent)
exports.linkStudentToParentCtrl = AsyncHandler(async (req, res) => {
  const { parentId, studentIdentifier } = req.body;

  // Determine target parent
  const targetParentId = req.userAuth.role === "admin" && parentId ? parentId : req.userAuth._id;

  const parent = await Parent.findById(targetParentId);
  if (!parent) {
    res.status(404);
    throw new Error("Parent not found");
  }

  if (!studentIdentifier) {
    res.status(400);
    throw new Error("Student admission number (studentId) or email is required");
  }

  const student = await Student.findOne({
    $or: [
      { studentId: studentIdentifier.trim() },
      { StudentId: studentIdentifier.trim() },
      { email: studentIdentifier.trim().toLowerCase() },
    ],
  });

  if (!student) {
    res.status(404);
    throw new Error(`No student found with identifier "${studentIdentifier}"`);
  }

  // Prevent duplicate linking
  if (!parent.children.some((id) => id.toString() === student._id.toString())) {
    parent.children.push(student._id);
    await parent.save();
  }

  student.parent = parent._id;
  student.parentEmail = parent.email;
  await student.save();

  const updatedParent = await Parent.findById(parent._id).populate("children", "name email studentId StudentId currentClassLevel");

  res.status(200).json({
    status: "success",
    message: `Student "${student.name}" successfully linked to parent "${parent.name}"`,
    data: updatedParent,
  });
});

//@desc Get all parents (Admin only)
//@route GET /api/v1/parents
//@access Private (Admin)
exports.getAllParentsCtrl = AsyncHandler(async (req, res) => {
  const parents = await Parent.find()
    .select("-password")
    .populate("children", "name email studentId StudentId currentClassLevel")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    count: parents.length,
    data: parents,
  });
});

//@desc Get unified dashboard analytics and student overview for parent
//@route GET /api/v1/parents/dashboard
//@access Private (Parent, Admin)
exports.getParentDashboardCtrl = AsyncHandler(async (req, res) => {
  const userId = req.userAuth.role === "admin" && req.query.parentId ? req.query.parentId : req.userAuth._id;
  const targetStudentId = req.query.studentId;

  const parentDoc = await Parent.findById(userId).populate({
    path: "children",
    select: "name email StudentId studentId currentClassLevel classLevels isWithDrawn isSuspended isGraduated yearGraduated isPromotedToLevel200 isPromotedToLevel300 isPromotedToLevel400 prefectName dateAdmitted program assignedTeacher enrolledSubjects",
    populate: [
      { path: "program", select: "name code description subjects" },
      { path: "assignedTeacher", select: "name email teacherId subject phone" },
      { path: "enrolledSubjects.subject", select: "name" },
    ],
  });

  if (!parentDoc) {
    res.status(404);
    throw new Error("Parent profile not found");
  }

  const children = parentDoc.children || [];
  if (children.length === 0) {
    return res.status(200).json({
      status: "success",
      data: {
        parent: {
          _id: parentDoc._id,
          name: parentDoc.name,
          email: parentDoc.email,
          phone: parentDoc.phone,
          parentId: parentDoc.parentId,
        },
        children: [],
        activeChild: null,
      },
    });
  }

  // Determine active child
  let activeChild = children[0];
  if (targetStudentId && targetStudentId !== "all") {
    const found = children.find(
      (c) => c._id.toString() === targetStudentId.toString()
    );
    if (found) activeChild = found;
  }

  const childId = activeChild._id;

  // 1. Fetch child's recent & eligible assignments
  const Assignment = require("../../models/Academy/Assignment");
  const AssignmentSubmission = require("../../models/Academy/AssignmentSubmission");
  const { isStudentEligibleForAssignment } = require("../academic/assignmentCtrl");

  const publishedAssignments = await Assignment.find({
    status: { $in: ["published", "active"] },
  })
    .populate("subject", "name")
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("createdBy", "name email teacherId")
    .sort({ dueDate: 1, createdAt: -1 });

  const childSubmissions = await AssignmentSubmission.find({
    student: childId,
  });

  const subMap = new Map();
  childSubmissions.forEach((sub) => {
    subMap.set(sub.assignment.toString(), sub);
  });

  const now = new Date();
  let totalAssignments = 0;
  let pendingAssignments = 0;
  let submittedAssignments = 0;
  let gradedAssignments = 0;
  let overdueAssignments = 0;
  let assignmentScoreSum = 0;
  let gradedCount = 0;
  let recentAssignments = [];

  for (const assign of publishedAssignments) {
    if (typeof isStudentEligibleForAssignment === "function" && !isStudentEligibleForAssignment(activeChild, assign)) {
      continue;
    }

    const sub = subMap.get(assign._id.toString());
    const hasSubmitted = !!sub;
    let subStatus = "pending";

    if (sub) {
      subStatus = sub.status;
      if (sub.score !== undefined && sub.score !== null) {
        assignmentScoreSum += (sub.score / (assign.totalMarks || 100)) * 100;
        gradedCount += 1;
      }
    } else if (assign.dueDate && new Date(assign.dueDate) < now) {
      subStatus = "overdue";
      overdueAssignments += 1;
    }

    if (subStatus === "pending") pendingAssignments += 1;
    else if (subStatus === "submitted") submittedAssignments += 1;
    else if (subStatus === "graded") gradedAssignments += 1;

    totalAssignments += 1;

    if (recentAssignments.length < 5) {
      const p = assign.toObject();
      p.submission = sub || null;
      p.hasSubmitted = hasSubmitted;
      p.submissionStatus = subStatus;
      recentAssignments.push(p);
    }
  }

  const assignmentAvg =
    gradedCount > 0 ? Math.round(assignmentScoreSum / gradedCount) : 0;

  // 2. Attendance Summary
  const Attendance = require("../../models/Academy/Attendance");
  const attendanceDocs = await Attendance.find({
    "records.student": childId,
  })
    .populate("teacher", "name")
    .sort({ date: -1 });

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let recentAttendance = [];

  for (const doc of attendanceDocs) {
    const studentRecord = doc.records.find(
      (r) => r.student?.toString() === childId.toString()
    );
    if (!studentRecord) continue;

    if (studentRecord.status === "Present") presentCount += 1;
    else if (studentRecord.status === "Absent") absentCount += 1;
    else if (studentRecord.status === "Late") lateCount += 1;
    else if (studentRecord.status === "Excused") excusedCount += 1;

    if (recentAttendance.length < 5) {
      recentAttendance.push({
        date: doc.date,
        dateString: doc.dateString,
        subject: doc.subject,
        classLevel: doc.classLevel,
        teacher: doc.teacher?.name || "Teacher",
        status: studentRecord.status,
        remarks: studentRecord.remarks || "",
      });
    }
  }

  const totalSessions = presentCount + absentCount + lateCount + excusedCount;
  const attendanceRate =
    totalSessions > 0
      ? Math.round(((presentCount + lateCount * 0.5) / totalSessions) * 100)
      : 100;

  // 3. Exam Results (MANDATORY: Parents only see results approved & published by Admin)
  const ExamResults = require("../../models/Academy/ExamResults");
  const examResults = await ExamResults.find({
    $or: [
      { studentID: activeChild.StudentId },
      { studentID: activeChild.studentId },
      { studentID: childId.toString() },
    ],
    isPublished: true,
  })
    .populate({
      path: "exam",
      populate: [
        { path: "subject" },
        { path: "program" },
        { path: "academicTerm" },
        { path: "academicYear" },
        { path: "classLevel" },
      ],
    })
    .populate("classLevel")
    .populate("academicTerm")
    .populate("academicYear")
    .sort({ createdAt: -1 });

  const totalExams = examResults.length;
  const passedExams = examResults.filter((e) => e.status === "Passed").length;
  const failedExams = examResults.filter((e) => e.status === "Failed").length;
  const examAvg =
    totalExams > 0
      ? Math.round(
          examResults.reduce(
            (acc, curr) => acc + (curr.score || curr.grade || 0),
            0
          ) / totalExams
        )
      : 0;

  const recentExams = examResults.map((e) => ({
    _id: e._id,
    examName: e.exam?.name || "Exam",
    examType: e.exam?.examType || "Assessment",
    subject: e.exam?.subject?.name || e.exam?.subject || "Subject",
    score: e.score,
    grade: e.grade,
    passMark: e.passMark || e.exam?.passMark || 50,
    totalMark: e.exam?.totalMark || 100,
    status: e.status,
    isPublished: e.isPublished ?? true,
    isTeacherPublished: e.isTeacherPublished ?? true,
    term: e.academicTerm?.name || e.exam?.academicTerm?.name || e.exam?.academicTerm || "",
    academicYear: e.academicYear?.name || e.exam?.academicYear?.name || "",
    classLevel: e.classLevel?.name || e.exam?.classLevel?.name || "",
    remarks: e.remarks || "",
    answeredQuestions: e.answeredQuestions || [],
    createdAt: e.createdAt,
  }));

  // 3b. Student Term Report Cards (MANDATORY: Parents only see report cards approved or published by Admin)
  const StudentReportCard = require("../../models/Academy/StudentReportCard");
  const allReportCards = await StudentReportCard.find({
    $or: [
      { student: childId },
      { studentID: activeChild.StudentId },
      { studentID: activeChild.studentId },
    ],
  })
    .populate("academicYear", "name")
    .populate("academicTerm", "name")
    .populate("classLevel", "name")
    .populate("approvedBy", "name")
    .populate("publishedBy", "name")
    .sort({ createdAt: -1 });

  const publishedReportCards = allReportCards.filter(
    (rc) => rc.published === true || rc.status === "published" || rc.status === "approved" || Boolean(rc.approvedBy)
  );
  const latestReportCard = publishedReportCards[0] || null;

  // 3c. Active announcements showing on student dashboard
  const Announcement = require("../../models/Staff/Announcement");
  const announcements = await Announcement.find({
    status: "active",
    targetAudience: { $in: ["student", "parent", "general"] },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(10);

  // 4. Financial & Invoices
  const StudentInvoice = require("../../models/Academy/StudentInvoice");
  const FeeStructure = require("../../models/Academy/FeeStructure");
  const invoices = await StudentInvoice.find({
    student: childId,
  })
    .populate("feeStructure", "name academicYear academicTerm totalAmount")
    .sort({ createdAt: -1 });

  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalBalance = 0;

  if (invoices && invoices.length > 0) {
    for (const inv of invoices) {
      const billed =
        inv.totalAmountDue !== undefined && inv.totalAmountDue !== null
          ? inv.totalAmountDue
          : inv.totalAmount !== undefined && inv.totalAmount !== null
          ? inv.totalAmount
          : inv.subtotal || 0;
      const paid = inv.amountPaid || 0;
      const balance =
        inv.balanceDue !== undefined && inv.balanceDue !== null
          ? inv.balanceDue
          : inv.balanceAmount !== undefined && inv.balanceAmount !== null
          ? inv.balanceAmount
          : Math.max(0, billed - paid);

      totalInvoiced += billed;
      totalPaid += paid;
      totalBalance += balance;
    }
  } else if (activeChild?.currentClassLevel) {
    // If individual invoices have not been generated yet, look up active class fee structure as the student's original bill
    const activeFeeStructure = await FeeStructure.findOne({
      classLevel: {
        $regex: new RegExp(`^${activeChild.currentClassLevel.trim()}$`, "i"),
      },
      isActive: true,
    }).sort({ createdAt: -1 });

    if (activeFeeStructure) {
      totalInvoiced = activeFeeStructure.totalAmount || 0;
      totalPaid = 0;
      totalBalance = totalInvoiced;
    }
  }

  // 5. Milestones & Level Progression
  const levelStr = activeChild.currentClassLevel || "Level 100";
  let stepIndex = 0;
  if (levelStr.includes("200")) stepIndex = 1;
  else if (levelStr.includes("300")) stepIndex = 2;
  else if (levelStr.includes("400")) stepIndex = 3;
  if (activeChild.isGraduated) stepIndex = 4;

  res.status(200).json({
    status: "success",
    data: {
      parent: {
        _id: parentDoc._id,
        name: parentDoc.name,
        email: parentDoc.email,
        phone: parentDoc.phone,
        parentId: parentDoc.parentId,
      },
      children: children.map((c) => ({
        _id: c._id,
        name: c.name,
        StudentId: c.StudentId || c.studentId,
        currentClassLevel: c.currentClassLevel,
        email: c.email,
        program: c.program?.name || "",
      })),
      activeChild: {
        profile: activeChild,
        kpis: {
          attendanceRate,
          assignmentsTotal: totalAssignments,
          assignmentsPending: pendingAssignments,
          assignmentsSubmitted: submittedAssignments,
          assignmentsGraded: gradedAssignments,
          assignmentsOverdue: overdueAssignments,
          assignmentAvg,
          examAverage: examAvg,
          totalExamsTaken: totalExams,
          passedExams,
          failedExams,
          totalInvoiced,
          totalPaid,
          feeBalance: totalBalance,
          feeStatus:
            totalInvoiced > 0 && totalBalance <= 0
              ? "Fully Paid"
              : totalPaid > 0
              ? "Partially Paid"
              : totalInvoiced > 0
              ? "Unpaid"
              : "No Invoices",
        },
        milestones: {
          currentLevel: levelStr,
          stepIndex,
          isGraduated: activeChild.isGraduated,
          status: activeChild.isSuspended
            ? "Suspended"
            : activeChild.isWithDrawn
            ? "Withdrawn"
            : "Good Standing",
        },
        recentAssignments,
        recentExams,
        publishedReportCards,
        latestReportCard,
        attendanceSummary: {
          totalSessions,
          presentCount,
          absentCount,
          lateCount,
          excusedCount,
          rate: attendanceRate,
          recentRecords: recentAttendance,
        },
        recentInvoices: invoices.slice(0, 3),
      },
      announcements,
    },
  });
});
