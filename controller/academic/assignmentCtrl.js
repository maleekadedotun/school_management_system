const AsyncHandler = require("express-async-handler");
const Assignment = require("../../models/Academy/Assignment");
const AssignmentSubmission = require("../../models/Academy/AssignmentSubmission");
const Teacher = require("../../models/Staff/Teacher");
const Admin = require("../../models/Staff/admin");
const Student = require("../../models/Academy/Student");
const Subject = require("../../models/Academy/Subject");
const ClassLevel = require("../../models/Academy/ClassLevel");

const Program = require("../../models/Academy/program");

// Helper to normalize class level names (e.g. "Level 100", "100 Level", "100L" -> "100")
const normalizeClassLevel = (val) => {
  if (!val) return "";
  const nameStr = (val.name || val.title || (typeof val === "string" ? val : "")).toString().trim().toLowerCase();
  if (nameStr && !/^[0-9a-fA-F]{24}$/.test(nameStr)) {
    const num = nameStr.match(/\d+/)?.[0];
    if (num) return num;
    return nameStr;
  }
  const str = (val._id || val).toString().trim().toLowerCase();
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    return ""; // Avoid extracting digits from ObjectId hex strings
  }
  const num = str.match(/\d+/)?.[0];
  return num || str;
};


//@desc Create a new assignment
//@route POST /api/v1/assignments
//@access Teacher and Admin
exports.createAssignmentCtrl = AsyncHandler(async (req, res) => {
  let {
    title,
    description,
    subject,
    classLevel,
    program,
    academicTerm,
    academicYear,
    dueDate,
    dueTime,
    totalMarks,
    passMark,
    status,
    attachment,
  } = req.body;

  // Determine creator
  let teacherFound = await Teacher.findById(req.userAuth?._id);
  let adminFound = null;
  if (!teacherFound) {
    adminFound = await Admin.findById(req.userAuth?._id);
  }

  if (!teacherFound && !adminFound) {
    res.status(401);
    throw new Error("Unauthorized: Teacher or Administrator credentials required");
  }

  // If teacher is creating assignment, auto-resolve missing program, subject, or classLevel from teacher profile
  if (teacherFound) {
    if (!program && teacherFound.program) {
      const pDoc = await Program.findOne({ name: new RegExp(`^${teacherFound.program.trim()}$`, "i") });
      if (pDoc) program = pDoc._id;
    }
    if (!subject && teacherFound.subject) {
      const sDoc = await Subject.findOne({ name: new RegExp(`^${teacherFound.subject.trim()}$`, "i") });
      if (sDoc) subject = sDoc._id;
    }
    if (!classLevel && teacherFound.classLevel) {
      const cNorm = normalizeClassLevel(teacherFound.classLevel);
      const cDoc = await ClassLevel.findOne({
        $or: [
          { name: new RegExp(`^${teacherFound.classLevel.trim()}$`, "i") },
          { name: new RegExp(`(^|\\b)${cNorm}(\\b|$)`, "i") },
        ],
      });
      if (cDoc) classLevel = cDoc._id;
    }
  }

  // If program is not explicitly provided, check if the chosen subject has a linked program
  if (!program && subject) {
    const sDoc = await Subject.findById(subject);
    if (sDoc && sDoc.program) {
      program = sDoc.program;
    }
  }

  // Default to draft if status not provided
  const targetStatus = status || "draft";

  // When publishing directly, enforce full validation
  if (targetStatus === "published") {
    if (!title || !title.trim()) {
      res.status(400);
      throw new Error("Assignment title is required");
    }
    if (!classLevel) {
      res.status(400);
      throw new Error("Class level is required before publishing");
    }
    if (!subject) {
      res.status(400);
      throw new Error("Subject is required before publishing");
    }
    if (!dueDate) {
      res.status(400);
      throw new Error("Due date is required before publishing");
    }
    if (!description || !description.trim() || description === "<p></p>" || description === "<p><br></p>") {
      res.status(400);
      throw new Error("Assignment content/instructions are required before publishing");
    }
  } else {
    // Draft: require title so teacher can identify it
    if (!title || !title.trim()) {
      res.status(400);
      throw new Error("Please provide an assignment title to save draft");
    }
  }

  const creatorModel = teacherFound ? "Teacher" : "Admin";

  const assignment = new Assignment({
    title: title.trim(),
    description: description || "",
    subject: subject || undefined,
    classLevel: classLevel || undefined,
    program: program || undefined,
    academicTerm: academicTerm || undefined,
    academicYear: academicYear || undefined,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    dueTime: dueTime || "23:59",
    totalMarks: totalMarks ? Number(totalMarks) : 100,
    passMark: passMark ? Number(passMark) : 50,
    status: targetStatus,
    attachment: attachment || { url: "", filename: "", fileType: "", size: 0 },
    createdBy: req.userAuth._id,
    creatorModel,
  });

  await assignment.save();

  const populatedAssignment = await Assignment.findById(assignment._id)
    .populate("subject", "name")
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("createdBy", "name email");

  res.status(201).json({
    status: "Success",
    message: targetStatus === "published" ? "Assignment published successfully" : "Draft saved successfully",
    data: populatedAssignment,
  });
});

