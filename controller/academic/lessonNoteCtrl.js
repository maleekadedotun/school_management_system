const AsyncHandler = require("express-async-handler");
const LessonNote = require("../../models/Academy/LessonNote");
const Teacher = require("../../models/Staff/Teacher");
const Admin = require("../../models/Staff/admin");
const Student = require("../../models/Academy/Student");
const Notification = require("../../models/Staff/Notification");

//@desc Create a new lesson note
//@route POST /api/v1/lesson-notes
//@access Teacher
exports.createLessonNoteCtrl = AsyncHandler(async (req, res) => {
  const teacherId = req.userAuth?._id;
  const teacher = await Teacher.findById(teacherId);
  if (!teacher) {
    res.status(404);
    throw new Error("Teacher profile not found");
  }

  const {
    subject,
    subjectName,
    classLevel,
    classLevelName,
    program,
    topic,
    subtopic,
    week,
    duration,
    lessonDate,
    learningObjectives,
    introduction,
    lessonContent,
    activities,
    teachingMaterials,
    assessment,
    conclusion,
    status,
  } = req.body;

  if (!topic || !topic.trim()) {
    res.status(400);
    throw new Error("Lesson note topic is required");
  }

  const noteStatus = status === "pending_review" ? "pending_review" : "draft";

  const lessonNote = await LessonNote.create({
    teacher: teacherId,
    teacherName: teacher.name,
    teacherEmail: teacher.email,
    subject: subject || null,
    subjectName: subjectName || (typeof teacher.subject === "object" ? teacher.subject?.name : teacher.subject) || "Subject",
    classLevel: classLevel || null,
    classLevelName: classLevelName || (typeof teacher.classLevel === "object" ? teacher.classLevel?.name : teacher.classLevel) || "Class",
    program: program || null,
    topic: topic.trim(),
    subtopic: subtopic || "",
    week: week || "Week 1",
    duration: duration || "45 Minutes",
    lessonDate: lessonDate || new Date(),
    learningObjectives: learningObjectives || "",
    introduction: introduction || "",
    lessonContent: lessonContent || "",
    activities: activities || "",
    teachingMaterials: teachingMaterials || "",
    assessment: assessment || "",
    conclusion: conclusion || "",
    status: noteStatus,
    sentToStudents: false,
  });

  // If submitted directly for review, notify admins
  if (noteStatus === "pending_review") {
    try {
      const admins = await Admin.find();
      for (const admin of admins) {
        await Notification.create({
          recipient: admin._id,
          recipientModel: "Admin",
          recipientRole: "admin",
          sender: teacherId,
          senderModel: "Teacher",
          senderName: teacher.name,
          title: "New Lesson Note Awaiting Review",
          message: `${teacher.name} submitted a lesson note for "${topic}" (${lessonNote.classLevelName}) for your review and approval.`,
          type: "general",
          relatedId: lessonNote._id,
          link: "/admin/lesson-notes",
        });
      }
    } catch (e) {
      console.error("Failed to dispatch admin notification:", e.message);
    }
  }

  res.status(201).json({
    status: "Success",
    message:
      noteStatus === "pending_review"
        ? "Lesson note created and submitted to Admin for review"
        : "Lesson note saved to drafts",
    data: lessonNote,
  });
});

//@desc Get lesson notes for logged in teacher
//@route GET /api/v1/lesson-notes/teacher
//@access Teacher
exports.getTeacherLessonNotesCtrl = AsyncHandler(async (req, res) => {
  const teacherId = req.userAuth?._id;
  const { status, subject, classLevel } = req.query;

  let query = { teacher: teacherId };
  if (status && status !== "all") {
    query.status = status;
  }
  if (subject && subject !== "all") {
    query.subjectName = new RegExp(subject, "i");
  }
  if (classLevel && classLevel !== "all") {
    query.classLevelName = new RegExp(classLevel, "i");
  }

  const notes = await LessonNote.find(query).sort({ updatedAt: -1, createdAt: -1 });

  res.status(200).json({
    status: "Success",
    results: notes.length,
    data: notes,
  });
});

