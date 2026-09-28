const AsyncHandler = require("express-async-handler");
const ExamResult = require("../../models/Academy/ExamResults");
const Student = require("../../models/Academy/Student");
const Teacher = require("../../models/Staff/Teacher");
// const { path } = require("../../app/app");


//@desc checking single result
//@route GET /api/v1/exam-results/:id/checking
//@access private Student only

exports.checkExamResultsCtrl = AsyncHandler(async(req, res) => {
    // find the student
    const studentFound = await Student.findById(req.userAuth?._id);
    if (!studentFound) {
        throw new Error("No student found");
    }

    // find the result for this student
    const examResult = await ExamResult.findOne({
        _id: req.params.id,
        $or: [
            { studentID: studentFound.StudentId },
            { studentID: studentFound._id.toString() }
        ]
    })
    .populate({
        path: "exam",
        populate: {
            path: "questions",
        }
    })
    .populate("classLevel")
    .populate("academicTerm")
    .populate("academicYear");

    if (!examResult) {
        return res.status(404).json({
            status: "failed",
            message: "Exam result not found for this student."
        });
    }

    // check if exam is published - student CANNOT see unpublished results
    if (examResult.isPublished === false) {
        if (!examResult.isTeacherPublished) {
            return res.status(403).json({
                status: "failed",
                message: "Exam result is currently awaiting verification and publication by your respective teacher. Please check back later."
            });
        }
        return res.status(403).json({
            status: "failed",
            message: "Exam result has been verified by your teacher and is currently undergoing administrative review for final release."
        });
    }

    res.status(200).json({
        status: "Success",
        message: "Exam result retrieved successfully",
        data: examResult,
        student: studentFound,
    });
});

//@desc Student get all published exam results
//@route GET /api/v1/exam-results
//@access private Student only

exports.fetchExamResultsCtrl = AsyncHandler(async(req, res) => {
    const student = await Student.findById(req.userAuth?._id);
    if (!student) {
        return res.status(404).json({
            status: "failed",
            message: "Student account not found."
        });
    }

    // Students CAN ONLY see published results
    const results = await ExamResult.find({
        isPublished: true,
        $or: [
            { studentID: student.StudentId },
            { studentID: student._id.toString() }
        ]
    })
    .populate({
        path: "exam",
        populate: [
            { path: "subject" },
            { path: "program" },
            { path: "academicTerm" },
            { path: "academicYear" },
            { path: "classLevel" }
        ]
    })
    .populate("classLevel")
    .populate("academicTerm")
    .populate("academicYear")
    .sort({ createdAt: -1 });

    res.status(200).json({
        status: "Success",
        message: "Published exam results fetched successfully",
        data: results,
    });
});


//@desc Admin get all exam results with filters (including published/unpublished status)
//@route GET /api/v1/exam-results/admin
//@access private Admin only

