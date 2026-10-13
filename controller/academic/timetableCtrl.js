const AsyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Timetable = require("../../models/Academy/Timetable");
const Program = require("../../models/Academy/program");
const Subject = require("../../models/Academy/Subject");
const Teacher = require("../../models/Staff/Teacher");
const Student = require("../../models/Academy/Student");
const Admin = require("../../models/Staff/admin");

// Helper to normalize day order
const DAY_ORDER = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

// Helper for flexible class matching
const matchClassLevel = (cls1, cls2) => {
  if (!cls1 || !cls2) return false;
  const s1 = cls1.toString().trim().toLowerCase();
  const s2 = cls2.toString().trim().toLowerCase();
  if (s1 === s2) return true;
  const d1 = s1.match(/\d+/)?.[0];
  const d2 = s2.match(/\d+/)?.[0];
  if (d1 && d2 && d1 === d2) return true;
  return false;
};

//@desc Create a new timetable slot (Admin only)
//@route POST /api/v1/timetables
//@access Private (Admin)
exports.createTimetableCtrl = AsyncHandler(async (req, res) => {
  if (!req.userAuth || req.userAuth.role !== "admin") {
    res.status(403);
    throw new Error("Access denied: Only administrators can create timetable schedules.");
  }
  const {
    program,
    classLevel,
    subject,
    teacher,
    day,
    periodNumber,
    startTime,
    endTime,
    room,
    academicYear,
    academicTerm,
    notes,
    force,
  } = req.body;

  if (!program || !classLevel || !subject || !teacher || !day || !periodNumber || !startTime || !endTime) {
    res.status(400);
    throw new Error("Program, Class Level, Subject, Teacher, Day, Period Number, Start Time, and End Time are required");
  }

  // Resolve Program name
  let progDoc = null;
  if (mongoose.Types.ObjectId.isValid(program)) {
    progDoc = await Program.findById(program);
  } else {
    progDoc = await Program.findOne({ name: program });
  }
  if (!progDoc) {
    res.status(404);
    throw new Error("Selected academic program not found");
  }

  // Resolve Subject name
  let subDoc = null;
  if (mongoose.Types.ObjectId.isValid(subject)) {
    subDoc = await Subject.findById(subject);
  } else {
    subDoc = await Subject.findOne({ name: subject });
  }
  if (!subDoc) {
    res.status(404);
    throw new Error("Selected subject not found");
  }

  // Resolve Teacher name
  let teacherDoc = null;
  if (mongoose.Types.ObjectId.isValid(teacher)) {
    teacherDoc = await Teacher.findById(teacher);
  } else {
    teacherDoc = await Teacher.findOne({ name: teacher });
  }
  if (!teacherDoc) {
    res.status(404);
    throw new Error("Selected teacher not found");
  }

  const pNum = Number(periodNumber);
  const formattedTimeSlot = `${startTime.trim()} - ${endTime.trim()}`;
  const targetRoom = (room || "Room 101").trim();
  const targetClass = classLevel.trim();

  // Collision checks (unless force is true)
  if (!force) {
    // 1. Class collision: Same class level already has a subject at this day & period
    const classClash = await Timetable.findOne({
      classLevel: { $regex: new RegExp(`^${targetClass.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i") },
      day,
      periodNumber: pNum,
    });
    if (classClash) {
      res.status(409);
      throw new Error(
        `Class Schedule Collision: Class "${targetClass}" is already scheduled for ${classClash.subjectName || "another subject"} on ${day} at Period ${pNum}.`
      );
    }

    // 2. Teacher collision: Teacher is already booked elsewhere at this day & period
    const teacherClash = await Timetable.findOne({
      teacher: teacherDoc._id,
      day,
      periodNumber: pNum,
    });
    if (teacherClash) {
      res.status(409);
      throw new Error(
        `Teacher Conflict: Teacher ${teacherDoc.name} is already teaching ${teacherClash.subjectName || "a class"} (${teacherClash.classLevel}) on ${day} at Period ${pNum}.`
      );
    }

    // 3. Room collision: Room is already occupied at this day & period
    if (targetRoom) {
      const roomClash = await Timetable.findOne({
        room: { $regex: new RegExp(`^${targetRoom.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i") },
        day,
        periodNumber: pNum,
      });
      if (roomClash) {
        res.status(409);
        throw new Error(
          `Room Conflict: Room "${targetRoom}" is already assigned to ${roomClash.subjectName} (${roomClash.classLevel}) on ${day} Period ${pNum}.`
        );
      }
    }
  }

  // Create slot
  const newSlot = await Timetable.create({
    program: progDoc._id,
    programName: progDoc.name,
    classLevel: targetClass,
    subject: subDoc._id,
    subjectName: subDoc.name,
    teacher: teacherDoc._id,
    teacherName: teacherDoc.name,
    day,
    periodNumber: pNum,
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    timeSlot: formattedTimeSlot,
    room: targetRoom,
    academicYear: academicYear || undefined,
    academicTerm: academicTerm || undefined,
    notes: notes?.trim() || "",
    createdBy: req.userAuth?._id,
  });

  const populatedSlot = await Timetable.findById(newSlot._id)
    .populate("program", "name code")
    .populate("subject", "name description classLevel")
    .populate("teacher", "name email teacherId");

  res.status(201).json({
    status: "Success",
    message: "Timetable slot scheduled successfully",
    data: populatedSlot,
  });
});

//@desc Get all timetable slots with filters (Admin, Teacher, Student)
//@route GET /api/v1/timetables
//@access Private
exports.getAllTimetablesCtrl = AsyncHandler(async (req, res) => {
  const { program, classLevel, day, teacher, subject, search } = req.query;

  const query = {};

  if (program) {
    if (mongoose.Types.ObjectId.isValid(program)) {
      query.program = program;
    } else {
      query.programName = { $regex: new RegExp(program, "i") };
    }
  }

  if (classLevel && classLevel !== "All") {
    query.classLevel = { $regex: new RegExp(`^${classLevel.trim().replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i") };
  }

  if (day && day !== "All") {
    query.day = day;
  }

  if (teacher && teacher !== "All") {
    if (mongoose.Types.ObjectId.isValid(teacher)) {
      query.teacher = teacher;
    } else {
      query.teacherName = { $regex: new RegExp(teacher, "i") };
    }
  }

  if (subject && subject !== "All") {
    if (mongoose.Types.ObjectId.isValid(subject)) {
      query.subject = subject;
    } else {
      query.subjectName = { $regex: new RegExp(subject, "i") };
    }
  }

  if (search) {
    query.$or = [
      { subjectName: { $regex: search, "i": true } },
      { teacherName: { $regex: search, "i": true } },
      { classLevel: { $regex: search, "i": true } },
      { programName: { $regex: search, "i": true } },
      { room: { $regex: search, "i": true } },
      { notes: { $regex: search, "i": true } },
    ];
  }

  const rawSlots = await Timetable.find(query)
    .populate("program", "name code")
    .populate("subject", "name description classLevel")
    .populate("teacher", "name email teacherId subject")
    .populate("academicYear", "name")
    .populate("academicTerm", "name")
    .lean();

  // Sort by day order and periodNumber
  const sortedSlots = rawSlots.sort((a, b) => {
    const dayA = DAY_ORDER[a.day] || 99;
    const dayB = DAY_ORDER[b.day] || 99;
    if (dayA !== dayB) return dayA - dayB;
    return (a.periodNumber || 0) - (b.periodNumber || 0);
  });

  // Extract distinct metadata for filter dropdowns
  const allDistinctClasses = Array.from(new Set(rawSlots.map((s) => s.classLevel).filter(Boolean)));
  const allDistinctPrograms = Array.from(new Set(rawSlots.map((s) => s.programName).filter(Boolean)));
  const allDistinctSubjects = Array.from(new Set(rawSlots.map((s) => s.subjectName).filter(Boolean)));

  res.status(200).json({
    status: "Success",
    count: sortedSlots.length,
    metadata: {
      classes: allDistinctClasses,
      programs: allDistinctPrograms,
      subjects: allDistinctSubjects,
    },
    data: sortedSlots,
  });
});

//@desc Get single timetable slot
//@route GET /api/v1/timetables/:id
//@access Private
exports.getSingleTimetableCtrl = AsyncHandler(async (req, res) => {
  const slot = await Timetable.findById(req.params.id)
    .populate("program", "name code")
    .populate("subject", "name description classLevel")
    .populate("teacher", "name email teacherId")
    .populate("academicYear", "name")
    .populate("academicTerm", "name");

  if (!slot) {
    res.status(404);
    throw new Error("Timetable slot not found");
  }

  res.status(200).json({
    status: "Success",
    data: slot,
  });
});

//@desc Update timetable slot (Admin only)
//@route PUT /api/v1/timetables/:id
//@access Private (Admin)
exports.updateTimetableCtrl = AsyncHandler(async (req, res) => {
  if (!req.userAuth || req.userAuth.role !== "admin") {
    res.status(403);
    throw new Error("Access denied: Only administrators can modify timetable schedules.");
  }
  const slotId = req.params.id;
  const slot = await Timetable.findById(slotId);
  if (!slot) {
    res.status(404);
    throw new Error("Timetable slot not found");
  }

  const {
    program,
    classLevel,
    subject,
    teacher,
    day,
    periodNumber,
    startTime,
    endTime,
    room,
    academicYear,
    academicTerm,
    notes,
    force,
  } = req.body;

  const targetDay = day || slot.day;
  const targetPeriod = periodNumber ? Number(periodNumber) : slot.periodNumber;
  const targetClass = (classLevel || slot.classLevel).trim();
  const targetRoom = (room || slot.room || "Room 101").trim();

  // If program changed, update name
  if (program && program !== slot.program?.toString()) {
    const progDoc = await Program.findById(program);
    if (progDoc) {
      slot.program = progDoc._id;
      slot.programName = progDoc.name;
    }
  }

  // If subject changed, update name
  if (subject && subject !== slot.subject?.toString()) {
    const subDoc = await Subject.findById(subject);
    if (subDoc) {
      slot.subject = subDoc._id;
      slot.subjectName = subDoc.name;
    }
  }

  // If teacher changed, update name
  let resolvedTeacherId = slot.teacher;
  if (teacher && teacher !== slot.teacher?.toString()) {
    const teacherDoc = await Teacher.findById(teacher);
    if (teacherDoc) {
      slot.teacher = teacherDoc._id;
      slot.teacherName = teacherDoc.name;
      resolvedTeacherId = teacherDoc._id;
    }
  }

  // Conflict verification (excluding self)
  if (!force) {
    const classClash = await Timetable.findOne({
      _id: { $ne: slotId },
      classLevel: { $regex: new RegExp(`^${targetClass.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i") },
      day: targetDay,
      periodNumber: targetPeriod,
    });
    if (classClash) {
      res.status(409);
      throw new Error(
        `Class Conflict: Class "${targetClass}" is already scheduled for ${classClash.subjectName} on ${targetDay} at Period ${targetPeriod}.`
      );
    }

    const teacherClash = await Timetable.findOne({
      _id: { $ne: slotId },
      teacher: resolvedTeacherId,
      day: targetDay,
      periodNumber: targetPeriod,
    });
    if (teacherClash) {
      res.status(409);
      throw new Error(
        `Teacher Conflict: Teacher is already scheduled for ${teacherClash.subjectName} (${teacherClash.classLevel}) on ${targetDay} at Period ${targetPeriod}.`
      );
    }
  }

  slot.classLevel = targetClass;
  slot.day = targetDay;
  slot.periodNumber = targetPeriod;
  if (startTime) slot.startTime = startTime.trim();
  if (endTime) slot.endTime = endTime.trim();
  slot.timeSlot = `${slot.startTime} - ${slot.endTime}`;
  slot.room = targetRoom;
  if (academicYear !== undefined) slot.academicYear = academicYear;
  if (academicTerm !== undefined) slot.academicTerm = academicTerm;
  if (notes !== undefined) slot.notes = notes.trim();

  await slot.save();

  const updated = await Timetable.findById(slot._id)
    .populate("program", "name code")
    .populate("subject", "name description classLevel")
    .populate("teacher", "name email teacherId");

  res.status(200).json({
    status: "Success",
    message: "Timetable slot updated successfully",
    data: updated,
  });
});

//@desc Delete timetable slot (Admin only)
//@route DELETE /api/v1/timetables/:id
//@access Private (Admin)
exports.deleteTimetableCtrl = AsyncHandler(async (req, res) => {
  if (!req.userAuth || req.userAuth.role !== "admin") {
    res.status(403);
    throw new Error("Access denied: Only administrators can delete timetable schedules.");
  }
  const slot = await Timetable.findById(req.params.id);
  if (!slot) {
    res.status(404);
    throw new Error("Timetable slot not found");
  }

  await Timetable.findByIdAndDelete(req.params.id);

  res.status(200).json({
    status: "Success",
    message: "Timetable slot removed successfully",
  });
});

//@desc Publish / Unpublish timetable slots (Admin only)
//@route PUT /api/v1/timetables/publish
//@access Private (Admin)
exports.publishTimetableCtrl = AsyncHandler(async (req, res) => {
  const { isPublished = true, classLevel, program } = req.body;
  const filter = {};
  if (classLevel && classLevel !== "All" && classLevel !== "All Classes") {
    filter.classLevel = { $regex: new RegExp(`^${classLevel.trim().replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i") };
  }
  if (program && program !== "All") {
    if (mongoose.Types.ObjectId.isValid(program)) {
      filter.program = program;
    } else {
      filter.programName = { $regex: new RegExp(program, "i") };
    }
  }

  const result = await Timetable.updateMany(filter, { $set: { isPublished: Boolean(isPublished) } });

  const totalPublished = await Timetable.countDocuments({ isPublished: true });
  const totalSlots = await Timetable.countDocuments();

  res.status(200).json({
    status: "Success",
    message: isPublished ? "Timetable successfully published to teachers and students" : "Timetable unpublished (draft mode)",
    data: {
      modifiedCount: result.modifiedCount,
      totalPublished,
      totalSlots,
      isPublished: Boolean(isPublished),
    },
  });
});

//@desc Teacher Timetable endpoint:
//      Shows teacher's own scheduled periods AND full timetable for all subjects according to selected class level (or all classes)!
//@route GET /api/v1/timetables/teacher/schedule
//@access Private (Teacher)
exports.getTeacherTimetableCtrl = AsyncHandler(async (req, res) => {
  const teacherId = req.userAuth?._id || req.query.teacherId;
  const teacher = await Teacher.findById(teacherId);
  if (!teacher) {
    res.status(404);
    throw new Error("Teacher profile not found");
  }

  // 1. Fetch teacher's own scheduled slots across all days and classes
  const mySlotsRaw = await Timetable.find({
    isPublished: { $ne: false },
    $or: [
      { teacher: teacher._id },
      { teacherName: { $regex: new RegExp(`^${teacher.name.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i") } },
    ],
  })
    .populate("program", "name code")
    .populate("subject", "name description classLevel")
    .populate("teacher", "name email teacherId")
    .lean();

  const myTeachingSlots = mySlotsRaw.map((slot) => ({ ...slot, isMyClass: true })).sort((a, b) => {
    const dayA = DAY_ORDER[a.day] || 99;
    const dayB = DAY_ORDER[b.day] || 99;
    if (dayA !== dayB) return dayA - dayB;
    return (a.periodNumber || 0) - (b.periodNumber || 0);
  });

  // 2. Discover all distinct class levels from the Timetable collection
  const allTimetableClasses = await Timetable.distinct("classLevel", { isPublished: { $ne: false } });
  const myTaughtClasses = Array.from(new Set(myTeachingSlots.map((s) => s.classLevel).filter(Boolean)));

  // Combine classes with teacher's assigned classLevel
  const teacherClassStr = typeof teacher.classLevel === "object" ? teacher.classLevel?.name : teacher.classLevel;
  const teacherClassHasSlots = teacherClassStr && allTimetableClasses.some(c => c.toLowerCase() === teacherClassStr.trim().toLowerCase());

  // Determine smart default class:
  // If teacher teaches any class, use their first taught class;
  // else if teacher's assigned class has timetable slots, use it;
  // else if any class exists in timetable, use allTimetableClasses[0];
  // else "All Classes"
  const defaultClass =
    myTaughtClasses[0] ||
    (teacherClassHasSlots ? teacherClassStr : null) ||
    allTimetableClasses[0] ||
    "All Classes";

  const requestedClass = req.query.classLevel?.trim();
  const selectedClass = requestedClass || defaultClass;

  // 3. Fetch full timetable slots for the selected class OR all classes if "All Classes" / "All"
  const isAllClasses = !selectedClass || selectedClass.toLowerCase() === "all" || selectedClass.toLowerCase() === "all classes";
  const classFilter = { isPublished: { $ne: false } };
  if (!isAllClasses) {
    classFilter.classLevel = { $regex: new RegExp(`^${selectedClass.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i") };
  }

  const classSlotsRaw = await Timetable.find(classFilter)
    .populate("program", "name code")
    .populate("subject", "name description classLevel")
    .populate("teacher", "name email teacherId")
    .lean();

  const classTimetableSlots = classSlotsRaw
    .map((slot) => {
      const isMyClass =
        slot.teacher?._id?.toString() === teacher._id.toString() ||
        slot.teacherName?.toLowerCase() === teacher.name?.toLowerCase();
      return {
        ...slot,
        isMyClass,
      };
    })
    .sort((a, b) => {
      const dayA = DAY_ORDER[a.day] || 99;
      const dayB = DAY_ORDER[b.day] || 99;
      if (dayA !== dayB) return dayA - dayB;
      return (a.periodNumber || 0) - (b.periodNumber || 0);
    });

  const uniqueClasses = Array.from(new Set([...myTaughtClasses, ...allTimetableClasses])).filter(Boolean);
  const availableClasses = ["All Classes", ...uniqueClasses];

  const totalSlotsCount = await Timetable.countDocuments({ isPublished: { $ne: false } });

  res.status(200).json({
    status: "Success",
    message: "Teacher timetable retrieved successfully",
    data: {
      teacher: {
        _id: teacher._id,
        name: teacher.name,
        teacherId: teacher.teacherId,
        subject: teacher.subject,
        classLevel: teacher.classLevel,
      },
      selectedClass: isAllClasses ? "All Classes" : selectedClass,
      availableClasses,
      myTeachingSlots,
      mySlotsCount: myTeachingSlots.length,
      classTimetableSlots,
      classSlotsCount: classTimetableSlots.length,
      totalSlotsCount,
      isPublished: true,
    },
  });
});

//@desc Student Timetable endpoint:
//      Shows timetable filtered to student's program, class level, and ONLY the subjects student is offering!
//      "let assume if hassanat is during 5 subjects it should display the five subject timetable only"
//@route GET /api/v1/timetables/student/my-timetable
//@access Private (Student)
exports.getStudentTimetableCtrl = AsyncHandler(async (req, res) => {
  const studentId = req.userAuth?._id || req.query.studentId;
  const student = await Student.findById(studentId)
    .populate("program", "name code")
    .populate("enrolledSubjects.subject", "name description classLevel")
    .lean();

  if (!student) {
    res.status(404);
    throw new Error("Student profile not found");
  }

  const currentClass = (
    student.currentClassLevel ||
    (Array.isArray(student.classLevels) && student.classLevels.length > 0
      ? student.classLevels[student.classLevels.length - 1]
      : "Level 100")
  ).trim();

  // 1. Gather all offered / enrolled subjects for the student
  const offeredSubjectMap = new Map(); // id or name -> subject info

  if (student.enrolledSubjects && Array.isArray(student.enrolledSubjects)) {
    for (const item of student.enrolledSubjects) {
      const sub = item.subject;
      if (sub) {
        const subId = (sub._id || sub).toString();
        const subName = (sub.name || "").trim();
        if (subName) {
          offeredSubjectMap.set(subName.toLowerCase(), {
            id: subId,
            name: subName,
            classLevel: item.classLevel || sub.classLevel || currentClass,
          });
        }
        if (subId) {
          offeredSubjectMap.set(subId, {
            id: subId,
            name: subName || "Subject",
            classLevel: item.classLevel || sub.classLevel || currentClass,
          });
        }
      }
    }
  }

  // Also include primary subject if present
  if (student.subject) {
    const primaryName = student.subject.toString().trim();
    if (primaryName && !offeredSubjectMap.has(primaryName.toLowerCase())) {
      offeredSubjectMap.set(primaryName.toLowerCase(), {
        id: primaryName,
        name: primaryName,
        classLevel: currentClass,
      });
    }
  }

  // 2. Build array of unique offered subjects
  const uniqueOfferedSubjects = Array.from(
    new Map(
      Array.from(offeredSubjectMap.values()).map((s) => [s.name.toLowerCase(), s])
    ).values()
  );

  const offeredNamesSet = new Set(
    uniqueOfferedSubjects.map((s) => s.name.toLowerCase().trim())
  );
  const offeredIdsSet = new Set(
    uniqueOfferedSubjects.map((s) => s.id?.toString()).filter(Boolean)
  );

  // 3. Find timetable slots for student's class level
  // Query all slots for this class level
  const classDigits = currentClass.match(/\d+/)?.[0];
  const classQuery = [
    { classLevel: currentClass },
    { classLevel: { $regex: new RegExp(`^${currentClass.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i") } },
    ...(classDigits ? [{ classLevel: { $regex: new RegExp(`(^|\\b|\\D)${classDigits}(\\D|\\b|$)`, "i") } }] : []),
  ];

  const candidateSlots = await Timetable.find({
    isPublished: { $ne: false },
    $or: classQuery,
  })
    .populate("program", "name code")
    .populate("subject", "name description classLevel")
    .populate("teacher", "name email teacherId")
    .lean();

  // 4. Strict filter: "let assume if hassanat is during 5 subjects it should display the five subject timetable only"
  // If student has offered subjects defined, filter ONLY to those subjects!
  let studentSlots = [];
  if (offeredNamesSet.size > 0) {
    studentSlots = candidateSlots.filter((slot) => {
      const slotSubId = (slot.subject?._id || slot.subject)?.toString();
      const slotSubName = (slot.subjectName || slot.subject?.name || "").toLowerCase().trim();

      // Check ID match
      if (slotSubId && offeredIdsSet.has(slotSubId)) return true;
      // Check Name match
      if (slotSubName && offeredNamesSet.has(slotSubName)) return true;

      return false;
    });
  } else {
    // If student has no enrolled subjects registered yet, show all slots for the class level
    studentSlots = candidateSlots;
  }

  // Sort by day and period number
  const sortedStudentSlots = studentSlots.sort((a, b) => {
    const dayA = DAY_ORDER[a.day] || 99;
    const dayB = DAY_ORDER[b.day] || 99;
    if (dayA !== dayB) return dayA - dayB;
    return (a.periodNumber || 0) - (b.periodNumber || 0);
  });

  res.status(200).json({
    status: "Success",
    message: "Student timetable retrieved successfully",
    data: {
      student: {
        _id: student._id,
        name: student.name,
        studentId: student.StudentId,
        program: student.program,
        currentClassLevel: currentClass,
        offeredSubjectsCount: uniqueOfferedSubjects.length,
        offeredSubjects: uniqueOfferedSubjects,
      },
      slots: sortedStudentSlots,
      totalSlots: sortedStudentSlots.length,
      classLevel: currentClass,
    },
  });
});
  