//@desc Get all lesson notes for admin review
//@route GET /api/v1/lesson-notes/admin
//@access Admin
exports.getAdminLessonNotesCtrl = AsyncHandler(async (req, res) => {
  const { status, subject, classLevel, teacher } = req.query;

  let query = {};
  if (status && status !== "all") {
    query.status = status;
  }
  if (subject && subject !== "all") {
    query.subjectName = new RegExp(subject, "i");
  }
  if (classLevel && classLevel !== "all") {
    query.classLevelName = new RegExp(classLevel, "i");
  }
  if (teacher && teacher !== "all") {
    query.teacherName = new RegExp(teacher, "i");
  }

  const notes = await LessonNote.find(query)
    .populate("teacher", "name email teacherId")
    .sort({ updatedAt: -1, createdAt: -1 });

  res.status(200).json({
    status: "Success",
    results: notes.length,
    data: notes,
  });
});

//@desc Get single lesson note by ID
//@route GET /api/v1/lesson-notes/:id
//@access Authenticated Users
exports.getLessonNoteByIdCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const note = await LessonNote.findById(id).populate("teacher", "name email");

  if (!note) {
    res.status(404);
    throw new Error("Lesson note not found");
  }

  res.status(200).json({
    status: "Success",
    data: note,
  });
});

//@desc Update lesson note
//@route PUT /api/v1/lesson-notes/:id
//@access Teacher (owner) or Admin
exports.updateLessonNoteCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userAuth?._id?.toString();
  const userRole = req.userAuth?.role;

  const note = await LessonNote.findById(id);
  if (!note) {
    res.status(404);
    throw new Error("Lesson note not found");
  }

  // Only creator teacher or admin can update
  if (userRole !== "admin" && note.teacher.toString() !== userId) {
    res.status(403);
    throw new Error("Access denied: You can only edit your own lesson notes");
  }

  const updatableFields = [
    "subject",
    "subjectName",
    "classLevel",
    "classLevelName",
    "program",
    "topic",
    "subtopic",
    "week",
    "duration",
    "lessonDate",
    "learningObjectives",
    "introduction",
    "lessonContent",
    "activities",
    "teachingMaterials",
    "assessment",
    "conclusion",
    "status",
  ];

  updatableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      note[field] = req.body[field];
    }
  });

  await note.save();

  res.status(200).json({
    status: "Success",
    message: "Lesson note updated successfully",
    data: note,
  });
});

//@desc Submit a lesson note to Admin for review
//@route PATCH /api/v1/lesson-notes/:id/submit-for-review
//@access Teacher
exports.submitForReviewCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const teacherId = req.userAuth?._id?.toString();

  const note = await LessonNote.findById(id);
  if (!note) {
    res.status(404);
    throw new Error("Lesson note not found");
  }

  if (note.teacher.toString() !== teacherId) {
    res.status(403);
    throw new Error("Access denied: You can only submit your own lesson notes");
  }

  note.status = "pending_review";
  await note.save();

  // Notify Admins
  try {
    const admins = await Admin.find();
    for (const admin of admins) {
      await Notification.create({
        recipient: admin._id,
        recipientModel: "Admin",
        recipientRole: "admin",
        sender: teacherId,
        senderModel: "Teacher",
        senderName: note.teacherName,
        title: "Lesson Note Submitted for Review",
        message: `${note.teacherName} submitted lesson note "${note.topic}" (${note.classLevelName}) for your review and approval.`,
        type: "general",
        relatedId: note._id,
        link: "/admin/lesson-notes",
      });
    }
  } catch (e) {
    console.error("Admin notification error:", e.message);
  }

  res.status(200).json({
    status: "Success",
    message: "Lesson note submitted to Admin for review successfully",
    data: note,
  });
});