exports.getAllExamResultsAdminCtrl = AsyncHandler(async (req, res) => {
    const { program, startDate, endDate, academicTerm, academicYear, status, isPublished, publish } = req.query;

    // MANDATORY RULE: Admin should NOT see it until teacher publishes it!
    let andConditions = [
        {
            $or: [
                { isTeacherPublished: true },
                { isPublished: true } // backwards compatibility for legacy records
            ]
        }
    ];

    if (status && status !== "all") {
        andConditions.push({ status });
    }
    // Filter by admin publish status
    const pubStatus = isPublished !== undefined ? isPublished : publish;
    if (pubStatus !== undefined && pubStatus !== "all") {
        andConditions.push({ isPublished: pubStatus === "true" || pubStatus === true || pubStatus === "published" });
    }
    if (academicTerm && academicTerm !== "all") {
        andConditions.push({ academicTerm });
    }
    if (academicYear && academicYear !== "all") {
        andConditions.push({ academicYear });
    }
    if (startDate || endDate) {
        let dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.$lte = end;
        }
        andConditions.push({ createdAt: dateFilter });
    }

    const filter = { $and: andConditions };

    let results = await ExamResult.find(filter)
        .populate({
            path: "exam",
            populate: [
                { path: "program" },
                { path: "subject" },
                { path: "academicTerm" },
                { path: "academicYear" },
                { path: "classLevel" }
            ]
        })
        .populate("classLevel")
        .populate("academicTerm")
        .populate("academicYear")
        .sort({ createdAt: -1 });

    // Fetch corresponding students to populate student details
    const studentIDs = [...new Set(results.map(r => r.studentID).filter(Boolean))];
    const regexIDs = studentIDs.map(id => new RegExp(`^${id}$`, "i"));
    const validMongoIDs = studentIDs.filter(id => id && id.match(/^[0-9a-fA-F]{24}$/));

    const students = await Student.find({
        $or: [
            { StudentId: { $in: regexIDs } },
            ...(validMongoIDs.length > 0 ? [{ _id: { $in: validMongoIDs } }] : [])
        ]
    })
    .select("name email StudentId program classLevels currentClassLevel")
    .populate("program");

    const studentMap = {};
    students.forEach(s => {
        if (s.StudentId) {
            studentMap[s.StudentId] = s;
            studentMap[s.StudentId.toLowerCase()] = s;
        }
        if (s._id) {
            studentMap[s._id.toString()] = s;
        }
    });

    let populatedResults = results.map(r => {
        const rObj = r.toObject();
        const studentObj = studentMap[r.studentID] || studentMap[r.studentID?.toLowerCase()] || null;
        rObj.student = studentObj || { StudentId: r.studentID, name: "Student (" + r.studentID + ")" };
        rObj.program = rObj.exam?.program || studentObj?.program || null;
        return rObj;
    });

    // If program filter specified, filter results accordingly
    if (program && program !== "all") {
        populatedResults = populatedResults.filter(r => {
            const progId = r.program?._id?.toString() || r.program?.toString();
            const progName = r.program?.name?.toLowerCase();
            const filterLower = program.toLowerCase();
            return progId === program || (progName && progName.includes(filterLower));
        });
    }

    res.status(200).json({
        status: "Success",
        message: "Exam results fetched successfully",
        data: populatedResults,
    });
});

//@desc Admin get all exam results of a specific student
//@route GET /api/v1/exam-results/admin/student/:studentId
//@access private Admin only

exports.getStudentResultsAdminCtrl = AsyncHandler(async (req, res) => {
    const { studentId } = req.params;
    let student = null;
    if (studentId.match(/^[0-9a-fA-F]{24}$/)) {
        student = await Student.findById(studentId).populate("program");
    }
    if (!student) {
        student = await Student.findOne({
            StudentId: { $regex: new RegExp(`^${studentId}$`, "i") }
        }).populate("program");
    }

    // Admin can ONLY see results after teacher has reviewed and published them!
    const query = {
        $and: [
            {
                $or: [
                    { isTeacherPublished: true },
                    { isPublished: true } // backwards compatibility for legacy records
                ]
            },
            {
                $or: [
                    { studentID: studentId },
                    ...(student ? [
                        { studentID: student.StudentId },
                        { studentID: { $regex: new RegExp(`^${student.StudentId}$`, "i") } },
                        { studentID: student._id.toString() }
                    ] : [])
                ]
            }
        ]
    };

    const results = await ExamResult.find(query)
        .populate({
            path: "exam",
            populate: [
                { path: "subject" },
                { path: "program" },
                { path: "academicTerm" },
                { path: "academicYear" }
            ]
        })
        .populate("classLevel")
        .populate("academicTerm")
        .populate("academicYear")
        .sort({ createdAt: -1 });

    res.status(200).json({
        status: "Success",
        message: "Student exam results fetched successfully",
        student,
        data: results,
    });
});

//@desc Admin publish / unpublish exam result (Tier 2: releases result to student)
//@route PUT /api/v1/exam-results/:id/admin-toggle-publish
//@route POST /api/v1/exam-results/:id/admin-toggle-publish
//@access private Admin only