// Strict Eligibility check:
// The student MUST match ALL FOUR requirements:
// 1. Class Level - student's current class level must match the assignment's class level
// 2. Program - student's program must match the assignment's program
// 3. Subject - student must offer/be enrolled in the subject of the assignment
// 4. Teacher - student MUST have an assigned teacher, and that teacher must match the assignment creator (or creator is Admin)
const isStudentEligibleForAssignment = (student, assignment) => {
  if (!student || !assignment) return false;

  // 1. Class Level check:
  // Must match the particular level set on the assignment
  const studentClassNorm = normalizeClassLevel(student.currentClassLevel || student.classLevel);
  const studentClassList = Array.isArray(student.classLevels)
    ? student.classLevels.map((lvl) => normalizeClassLevel(lvl)).filter(Boolean)
    : [];

  const assignClassNorm = normalizeClassLevel(assignment.classLevel);

  const assignClassId = assignment.classLevel?._id
    ? assignment.classLevel._id.toString()
    : (assignment.classLevel ? assignment.classLevel.toString() : "");
  const studentClassId = student.classLevel?._id
    ? student.classLevel._id.toString()
    : (student.classLevel ? student.classLevel.toString() : "");

  let isClassMatch = false;
  if (!assignClassNorm && !assignClassId) {
    isClassMatch = true;
  } else {
    isClassMatch = Boolean(
      (studentClassNorm && assignClassNorm && studentClassNorm === assignClassNorm) ||
      (studentClassList.length > 0 && assignClassNorm && studentClassList.includes(assignClassNorm)) ||
      (studentClassId && assignClassId && studentClassId === assignClassId)
    );
  }

  // Student MUST match the class level
  if (!isClassMatch) {
    return false;
  }

  // 2. Program check:
  // Must match the designated program of the assignment
  const studentProgId = student.program?._id
    ? student.program._id.toString()
    : (student.program ? student.program.toString() : "");
  const studentProgName = (
    student.program?.name || (typeof student.program === "string" ? student.program : "")
  )
    .trim()
    .toLowerCase();

  const assignProgId = assignment.program?._id
    ? assignment.program._id.toString()
    : (assignment.program ? assignment.program.toString() : "");
  const assignProgName = (
    assignment.program?.name || (typeof assignment.program === "string" ? assignment.program : "")
  )
    .trim()
    .toLowerCase();

  let isProgramMatch = false;
  if (assignProgId || assignProgName) {
    if (!studentProgId && !studentProgName) {
      return false; // Assignment specifies a program, but student is not enrolled in any program
    }
    isProgramMatch = Boolean(
      (studentProgId && assignProgId && studentProgId === assignProgId) ||
      (studentProgName &&
        assignProgName &&
        (studentProgName === assignProgName ||
          assignProgName.includes(studentProgName) ||
          studentProgName.includes(assignProgName)))
    );
  } else {
    // If assignment didn't specify a program, program requirement passes
    isProgramMatch = true;
  }

  if (!isProgramMatch) {
    return false;
  }

  // 3. Subject check:
  // Must match the subject of the assignment
  let isSubjectMatch = false;
  if (!assignment.subject) {
    isSubjectMatch = true;
  } else {
    const assignSubId = assignment.subject?._id
      ? assignment.subject._id.toString()
      : (assignment.subject ? assignment.subject.toString() : "");
    const assignSubName = (
      assignment.subject?.name || (typeof assignment.subject === "string" ? assignment.subject : "")
    )
      .trim()
      .toLowerCase();

    // Check student's primary subject
    const studentSubId = student.subject?._id
      ? student.subject._id.toString()
      : (student.subject ? student.subject.toString() : "");
    const studentSubName = (
      student.subject?.name || (typeof student.subject === "string" ? student.subject : "")
    )
      .trim()
      .toLowerCase();

    if (
      (assignSubId && studentSubId && assignSubId === studentSubId) ||
      (assignSubName &&
        studentSubName &&
        (assignSubName === studentSubName ||
          assignSubName.includes(studentSubName) ||
          studentSubName.includes(assignSubName)))
    ) {
      isSubjectMatch = true;
    }

    // Check enrolled subjects
    if (!isSubjectMatch && Array.isArray(student.enrolledSubjects)) {
      isSubjectMatch = student.enrolledSubjects.some((item) => {
        if (!item || !item.subject) return false;
        const subId = item.subject?._id
          ? item.subject._id.toString()
          : item.subject.toString();
        const subName = (
          item.subject?.name || (typeof item.subject === "string" ? item.subject : "")
        )
          .trim()
          .toLowerCase();
        return (
          (assignSubId && subId && assignSubId === subId) ||
          (assignSubName &&
            subName &&
            (assignSubName === subName ||
              assignSubName.includes(subName) ||
              subName.includes(assignSubName)))
        );
      });
    }

    // Check program subjects if populated
    if (!isSubjectMatch && student.program && Array.isArray(student.program.subjects)) {
      isSubjectMatch = student.program.subjects.some((pSub) => {
        if (!pSub) return false;
        const pId = pSub._id ? pSub._id.toString() : pSub.toString();
        const pName = (pSub.name || (typeof pSub === "string" ? pSub : "")).trim().toLowerCase();
        return (
          (assignSubId && pId && assignSubId === pId) ||
          (assignSubName &&
            pName &&
            (assignSubName === pName ||
              assignSubName.includes(pName) ||
              pName.includes(assignSubName)))
        );
      });
    }
  }

  if (!isSubjectMatch) {
    return false;
  }

  // 4. Subject Teacher check:
  // If created by a Teacher, the student MUST have an assigned teacher, AND that teacher MUST match the creator!
  const creatorModel =
    assignment.creatorModel ||
    (assignment.createdBy?.role === "admin" ? "Admin" : "Teacher");
  const isCreatedByAdmin =
    creatorModel === "Admin" ||
    assignment.createdBy?.role === "admin" ||
    (assignment.createdBy?.name || "").toLowerCase().includes("admin");

  if (!isCreatedByAdmin) {
    // If student has NOT been assigned a teacher, access is strictly denied
    if (!student.assignedTeacher) {
      return false;
    }

    const studentTeacherId = student.assignedTeacher?._id
      ? student.assignedTeacher._id.toString()
      : student.assignedTeacher.toString();

    const creatorId = assignment.createdBy?._id
      ? assignment.createdBy._id.toString()
      : (assignment.createdBy ? assignment.createdBy.toString() : "");

    const studentTeacherEmail = (student.assignedTeacher?.email || "").trim().toLowerCase();
    const creatorEmail = (assignment.createdBy?.email || "").trim().toLowerCase();

    const studentTeacherIdCode = (student.assignedTeacher?.teacherId || "").trim().toLowerCase();
    const creatorTeacherIdCode = (assignment.createdBy?.teacherId || "").trim().toLowerCase();

    const studentTeacherName = (student.assignedTeacher?.name || "").trim().toLowerCase();
    const creatorName = (assignment.createdBy?.name || "").trim().toLowerCase();

    const isTeacherMatch = Boolean(
      (studentTeacherId && creatorId && studentTeacherId === creatorId) ||
      (studentTeacherEmail && creatorEmail && studentTeacherEmail === creatorEmail) ||
      (studentTeacherIdCode && creatorTeacherIdCode && studentTeacherIdCode === creatorTeacherIdCode) ||
      (studentTeacherName &&
        creatorName &&
        (studentTeacherName === creatorName ||
          studentTeacherName.includes(creatorName) ||
          creatorName.includes(studentTeacherName)))
    );

    if (!isTeacherMatch) {
      return false;
    }
  }

  // All 4 criteria (Class Level, Program, Subject, Subject Teacher) matched successfully!
  return true;
};