//@desc Admin reviews and either approves or requests revisions on a lesson note
//@route PATCH /api/v1/lesson-notes/:id/review
//@access Admin
exports.reviewLessonNoteCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.userAuth?._id;
  const admin = req.userAuth;

  const { action, adminFeedback } = req.body;

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400);
    throw new Error("Please specify review action: 'approve' or 'reject'");
  }

  const note = await LessonNote.findById(id);
  if (!note) {
    res.status(404);
    throw new Error("Lesson note not found");
  }

  if (action === "approve") {
    note.status = "approved";
    note.adminFeedback = adminFeedback || "";
    note.reviewedBy = adminId;
    note.reviewedAt = new Date();
    // Once approved by admin, author teacher can send to students or it can be authorized immediately
    note.sentToStudents = true;
    note.sentAt = new Date();
  } else {
    note.status = "rejected";
    note.adminFeedback = adminFeedback || "Please review curriculum alignment and resubmit.";
    note.reviewedBy = adminId;
    note.reviewedAt = new Date();
    note.sentToStudents = false;
  }

  await note.save();

  // Notify the Teacher about the review decision
  try {
    const isApproved = action === "approve";
    await Notification.create({
      recipient: note.teacher,
      recipientModel: "Teacher",
      recipientRole: "teacher",
      sender: adminId,
      senderModel: "Admin",
      senderName: admin.name || "School Administration",
      title: isApproved
        ? "Lesson Note Approved by Admin"
        : "Lesson Note Revision Requested",
      message: isApproved
        ? `Your lesson note for "${note.topic}" has been approved by Admin and is authorized for students.`
        : `Admin requested revisions on your lesson note "${note.topic}": ${note.adminFeedback}`,
      type: "general",
      relatedId: note._id,
      link: "/teacher/resources/lesson-notes",
    });
  } catch (e) {
    console.error("Teacher notification error:", e.message);
  }

  res.status(200).json({
    status: "Success",
    message:
      action === "approve"
        ? "Lesson note approved and authorized for students"
        : "Revisions requested from teacher",
    data: note,
  });
});

//@desc Send an approved lesson note to students
//@route PATCH /api/v1/lesson-notes/:id/send-to-students
//@access Teacher (owner) or Admin
exports.sendToStudentsCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userAuth?._id?.toString();
  const userRole = req.userAuth?.role;

  const note = await LessonNote.findById(id);
  if (!note) {
    res.status(404);
    throw new Error("Lesson note not found");
  }

  if (userRole !== "admin" && note.teacher.toString() !== userId) {
    res.status(403);
    throw new Error("Access denied: You can only publish your own lesson notes");
  }

  // CRITICAL REQUIREMENT: Admin must have approved the note first!
  if (note.status !== "approved") {
    res.status(400);
    throw new Error("Admin review required: This lesson note must be approved by the admin before it can be sent to students.");
  }

  note.sentToStudents = true;
  note.sentAt = new Date();
  await note.save();

  res.status(200).json({
    status: "Success",
    message: "Lesson note sent to students successfully",
    data: note,
  });
});

//@desc Get approved lesson notes for logged in student
//@route GET /api/v1/lesson-notes/student
//@access Student
exports.getStudentLessonNotesCtrl = AsyncHandler(async (req, res) => {
  const studentId = req.userAuth?._id;
  const student = await Student.findById(studentId);
  if (!student) {
    res.status(404);
    throw new Error("Student not found");
  }

  const studentClassStr = (student.currentClassLevel || "").toString().trim().toLowerCase();

  // Query: Only notes that are APPROVED and SENT TO STUDENTS
  const allApproved = await LessonNote.find({
    status: "approved",
    sentToStudents: true,
  })
    .populate("teacher", "name email")
    .sort({ lessonDate: -1, createdAt: -1 });

  // Filter notes matching student's class
  const studentNotes = allApproved.filter((note) => {
    const noteClass = (note.classLevelName || "").toString().trim().toLowerCase();
    if (!noteClass) return true;
    return (
      studentClassStr.includes(noteClass) ||
      noteClass.includes(studentClassStr) ||
      studentClassStr.match(/\d+/)?.[0] === noteClass.match(/\d+/)?.[0]
    );
  });

  res.status(200).json({
    status: "Success",
    results: studentNotes.length,
    data: studentNotes,
  });
});

//@desc Delete lesson note
//@route DELETE /api/v1/lesson-notes/:id
//@access Teacher (owner) or Admin
exports.deleteLessonNoteCtrl = AsyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userAuth?._id?.toString();
  const userRole = req.userAuth?.role;

  const note = await LessonNote.findById(id);
  if (!note) {
    res.status(404);
    throw new Error("Lesson note not found");
  }

  if (userRole !== "admin" && note.teacher.toString() !== userId) {
    res.status(403);
    throw new Error("Access denied: You can only delete your own lesson notes");
  }

  await LessonNote.findByIdAndDelete(id);

  res.status(200).json({
    status: "Success",
    message: "Lesson note deleted successfully",
  });
});