exports.adminToggleExamResult = AsyncHandler(async(req, res) => {
    // find the exam result
    const examResult = await ExamResult.findById(req.params.id);
    if (!examResult) {
        return res.status(404).json({
            status: "failed",
            message: "Exam result not found"
        });
    }

    const newPublishStatus = req.body.publish !== undefined 
        ? Boolean(req.body.publish) 
        : !examResult.isPublished;

    // MANDATORY WORKFLOW RULE: Admin should NOT publish result until teacher has reviewed & published it!
    if (newPublishStatus === true && !examResult.isTeacherPublished) {
        return res.status(400).json({
            status: "failed",
            message: "Cannot publish result to student: This result has not yet been reviewed and published by the respective teacher."
        });
    }

    const publishResult = await ExamResult.findByIdAndUpdate(
        req.params.id, 
        { 
            isPublished: newPublishStatus,
            adminPublishedAt: newPublishStatus ? new Date() : null,
            adminPublishedBy: newPublishStatus ? req.userAuth?._id : null,
        }, 
        { new: true }
    )
    .populate({
        path: "exam",
        populate: [
            { path: "subject" },
            { path: "program" },
            { path: "academicTerm" },
            { path: "academicYear" },
            { path: "classLevel" }
        ]
    })
    .populate("classLevel")
    .populate("academicTerm")
    .populate("academicYear");

    // Fetch student info
    let student = await Student.findOne({
        $or: [
            { StudentId: publishResult.studentID },
            ...(publishResult.studentID && publishResult.studentID.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: publishResult.studentID }] : [])
        ]
    }).select("name email StudentId currentClassLevel program");

    const resultObj = publishResult.toObject();
    resultObj.student = student || { name: `Student (${publishResult.studentID})`, StudentId: publishResult.studentID };

    res.status(200).json({
        status: "Success",
        message: newPublishStatus 
            ? "Exam result published by Admin successfully! It is now live on the student dashboard." 
            : "Exam result unpublished by Admin. The result has been hidden from student view.",
        data: resultObj,
    });
});

