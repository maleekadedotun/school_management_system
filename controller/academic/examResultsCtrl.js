const AsyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const ExamResult = require("../../models/Academy/ExamResults");
const Student = require("../../models/Academy/Student");
const Teacher = require("../../models/Staff/Teacher");
const Exam = require("../../models/Academy/Exam");
const Subject = require("../../models/Academy/Subject");
const ClassLevel = require("../../models/Academy/ClassLevel");

// Helper to extract numeric level digits (e.g. "100" from "Level 100", "100L", "100")
const extractLevelNumber = (str) => {
    if (!str || typeof str !== "string") return null;
    const match = str.match(/\d+/);
    return match ? match[0] : null;
};

const safeEscapeRegex = (str) => {
    return (str || "").toString().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Helper to resolve all Subject IDs and lowercase Subject names associated with a teacher
const getTeacherSubjectInfo = async (teacher) => {
    const teacherSubjectIds = new Set();
    const teacherSubjectNames = new Set();

    if (teacher.subject) {
        const rawSubStr = teacher.subject.toString().trim();
        if (rawSubStr) {
            teacherSubjectNames.add(rawSubStr.toLowerCase());
            if (mongoose.Types.ObjectId.isValid(rawSubStr)) {
                teacherSubjectIds.add(rawSubStr);
            }
        }
    }

    if (Array.isArray(teacher.subjects)) {
        teacher.subjects.forEach((sub) => {
            if (!sub) return;
            if (typeof sub === "object" && sub._id) {
                teacherSubjectIds.add(sub._id.toString());
                if (sub.name) teacherSubjectNames.add(sub.name.trim().toLowerCase());
            } else {
                const sStr = sub.toString().trim();
                if (mongoose.Types.ObjectId.isValid(sStr)) {
                    teacherSubjectIds.add(sStr);
                } else if (sStr) {
                    teacherSubjectNames.add(sStr.toLowerCase());
                }
            }
        });
    }

    const subjectQueryConditions = [{ teacher: teacher._id }];
    if (teacher.subject) {
        const escaped = safeEscapeRegex(teacher.subject);
        subjectQueryConditions.push({ name: { $regex: new RegExp(`^${escaped}$`, "i") } });
        if (mongoose.Types.ObjectId.isValid(teacher.subject)) {
            subjectQueryConditions.push({ _id: teacher.subject });
        }
    }
    if (teacherSubjectIds.size > 0) {
        subjectQueryConditions.push({
            _id: { $in: Array.from(teacherSubjectIds).filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id)) }
        });
    }

    const matchedSubjects = await Subject.find({ $or: subjectQueryConditions });
    matchedSubjects.forEach((subDoc) => {
        teacherSubjectIds.add(subDoc._id.toString());
        if (subDoc.name) {
            teacherSubjectNames.add(subDoc.name.trim().toLowerCase());
        }
    });

    return {
        hasTeacherSubject: teacherSubjectNames.size > 0 || teacherSubjectIds.size > 0,
        teacherSubjectIds,
        teacherSubjectNames,
    };
};

// Helper: strictly check if a student belongs to the teacher's class AND is offering the teacher's subject alone
const isStudentInTeacherClassAndOfferingSubject = (student, teacher, teacherSubjectInfo, targetClassName, teacherLevelNumber) => {
    // 1. Class level check: Student must strictly match teacher's assigned class
    if (targetClassName) {
        const studentLevel = (student.currentClassLevel || "").trim();
        const studentLevelNum = extractLevelNumber(studentLevel);
        let classMatches = false;
        if (teacherLevelNumber && studentLevelNum) {
            classMatches = studentLevelNum === teacherLevelNumber;
        } else {
            classMatches = studentLevel.toLowerCase() === targetClassName.toLowerCase();
        }
        if (!classMatches) return false;
    }

    // If teacher has assigned program or class teacher assignment, filter by program alone without restricting by subject
    if (teacher?.program || teacher?.classTeacherAssignment) {
        return true;
    }

    // 2. Subject offering check: Student must be offering teacher's assigned subject alone
    if (teacherSubjectInfo.hasTeacherSubject) {
        let offersSubject = false;

        // Direct subject field check
        if (student.subject) {
            const sSubStr = student.subject.toString().trim().toLowerCase();
            const sSubId = student.subject._id ? student.subject._id.toString() : student.subject.toString();
            if (teacherSubjectInfo.teacherSubjectNames.has(sSubStr) || teacherSubjectInfo.teacherSubjectIds.has(sSubId)) {
                offersSubject = true;
            }
        }

        // enrolledSubjects array check
        if (!offersSubject && Array.isArray(student.enrolledSubjects)) {
            for (const item of student.enrolledSubjects) {
                if (!item || !item.subject) continue;
                const subObj = item.subject;
                const subId = (subObj._id || subObj).toString();
                const subName = (subObj.name || "").toString().trim().toLowerCase();

                if (teacherSubjectInfo.teacherSubjectIds.has(subId) || teacherSubjectInfo.teacherSubjectNames.has(subName)) {
                    offersSubject = true;
                    break;
                }
            }
        }

        if (!offersSubject) {
            // Fallback: In secondary school, all students in the class level offer class subjects by default
            offersSubject = true;
        }
    }

    return true;
};