//@desc Get all assignments (role-aware: students see strictly their class/program assignments, teachers see theirs/class, admin sees all)
//@route GET /api/v1/assignments
//@access Authenticated Users (Teacher, Student, Admin)
exports.getAllAssignmentsCtrl = AsyncHandler(async (req, res) => {
  const userId = req.userAuth?._id;
  const userRole = req.userAuth?.role;

  let query = {};
  const { status, subject, classLevel, mine } = req.query;

  if (status) {
    query.status = status;
  }
  if (subject) {
    query.subject = subject;
  }
  if (classLevel) {
    query.classLevel = classLevel;
  }

  let assignments = [];

  if (userRole === "student") {
    // Look up the student details with assigned program, assigned teacher, and enrolled subjects
    const student = await Student.findById(userId)
      .populate({
        path: "program",
        populate: { path: "subjects", select: "name" },
      })
      .populate("assignedTeacher")
      .populate({
        path: "enrolledSubjects.subject",
        select: "name",
      });

    if (!student) {
      res.status(404);
      throw new Error("Student profile not found");
    }

    const studentFilter = { status: { $in: ["published", "active"] } };
    if (subject) studentFilter.subject = subject;

    const allActiveAssignments = await Assignment.find(studentFilter)
      .populate("subject", "name")
      .populate("classLevel", "name")
      .populate("program", "name")
      .populate("createdBy", "name email teacherId role")
      .sort({ createdAt: -1 });

    // Strictly filter for students who meet all requirements (Class Level, Program, Subject, Subject Teacher)
    const eligibleAssignments = allActiveAssignments.filter((item) =>
      isStudentEligibleForAssignment(student, item)
    );

    // Attach student's own submission status to each assignment
    const assignmentIds = eligibleAssignments.map((a) => a._id);
    const mySubmissions = await AssignmentSubmission.find({
      assignment: { $in: assignmentIds },
      student: userId,
    });

    const submissionMap = new Map();
    mySubmissions.forEach((sub) => {
      submissionMap.set(sub.assignment.toString(), sub);
    });

    const enrichedAssignments = eligibleAssignments.map((item) => {
      const plain = item.toObject();
      const mySub = submissionMap.get(item._id.toString());
      plain.mySubmission = mySub || null;
      plain.hasSubmitted = !!mySub;
      plain.submissionStatus = mySub ? mySub.status : "pending";
      // Prevent leaking other students' submission ids to this student
      plain.submissions = mySub ? [mySub._id] : [];
      return plain;
    });

    return res.status(200).json({
      status: "Success",
      results: enrichedAssignments.length,
      data: enrichedAssignments,
    });
  }

  // Teacher or Admin
  if (userRole === "teacher") {
    if (mine === "true" || mine === true) {
      query.createdBy = userId;
    }
  }

  assignments = await Assignment.find(query)
    .populate("subject", "name")
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("createdBy", "name email teacherId")
    .populate({
      path: "submissions",
      select: "status score submittedAt student studentName",
    })
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "Success",
    results: assignments.length,
    data: assignments,
  });
});