//@desc Teacher enters student exam result
//@route POST /api/v1/exam-results/teacher/enter-result
//@access private Teacher only
exports.teacherEnterExamResultCtrl = AsyncHandler(async (req, res) => {
    const { studentId, examId, score, passMark: customPassMark, remarks: customRemarks } = req.body;

    if (!studentId || !examId || score === undefined || score === null || score === "") {
        return res.status(400).json({
            status: "failed",
            message: "Student ID, Exam ID, and Score are required to record an exam result."
        });
    }

    const Exam = require("../../models/Academy/Exam");

    // Find student
    let student = null;
    if (studentId.match(/^[0-9a-fA-F]{24}$/)) {
        student = await Student.findById(studentId);
    }
    if (!student) {
        student = await Student.findOne({
            StudentId: { $regex: new RegExp(`^${studentId.trim()}$`, "i") }
        });
    }
    if (!student) {
        return res.status(404).json({
            status: "failed",
            message: `Student with identifier "${studentId}" was not found.`
        });
    }

    // Find exam
    const exam = await Exam.findById(examId)
        .populate("subject")
        .populate("program")
        .populate("academicTerm")
        .populate("academicYear")
        .populate("classLevel");

    if (!exam) {
        return res.status(404).json({
            status: "failed",
            message: "Exam not found."
        });
    }

    const numScore = Number(score);
    if (isNaN(numScore) || numScore < 0) {
        return res.status(400).json({
            status: "failed",
            message: "Score must be a non-negative number."
        });
    }

    const effectiveTotalMark = exam.totalMark || 100;
    const effectivePassMark = customPassMark !== undefined ? Number(customPassMark) : (exam.passMark || 50);

    // Calculate percentage grade if score is raw marks, or if totalMark is 100
    const grade = Math.round((numScore / effectiveTotalMark) * 100);
    const status = grade >= effectivePassMark ? "Passed" : "Failed";

    // Calculate remarks if not provided
    let remarks = customRemarks;
    if (!remarks) {
        if (grade >= 80) remarks = "Excellent";
        else if (grade >= 70) remarks = "Very Good";
        else if (grade >= 60) remarks = "Good";
        else if (grade >= 50) remarks = "Fair";
        else remarks = "Poor";
    }

    // When a teacher enters a result, they can publish it directly to the admin queue
    const isTeacherPublished = req.body.publishToAdmin !== undefined ? Boolean(req.body.publishToAdmin) : true;

    // Check if an existing ExamResult exists for this student and exam
    let existingResult = await ExamResult.findOne({
        $or: [
            { studentID: student.StudentId, exam: exam._id },
            { studentID: student._id.toString(), exam: exam._id }
        ]
    });

    let savedResult;
    if (existingResult) {
        // STRICT WORKFLOW RULE: If already approved and published by Admin, teacher cannot alter or recall it
        if (existingResult.isPublished) {
            return res.status(400).json({
                status: "failed",
                message: "This exam result has already been officially approved and published by administration. It cannot be altered or recalled by the teacher."
            });
        }

        // Update existing result
        existingResult.score = numScore;
        existingResult.grade = grade;
        existingResult.passMark = effectivePassMark;
        existingResult.status = status;
        existingResult.remarks = remarks;
        existingResult.isTeacherPublished = isTeacherPublished;
        if (isTeacherPublished) {
            existingResult.teacherPublishedAt = new Date();
            existingResult.teacherPublishedBy = req.userAuth?._id;
        }
        existingResult.isPublished = false; // Admin must review and release to student
        existingResult.classLevel = exam.classLevel?._id || exam.classLevel;
        existingResult.academicTerm = exam.academicTerm?._id || exam.academicTerm;
        existingResult.academicYear = exam.academicYear?._id || exam.academicYear;
        savedResult = await existingResult.save();
    } else {
        // Create new result
        savedResult = await ExamResult.create({
            studentID: student.StudentId,
            exam: exam._id,
            grade,
            score: numScore,
            passMark: effectivePassMark,
            status,
            remarks,
            classLevel: exam.classLevel?._id || exam.classLevel,
            academicTerm: exam.academicTerm?._id || exam.academicTerm,
            academicYear: exam.academicYear?._id || exam.academicYear,
            isTeacherPublished: isTeacherPublished,
            teacherPublishedAt: isTeacherPublished ? new Date() : null,
            teacherPublishedBy: isTeacherPublished ? req.userAuth?._id : null,
            isPublished: false, // Admin must review and release to student
            answeredQuestions: [],
        });

        // Link result to student profile if not already present
        if (!student.examsResults.includes(savedResult._id)) {
            student.examsResults.push(savedResult._id);
            await student.save({ validateBeforeSave: false });
        }
    }

    // Populate for response
    const populated = await ExamResult.findById(savedResult._id)
        .populate({
            path: "exam",
            populate: [
                { path: "subject" },
                { path: "program" },
                { path: "academicTerm" },
                { path: "academicYear" },
                { path: "classLevel" }
            ]
        })
        .populate("classLevel")
        .populate("academicTerm")
        .populate("academicYear");

    const responseObj = populated.toObject();
    responseObj.student = {
        _id: student._id,
        name: student.name,
        StudentId: student.StudentId,
        email: student.email,
        currentClassLevel: student.currentClassLevel,
        program: student.program,
    };

    res.status(201).json({
        status: "Success",
        message: isTeacherPublished
            ? "Exam result recorded and published to Admin! It is now in the administrative review queue for final publication."
            : "Exam result recorded as draft. You can publish it to Admin whenever you're ready.",
        data: responseObj,
    });
});