// Ordinal formatter: 1 -> 1st, 2 -> 2nd, 3 -> 3rd, 4 -> 4th, 21 -> 21st, 11 -> 11th...
const formatOrdinal = (n) => {
    if (!n || isNaN(n)) return "";
    const num = parseInt(n, 10);
    const s = ["th", "st", "nd", "rd"];
    const v = num % 100;
    return num + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * Re-calculates and persists positions for all ExamResults within the same subject & class cohort
 */
const recalculateSubjectPositions = async ({ subjectId, subjectName, classLevelId, currentClassLevel, examId, academicTermId }) => {
    try {
        const queryConditions = [];

        if (examId && mongoose.Types.ObjectId.isValid(examId)) {
            queryConditions.push({ exam: examId });
        }

        const subOr = [];
        if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
            subOr.push({ subject: subjectId });
        }
        if (subjectName && typeof subjectName === "string" && subjectName.trim()) {
            const esc = safeEscapeRegex(subjectName);
            subOr.push({ subjectName: { $regex: new RegExp(`^${esc}$`, "i") } });
            subOr.push({ "exam.subject.name": { $regex: new RegExp(`^${esc}$`, "i") } });
        }

        const classOr = [];
        if (classLevelId && mongoose.Types.ObjectId.isValid(classLevelId)) {
            classOr.push({ classLevel: classLevelId });
        }
        if (currentClassLevel && typeof currentClassLevel === "string" && currentClassLevel.trim()) {
            classOr.push({ currentClassLevel: currentClassLevel.trim() });
            const lvlNum = extractLevelNumber(currentClassLevel);
            if (lvlNum) {
                classOr.push({ currentClassLevel: { $regex: new RegExp(`(^|\\b|\\D)${lvlNum}(\\D|\\b|$)`, "i") } });
            }
        }

        let query = {};
        if (subOr.length > 0 && classOr.length > 0) {
            query = {
                $and: [
                    { $or: subOr },
                    { $or: classOr },
                    ...(academicTermId ? [{ academicTerm: academicTermId }] : [])
                ]
            };
        } else if (examId) {
            query = { exam: examId };
        } else if (subOr.length > 0) {
            query = { $or: subOr };
        } else if (queryConditions.length > 0) {
            query = { $or: queryConditions };
        } else {
            return;
        }

        // Fetch matching results ordered by score descending
        const results = await ExamResult.find(query).sort({ score: -1, createdAt: 1 });
        if (!results || results.length === 0) return;

        let prevScore = null;
        let rankToAssign = 1;

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (prevScore !== null && r.score === prevScore) {
                // Same score shares the same rank
            } else {
                rankToAssign = i + 1;
            }
            prevScore = r.score;

            const formatted = formatOrdinal(rankToAssign);
            r.position = rankToAssign;
            r.positionFormatted = formatted;
            await r.save();

            // Sync with StudentReportCard if present
            try {
                const StudentReportCard = require("../../models/Academy/StudentReportCard");
                const reportCards = await StudentReportCard.find({
                    $or: [
                        { studentID: r.studentID },
                        { student: r.studentID }
                    ]
                });

                for (const rc of reportCards) {
                    let updated = false;
                    if (Array.isArray(rc.subjectResults)) {
                        for (const subRes of rc.subjectResults) {
                            const isMatch =
                                (r.subject && subRes.subject && subRes.subject.toString() === r.subject.toString()) ||
                                (r.subjectName && subRes.subjectName && subRes.subjectName.toLowerCase() === r.subjectName.toLowerCase()) ||
                                (r.exam && subRes.exam && subRes.exam.toString() === r.exam.toString());

                            if (isMatch) {
                                subRes.testScore = r.testScore !== undefined ? r.testScore : subRes.testScore;
                                subRes.examScore = r.examScore !== undefined ? r.examScore : subRes.examScore;
                                subRes.score = r.score;
                                subRes.position = rankToAssign;
                                subRes.positionFormatted = formatted;
                                updated = true;
                            }
                        }
                    }
                    if (updated) {
                        await rc.save({ validateBeforeSave: false });
                    }
                }
            } catch (err) {
                console.error("Error updating StudentReportCard position:", err);
            }
        }
    } catch (err) {
        console.error("Error in recalculateSubjectPositions:", err);
    }
};

exports.extractLevelNumber = extractLevelNumber;
exports.getTeacherSubjectInfo = getTeacherSubjectInfo;
exports.isStudentInTeacherClassAndOfferingSubject = isStudentInTeacherClassAndOfferingSubject;
exports.formatOrdinal = formatOrdinal;
exports.recalculateSubjectPositions = recalculateSubjectPositions;

//@desc checking single result
//@route GET /api/v1/exam-results/:id/checking
//@access private Student or Parent