//@desc Get single assignment by ID
//@route GET /api/v1/assignments/:id
//@access Authenticated Users
exports.getAssignmentByIdCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userAuth?._id;
  const userRole = req.userAuth?.role;

  const assignment = await Assignment.findById(id)
    .populate("subject", "name")
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("academicTerm", "name")
    .populate("academicYear", "name")
    .populate("createdBy", "name email teacherId role");

  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  // If student, strictly verify Class Level, Program, Subject, and Teacher eligibility
  if (userRole === "student") {
    if (assignment.status === "draft") {
      res.status(403);
      throw new Error("This assignment is still a draft and not available to students.");
    }
    const student = await Student.findById(userId)
      .populate({
        path: "program",
        populate: { path: "subjects", select: "name" },
      })
      .populate("assignedTeacher")
      .populate({
        path: "enrolledSubjects.subject",
        select: "name",
      });
    if (!student || !isStudentEligibleForAssignment(student, assignment)) {
      res.status(403);
      throw new Error("No assignment record yet for your class.");
    }

    const plain = assignment.toObject();
    const mySub = await AssignmentSubmission.findOne({
      assignment: id,
      student: userId,
    });
    plain.mySubmission = mySub || null;
    plain.hasSubmitted = !!mySub;
    plain.submissionStatus = mySub ? mySub.status : "pending";
    plain.submissions = mySub ? [mySub._id] : [];

    return res.status(200).json({
      status: "Success",
      data: plain,
    });
  }

  // If teacher/admin, attach all submissions
  const plain = assignment.toObject();
  const submissions = await AssignmentSubmission.find({ assignment: id })
    .populate("student", "name StudentId email")
    .sort({ submittedAt: -1 });
  plain.allSubmissions = submissions;

  res.status(200).json({
    status: "Success",
    data: plain,
  });
});

