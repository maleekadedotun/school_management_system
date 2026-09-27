const AsyncHandler = require("express-async-handler");
const ExamResult = require("../../models/Academy/ExamResults");
const Student = require("../../models/Academy/Student");
const Teacher = require("../../models/Staff/Teacher");
// const { path } = require("../../app/app");


//@desc checkig result
//@route POST /api/v1/check-results/:id/checking
//@access private Student only

exports.checkExamResultsCtrl = AsyncHandler(async(req, res) => {
    // find the student
    const studentFound = await Student.findById(req.userAuth?._id);
    if (!studentFound) {
        throw new Error("No student found")
    }
    // find the result
    const examResult = await ExamResult.findById({
        studentID: studentFound?.StudentId,
        _id: req.params.id,
    })
    .populate({
        path: "exam",
        populate: {
            path: "questions",
        }
    })
    // .populate("exam")
    .populate("classLevel")
    .populate("academicTerm")
    .populate("academicYear");
    // check if exam is published
    if (examResult?.isPublished === false) {
        throw new Error("Exam result not available, check out later.")
    }
    res.status(200).json({
        status: "Success",
        message: "Exam result",
        data: examResult,
        student: studentFound,
    })
});

//@desc All exam Results (name, id)
//@route POST /api/v1/check-results
//@access private Student only

exports.fetchExamResultsCtrl = AsyncHandler(async(req, res) => {
    const results = await ExamResult.find().select("exam").populate("exam");
    res.status(200).json({
        status: "Success",
        message: "Exam results fetched successfully",
        data: results,
    })
});


//@desc Admin get all exam results with filters
//@route GET /api/v1/exam-results/admin
//@access private Admin only

exports.getAllExamResultsAdminCtrl = AsyncHandler(async (req, res) => {
    const { program, startDate, endDate, academicTerm, academicYear, status } = req.query;

    let filter = {};

    if (status && status !== "all") {
        filter.status = status;
    }
    if (academicTerm && academicTerm !== "all") {
        filter.academicTerm = academicTerm;
    }
    if (academicYear && academicYear !== "all") {
        filter.academicYear = academicYear;
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filter.createdAt.$lte = end;
        }
    }

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

    const query = {
        $or: [
            { studentID: studentId },
            ...(student ? [
                { studentID: student.StudentId },
                { studentID: { $regex: new RegExp(`^${student.StudentId}$`, "i") } },
                { studentID: student._id.toString() }
            ] : [])
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

//@desc Admin publish exam result
//@route POST /api/v1/check-results/:id/admin-toggle-publish
//@access private Admin only

exports.adminToggleExamResult = AsyncHandler(async(req, res) => {
    // find the exam result
    const examResult = await ExamResult.findById(req.params.id)
    if (!examResult) {
        throw new Error("Exam result not found")
    }
        const publishResult  = await ExamResult.findByIdAndUpdate(req.params?.id, {
            isPublished: req.body.publish !== undefined ? req.body.publish : !examResult.isPublished,
        }, 
    {
        new: true,
    }
    )
    res.status(200).json({
        status: "Success",
        message: "Exam Results Updated",
        data: publishResult,
    })
});

//@desc Teacher get all exam results of students in their class level
//@route GET /api/v1/exam-results/teacher/class-results
//@access private Teacher only

exports.fetchTeacherClassResultsCtrl = AsyncHandler(async (req, res) => {
    const teacher = await Teacher.findById(req.userAuth?._id);
    if (!teacher) {
        throw new Error("Teacher not found");
    }

    const { startDate, endDate, status, studentName } = req.query;

    // If teacher has no assigned classLevel yet, return empty
    if (!teacher.classLevel) {
        return res.status(200).json({
            status: "Success",
            message: "No class level assigned to your account yet.",
            data: [],
            teacherClassLevel: null,
            totalStudents: 0,
        });
    }

    const mongoose = require("mongoose");
    let targetClassName = teacher.classLevel;
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

    // Strictly match currentClassLevel ONLY — DO NOT match historical classLevels array
    const studentFilter = {
        $or: [
            { currentClassLevel: targetClassName },
            { currentClassLevel: teacher.classLevel },
            { currentClassLevel: { $regex: levelRegex } },
        ]
    };

    // Fetch candidate students in teacher's class
    let rawClassStudents = await Student.find(studentFilter)
        .select("_id StudentId name email currentClassLevel program")
        .populate("program");

    // Strict in-memory filtering to guarantee no cross-level mismatch (e.g. 400L under 200L)
    let classStudents = rawClassStudents.filter((student) => {
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

    const studentIds = classStudents.map(s => s.StudentId).filter(Boolean);
    const studentMongoIds = classStudents.map(s => s._id.toString());

    // Build result filter: match results whose studentID is one of the class students
    let resultFilter = {
        $or: [
            { studentID: { $in: studentIds } },
            { studentID: { $in: studentMongoIds } },
        ]
    };

    if (status && status !== "all") {
        resultFilter.status = status;
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
        if (s.StudentId) studentMap[s.StudentId] = s;
        studentMap[s._id.toString()] = s;
    });

    // Merge student data into results
    let populatedResults = results.map(r => {
        const rObj = r.toObject();
        const studentObj = studentMap[r.studentID] || null;
        rObj.student = studentObj || { StudentId: r.studentID, name: "Student (" + r.studentID + ")" };
        rObj.program = rObj.exam?.program || studentObj?.program || null;
        return rObj;
    });

    // Optional: filter by student name client-side hint on server side too
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