//@desc Teacher publish / unpublish exam result (Tier 1: forwards to Admin review queue)
//@route PUT /api/v1/exam-results/:id/teacher-toggle-publish
//@route POST /api/v1/exam-results/:id/teacher-toggle-publish
//@access private Teacher only
exports.teacherTogglePublishResultCtrl = AsyncHandler(async (req, res) => {
    const examResult = await ExamResult.findById(req.params.id);
    if (!examResult) {
        return res.status(404).json({
            status: "failed",
            message: "Exam result not found"
        });
    }

    const newTeacherStatus = req.body.publish !== undefined
        ? Boolean(req.body.publish)
        : !examResult.isTeacherPublished;

    // STRICT WORKFLOW RULE: Once Admin has approved and published the result, teacher is unable to recall it back!
    if (examResult.isPublished && !newTeacherStatus) {
        return res.status(400).json({
            status: "failed",
            message: "This exam result has already been officially approved and published by administration. It cannot be recalled by the teacher."
        });
    }

    const updateFields = {
        isTeacherPublished: newTeacherStatus,
        teacherPublishedAt: newTeacherStatus ? new Date() : null,
        teacherPublishedBy: newTeacherStatus ? req.userAuth?._id : null,
    };

    // If teacher recalls or unpublishes (before Admin approves), clear any admin published timestamps
    if (!newTeacherStatus) {
        updateFields.isPublished = false;
        updateFields.adminPublishedAt = null;
        updateFields.adminPublishedBy = null;
    }

    const updated = await ExamResult.findByIdAndUpdate(
        req.params.id,
        updateFields,
        { new: true }
    )
    .populate({
        path: "exam",
        populate: [
            { path: "subject" },
            { path: "program" },
            { path: "academicTerm" },
            { path: "academicYear" },
            { path: "classLevel" }
        ]
    })
    .populate("classLevel")
    .populate("academicTerm")
    .populate("academicYear");

    // Fetch student info
    let student = await Student.findOne({
        $or: [
            { StudentId: updated.studentID },
            ...(updated.studentID && updated.studentID.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: updated.studentID }] : [])
        ]
    }).select("name email StudentId currentClassLevel program");

    const resultObj = updated.toObject();
    resultObj.student = student || { name: `Student (${updated.studentID})`, StudentId: updated.studentID };

    res.status(200).json({
        status: "Success",
        message: newTeacherStatus
            ? "Exam result published to Admin successfully! The administrator can now review and release it to the student."
            : "Exam result recalled by teacher. It has been removed from the Admin review queue.",
        data: resultObj,
    });
});

//@desc Teacher get all exam results of students in their class level
//@route GET /api/v1/exam-results/teacher/class-results
//@access private Teacher only