//@desc Update assignment
//@route PUT /api/v1/assignments/:id
//@access Teacher and Admin
exports.updateAssignmentCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userAuth?._id?.toString();
  const userRole = req.userAuth?.role;

  const assignment = await Assignment.findById(id);
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  // Check authorization: only creator or admin
  if (userRole !== "admin" && assignment.createdBy.toString() !== userId) {
    res.status(403);
    throw new Error("Access denied: You can only edit assignments you created");
  }

  const {
    title,
    description,
    subject,
    classLevel,
    program,
    academicTerm,
    academicYear,
    dueDate,
    dueTime,
    totalMarks,
    passMark,
    status,
    attachment,
  } = req.body;

  if (title) assignment.title = title;
  if (description) assignment.description = description;
  if (subject) assignment.subject = subject;
  if (classLevel) assignment.classLevel = classLevel;
  if (program) assignment.program = program;
  if (academicTerm) assignment.academicTerm = academicTerm;
  if (academicYear) assignment.academicYear = academicYear;
  if (dueDate) assignment.dueDate = new Date(dueDate);
  if (dueTime) assignment.dueTime = dueTime;
  if (totalMarks !== undefined) assignment.totalMarks = Number(totalMarks);
  if (passMark !== undefined) assignment.passMark = Number(passMark);
  if (status) assignment.status = status;
  if (attachment) assignment.attachment = attachment;

  await assignment.save();

  const updated = await Assignment.findById(id)
    .populate("subject", "name")
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("createdBy", "name email");

  res.status(200).json({
    status: "Success",
    message: "Assignment updated successfully",
    data: updated,
  });
});

//@desc Delete assignment and its submissions
//@route DELETE /api/v1/assignments/:id
//@access Teacher and Admin
exports.deleteAssignmentCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userAuth?._id?.toString();
  const userRole = req.userAuth?.role;

  const assignment = await Assignment.findById(id);
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  // Check authorization
  if (userRole !== "admin" && assignment.createdBy.toString() !== userId) {
    res.status(403);
    throw new Error("Access denied: You can only delete assignments you created");
  }

  // Delete all submissions associated with this assignment
  await AssignmentSubmission.deleteMany({ assignment: id });
  await Assignment.findByIdAndDelete(id);

  res.status(200).json({
    status: "Success",
    message: "Assignment and all related submissions deleted successfully",
    data: id,
  });
});