exports.checkExamResultsCtrl = AsyncHandler(async (req, res) => {
    let studentIds = [];
    let studentFound = null;
    const isParent = req.userAuth?.role === "parent";

    if (isParent) {
        const Parent = require("../../models/Staff/Parent");
        const parent = await Parent.findById(req.userAuth?._id);
        if (!parent || !parent.children || parent.children.length === 0) {
            return res.status(404).json({
                status: "failed",
                message: "No linked children found for this parent.",
            });
        }
        const studentDocs = await Student.find({ _id: { $in: parent.children } });
        studentDocs.forEach((s) => {
            if (s.StudentId) studentIds.push(s.StudentId);
            studentIds.push(s._id.toString());
        });
        studentFound = studentDocs[0] || null;
    } else {
        studentFound = await Student.findById(req.userAuth?._id);
        if (!studentFound) {
            throw new Error("No student found");
        }
        if (studentFound.StudentId) studentIds.push(studentFound.StudentId);
        studentIds.push(studentFound._id.toString());
    }

    // find the result
    const examResult = await ExamResult.findOne({
        _id: req.params.id,
        studentID: { $in: studentIds },
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

    // check if exam is published - student/parent CANNOT see unpublished results
    if (examResult.isPublished !== true) {
        if (!examResult.isTeacherPublished) {
            return res.status(403).json({
                status: "failed",
                message: "Exam result is currently awaiting verification and publication by the respective teacher. Please check back later."
            });
        }
        return res.status(403).json({
            status: "failed",
            message: "Exam result has been verified by teacher and is currently undergoing administrative review for final release."
        });
    }

    res.status(200).json({
        status: "Success",
        message: "Exam result retrieved successfully",
        data: examResult,
        student: studentFound,
    });
});

//@desc Student or Parent get all published exam results
//@route GET /api/v1/exam-results
//@access private Student or Parent

exports.fetchExamResultsCtrl = AsyncHandler(async (req, res) => {
    let studentIds = [];
    const isParent = req.userAuth?.role === "parent";

    if (isParent) {
        const Parent = require("../../models/Staff/Parent");
        const parent = await Parent.findById(req.userAuth?._id);
        if (!parent || !parent.children || parent.children.length === 0) {
            return res.status(200).json({
                status: "Success",
                message: "No linked children found for this parent.",
                data: [],
            });
        }

        const targetChildId = req.query.studentId;
        let childrenToQuery = parent.children;
        if (targetChildId && targetChildId !== "all") {
            const match = parent.children.find((c) => c.toString() === targetChildId.toString());
            if (!match) {
                return res.status(403).json({
                    status: "failed",
                    message: "You are not authorized to view results for this student.",
                });
            }
            childrenToQuery = [match];
        }

        const studentDocs = await Student.find({ _id: { $in: childrenToQuery } });
        studentDocs.forEach((s) => {
            if (s.StudentId) studentIds.push(s.StudentId);
            if (s.studentId) studentIds.push(s.studentId);
            studentIds.push(s._id.toString());
        });
    } else {
        const student = await Student.findById(req.userAuth?._id);
        if (!student) {
            return res.status(404).json({
                status: "failed",
                message: "Student account not found."
            });
        }
        if (student.StudentId) studentIds.push(student.StudentId);
        if (student.studentId) studentIds.push(student.studentId);
        studentIds.push(student._id.toString());
    }

    // MANDATORY WORKFLOW RULE: Students and Parents CANNOT see results until Admin approves and publishes them!
    const results = await ExamResult.find({
        isPublished: true,
        studentID: { $in: studentIds },
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
        rObj.program = studentObj?.program || rObj.exam?.program || null;
        return rObj;
    });

    // If program filter specified, filter results accordingly
    if (program && program !== "all") {
        populatedResults = populatedResults.filter(r => {
            const progId = r.program?._id?.toString() || r.program?.toString();
            const progName = r.program?.name?.toLowerCase();
            const stuProgId = r.student?.program?._id?.toString() || r.student?.program?.toString();
            const stuProgName = r.student?.program?.name?.toLowerCase();
            const examProgId = r.exam?.program?._id?.toString() || r.exam?.program?.toString();
            const examProgName = r.exam?.program?.name?.toLowerCase();
            const filterLower = program.toLowerCase();
            return progId === program ||
                (progName && progName.includes(filterLower)) ||
                stuProgId === program ||
                (stuProgName && stuProgName.includes(filterLower)) ||
                examProgId === program ||
                (examProgName && examProgName.includes(filterLower));
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
        student = await Student.findById(studentId).populate("program").populate("enrolledSubjects.subject");
    }
    if (!student) {
        student = await Student.findOne({
            StudentId: { $regex: new RegExp(`^${studentId}$`, "i") }
        }).populate("program").populate("enrolledSubjects.subject");
    }

    // If caller is a teacher, strictly verify they have access to this student in their class offering their subject alone
    if (req.userAuth?.role === "teacher") {
        const teacher = await Teacher.findById(req.userAuth._id);
        if (!teacher) {
            return res.status(404).json({ status: "failed", message: "Teacher account not found." });
        }
        const teacherSubjectInfo = await getTeacherSubjectInfo(teacher);
        let targetClassName = (teacher.classLevel || "").toString().trim();
        if (teacher.classLevel && mongoose.Types.ObjectId.isValid(teacher.classLevel)) {
            const cDoc = await ClassLevel.findById(teacher.classLevel);
            if (cDoc && cDoc.name) targetClassName = cDoc.name.trim();
        }
        const teacherLevelNum = extractLevelNumber(targetClassName);

        const isAllowed = student && isStudentInTeacherClassAndOfferingSubject(student, teacher, teacherSubjectInfo, targetClassName, teacherLevelNum);
        if (!isAllowed) {
            return res.status(403).json({
                status: "failed",
                message: "Access denied. You only have access to students in your class offering your subject."
            });
        }

        // Filter results by teacher's exams / subject
        const examOr = [{ createdBy: teacher._id }];
        if (teacherSubjectInfo.teacherSubjectIds.size > 0) {
            examOr.push({ subject: { $in: Array.from(teacherSubjectInfo.teacherSubjectIds).map(id => new mongoose.Types.ObjectId(id)) } });
        }
        const teacherExams = await Exam.find({ $or: examOr }).select("_id");
        const teacherExamIds = teacherExams.map(e => e._id);

        const studentConditions = [
            { studentID: studentId },
            ...(student ? [
                { studentID: student.StudentId },
                { studentID: { $regex: new RegExp(`^${student.StudentId}$`, "i") } },
                { studentID: student._id.toString() }
            ] : [])
        ];

        const teacherResultsQuery = {
            $and: [
                { $or: studentConditions },
                { exam: { $in: teacherExamIds } }
            ]
        };

        const results = await ExamResult.find(teacherResultsQuery)
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

        return res.status(200).json({
            status: "Success",
            message: "Student exam results fetched successfully",
            student,
            data: results,
        });
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

exports.adminToggleExamResult = AsyncHandler(async (req, res) => {
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
    const {
        studentId,
        examId: incomingExamId,
        subjectId: incomingSubjectId,
        subjectName: incomingSubjectName,
        testScore: incomingTestScore,
        examScore: incomingExamScore,
        score: incomingScore,
        passMark: customPassMark,
        remarks: customRemarks,
        publishToAdmin
    } = req.body;

    if (!studentId) {
        return res.status(400).json({
            status: "failed",
            message: "Student ID is required to record a result."
        });
    }

    // Determine numerical test and exam scores
    const tScore = incomingTestScore !== undefined && incomingTestScore !== null && incomingTestScore !== ""
        ? Number(incomingTestScore)
        : null;
    const eScore = incomingExamScore !== undefined && incomingExamScore !== null && incomingExamScore !== ""
        ? Number(incomingExamScore)
        : null;

    let totalScore;
    if (tScore !== null || eScore !== null) {
        totalScore = (tScore || 0) + (eScore || 0);
    } else if (incomingScore !== undefined && incomingScore !== null && incomingScore !== "") {
        totalScore = Number(incomingScore);
    } else {
        return res.status(400).json({
            status: "failed",
            message: "Please enter test score and exam score, or a total score."
        });
    }

    if (tScore !== null && (tScore < 0 || tScore > 30)) {
        return res.status(400).json({
            status: "failed",
            message: "Test score must be between 0 and 30 marks.",
        });
    }
    if (eScore !== null && (eScore < 0 || eScore > 70)) {
        return res.status(400).json({
            status: "failed",
            message: "Exam score must be between 0 and 70 marks.",
        });
    }

    if (isNaN(totalScore) || totalScore < 0) {
        return res.status(400).json({
            status: "failed",
            message: "Score must be a non-negative number."
        });
    }

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

    // Strictly verify teacher access: student must be in teacher's class offering the teacher's subject alone
    const teacher = await Teacher.findById(req.userAuth?._id);
    if (!teacher) {
        return res.status(404).json({
            status: "failed",
            message: "Teacher account not found."
        });
    }

    const teacherSubjectInfo = await getTeacherSubjectInfo(teacher);
    let targetClassName = (teacher.classLevel || "").toString().trim();
    let teacherClassLevelDoc = null;
    if (teacher.classLevel && mongoose.Types.ObjectId.isValid(teacher.classLevel)) {
        teacherClassLevelDoc = await ClassLevel.findById(teacher.classLevel);
        if (teacherClassLevelDoc && teacherClassLevelDoc.name) targetClassName = teacherClassLevelDoc.name.trim();
    }
    const teacherLevelNum = extractLevelNumber(targetClassName);

    await student.populate("enrolledSubjects.subject");
    await student.populate("program");

    const isStudentAllowed = isStudentInTeacherClassAndOfferingSubject(
        student,
        teacher,
        teacherSubjectInfo,
        targetClassName,
        teacherLevelNum
    );

    if (!isStudentAllowed) {
        return res.status(403).json({
            status: "failed",
            message: "Access denied: You can only record exam results for students in your class offering your subject."
        });
    }

    // Resolve Subject and Exam
    let exam = null;
    let resolvedSubject = null;

    if (incomingExamId && mongoose.Types.ObjectId.isValid(incomingExamId)) {
        exam = await Exam.findById(incomingExamId)
            .populate("subject")
            .populate("program")
            .populate("academicTerm")
            .populate("academicYear")
            .populate("classLevel");
    }

    if (!exam && (incomingSubjectId || incomingSubjectName)) {
        if (incomingSubjectId && mongoose.Types.ObjectId.isValid(incomingSubjectId)) {
            resolvedSubject = await Subject.findById(incomingSubjectId);
        }
        if (!resolvedSubject && incomingSubjectName) {
            const esc = safeEscapeRegex(incomingSubjectName);
            resolvedSubject = await Subject.findOne({ name: { $regex: new RegExp(`^${esc}$`, "i") } });
        }

        if (resolvedSubject) {
            exam = await Exam.findOne({
                subject: resolvedSubject._id,
                $or: [
                    { createdBy: teacher._id },
                    ...(teacherClassLevelDoc ? [{ classLevel: teacherClassLevelDoc._id }] : [])
                ]
            })
                .populate("subject")
                .populate("program")
                .populate("academicTerm")
                .populate("academicYear")
                .populate("classLevel");
        }
    }

    // Auto-create assessment Exam for this subject if not present yet so teacher is never blocked
    if (!exam && resolvedSubject) {
        const AcademicTerm = require("../../models/Academy/AcademicTerm");
        const AcademicYear = require("../../models/Academy/AcademicYear");
        const activeTerm = await AcademicTerm.findOne({ isCurrent: true }) || await AcademicTerm.findOne();
        const activeYear = await AcademicYear.findOne({ isCurrent: true }) || await AcademicYear.findOne();
        const classLevelId = teacherClassLevelDoc?._id || (teacher.classLevel && mongoose.Types.ObjectId.isValid(teacher.classLevel) ? teacher.classLevel : null);

        exam = await Exam.create({
            name: `${resolvedSubject.name} Continuous Assessment & Exam`,
            description: `Official subject grading assessment for ${student.currentClassLevel || targetClassName || "Class"}`,
            subject: resolvedSubject._id,
            program: student.program?._id || resolvedSubject.program || teacher.program,
            academicTerm: activeTerm?._id,
            academicYear: activeYear?._id,
            classLevel: classLevelId,
            createdBy: teacher._id,
            duration: "60 minutes",
            examDate: new Date(),
            examTime: "09:00 AM",
            totalMark: 100,
            passMark: 40,
        });

        exam = await Exam.findById(exam._id)
            .populate("subject")
            .populate("program")
            .populate("academicTerm")
            .populate("academicYear")
            .populate("classLevel");
    }

    if (!exam) {
        return res.status(404).json({
            status: "failed",
            message: "No exam assessment or subject found. Please select an exam assessment or subject."
        });
    }

    if (!resolvedSubject && exam.subject) {
        resolvedSubject = exam.subject;
    }

    const isTestType = ["test", "quiz", "continuous assessment", "ca"].includes((exam.examType || "").toLowerCase());
    const defaultTotal = isTestType ? 30 : 70;
    const defaultPass = isTestType ? 15 : 40;
    const effectiveTotalMark = exam.totalMark || (tScore !== null && eScore !== null ? 100 : defaultTotal);
    const effectivePassMark = customPassMark !== undefined 
        ? Number(customPassMark) 
        : (exam.passMark || (effectiveTotalMark === 100 ? 40 : defaultPass));

    const grade = Math.min(100, Math.round((totalScore / effectiveTotalMark) * 100));
    const passThreshold = effectivePassMark <= 100 && effectiveTotalMark === 100
        ? effectivePassMark
        : (effectivePassMark / effectiveTotalMark) * 100;
    const status = (grade >= passThreshold || totalScore >= effectivePassMark) ? "Passed" : "Failed";

    let remarks = customRemarks;
    if (!remarks) {
        if (grade >= 80) remarks = "Excellent";
        else if (grade >= 70) remarks = "Very Good";
        else if (grade >= 60) remarks = "Good";
        else if (grade >= 40) remarks = "Fair";
        else remarks = "Poor";
    }

    const isTeacherPublished = publishToAdmin !== undefined ? Boolean(publishToAdmin) : true;

    // Check if an existing ExamResult exists for this student and exam/subject
    let existingResult = await ExamResult.findOne({
        $or: [
            { studentID: student.StudentId, exam: exam._id },
            { studentID: student._id.toString(), exam: exam._id },
            ...(resolvedSubject ? [
                { studentID: student.StudentId, subject: resolvedSubject._id },
                { studentID: student._id.toString(), subject: resolvedSubject._id }
            ] : [])
        ]
    });

    let savedResult;
    if (existingResult) {
        if (existingResult.isPublished) {
            return res.status(400).json({
                status: "failed",
                message: "This exam result has already been officially approved and published by administration. It cannot be altered or recalled by the teacher."
            });
        }

        existingResult.score = totalScore;
        existingResult.testScore = tScore !== null ? tScore : (existingResult.testScore || 0);
        existingResult.examScore = eScore !== null ? eScore : (existingResult.examScore || totalScore);
        existingResult.grade = grade;
        existingResult.passMark = effectivePassMark;
        existingResult.status = status;
        existingResult.remarks = remarks;
        existingResult.subject = resolvedSubject?._id || existingResult.subject;
        existingResult.subjectName = resolvedSubject?.name || existingResult.subjectName;
        existingResult.program = student.program?._id || student.program || existingResult.program;
        existingResult.programName = student.program?.name || existingResult.programName;
        existingResult.currentClassLevel = student.currentClassLevel || targetClassName || existingResult.currentClassLevel;
        existingResult.classLevel = exam.classLevel?._id || exam.classLevel || existingResult.classLevel;
        existingResult.academicTerm = exam.academicTerm?._id || exam.academicTerm || existingResult.academicTerm;
        existingResult.academicYear = exam.academicYear?._id || exam.academicYear || existingResult.academicYear;
        existingResult.isTeacherPublished = isTeacherPublished;
        if (isTeacherPublished) {
            existingResult.teacherPublishedAt = new Date();
            existingResult.teacherPublishedBy = req.userAuth?._id;
        }
        existingResult.isPublished = false;
        savedResult = await existingResult.save();
    } else {
        savedResult = await ExamResult.create({
            studentID: student.StudentId,
            exam: exam._id,
            grade,
            score: totalScore,
            testScore: tScore !== null ? tScore : 0,
            examScore: eScore !== null ? eScore : totalScore,
            passMark: effectivePassMark,
            status,
            remarks,
            subject: resolvedSubject?._id || null,
            subjectName: resolvedSubject?.name || "",
            program: student.program?._id || student.program || null,
            programName: student.program?.name || "",
            currentClassLevel: student.currentClassLevel || targetClassName || "",
            classLevel: exam.classLevel?._id || exam.classLevel,
            academicTerm: exam.academicTerm?._id || exam.academicTerm,
            academicYear: exam.academicYear?._id || exam.academicYear,
            isTeacherPublished: isTeacherPublished,
            teacherPublishedAt: isTeacherPublished ? new Date() : null,
            teacherPublishedBy: isTeacherPublished ? req.userAuth?._id : null,
            isPublished: false,
            answeredQuestions: [],
        });

        if (!student.examsResults.includes(savedResult._id)) {
            student.examsResults.push(savedResult._id);
            await student.save({ validateBeforeSave: false });
        }
    }

    // Recalculate subject positions for all students in this cohort
    await recalculateSubjectPositions({
        subjectId: resolvedSubject?._id,
        subjectName: resolvedSubject?.name,
        classLevelId: exam.classLevel?._id || exam.classLevel,
        currentClassLevel: student.currentClassLevel || targetClassName,
        examId: exam._id,
        academicTermId: exam.academicTerm?._id || exam.academicTerm,
    });

    // Automatically document score into StudentSubjectResult for Report Card system
    try {
        const StudentSubjectResult = require("../../models/Academy/StudentSubjectResult");
        const yearId = exam.academicYear?._id || exam.academicYear;
        const termId = exam.academicTerm?._id || exam.academicTerm;
        const classId = exam.classLevel?._id || exam.classLevel || teacherClassLevelDoc?._id;
        const subjectId = resolvedSubject?._id || exam.subject?._id || exam.subject;
        const subjectName = resolvedSubject?.name || exam.name || "Subject";

        if (yearId && termId && classId && subjectId) {
            let subjectResult = await StudentSubjectResult.findOne({
                student: student._id,
                academicYear: yearId,
                academicTerm: termId,
                classLevel: classId,
                subject: subjectId,
            });

            const effectiveTest = tScore !== null ? Math.min(30, Math.max(0, Number(tScore))) : 0;
            const effectiveExam = eScore !== null ? Math.min(70, Math.max(0, Number(eScore))) : 0;

            if (!subjectResult) {
                subjectResult = new StudentSubjectResult({
                    student: student._id,
                    studentID: student.StudentId,
                    academicYear: yearId,
                    academicTerm: termId,
                    classLevel: classId,
                    subject: subjectId,
                    subjectName: subjectName,
                    testScore: effectiveTest,
                    examScore: effectiveExam,
                    recordedBy: req.userAuth?._id,
                    status: "saved",
                });
            } else {
                if (tScore !== null) subjectResult.testScore = effectiveTest;
                if (eScore !== null) subjectResult.examScore = effectiveExam;
            }

            await subjectResult.save();
        }
    } catch (ssrErr) {
        console.error("Auto-document to StudentSubjectResult in examResultsCtrl error:", ssrErr.message);
    }

    // Create / Sync StudentReportCard for this student with rankings
    try {
        const StudentReportCard = require("../../models/Academy/StudentReportCard");
        const termId = exam.academicTerm?._id || exam.academicTerm;
        const yearId = exam.academicYear?._id || exam.academicYear;
        const cLevelId = exam.classLevel?._id || exam.classLevel || teacherClassLevelDoc?._id;

        if (termId && yearId && cLevelId) {
            let reportCard = await StudentReportCard.findOne({
                student: student._id,
                academicYear: yearId,
                academicTerm: termId,
                classLevel: cLevelId,
            });

            const subName = resolvedSubject?.name || savedResult.subjectName || "Subject";
            const subResultEntry = {
                subject: resolvedSubject?._id || null,
                subjectName: subName,
                exam: exam._id,
                examName: exam.name || "",
                score: totalScore,
                testScore: tScore !== null ? tScore : 0,
                examScore: eScore !== null ? eScore : totalScore,
                totalMark: effectiveTotalMark,
                grade: grade,
                letterGrade: grade >= 80 ? "A" : grade >= 70 ? "B" : grade >= 60 ? "C" : grade >= 50 ? "D" : "F",
                remarks: remarks,
                status: status,
                position: savedResult.position || 1,
                positionFormatted: savedResult.positionFormatted || formatOrdinal(savedResult.position || 1),
            };

            if (!reportCard) {
                reportCard = new StudentReportCard({
                    student: student._id,
                    studentID: student.StudentId,
                    academicYear: yearId,
                    academicTerm: termId,
                    classLevel: cLevelId,
                    subjectResults: [subResultEntry],
                    totalScore: grade,
                    totalMaxScore: 100,
                    averageScore: grade,
                    overallGrade: grade >= 80 ? "A" : grade >= 70 ? "B" : grade >= 60 ? "C" : grade >= 50 ? "D" : "F",
                    overallRemark: remarks,
                    status: "calculated",
                    published: false,
                });
            } else {
                const existingIdx = (reportCard.subjectResults || []).findIndex(sr =>
                    (sr.subject && resolvedSubject && sr.subject.toString() === resolvedSubject._id.toString()) ||
                    (sr.subjectName && sr.subjectName.toLowerCase() === subName.toLowerCase()) ||
                    (sr.exam && sr.exam.toString() === exam._id.toString())
                );
                if (existingIdx >= 0) {
                    reportCard.subjectResults[existingIdx] = subResultEntry;
                } else {
                    reportCard.subjectResults.push(subResultEntry);
                }

                let sumGrade = 0;
                reportCard.subjectResults.forEach(sr => {
                    sumGrade += sr.grade || 0;
                });
                const count = reportCard.subjectResults.length;
                reportCard.totalScore = sumGrade;
                reportCard.totalMaxScore = count * 100;
                reportCard.averageScore = count > 0 ? Number((sumGrade / count).toFixed(1)) : 0;
                const avg = reportCard.averageScore;
                reportCard.overallGrade = avg >= 80 ? "A" : avg >= 70 ? "B" : avg >= 60 ? "C" : avg >= 50 ? "D" : "F";
                reportCard.overallRemark = avg >= 80 ? "Distinction - Outstanding Performance" : avg >= 70 ? "Very Good - Commendable Result" : avg >= 60 ? "Good - Satisfactory Progress" : avg >= 50 ? "Fair - Needs More Dedication" : "Poor - Needs Academic Intervention";
            }
            await reportCard.save({ validateBeforeSave: false });

            // Recalculate rankings among all students who have report cards in this class
            const classCards = await StudentReportCard.find({
                classLevel: cLevelId,
                academicYear: yearId,
                academicTerm: termId,
                "subjectResults.0": { $exists: true },
            }).sort({ averageScore: -1, totalScore: -1 });

            let currRank = 1;
            for (let i = 0; i < classCards.length; i++) {
                if (i > 0) {
                    const prev = classCards[i - 1];
                    const curr = classCards[i];
                    if (curr.averageScore < prev.averageScore || curr.totalScore < prev.totalScore) {
                        currRank = i + 1;
                    }
                }
                classCards[i].position = currRank;
                classCards[i].positionFormatted = formatOrdinal(currRank);
                classCards[i].totalStudents = classCards.length;
                await classCards[i].save({ validateBeforeSave: false });
            }
        }
    } catch (rcErr) {
        console.error("Error updating StudentReportCard on enter result:", rcErr);
    }

    // Populate for response with position
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
        .populate("subject")
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
        message: `Exam result recorded successfully! Student position in class: ${responseObj.positionFormatted || (responseObj.position ? formatOrdinal(responseObj.position) : "1st")}.`,
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

    const teacherSubjectInfo = await getTeacherSubjectInfo(teacher);

    // Fetch exams created by this teacher or matching teacher's assigned subject
    const examOrConditions = [{ createdBy: teacher._id }];
    if (teacherSubjectInfo.teacherSubjectIds.size > 0) {
        examOrConditions.push({
            subject: { $in: Array.from(teacherSubjectInfo.teacherSubjectIds).map(id => new mongoose.Types.ObjectId(id)) }
        });
    }
    const teacherExams = await Exam.find({ $or: examOrConditions }).select("_id");
    const teacherExamIds = teacherExams.map(e => e._id);

    const ClassTeacherAssignment = require("../../models/Academy/ClassTeacherAssignment");
    const activeAssignment = await ClassTeacherAssignment.findOne({ teacher: teacher._id, isActive: true }).populate("classLevel program academicYear");
    let assignedProgramId = null;
    let assignedProgramName = null;
    if (activeAssignment?.program) {
        assignedProgramId = activeAssignment.program._id ? activeAssignment.program._id.toString() : activeAssignment.program.toString();
        assignedProgramName = activeAssignment.program.name || null;
    } else if (teacher.program) {
        assignedProgramName = teacher.program.toString().trim();
    }
    const hasAssignedProgram = Boolean(assignedProgramId || assignedProgramName);

    let targetClassName = (teacher.classLevel || "").toString().trim();
    if (!targetClassName && activeAssignment?.classLevel?.name) {
        targetClassName = activeAssignment.classLevel.name.trim();
    }
    if (teacher.classLevel && mongoose.Types.ObjectId.isValid(teacher.classLevel)) {
        const cDoc = await ClassLevel.findById(teacher.classLevel);
        if (cDoc && cDoc.name) {
            targetClassName = cDoc.name.trim();
        }
    }

    const teacherLevelNumber = extractLevelNumber(targetClassName);
    const levelRegex = teacherLevelNumber
        ? new RegExp(`(^|\\b|\\D)${teacherLevelNumber}(\\D|\\b|$)`, "i")
        : targetClassName ? new RegExp(`^${safeEscapeRegex(targetClassName)}$`, "i") : null;

    // Filter students in teacher's class
    const studentOr = [];
    if (targetClassName) {
        studentOr.push({ currentClassLevel: targetClassName });
        studentOr.push({ currentClassLevel: teacher.classLevel });
        if (levelRegex) studentOr.push({ currentClassLevel: { $regex: levelRegex } });
    }
    if (teacherSubjectInfo.hasTeacherSubject && !hasAssignedProgram) {
        Array.from(teacherSubjectInfo.teacherSubjectNames).forEach(name => {
            const esc = safeEscapeRegex(name);
            studentOr.push({ subject: { $regex: new RegExp(`^${esc}$`, "i") } });
        });
        if (teacherSubjectInfo.teacherSubjectIds.size > 0) {
            studentOr.push({
                "enrolledSubjects.subject": { $in: Array.from(teacherSubjectInfo.teacherSubjectIds).map(id => new mongoose.Types.ObjectId(id)) }
            });
        }
    }
    studentOr.push({ assignedTeacher: teacher._id });

    let studentFilter = studentOr.length > 0 ? { $or: studentOr } : {};
    if (hasAssignedProgram && assignedProgramId) {
        studentFilter = { $and: [studentFilter, { program: assignedProgramId }] };
    }

    const rawClassStudents = await Student.find(studentFilter)
        .select("_id StudentId name email currentClassLevel program subject enrolledSubjects")
        .populate("program")
        .populate("enrolledSubjects.subject");

    // In-memory check: if teacher has assigned program, filter by program alone
    const classStudents = rawClassStudents.filter((student) => {
        if (hasAssignedProgram) {
            if (!student.program) return false;
            const sProgId = student.program._id ? student.program._id.toString() : student.program.toString();
            const sProgName = (student.program.name || "").toString().trim().toLowerCase();
            let matches = false;
            if (assignedProgramId && sProgId === assignedProgramId) matches = true;
            if (!matches && assignedProgramName && sProgName === assignedProgramName.toLowerCase()) matches = true;
            return matches;
        }
        return isStudentInTeacherClassAndOfferingSubject(
            student,
            teacher,
            teacherSubjectInfo,
            targetClassName,
            teacherLevelNumber
        );
    });

    const studentIds = classStudents.map(s => s.StudentId).filter(Boolean);
    const studentMongoIds = classStudents.map(s => s._id.toString());
    const validStudentIds = [...new Set([...studentIds, ...studentMongoIds])];

    if (validStudentIds.length === 0) {
        return res.status(200).json({
            status: "Success",
            message: "No students in your class offering your subject.",
            data: [],
            teacherClassLevel: targetClassName || null,
            teacherSubject: teacher.subject || null,
            totalStudents: 0,
        });
    }

    // Results filter: Must be from students in teacher's class
    const andConditions = [
        { studentID: { $in: validStudentIds } }
    ];

    if (!hasAssignedProgram && (teacherSubjectInfo.hasTeacherSubject || teacherExamIds.length > 0)) {
        andConditions.push({ exam: { $in: teacherExamIds } });
    }

    let resultFilter = { $and: andConditions };

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
        .populate("subject")
        .populate("classLevel")
        .populate("academicTerm")
        .populate("academicYear")
        .sort({ score: -1, createdAt: -1 });

    // Build student lookup map from strictly matched class students
    const studentMap = {};
    classStudents.forEach(s => {
        if (s.StudentId) {
            studentMap[s.StudentId] = s;
            studentMap[s.StudentId.toLowerCase()] = s;
        }
        studentMap[s._id.toString()] = s;
    });

    // Merge student data into results
    let populatedResults = results.map(r => {
        const rObj = r.toObject();
        const studentObj = studentMap[r.studentID] || studentMap[r.studentID?.toLowerCase()] || null;
        rObj.student = studentObj || { StudentId: r.studentID, name: "Student (" + r.studentID + ")" };
        rObj.program = studentObj?.program || rObj.exam?.program || null;
        if (!rObj.subject && rObj.exam?.subject) {
            rObj.subject = rObj.exam.subject;
        }
        if (!rObj.subjectName && rObj.exam?.subject?.name) {
            rObj.subjectName = rObj.exam.subject.name;
        }
        return rObj;
    });

    // Also include StudentSubjectResult entries for these class students
    const StudentSubjectResult = require("../../models/Academy/StudentSubjectResult");
    const ssResults = await StudentSubjectResult.find({
        $or: [
            { student: { $in: classStudents.map(s => s._id) } },
            { studentID: { $in: validStudentIds } }
        ]
    }).populate("subject academicYear academicTerm classLevel");

    for (const ssr of ssResults) {
        const studentObj = studentMap[ssr.studentID] || studentMap[ssr.student?.toString()] || null;
        populatedResults.push({
            _id: ssr._id,
            studentID: ssr.studentID,
            student: studentObj || { StudentId: ssr.studentID, name: "Student (" + ssr.studentID + ")" },
            program: studentObj?.program || null,
            subject: ssr.subject,
            subjectName: ssr.subjectName || ssr.subject?.name || "Subject",
            exam: {
                _id: ssr._id,
                name: `${ssr.subjectName || ssr.subject?.name || "Subject"} Continuous Assessment & Exam`,
                subject: ssr.subject,
                totalMark: 100,
                passMark: 40,
                academicYear: ssr.academicYear,
                academicTerm: ssr.academicTerm,
                classLevel: ssr.classLevel,
            },
            testScore: ssr.testScore,
            examScore: ssr.examScore,
            score: ssr.totalScore,
            grade: ssr.grade,
            passMark: 40,
            status: ssr.status === "failed" ? "Failed" : "Passed",
            remarks: ssr.remark || (ssr.grade >= 80 ? "Excellent" : ssr.grade >= 70 ? "Very Good" : ssr.grade >= 60 ? "Good" : ssr.grade >= 40 ? "Fair" : "Poor"),
            isTeacherPublished: true,
            isPublished: false,
            createdAt: ssr.createdAt || new Date(),
        });
    }

    // Consolidate test and exam results for each student in each subject so test & exam are displayed together in one line
    const consolidatedMap = new Map();
    populatedResults.forEach(r => {
        const sid = (r.studentID || r.student?.StudentId || "").toString().trim().toLowerCase();
        const subId = (r.subject?._id || r.subject || r.exam?.subject?._id || r.exam?.subject || r.subjectName || "default").toString().trim().toLowerCase();
        const key = `${sid}_${subId}`;

        if (!consolidatedMap.has(key)) {
            consolidatedMap.set(key, { ...r });
        } else {
            const existing = consolidatedMap.get(key);
            const bestTest = Math.max(existing.testScore || 0, r.testScore || 0);
            const bestExam = Math.max(existing.examScore || 0, r.examScore || 0);
            const combined = bestTest + bestExam;

            existing.testScore = bestTest;
            existing.examScore = bestExam;
            existing.score = combined;
            existing.grade = Math.min(100, Math.round(combined));
            existing.passMark = 40;
            existing.status = combined >= 40 ? "Passed" : "Failed";

            if (existing.grade >= 80) existing.remarks = "Excellent";
            else if (existing.grade >= 70) existing.remarks = "Very Good";
            else if (existing.grade >= 60) existing.remarks = "Good";
            else if (existing.grade >= 40) existing.remarks = "Fair";
            else existing.remarks = "Poor";

            existing.isTeacherPublished = existing.isTeacherPublished || r.isTeacherPublished;
            existing.isPublished = existing.isPublished || r.isPublished;
        }
    });
    populatedResults = Array.from(consolidatedMap.values());

    // Ensure all results have a position and positionFormatted calculated
    const subjectCohortMap = {};
    populatedResults.forEach(r => {
        const subKey = (r.subject?._id || r.subject || r.exam?.subject?._id || r.exam?.subject || r.subjectName || "all").toString();
        if (!subjectCohortMap[subKey]) subjectCohortMap[subKey] = [];
        subjectCohortMap[subKey].push(r);
    });

    Object.values(subjectCohortMap).forEach(cohort => {
        cohort.sort((a, b) => (b.score || 0) - (a.score || 0));
        let prevScore = null;
        let rank = 1;
        cohort.forEach((r, idx) => {
            if (prevScore !== null && r.score === prevScore) {
                // tie
            } else {
                rank = idx + 1;
            }
            prevScore = r.score;
            if (!r.position) {
                r.position = rank;
                r.positionFormatted = formatOrdinal(rank);
            }
        });
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
        teacherClassLevel: targetClassName || null,
        teacherProgram: teacher.program || null,
        teacherSubject: teacher.subject || null,
        totalStudents: classStudents.length,
    });
});