exports.fetchTeacherClassResultsCtrl = AsyncHandler(async (req, res) => {
    const teacher = await Teacher.findById(req.userAuth?._id);
    if (!teacher) {
        throw new Error("Teacher not found");
    }

    const { startDate, endDate, status, studentName, isTeacherPublished, teacherPublish, isPublished } = req.query;

    const mongoose = require("mongoose");
    const Exam = require("../../models/Academy/Exam");

    // Fetch exams created by this teacher
    const teacherExams = await Exam.find({ createdBy: teacher._id }).select("_id");
    const teacherExamIds = teacherExams.map(e => e._id);

    let classStudents = [];
    let targetClassName = teacher.classLevel || "";

    if (teacher.classLevel) {
        if (mongoose.Types.ObjectId.isValid(teacher.classLevel)) {
            const cDoc = await ClassLevel.findById(teacher.classLevel);
            if (cDoc && cDoc.name) {
                targetClassName = cDoc.name;
            }
        }

        const extractLevelNumber = (str) => {
            if (!str || typeof str !== "string") return null;
            const match = str.match(/\d+/);
            return match ? match[0] : null;
        };

        const teacherLevelNumber = extractLevelNumber(targetClassName);
        const levelRegex = teacherLevelNumber
            ? new RegExp(`(^|\\b|\\D)${teacherLevelNumber}(\\D|\\b|$)`, "i")
            : new RegExp(`^${targetClassName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, "i");

        // Match currentClassLevel
        const studentFilter = {
            $or: [
                { currentClassLevel: targetClassName },
                { currentClassLevel: teacher.classLevel },
                { currentClassLevel: { $regex: levelRegex } },
            ]
        };

        let rawClassStudents = await Student.find(studentFilter)
            .select("_id StudentId name email currentClassLevel program")
            .populate("program");

        classStudents = rawClassStudents.filter((student) => {
            const studentLevel = (student.currentClassLevel || "").trim();
            const studentLevelNum = extractLevelNumber(studentLevel);

            if (teacherLevelNumber) {
                if (studentLevelNum) {
                    return studentLevelNum === teacherLevelNumber;
                }
                return studentLevel.toLowerCase() === targetClassName.toLowerCase();
            }
            return studentLevel.toLowerCase() === targetClassName.toLowerCase();
        });
    }

    // Also include any students assigned to this teacher
    const assignedStudents = await Student.find({ assignedTeacher: teacher._id })
        .select("_id StudentId name email currentClassLevel program")
        .populate("program");
    assignedStudents.forEach(st => {
        if (!classStudents.some(cs => cs._id.toString() === st._id.toString())) {
            classStudents.push(st);
        }
    });

    const studentIds = classStudents.map(s => s.StudentId).filter(Boolean);
    const studentMongoIds = classStudents.map(s => s._id.toString());

    // Build orConditions: match students in teacher's class / assigned OR exams created by teacher
    let orConditions = [];
    if (studentIds.length > 0) orConditions.push({ studentID: { $in: studentIds } });
    if (studentMongoIds.length > 0) orConditions.push({ studentID: { $in: studentMongoIds } });
    if (teacherExamIds.length > 0) orConditions.push({ exam: { $in: teacherExamIds } });

    // If teacher has no class, no assigned students, and no created exams
    if (orConditions.length === 0) {
        return res.status(200).json({
            status: "Success",
            message: "No assigned students or created exams found for your account.",
            data: [],
            teacherClassLevel: teacher.classLevel || null,
            totalStudents: 0,
        });
    }

    let resultFilter = { $or: orConditions };

    if (status && status !== "all") {
        resultFilter.status = status;
    }
    // Filter by teacher publish status
    const tPub = isTeacherPublished !== undefined ? isTeacherPublished : teacherPublish;
    if (tPub !== undefined && tPub !== "all") {
        resultFilter.isTeacherPublished = tPub === "true" || tPub === true || tPub === "published";
    }
    // Filter by admin publish status
    if (isPublished !== undefined && isPublished !== "all") {
        resultFilter.isPublished = isPublished === "true" || isPublished === true || isPublished === "published";
    }
    if (startDate || endDate) {
        resultFilter.createdAt = {};
        if (startDate) resultFilter.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            resultFilter.createdAt.$lte = end;
        }
    }

    let results = await ExamResult.find(resultFilter)
        .populate({
            path: "exam",
            populate: [
                { path: "subject" },
                { path: "program" },
                { path: "academicTerm" },
                { path: "academicYear" },
                { path: "classLevel" },
            ]
        })
        .populate("classLevel")
        .populate("academicTerm")
        .populate("academicYear")
        .sort({ createdAt: -1 });

    // Build student lookup map
    const studentMap = {};
    classStudents.forEach(s => {
        if (s.StudentId) {
            studentMap[s.StudentId] = s;
            studentMap[s.StudentId.toLowerCase()] = s;
        }
        studentMap[s._id.toString()] = s;
    });

    // If there are exam results from students not yet in classStudents (e.g. students from another class taking this teacher's exam), fetch them
    const resultStudentIds = [...new Set(results.map(r => r.studentID).filter(Boolean))];
    const missingIds = resultStudentIds.filter(id => !studentMap[id] && !studentMap[id?.toLowerCase()]);
    if (missingIds.length > 0) {
        const extraStudents = await Student.find({
            $or: [
                { StudentId: { $in: missingIds } },
                ...(missingIds.filter(id => id.match(/^[0-9a-fA-F]{24}$/)).map(id => ({ _id: id })))
            ]
        }).select("_id StudentId name email currentClassLevel program").populate("program");
        extraStudents.forEach(s => {
            if (s.StudentId) {
                studentMap[s.StudentId] = s;
                studentMap[s.StudentId.toLowerCase()] = s;
            }
            studentMap[s._id.toString()] = s;
        });
    }

    // Merge student data into results
    let populatedResults = results.map(r => {
        const rObj = r.toObject();
        const studentObj = studentMap[r.studentID] || studentMap[r.studentID?.toLowerCase()] || null;
        rObj.student = studentObj || { StudentId: r.studentID, name: "Student (" + r.studentID + ")" };
        rObj.program = rObj.exam?.program || studentObj?.program || null;
        return rObj;
    });

    // Optional: filter by student name
    if (studentName && studentName.trim()) {
        const query = studentName.trim().toLowerCase();
        populatedResults = populatedResults.filter(r =>
            (r.student?.name || "").toLowerCase().includes(query) ||
            (r.student?.StudentId || r.studentID || "").toLowerCase().includes(query)
        );
    }

    res.status(200).json({
        status: "Success",
        message: "Class exam results fetched successfully",
        data: populatedResults,
        teacherClassLevel: teacher.classLevel || null,
        teacherProgram: teacher.program || null,
        totalStudents: classStudents.length,
    });
});