//@desc Student submits assignment response/files
//@route POST /api/v1/assignments/:id/submit
//@access Student only
exports.submitAssignmentCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userAuth?._id;

  const assignment = await Assignment.findById(id)
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("createdBy", "name email teacherId role");
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  if (assignment.status === "draft") {
    res.status(400);
    throw new Error("Cannot submit to an unpublished draft assignment");
  }

  if (assignment.status === "closed") {
    res.status(400);
    throw new Error("This assignment is closed and no longer accepting submissions");
  }

  const student = await Student.findById(userId)
    .populate({
      path: "program",
      populate: { path: "subjects", select: "name" },
    })
    .populate("assignedTeacher")
    .populate({
      path: "enrolledSubjects.subject",
      select: "name",
    });
  if (!student) {
    res.status(404);
    throw new Error("Student profile not found");
  }

  // Strictly verify student meets all requirements: Class Level, Program, Subject, and Teacher
  if (!isStudentEligibleForAssignment(student, assignment)) {
    res.status(403);
    throw new Error("No assignment record yet for your class.");
  }

  const { submissionText, attachment } = req.body;

  if (!submissionText && (!attachment || !attachment.url)) {
    res.status(400);
    throw new Error("Please provide your submission text or an attached document/file");
  }

  // Check if late
  const now = new Date();
  const deadline = new Date(assignment.dueDate);
  const isLate = now > deadline;

  // Check for existing submission
  let existingSubmission = await AssignmentSubmission.findOne({
    assignment: id,
    student: userId,
  });

  if (existingSubmission) {
    // If already graded, prevent overwrite unless teacher resets
    if (existingSubmission.status === "graded") {
      res.status(400);
      throw new Error("Your assignment has already been graded and cannot be resubmitted");
    }

    existingSubmission.submissionText = submissionText || existingSubmission.submissionText;
    if (attachment) existingSubmission.attachment = attachment;
    existingSubmission.submittedAt = now;
    existingSubmission.status = isLate ? "late" : "submitted";
    existingSubmission.classLevel = student.currentClassLevel || existingSubmission.classLevel;
    existingSubmission.program = student.program?._id || student.program || existingSubmission.program;

    await existingSubmission.save();

    return res.status(200).json({
      status: "Success",
      message: isLate ? "Assignment resubmitted (Late)" : "Assignment resubmitted successfully",
      data: existingSubmission,
    });
  }

  // Create new submission with student's class level and program
  const newSubmission = new AssignmentSubmission({
    assignment: id,
    student: userId,
    studentName: student.name,
    studentId: student.StudentId,
    studentEmail: student.email,
    classLevel: student.currentClassLevel || "",
    program: student.program?._id || student.program || undefined,
    submissionText: submissionText || "",
    attachment: attachment || { url: "", filename: "", fileType: "", size: 0 },
    status: isLate ? "late" : "submitted",
    submittedAt: now,
  });

  await newSubmission.save();

  // Add to assignment submissions list
  assignment.submissions.push(newSubmission._id);
  await assignment.save();

  res.status(201).json({
    status: "Success",
    message: isLate ? "Assignment submitted (marked Late)" : "Assignment submitted successfully",
    data: newSubmission,
  });
});

//@desc Get submissions for an assignment
//@route GET /api/v1/assignments/:id/submissions
//@access Teacher and Admin
exports.getAssignmentSubmissionsCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;

  const assignment = await Assignment.findById(id);
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  const submissions = await AssignmentSubmission.find({ assignment: id })
    .populate("student", "name StudentId email currentClassLevel")
    .sort({ submittedAt: -1 });

  res.status(200).json({
    status: "Success",
    results: submissions.length,
    data: submissions,
  });
});

//@desc Grade a student submission
//@route PUT /api/v1/assignments/submissions/:submissionId/grade
//@access Teacher and Admin
exports.gradeSubmissionCtrl = AsyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { score, feedback } = req.body;
  const userId = req.userAuth?._id;
  const userRole = req.userAuth?.role;

  if (score === undefined || score === null) {
    res.status(400);
    throw new Error("Please provide a score/grade");
  }

  const submission = await AssignmentSubmission.findById(submissionId).populate("assignment");
  if (!submission) {
    res.status(404);
    throw new Error("Submission not found");
  }

  const maxMarks = submission.assignment?.totalMarks || 100;
  if (Number(score) < 0 || Number(score) > maxMarks) {
    res.status(400);
    throw new Error(`Score must be between 0 and total marks (${maxMarks})`);
  }

  submission.score = Number(score);
  submission.feedback = feedback || "";
  submission.status = "graded";
  submission.gradedBy = userId;
  submission.graderModel = userRole === "admin" ? "Admin" : "Teacher";
  submission.gradedAt = new Date();

  await submission.save();

  res.status(200).json({
    status: "Success",
    message: "Submission graded successfully",
    data: submission,
  });
});

//@desc Get all submissions for logged in student
//@route GET /api/v1/assignments/student/my-submissions
//@access Student only
exports.getStudentSubmissionsCtrl = AsyncHandler(async (req, res) => {
  const userId = req.userAuth?._id;

  const submissions = await AssignmentSubmission.find({ student: userId })
    .populate({
      path: "assignment",
      select: "title description subject classLevel totalMarks passMark dueDate dueTime status createdBy",
      populate: [
        { path: "subject", select: "name" },
        { path: "classLevel", select: "name" },
        { path: "createdBy", select: "name email" },
      ],
    })
    .sort({ submittedAt: -1 });

  res.status(200).json({
    status: "Success",
    results: submissions.length,
    data: submissions,
  });
});

//@desc Publish an assignment (changes status from draft to published)
//@route PATCH /api/v1/assignments/:id/publish
//@access Teacher and Admin
exports.publishAssignmentCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userAuth?._id?.toString();
  const userRole = req.userAuth?.role;

  const assignment = await Assignment.findById(id);
  if (!assignment) {
    res.status(404);
    throw new Error("Assignment not found");
  }

  // Check authorization: only creator teacher or admin
  if (userRole !== "admin" && assignment.createdBy.toString() !== userId) {
    res.status(403);
    throw new Error("Access denied: You are not authorized to publish this assignment");
  }

  // Validate required fields before publishing
  if (!assignment.title || !assignment.title.trim()) {
    res.status(400);
    throw new Error("Assignment title is required before publishing");
  }
  if (!assignment.classLevel) {
    res.status(400);
    throw new Error("Class level is required before publishing");
  }
  if (!assignment.subject) {
    res.status(400);
    throw new Error("Subject is required before publishing");
  }
  if (!assignment.dueDate) {
    res.status(400);
    throw new Error("Due date is required before publishing");
  }
  if (
    !assignment.description ||
    !assignment.description.trim() ||
    assignment.description === "<p></p>" ||
    assignment.description === "<p><br></p>"
  ) {
    res.status(400);
    throw new Error("Assignment content/instructions are required before publishing");
  }

  assignment.status = "published";
  await assignment.save();

  const publishedAssignment = await Assignment.findById(id)
    .populate("subject", "name")
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("createdBy", "name email teacherId role");

  res.status(200).json({
    status: "Success",
    message: "Assignment published successfully",
    data: publishedAssignment,
  });
});

//@desc Get assignments created by the authenticated teacher
//@route GET /api/v1/assignments/teacher
//@access Teacher and Admin
exports.getTeacherAssignmentsCtrl = AsyncHandler(async (req, res) => {
  const teacherId = req.userAuth?._id;
  const { status, classLevel, subject } = req.query;

  let query = { createdBy: teacherId };
  if (status && status !== "all") {
    query.status = status;
  }
  if (classLevel && classLevel !== "all") {
    query.classLevel = classLevel;
  }
  if (subject && subject !== "all") {
    query.subject = subject;
  }

  const assignments = await Assignment.find(query)
    .populate("subject", "name")
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("createdBy", "name email teacherId")
    .populate({
      path: "submissions",
      select: "status score submittedAt student studentName",
    })
    .sort({ updatedAt: -1, createdAt: -1 });

  res.status(200).json({
    status: "Success",
    results: assignments.length,
    data: assignments,
  });
});

//@desc Get eligible published assignments for logged-in student
//@route GET /api/v1/assignments/student
//@access Student only
exports.getStudentAssignmentsCtrl = AsyncHandler(async (req, res) => {
  const userId = req.userAuth?._id;

  const student = await Student.findById(userId)
    .populate({
      path: "program",
      populate: { path: "subjects", select: "name" },
    })
    .populate("assignedTeacher")
    .populate({
      path: "enrolledSubjects.subject",
      select: "name",
    });

  if (!student) {
    res.status(404);
    throw new Error("Student profile not found");
  }

  // Student must NEVER see draft assignments. Strictly published / active
  const studentFilter = { status: { $in: ["published", "active"] } };
  const { subject } = req.query;
  if (subject && subject !== "all") studentFilter.subject = subject;

  const publishedAssignments = await Assignment.find(studentFilter)
    .populate("subject", "name")
    .populate("classLevel", "name")
    .populate("program", "name")
    .populate("createdBy", "name email teacherId role")
    .sort({ createdAt: -1 });

  // Apply existing eligibility logic
  const eligibleAssignments = publishedAssignments.filter((item) =>
    isStudentEligibleForAssignment(student, item)
  );

  // Attach student's own submission status to each assignment
  const assignmentIds = eligibleAssignments.map((a) => a._id);
  const mySubmissions = await AssignmentSubmission.find({
    assignment: { $in: assignmentIds },
    student: userId,
  });

  const submissionMap = new Map();
  mySubmissions.forEach((sub) => {
    submissionMap.set(sub.assignment.toString(), sub);
  });

  const enrichedAssignments = eligibleAssignments.map((item) => {
    const plain = item.toObject();
    const mySub = submissionMap.get(item._id.toString());
    plain.mySubmission = mySub || null;
    plain.hasSubmitted = !!mySub;
    plain.submissionStatus = mySub ? mySub.status : "pending";
    plain.submissions = mySub ? [mySub._id] : [];
    return plain;
  });

  res.status(200).json({
    status: "Success",
    results: enrichedAssignments.length,
    data: enrichedAssignments,
  });
});

