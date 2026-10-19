const mongoose = require("mongoose");
const AsyncHandler = require("express-async-handler");
const StudentReportCard = require("../../models/Academy/StudentReportCard");
const StudentSubjectResult = require("../../models/Academy/StudentSubjectResult");
const ExamResult = require("../../models/Academy/ExamResults");
const Exam = require("../../models/Academy/Exam");
const Student = require("../../models/Academy/Student");
const ClassLevel = require("../../models/Academy/ClassLevel");
const AcademicYear = require("../../models/Academy/AcademicYear");
const AcademicTerm = require("../../models/Academy/AcademicTerm");
const Subject = require("../../models/Academy/Subject");
const Teacher = require("../../models/Staff/Teacher");
const Admin = require("../../models/Staff/admin");
const ClassTeacherAssignment = require("../../models/Academy/ClassTeacherAssignment");
const Program = require("../../models/Academy/program");

// Helper: Resolve target program for class teacher or explicit request
const resolveTargetProgram = async (userAuth, classLevelId, academicYearId, explicitProgramId) => {
    // 1. Explicit program provided in query or body
    if (explicitProgramId && explicitProgramId !== "all") {
        if (mongoose.Types.ObjectId.isValid(explicitProgramId)) {
            const prog = await Program.findById(explicitProgramId);
            if (prog) return { id: prog._id.toString(), doc: prog };
        }
        const progByName = await Program.findOne({
            $or: [
                { name: { $regex: new RegExp(`^${explicitProgramId.toString().trim()}$`, "i") } },
                { code: { $regex: new RegExp(`^${explicitProgramId.toString().trim()}$`, "i") } },
            ],
        });
        if (progByName) return { id: progByName._id.toString(), doc: progByName };
    }

    // 2. If requesting user is a Teacher, automatically retrieve their active Class Teacher Assignment
    if (userAuth?.role === "teacher" && userAuth?._id) {
        let query = {
            teacher: userAuth._id,
            isActive: true,
        };
        if (classLevelId) {
            query.$or = [
                ...(mongoose.Types.ObjectId.isValid(classLevelId) ? [{ classLevel: classLevelId }] : []),
                { classLevel: classLevelId },
            ];
        }
        if (academicYearId && mongoose.Types.ObjectId.isValid(academicYearId)) {
            query.academicYear = academicYearId;
        }

        let assignment = await ClassTeacherAssignment.findOne(query).populate("program");
        
        // If not found with specific academicYear, fallback to any active assignment for this class
        if (!assignment && classLevelId) {
            assignment = await ClassTeacherAssignment.findOne({
                teacher: userAuth._id,
                isActive: true,
                $or: [
                    ...(mongoose.Types.ObjectId.isValid(classLevelId) ? [{ classLevel: classLevelId }] : []),
                    { classLevel: classLevelId },
                ],
            }).populate("program");
        }

        // If still not found, fallback to teacher's primary active assignment
        if (!assignment) {
            assignment = await ClassTeacherAssignment.findOne({
                teacher: userAuth._id,
                isActive: true,
            }).populate("program");
        }

        if (assignment && assignment.program) {
            const progDoc = assignment.program;
            return { id: (progDoc._id || progDoc).toString(), doc: progDoc };
        }

        // Fallback: check teacher profile program
        const teacherDoc = await Teacher.findById(userAuth._id);
        if (teacherDoc?.program) {
            const rawP = teacherDoc.program.toString().trim();
            if (mongoose.Types.ObjectId.isValid(rawP)) {
                const prog = await Program.findById(rawP);
                if (prog) return { id: prog._id.toString(), doc: prog };
            }
            const prog = await Program.findOne({
                name: { $regex: new RegExp(`^${rawP.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i") },
            });
            if (prog) return { id: prog._id.toString(), doc: prog };
        }
    }

    return null;
};

// Helper: Filter an array of populated student documents by target program
const filterStudentsByProgram = (studentsList, targetProgramId) => {
    if (!targetProgramId) return studentsList;
    const targetIdStr = targetProgramId.toString();
    return studentsList.filter((stu) => {
        if (!stu.program) return false;
        const stuProgId = stu.program._id ? stu.program._id.toString() : stu.program.toString();
        const stuProgName = (stu.program.name || "").trim().toLowerCase();
        return stuProgId === targetIdStr || stuProgName === targetIdStr.toLowerCase();
    });
};

// Helper: Verify if teacher is authorized to record results for given subject & class
const verifyTeacherAuthorization = async (teacherId, classLevelDoc, subjectDoc) => {
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
        return { authorized: false, reason: "Teacher profile not found." };
    }

    // Check if teacher is assigned Class Teacher for this class
    const isClassTeacher = await ClassTeacherAssignment.exists({
        teacher: teacherId,
        isActive: true,
        $or: [
            ...(classLevelDoc._id ? [{ classLevel: classLevelDoc._id }] : []),
            ...(classLevelDoc.name ? [{ classLevel: classLevelDoc.name }] : []),
        ],
    });
    if (isClassTeacher) {
        return { authorized: true };
    }

    // Check subject authorization if teacher has assigned subject(s)
    const hasAssignedSubjects = (Array.isArray(teacher.subjects) && teacher.subjects.length > 0) || !!teacher.subject;
    if (hasAssignedSubjects) {
        const targetSubjectName = (subjectDoc.name || "").trim().toLowerCase();
        const targetSubjectIdStr = subjectDoc._id ? subjectDoc._id.toString() : "";
        const isSubjectTeacher = subjectDoc.teacher && subjectDoc.teacher.toString() === teacherId.toString();

        let subjectMatches = isSubjectTeacher;

        if (!subjectMatches && teacher.subject) {
            const teacherSubjectStr = teacher.subject.toString().trim().toLowerCase();
            subjectMatches =
                teacherSubjectStr === targetSubjectName ||
                teacherSubjectStr === targetSubjectIdStr;
        }

        if (!subjectMatches && Array.isArray(teacher.subjects) && teacher.subjects.length > 0) {
            subjectMatches = teacher.subjects.some((sub) => {
                if (!sub) return false;
                const subId = (sub._id || sub).toString();
                const subName = (sub.name || "").trim().toLowerCase();
                return subId === targetSubjectIdStr || (subName && subName === targetSubjectName);
            });
        }

        if (!subjectMatches) {
            return {
                authorized: false,
                reason: `You are not authorized to enter results for "${subjectDoc.name}".`,
            };
        }
    }

    return { authorized: true };
};


// Helper: Format ordinal position (1 -> 1st, 2 -> 2nd, 3 -> 3rd, 4 -> 4th, etc.)
const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Helper: Letter grade
const getLetterGrade = (percentage) => {
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B";
    if (percentage >= 60) return "C";
    if (percentage >= 50) return "D";
    return "F";
};

// Helper: Subject remark
const getSubjectRemark = (percentage) => {
    if (percentage >= 80) return "Excellent";
    if (percentage >= 70) return "Very Good";
    if (percentage >= 60) return "Good";
    if (percentage >= 40) return "Fair";
    return "Poor";
};

// Helper: Overall grade & remark
const getOverallEvaluation = (average) => {
    if (average >= 80) return { grade: "A", remark: "Distinction - Outstanding Performance" };
    if (average >= 70) return { grade: "B", remark: "Very Good - Commendable Result" };
    if (average >= 60) return { grade: "C", remark: "Good - Satisfactory Progress" };
    if (average >= 50) return { grade: "D", remark: "Fair - Needs More Dedication" };
    return { grade: "F", remark: "Poor - Needs Academic Intervention" };
};

// Helper: Default automated teacher comment
const getDefaultTeacherComment = (average) => {
    if (average >= 85) return "An exceptional student with brilliant academic performance. Keep it up!";
    if (average >= 75) return "Very good result. Shows strong dedication and enthusiasm in class.";
    if (average >= 60) return "Good performance. Can achieve even greater results with more focus.";
    if (average >= 50) return "Satisfactory effort, but more commitment is needed to improve grades.";
    return "Struggling in core areas. Requires close attention and consistent study habits.";
};

// Helper: Default automated principal comment
const getDefaultPrincipalComment = (average) => {
    if (average >= 85) return "Commendable academic excellence. A role model for the school community.";
    if (average >= 75) return "Very good term results. Maintain this high academic standard.";
    if (average >= 60) return "Pleasing progress. Strive for higher academic honors next term.";
    if (average >= 50) return "Fair result. Must double effort in the upcoming academic term.";
    return "Academic counseling recommended to assist this student in progressing.";
};

// Helper: Ensure all recorded subject results from StudentSubjectResult are in StudentReportCard
const syncMissingReportCardSubjects = async (reportCard, studentId) => {
    if (!reportCard) return;
    try {
        const studentSubjectResults = await StudentSubjectResult.find({
            $or: [
                { student: studentId },
                { studentID: reportCard.studentID || reportCard.student?.StudentId },
            ].filter(Boolean),
            academicYear: reportCard.academicYear?._id || reportCard.academicYear,
            academicTerm: reportCard.academicTerm?._id || reportCard.academicTerm,
        }).populate("subject");

        if (studentSubjectResults.length > 0) {
            const existingSubjectNames = new Set(
                (reportCard.subjectResults || []).map((sr) =>
                    (sr.subjectName || sr.subject?.name || "").toLowerCase().trim()
                )
            );
            const existingSubjectIds = new Set(
                (reportCard.subjectResults || []).map((sr) =>
                    (sr.subject?._id || sr.subject || "").toString()
                )
            );

            let hasMissing = false;
            for (const sr of studentSubjectResults) {
                const subId = (sr.subject?._id || sr.subject || "").toString();
                const subName = (sr.subjectName || sr.subject?.name || "").toLowerCase().trim();
                if (!existingSubjectIds.has(subId) && !existingSubjectNames.has(subName)) {
                    hasMissing = true;
                    break;
                }
            }

            if (hasMissing) {
                reportCard.subjectResults = studentSubjectResults.map((sr) => {
                    const totalScore = sr.totalScore !== undefined ? sr.totalScore : (sr.testScore || 0) + (sr.examScore || 0);
                    const grade = sr.grade !== undefined ? sr.grade : totalScore;
                    return {
                        subject: sr.subject?._id || sr.subject,
                        subjectName: sr.subjectName || sr.subject?.name || "Subject",
                        exam: null,
                        examName: "Continuous Assessment & Exam",
                        testScore: sr.testScore || 0,
                        examScore: sr.examScore || 0,
                        score: totalScore,
                        totalMark: 100,
                        grade,
                        letterGrade: getLetterGrade(grade),
                        remarks: sr.remark || (grade >= 40 ? "Credit" : "Fail"),
                        status: grade >= 40 ? "Passed" : "Failed",
                    };
                });

                let grandTotal = 0;
                reportCard.subjectResults.forEach((sr) => {
                    grandTotal += Number(sr.score || 0);
                });
                const count = reportCard.subjectResults.length;
                reportCard.totalScore = grandTotal;
                reportCard.totalMaxScore = count * 100;
                reportCard.averageScore = count > 0 ? Number((grandTotal / count).toFixed(1)) : 0;
                reportCard.overallGrade = getLetterGrade(reportCard.averageScore);
                reportCard.overallRemark = getSubjectRemark(reportCard.averageScore);
                await reportCard.save();
            }
        }
    } catch (err) {
        console.error("Auto sync report card subjects error:", err.message);
    }
};

//@desc Get class subject result sheet for entering marks (Shared Class Result Sheet)
//@route GET /api/v1/report-cards/class/:classLevelId/subject-sheet
//@access Private (Teacher or Admin)
exports.getClassSubjectSheetCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId } = req.params;
    const { academicYearId, academicTermId, subjectId } = req.query;

    if (!academicYearId || !academicTermId || !subjectId) {
        return res.status(400).json({
            status: "failed",
            message: "academicYearId, academicTermId, and subjectId are required query parameters.",
        });
    }

    const [classLevelDoc, academicYearDoc, academicTermDoc, subjectDoc] = await Promise.all([
        ClassLevel.findById(classLevelId),
        AcademicYear.findById(academicYearId),
        AcademicTerm.findById(academicTermId),
        Subject.findById(subjectId),
    ]);

    if (!classLevelDoc) return res.status(404).json({ status: "failed", message: "Class Level not found." });
    if (!academicYearDoc) return res.status(404).json({ status: "failed", message: "Academic Year not found." });
    if (!academicTermDoc) return res.status(404).json({ status: "failed", message: "Academic Term not found." });
    if (!subjectDoc) return res.status(404).json({ status: "failed", message: "Subject not found." });

    // Teacher authorization check (Section 10 & 31)
    if (req.userAuth?.role === "teacher") {
        const authCheck = await verifyTeacherAuthorization(req.userAuth._id, classLevelDoc, subjectDoc);
        if (!authCheck.authorized) {
            return res.status(403).json({ status: "failed", message: authCheck.reason });
        }
    }

    // Discover students in this class
    const extractDigits = (str) => (str ? (str.match(/\d+/) || [null])[0] : null);
    const classNum = extractDigits(classLevelDoc.name);
    const regexPattern = classNum
        ? new RegExp(`(^|\\b|\\D)${classNum}(\\D|\\b|$)`, "i")
        : new RegExp(`^${classLevelDoc.name.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i");

    const explicitProgram = req.query.programId || req.query.program;
    const targetProgram = await resolveTargetProgram(req.userAuth, classLevelId, academicYearId, explicitProgram);

    const studentFilter = {
        $or: [
            { _id: { $in: classLevelDoc.students || [] } },
            { currentClassLevel: classLevelDoc.name },
            { currentClassLevel: classLevelDoc._id.toString() },
            { currentClassLevel: { $regex: regexPattern } },
            { classLevels: classLevelDoc.name },
        ],
    };

    if (targetProgram) {
        studentFilter.program = targetProgram.id;
    }

    let students = await Student.find(studentFilter)
        .select("_id StudentId name email currentClassLevel program subject enrolledSubjects")
        .populate("program")
        .populate("enrolledSubjects.subject")
        .sort({ name: 1 });

    if (students.length === 0 && req.userAuth?._id) {
        const fallbackFilter = { assignedTeacher: req.userAuth._id };
        if (targetProgram) fallbackFilter.program = targetProgram.id;
        students = await Student.find(fallbackFilter)
            .select("_id StudentId name email currentClassLevel program subject enrolledSubjects")
            .populate("program")
            .populate("enrolledSubjects.subject")
            .sort({ name: 1 });
    }

    // Filter students by class level and program
    if (targetProgram) {
        students = filterStudentsByProgram(students, targetProgram.id);
    }

    const targetSubName = (subjectDoc.name || "").toString().trim().toLowerCase();
    const targetSubId = subjectDoc._id.toString();

    const classStudents = students.filter((stu) => {
        const stuLevel = (stu.currentClassLevel || "").trim();
        const stuNum = extractDigits(stuLevel);
        if (classNum && stuNum) {
            return stuNum === classNum;
        }
        return stuLevel.toLowerCase() === classLevelDoc.name.trim().toLowerCase();
    });

    // Fetch existing StudentSubjectResult for this subject + class + year + term
    const existingResults = await StudentSubjectResult.find({
        academicYear: academicYearId,
        academicTerm: academicTermId,
        classLevel: classLevelId,
        subject: subjectId,
    });

    const resultMap = new Map();
    existingResults.forEach((r) => {
        resultMap.set(r.student.toString(), r);
    });

    const checkStudentOffersSubject = (stu) => {
        if (!stu) return false;

        // If a result has already been recorded for this student in this subject
        if (resultMap.has(stu._id.toString())) {
            return true;
        }

        // Direct subject field
        if (stu.subject) {
            const sSubName = (stu.subject.name || stu.subject).toString().trim().toLowerCase();
            const sSubId = (stu.subject._id || stu.subject).toString();
            if (sSubId === targetSubId || sSubName === targetSubName) {
                return true;
            }
        }

        // Enrolled subjects array
        if (Array.isArray(stu.enrolledSubjects) && stu.enrolledSubjects.length > 0) {
            for (const es of stu.enrolledSubjects) {
                if (!es || !es.subject) continue;
                const subObj = es.subject;
                const subId = (subObj._id || subObj).toString();
                const subName = (subObj.name || "").toString().trim().toLowerCase();
                if (subId === targetSubId || subName === targetSubName) {
                    return true;
                }
            }
        }

        // In secondary school, all students in the class level offer class subjects by default
        return true;
    };

    // Check if class term report is locked (submitted, approved, or published)
    const existingCards = await StudentReportCard.find({
        academicYear: academicYearId,
        academicTerm: academicTermId,
        classLevel: classLevelId,
    });

    let isLocked = false;
    let reportStatus = "draft";
    if (existingCards.length > 0) {
        reportStatus = existingCards[0].status;
        if (["approved", "published"].includes(reportStatus) && req.userAuth?.role !== "admin") {
            isLocked = true;
        }
    }

    // ONLY return students in this class who registered for / offer this course
    const offeringStudents = classStudents.filter(checkStudentOffersSubject);

    const rows = offeringStudents.map((stu) => {
        const found = resultMap.get(stu._id.toString());
        return {
            student: {
                _id: stu._id,
                StudentId: stu.StudentId,
                name: stu.name,
                email: stu.email,
                currentClassLevel: stu.currentClassLevel,
                program: stu.program,
            },
            isRegistered: true,
            resultId: found?._id || null,
            testScore: found && found.testScore !== undefined && found.testScore !== null ? found.testScore : null,
            examScore: found && found.examScore !== undefined && found.examScore !== null ? found.examScore : null,
            totalScore: found && found.totalScore !== undefined && found.totalScore !== null ? found.totalScore : null,
            grade: found && found.grade !== undefined && found.grade !== null ? found.grade : null,
            remark: found ? (found.remark || "") : "",
            status: found ? (found.status || "draft") : "draft",
            recordedAt: found?.recordedAt || null,
        };
    });

    res.status(200).json({
        status: "Success",
        data: {
            classLevel: classLevelDoc,
            academicYear: academicYearDoc,
            academicTerm: academicTermDoc,
            subject: subjectDoc,
            isLocked,
            reportStatus,
            totalStudents: offeringStudents.length,
            recordedCount: offeringStudents.filter((s) => resultMap.has(s._id.toString())).length,
            isCompleted: offeringStudents.length > 0 && offeringStudents.every((s) => resultMap.has(s._id.toString())),
            students: rows,
            program: targetProgram?.doc || null,
        },
    });
});

//@desc Get subject progress for a class term (which subjects are completed vs incomplete)
//@route GET /api/v1/report-cards/class/:classLevelId/subjects-progress
//@access Private (Teacher or Admin)
exports.getClassSubjectsProgressCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId } = req.params;
    const { academicYearId, academicTermId } = req.query;

    if (!academicYearId || !academicTermId) {
        return res.status(400).json({
            status: "failed",
            message: "academicYearId and academicTermId are required query parameters.",
        });
    }

    const [classLevelDoc, academicYearDoc, academicTermDoc] = await Promise.all([
        ClassLevel.findById(classLevelId).populate("subjects"),
        AcademicYear.findById(academicYearId),
        AcademicTerm.findById(academicTermId),
    ]);

    if (!classLevelDoc) return res.status(404).json({ status: "failed", message: "Class Level not found." });
    if (!academicYearDoc) return res.status(404).json({ status: "failed", message: "Academic Year not found." });
    if (!academicTermDoc) return res.status(404).json({ status: "failed", message: "Academic Term not found." });

    // Resolve target program for class teacher or explicit request
    const explicitProgram = req.query.programId || req.query.program;
    const targetProgram = await resolveTargetProgram(req.userAuth, classLevelId, academicYearId, explicitProgram);

    // Students count in this class
    const extractDigits = (str) => (str ? (str.match(/\d+/) || [null])[0] : null);
    const classNum = extractDigits(classLevelDoc.name);
    const regexPattern = classNum
        ? new RegExp(`(^|\\b|\\D)${classNum}(\\D|\\b|$)`, "i")
        : new RegExp(`^${classLevelDoc.name.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i");

    const studentFilter = {
        $or: [
            { _id: { $in: classLevelDoc.students || [] } },
            { currentClassLevel: classLevelDoc.name },
            { currentClassLevel: classLevelDoc._id.toString() },
            { currentClassLevel: { $regex: regexPattern } },
            { classLevels: classLevelDoc.name },
        ],
    };

    if (targetProgram) {
        studentFilter.program = targetProgram.id;
    }

    let totalStudents = await Student.countDocuments(studentFilter);
    if (totalStudents === 0 && req.userAuth?._id) {
        const fallbackFilter = { assignedTeacher: req.userAuth._id };
        if (targetProgram) fallbackFilter.program = targetProgram.id;
        totalStudents = await Student.countDocuments(fallbackFilter);
    }

    // Resolve subjects for this class
    let subjects = [];
    if (classLevelDoc.subjects && classLevelDoc.subjects.length > 0) {
        subjects = [...classLevelDoc.subjects];
    } else {
        subjects = await Subject.find({
            $or: [
                { classLevel: classLevelDoc.name },
                { classLevel: { $regex: regexPattern } },
                { classLevel: "Level 100" },
                { classLevel: { $exists: false } },
                { classLevel: null },
            ],
        });
        if (subjects.length === 0) {
            subjects = await Subject.find().limit(50);
        }
    }

    // If teacher is logged in, ALWAYS ensure all the teacher's assigned subjects are included
    if (req.userAuth?._id) {
        const teacherDoc = await Teacher.findById(req.userAuth._id);
        const teacherSubsToCheck = [];
        if (teacherDoc?.subject) {
            teacherSubsToCheck.push(teacherDoc.subject.toString().trim());
        }
        if (Array.isArray(teacherDoc?.subjects)) {
            teacherDoc.subjects.forEach((s) => {
                if (s) teacherSubsToCheck.push(s.toString().trim());
            });
        }

        for (const rawSub of teacherSubsToCheck) {
            if (!rawSub) continue;
            const exists = subjects.some(
                (s) => (s.name && s.name.toLowerCase() === rawSub.toLowerCase()) || s._id.toString() === rawSub
            );
            if (!exists) {
                const subDoc = await Subject.findOne({
                    $or: [
                        { name: { $regex: new RegExp(`^${rawSub.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i") } },
                        ...(mongoose.Types.ObjectId.isValid(rawSub) ? [{ _id: rawSub }] : []),
                    ],
                });
                if (subDoc) {
                    subjects.push(subDoc);
                }
            }
        }
    }

    // Deduplicate subjects by ID
    const uniqueMap = new Map();
    subjects.forEach((s) => {
        if (s && s._id) {
            uniqueMap.set(s._id.toString(), s);
        }
    });
    subjects = Array.from(uniqueMap.values());

    // For each subject, count recorded StudentSubjectResult and offering students
    const progressList = [];
    for (const sub of subjects) {
        const subId = sub._id;
        const subNameEscaped = (sub.name || "").replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

        // Count how many students in this class level actually offer this subject
        const offeringStudentsCount = await Student.countDocuments({
            ...studentFilter,
            $or: [
                { subject: { $regex: new RegExp(`^${subNameEscaped}$`, "i") } },
                { "enrolledSubjects.subject": subId },
            ],
        });

        const subjectTotal = offeringStudentsCount > 0 ? offeringStudentsCount : totalStudents;

        const recordedCount = await StudentSubjectResult.countDocuments({
            academicYear: academicYearId,
            academicTerm: academicTermId,
            classLevel: classLevelId,
            subject: subId,
        });

        const isCompleted = subjectTotal > 0 && recordedCount >= subjectTotal;
        const percentage = subjectTotal > 0 ? Math.min(100, Math.round((recordedCount / subjectTotal) * 100)) : 0;

        progressList.push({
            subjectId: sub._id,
            subjectName: sub.name,
            recordedCount,
            totalStudents: subjectTotal,
            isCompleted,
            percentage,
        });
    }

    const totalSubjects = progressList.length;
    const completedSubjects = progressList.filter((p) => p.isCompleted).length;
    const allCompleted = totalSubjects > 0 && completedSubjects === totalSubjects;

    // Check overall report status for this class & term & program
    const cardQuery = {
        academicYear: academicYearId,
        academicTerm: academicTermId,
        classLevel: classLevelId,
    };
    if (targetProgram) {
        cardQuery.program = targetProgram.id;
    }

    const existingCard = await StudentReportCard.findOne(cardQuery);

    res.status(200).json({
        status: "Success",
        data: {
            classLevel: classLevelDoc,
            academicYear: academicYearDoc,
            academicTerm: academicTermDoc,
            program: targetProgram?.doc || null,
            totalStudents,
            totalSubjects,
            completedSubjects,
            allCompleted,
            overallPercentage: totalSubjects > 0 ? Math.round((completedSubjects / totalSubjects) * 100) : 0,
            reportStatus: existingCard ? existingCard.status : "draft",
            isPublished: existingCard ? existingCard.published : false,
            subjects: progressList,
        },
    });
});

//@desc Save / update subject results for all students in a class (Batch Entry)
//@route POST /api/v1/report-cards/subject-results
//@access Private (Teacher or Admin)
exports.saveClassSubjectResultsCtrl = AsyncHandler(async (req, res) => {
    const { academicYearId, academicTermId, classLevelId, subjectId, results } = req.body;

    if (!academicYearId || !academicTermId || !classLevelId || !subjectId) {
        return res.status(400).json({
            status: "failed",
            message: "academicYearId, academicTermId, classLevelId, and subjectId are required.",
        });
    }

    if (!Array.isArray(results) || results.length === 0) {
        return res.status(400).json({
            status: "failed",
            message: "results must be a non-empty array of student scores.",
        });
    }

    const [classLevelDoc, academicYearDoc, academicTermDoc, subjectDoc] = await Promise.all([
        ClassLevel.findById(classLevelId),
        AcademicYear.findById(academicYearId),
        AcademicTerm.findById(academicTermId),
        Subject.findById(subjectId),
    ]);

    if (!classLevelDoc) return res.status(404).json({ status: "failed", message: "Class Level not found." });
    if (!academicYearDoc) return res.status(404).json({ status: "failed", message: "Academic Year not found." });
    if (!academicTermDoc) return res.status(404).json({ status: "failed", message: "Academic Term not found." });
    if (!subjectDoc) return res.status(404).json({ status: "failed", message: "Subject not found." });

    // Authorization check (Section 10 & 31)
    if (req.userAuth?.role === "teacher") {
        const authCheck = await verifyTeacherAuthorization(req.userAuth._id, classLevelDoc, subjectDoc);
        if (!authCheck.authorized) {
            return res.status(403).json({ status: "failed", message: authCheck.reason });
        }
    }

    // Check lock status: if report card is approved or published, teacher cannot modify unless admin reopens (Section 19)
    const existingCards = await StudentReportCard.find({
        academicYear: academicYearId,
        academicTerm: academicTermId,
        classLevel: classLevelId,
        status: { $in: ["approved", "published"] },
    });

    if (existingCards.length > 0 && req.userAuth?.role !== "admin") {
        return res.status(403).json({
            status: "failed",
            message: `Class results have already been ${existingCards[0].status} by administration and are locked for editing.`,
        });
    }

    // Process and validate each student's score
    const savedRecords = [];
    const validationErrors = [];

    for (const item of results) {
        const { studentId, testScore, examScore } = item;

        // Skip completely empty rows where neither test nor exam was entered
        if (
            (testScore === undefined || testScore === null || testScore === "") &&
            (examScore === undefined || examScore === null || examScore === "")
        ) {
            continue;
        }

        const numTest = Number(testScore);
        const numExam = Number(examScore);

        // Score validations (Section 4 & 5)
        if (isNaN(numTest) || numTest < 0 || numTest > 30) {
            validationErrors.push(`Student ${studentId}: Test score must be between 0 and 30 marks (received: ${testScore}).`);
            continue;
        }
        if (isNaN(numExam) || numExam < 0 || numExam > 70) {
            validationErrors.push(`Student ${studentId}: Exam score must be between 0 and 70 marks (received: ${examScore}).`);
            continue;
        }

        const totalScore = numTest + numExam;
        const grade = totalScore; // Keep existing grade field meaning (percentage)
        const remark = getSubjectRemark(grade);

        const studentDoc = await Student.findOne({
            $or: [
                { _id: mongoose.Types.ObjectId.isValid(studentId) ? studentId : null },
                { StudentId: studentId },
            ].filter((c) => c._id !== null || c.StudentId !== null),
        });

        if (!studentDoc) {
            validationErrors.push(`Student with ID "${studentId}" was not found.`);
            continue;
        }

        // Upsert into StudentSubjectResult (prevents duplicate subject entries for same student/term/class/year - Section 9 & 25)
        const updatedResult = await StudentSubjectResult.findOneAndUpdate(
            {
                student: studentDoc._id,
                academicYear: academicYearId,
                academicTerm: academicTermId,
                classLevel: classLevelId,
                subject: subjectId,
            },
            {
                $set: {
                    student: studentDoc._id,
                    studentID: studentDoc.StudentId,
                    academicYear: academicYearId,
                    academicTerm: academicTermId,
                    classLevel: classLevelId,
                    subject: subjectId,
                    subjectName: subjectDoc.name,
                    testScore: numTest,
                    examScore: numExam,
                    totalScore,
                    grade,
                    remark,
                    recordedBy: req.userAuth._id,
                    recordedAt: new Date(),
                    status: "saved",
                },
            },
            { upsert: true, new: true, runValidators: true }
        );

        savedRecords.push(updatedResult);

        // Also sync into existing StudentReportCard if present
        const reportCard = await StudentReportCard.findOne({
            student: studentDoc._id,
            academicYear: academicYearId,
            academicTerm: academicTermId,
            classLevel: classLevelId,
        });

        if (reportCard) {
            const letterGrade = getLetterGrade(grade);
            const status = grade >= 40 ? "Passed" : "Failed";

            const existingSubIndex = reportCard.subjectResults.findIndex(
                (sr) => sr.subject?.toString() === subjectId.toString() || sr.subjectName?.toLowerCase() === subjectDoc.name.toLowerCase()
            );

            const subjectEntry = {
                subject: subjectDoc._id,
                subjectName: subjectDoc.name,
                testScore: numTest,
                examScore: numExam,
                score: totalScore,
                totalMark: 100,
                grade,
                letterGrade,
                remarks: remark,
                status,
            };

            if (existingSubIndex >= 0) {
                reportCard.subjectResults[existingSubIndex] = {
                    ...reportCard.subjectResults[existingSubIndex].toObject(),
                    ...subjectEntry,
                };
            } else {
                reportCard.subjectResults.push(subjectEntry);
            }

            if (["draft", "calculated", "rejected"].includes(reportCard.status)) {
                reportCard.status = "saved";
            }
            await reportCard.save();
        }
    }

    if (validationErrors.length > 0 && savedRecords.length === 0) {
        return res.status(400).json({
            status: "failed",
            message: "Validation failed for all submitted results.",
            errors: validationErrors,
        });
    }

    res.status(200).json({
        status: "Success",
        message: `Successfully saved ${savedRecords.length} student results for "${subjectDoc.name}".`,
        savedCount: savedRecords.length,
        errors: validationErrors.length > 0 ? validationErrors : undefined,
        data: savedRecords,
    });
});

//@desc Update a single student's subject result
//@route PATCH /api/v1/report-cards/subject-results/:resultId
//@access Private (Teacher or Admin)
exports.updateSingleSubjectResultCtrl = AsyncHandler(async (req, res) => {
    const { resultId } = req.params;
    const { testScore, examScore } = req.body;

    const numTest = Number(testScore);
    const numExam = Number(examScore);

    if (isNaN(numTest) || numTest < 0 || numTest > 30) {
        return res.status(400).json({ status: "failed", message: "Test score must be between 0 and 30 marks." });
    }
    if (isNaN(numExam) || numExam < 0 || numExam > 70) {
        return res.status(400).json({ status: "failed", message: "Exam score must be between 0 and 70 marks." });
    }

    const existingResult = await StudentSubjectResult.findById(resultId)
        .populate("classLevel")
        .populate("subject");

    if (!existingResult) {
        return res.status(404).json({ status: "failed", message: "Subject result not found." });
    }

    // Authorization check
    if (req.userAuth?.role === "teacher") {
        const authCheck = await verifyTeacherAuthorization(req.userAuth._id, existingResult.classLevel, existingResult.subject);
        if (!authCheck.authorized) {
            return res.status(403).json({ status: "failed", message: authCheck.reason });
        }
    }

    const totalScore = numTest + numExam;
    const grade = totalScore;
    const remark = getSubjectRemark(grade);

    existingResult.testScore = numTest;
    existingResult.examScore = numExam;
    existingResult.totalScore = totalScore;
    existingResult.grade = grade;
    existingResult.remark = remark;
    existingResult.recordedBy = req.userAuth._id;
    existingResult.recordedAt = new Date();
    await existingResult.save();

    res.status(200).json({
        status: "Success",
        message: "Subject result updated successfully.",
        data: existingResult,
    });
});

//@desc Calculate / Generate class term report cards (Teacher or Admin)
//@route POST /api/v1/report-cards/calculate-class
//@access Private (Teacher or Admin)
exports.calculateClassReportCardsCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId, academicYearId, academicTermId } = req.body;

    if (!classLevelId || !academicYearId || !academicTermId) {
        return res.status(400).json({
            status: "failed",
            message: "Class Level, Academic Year, and Academic Term are all required to calculate results.",
        });
    }

    // 1. Verify existence of ClassLevel, AcademicYear, AcademicTerm
    const [classLevelDoc, academicYearDoc, academicTermDoc] = await Promise.all([
        ClassLevel.findById(classLevelId),
        AcademicYear.findById(academicYearId),
        AcademicTerm.findById(academicTermId),
    ]);

    if (!classLevelDoc) {
        return res.status(404).json({ status: "failed", message: "Class Level not found." });
    }
    if (!academicYearDoc) {
        return res.status(404).json({ status: "failed", message: "Academic Year not found." });
    }
    if (!academicTermDoc) {
        return res.status(404).json({ status: "failed", message: "Academic Term not found." });
    }

    // 2. Discover students belonging to this class level
    const extractDigits = (str) => (str ? (str.match(/\d+/) || [null])[0] : null);
    const classNum = extractDigits(classLevelDoc.name);
    const regexPattern = classNum
        ? new RegExp(`(^|\\b|\\D)${classNum}(\\D|\\b|$)`, "i")
        : new RegExp(`^${classLevelDoc.name.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i");

    const explicitProgram = req.body.programId || req.body.program || req.query.programId || req.query.program;
    const targetProgram = await resolveTargetProgram(req.userAuth, classLevelId, academicYearId, explicitProgram);

    const studentFilter = {
        $or: [
            { _id: { $in: classLevelDoc.students || [] } },
            { currentClassLevel: classLevelDoc.name },
            { currentClassLevel: classLevelDoc._id.toString() },
            { currentClassLevel: { $regex: regexPattern } },
            { classLevels: classLevelDoc.name },
        ],
    };

    if (targetProgram) {
        studentFilter.program = targetProgram.id;
    }

    let students = await Student.find(studentFilter)
        .select("_id StudentId name email currentClassLevel program")
        .populate("program");

    if (students.length === 0 && req.userAuth?._id) {
        const fallbackFilter = { assignedTeacher: req.userAuth._id };
        if (targetProgram) fallbackFilter.program = targetProgram.id;
        students = await Student.find(fallbackFilter)
            .select("_id StudentId name email currentClassLevel program")
            .populate("program");
    }

    // Filter strictly by target program
    if (targetProgram) {
        students = filterStudentsByProgram(students, targetProgram.id);
    }

    if (students.length === 0) {
        const programNote = targetProgram ? ` in program "${targetProgram.doc?.name || targetProgram.id}"` : "";
        return res.status(404).json({
            status: "failed",
            message: `No registered students found in class "${classLevelDoc.name}"${programNote}.`,
        });
    }

    // 3. For each student, collect their subject results (from StudentSubjectResult + ExamResult fallback)
    const studentCalculations = [];

    for (const student of students) {
        const studentIdentifiers = [
            { studentID: student.StudentId },
        ];
        if (student._id) {
            studentIdentifiers.push({ studentID: student._id.toString() });
        }

        // Check if an existing report card already exists (to preserve custom comments if any)
        const existingCard = await StudentReportCard.findOne({
            student: student._id,
            academicYear: academicYearId,
            academicTerm: academicTermId,
            classLevel: classLevelId,
        });

        // If officially published and user is teacher, don't silently overwrite without admin reopening
        const isAlreadyPublished = existingCard && existingCard.published;
        const isTeacherUser = req.userAuth?.role === "teacher";
        if (isAlreadyPublished && isTeacherUser) {
            studentCalculations.push({
                student,
                subjectResults: existingCard.subjectResults,
                totalScore: existingCard.totalScore,
                totalMaxScore: existingCard.totalMaxScore,
                averageScore: existingCard.averageScore,
                teacherComment: existingCard.teacherComment,
                principalComment: existingCard.principalComment,
                promoted: existingCard.promoted,
                promotionStatus: existingCard.promotionStatus,
                existingId: existingCard._id,
                alreadyPublished: true,
                status: existingCard.status,
            });
            continue;
        }

        const subjectMap = new Map();

        // 3a. Primary source: Shared class result sheet entries (StudentSubjectResult)
        const classSubjectResults = await StudentSubjectResult.find({
            student: student._id,
            academicYear: academicYearId,
            academicTerm: academicTermId,
            classLevel: classLevelId,
        }).populate("subject");

        for (const item of classSubjectResults) {
            const subjectId = item.subject?._id?.toString() || item.subject?.toString() || item.subjectName;
            subjectMap.set(subjectId, {
                subject: item.subject?._id || item.subject,
                subjectName: item.subjectName || item.subject?.name || "Subject",
                exam: null,
                examName: "Continuous Assessment & Exam",
                testScore: item.testScore,
                examScore: item.examScore,
                rawScoreSum: item.totalScore,
                totalMarkSum: 100,
                count: 1,
                originalGrade: item.grade,
                lastStatus: item.grade >= 40 ? "Passed" : "Failed",
                lastRemarks: item.remark,
            });
        }

        // 3b. Secondary source: Legacy ExamResult items not yet recorded via sheet (preserves backward compatibility)
        const examResults = await ExamResult.find({
            $or: studentIdentifiers,
            academicYear: academicYearId,
            academicTerm: academicTermId,
        }).populate({
            path: "exam",
            populate: [
                { path: "subject" },
                { path: "classLevel" },
            ],
        });

        for (const resItem of examResults) {
            const subjectId = resItem.exam?.subject?._id?.toString() || resItem.exam?.name || "General";
            const subjectName = resItem.exam?.subject?.name || resItem.exam?.name || "Subject";
            const examTotalMark = resItem.exam?.totalMark || 100;
            const rawScore = resItem.score !== undefined ? resItem.score : resItem.grade;
            const examType = (resItem.exam?.examType || "").toLowerCase();
            const isTest = ["test", "quiz", "continuous assessment", "ca"].includes(examType);

            if (subjectMap.has(subjectId)) {
                // If existing entry is from ExamResult, merge test and exam
                const existing = subjectMap.get(subjectId);
                if (existing.isFromExamResult) {
                    if (isTest && (existing.testScore === null || existing.testScore === 0)) {
                        existing.testScore = rawScore;
                    } else if (!isTest && (existing.examScore === null || existing.examScore === 0)) {
                        existing.examScore = rawScore;
                    }
                    existing.rawScoreSum = (existing.testScore || 0) + (existing.examScore || 0);
                    existing.totalMarkSum = 100;
                    existing.count = 2;
                }
                continue;
            }

            const parsedTest = isTest ? rawScore : (resItem.testScore || null);
            const parsedExam = !isTest ? rawScore : (resItem.examScore || null);
            const combinedRaw = (parsedTest !== null && parsedExam !== null) ? (parsedTest + parsedExam) : rawScore;

            subjectMap.set(subjectId, {
                subject: resItem.exam?.subject?._id || null,
                subjectName,
                exam: resItem.exam?._id || null,
                examName: resItem.exam?.name || "",
                testScore: parsedTest,
                examScore: parsedExam,
                rawScoreSum: combinedRaw,
                totalMarkSum: (parsedTest !== null && parsedExam !== null) ? 100 : (isTest ? 30 : examTotalMark),
                count: 1,
                originalGrade: resItem.grade,
                lastStatus: resItem.status,
                lastRemarks: resItem.remarks,
                isFromExamResult: true,
            });
        }

        const subjectResults = [];
        let totalScore = 0;
        let totalMaxScore = 0;

        for (const [, item] of subjectMap) {
            let finalGrade;
            let finalScore = item.rawScoreSum;
            let finalTotalMark = item.totalMarkSum;

            if (item.count === 1) {
                finalGrade = item.originalGrade !== undefined
                    ? item.originalGrade
                    : Math.round((finalScore / (finalTotalMark || 100)) * 100);
            } else {
                finalGrade = Math.round((finalScore / (finalTotalMark || 100)) * 100);
            }

            const letterGrade = getLetterGrade(finalGrade);
            const remarks = item.count === 1 && item.lastRemarks ? item.lastRemarks : getSubjectRemark(finalGrade);
            const status = finalGrade >= 40 ? "Passed" : "Failed";

            subjectResults.push({
                subject: item.subject,
                subjectName: item.subjectName,
                exam: item.exam,
                examName: item.examName,
                testScore: item.testScore !== undefined ? item.testScore : null,
                examScore: item.examScore !== undefined ? item.examScore : null,
                score: finalScore,
                totalMark: finalTotalMark,
                grade: finalGrade, // Normalized percentage preserved
                letterGrade,
                remarks,
                status,
            });

            totalScore += finalGrade;
            totalMaxScore += 100;
        }


        const numberOfSubjects = subjectResults.length;
        if (numberOfSubjects === 0) {
            // DO NOT create or calculate empty report cards for students without any recorded results
            continue;
        }
        const averageScore = Number((totalScore / numberOfSubjects).toFixed(1));
        const evaluation = getOverallEvaluation(averageScore);

        const teacherComment =
            existingCard?.teacherComment && existingCard.teacherComment.trim()
                ? existingCard.teacherComment
                : getDefaultTeacherComment(averageScore);

        const principalComment =
            existingCard?.principalComment && existingCard.principalComment.trim()
                ? existingCard.principalComment
                : getDefaultPrincipalComment(averageScore);

        const promoted = existingCard ? existingCard.promoted : averageScore >= 50;
        const promotionStatus = existingCard ? existingCard.promotionStatus : (averageScore >= 50 ? "Promoted" : "Repeat");

        studentCalculations.push({
            student,
            subjectResults,
            totalScore,
            totalMaxScore,
            averageScore,
            overallGrade: evaluation.grade,
            overallRemark: evaluation.remark,
            teacherComment,
            principalComment,
            promoted,
            promotionStatus,
            existingId: existingCard?._id || null,
            alreadyPublished: false,
            status: existingCard?.status && existingCard.status !== "draft" ? existingCard.status : "calculated",
        });
    }

    // 4. Competition Ranking (1224 ranking - Section 8)
    studentCalculations.sort((a, b) => {
        if (b.averageScore !== a.averageScore) {
            return b.averageScore - a.averageScore;
        }
        return b.totalScore - a.totalScore;
    });

    let currentRank = 1;
    for (let i = 0; i < studentCalculations.length; i++) {
        if (i > 0) {
            const prev = studentCalculations[i - 1];
            const curr = studentCalculations[i];
            if (curr.averageScore < prev.averageScore || curr.totalScore < prev.totalScore) {
                currentRank = i + 1; // standard competition ranking
            }
        }
        studentCalculations[i].position = currentRank;
        studentCalculations[i].positionFormatted = getOrdinal(currentRank);
        studentCalculations[i].totalStudents = studentCalculations.length;
    }

    // 5. Persist / Upsert Report Cards in Database
    const savedCards = [];
    for (const item of studentCalculations) {
        if (item.alreadyPublished) {
            const card = await StudentReportCard.findById(item.existingId)
                .populate("student", "name email StudentId currentClassLevel program")
                .populate("academicYear", "name")
                .populate("academicTerm", "name")
                .populate("classLevel", "name");
            savedCards.push(card);
            continue;
        }

        const progToSave = targetProgram?.id || item.student.program?._id || item.student.program || null;

        const updateData = {
            student: item.student._id,
            studentID: item.student.StudentId,
            academicYear: academicYearId,
            academicTerm: academicTermId,
            classLevel: classLevelId,
            program: progToSave,
            subjectResults: item.subjectResults,
            totalScore: item.totalScore,
            totalMaxScore: item.totalMaxScore,
            averageScore: item.averageScore,
            position: item.position,
            positionFormatted: item.positionFormatted,
            totalStudents: item.totalStudents,
            overallGrade: item.overallGrade,
            overallRemark: item.overallRemark,
            teacherComment: item.teacherComment,
            principalComment: item.principalComment,
            promoted: item.promoted,
            promotionStatus: item.promotionStatus,
            status: item.status || "calculated",
            published: false,
        };

        const cardLookup = {
            student: item.student._id,
            academicYear: academicYearId,
            academicTerm: academicTermId,
            classLevel: classLevelId,
        };

        const card = await StudentReportCard.findOneAndUpdate(
            cardLookup,
            { $set: updateData },
            { new: true, upsert: true, runValidators: true }
        )
            .populate("student", "name email StudentId currentClassLevel program")
            .populate("program", "name code")
            .populate("academicYear", "name")
            .populate("academicTerm", "name")
            .populate("classLevel", "name");

        savedCards.push(card);
    }

    res.status(200).json({
        status: "Success",
        message: `Calculated report cards for ${savedCards.length} students in ${classLevelDoc.name} successfully.`,
        data: savedCards,
        classLevel: classLevelDoc,
        program: targetProgram?.doc || null,
        academicYear: academicYearDoc,
        academicTerm: academicTermDoc,
        totalStudents: savedCards.length,
    });
});

//@desc Get dynamic class results overview (aggregates live subject results per student)
//@route GET /api/v1/report-cards/class/:classLevelId/overview
//@access Private (Teacher or Admin)
exports.getClassReportCardsOverviewCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId } = req.params;
    const { academicYearId, academicTermId } = req.query;

    if (!classLevelId || !academicYearId || !academicTermId) {
        return res.status(400).json({
            status: "failed",
            message: "Class Level, Academic Year, and Academic Term are required.",
        });
    }

    const [classLevelDoc, academicYearDoc, academicTermDoc] = await Promise.all([
        ClassLevel.findById(classLevelId).populate("subjects"),
        AcademicYear.findById(academicYearId),
        AcademicTerm.findById(academicTermId),
    ]);

    if (!classLevelDoc) return res.status(404).json({ status: "failed", message: "Class Level not found." });
    if (!academicYearDoc) return res.status(404).json({ status: "failed", message: "Academic Year not found." });
    if (!academicTermDoc) return res.status(404).json({ status: "failed", message: "Academic Term not found." });

    // 1. Discover all students belonging to this class
    const extractDigits = (str) => (str ? (str.match(/\d+/) || [null])[0] : null);
    const classNum = extractDigits(classLevelDoc.name);
    const regexPattern = classNum
        ? new RegExp(`(^|\\b|\\D)${classNum}(\\D|\\b|$)`, "i")
        : new RegExp(`^${classLevelDoc.name.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&")}$`, "i");

    const explicitProgram = req.query.programId || req.query.program;
    const targetProgram = await resolveTargetProgram(req.userAuth, classLevelId, academicYearId, explicitProgram);

    const studentFilter = {
        $or: [
            { _id: { $in: classLevelDoc.students || [] } },
            { currentClassLevel: classLevelDoc.name },
            { currentClassLevel: classLevelDoc._id.toString() },
            { currentClassLevel: { $regex: regexPattern } },
            { classLevels: classLevelDoc.name },
        ],
    };

    if (targetProgram) {
        studentFilter.program = targetProgram.id;
    }

    let students = await Student.find(studentFilter)
        .select("_id StudentId name email currentClassLevel program enrolledSubjects subject")
        .populate("program", "name subjects")
        .populate("enrolledSubjects.subject", "name classLevel")
        .sort({ name: 1 });

    if (students.length === 0 && req.userAuth?._id) {
        const fallbackFilter = { assignedTeacher: req.userAuth._id };
        if (targetProgram) fallbackFilter.program = targetProgram.id;
        students = await Student.find(fallbackFilter)
            .select("_id StudentId name email currentClassLevel program enrolledSubjects subject")
            .populate("program", "name subjects")
            .populate("enrolledSubjects.subject", "name classLevel")
            .sort({ name: 1 });
    }

    // Filter strictly by target program
    if (targetProgram) {
        students = filterStudentsByProgram(students, targetProgram.id);
    }

    // 2. Fetch all StudentSubjectResult for this class/year/term in ONE query
    const subjectResults = await StudentSubjectResult.find({
        academicYear: academicYearId,
        academicTerm: academicTermId,
        classLevel: classLevelId,
    }).populate("subject", "name").populate("recordedBy", "name email");

    const studentResultsMap = new Map();
    for (const sr of subjectResults) {
        const sKey = sr.student.toString();
        if (!studentResultsMap.has(sKey)) {
            studentResultsMap.set(sKey, []);
        }
        studentResultsMap.get(sKey).push(sr);
    }

    // 3. Fetch existing compiled StudentReportCard records
    const existingCards = await StudentReportCard.find({
        academicYear: academicYearId,
        academicTerm: academicTermId,
        classLevel: classLevelId,
    });
    const cardMap = new Map();
    for (const card of existingCards) {
        cardMap.set(card.student.toString(), card);
    }

    // 4. Default class subjects (curriculum) as fallback
    let defaultClassSubjects = [];
    if (classLevelDoc.subjects && classLevelDoc.subjects.length > 0) {
        defaultClassSubjects = classLevelDoc.subjects;
    } else {
        defaultClassSubjects = await Subject.find({
            $or: [
                { classLevel: classLevelDoc.name },
                { classLevel: { $regex: regexPattern } },
                { classLevel: "Level 100" },
                { classLevel: { $exists: false } },
                { classLevel: null },
            ],
        }).limit(30);
    }

    // 5. Build overview for each student
    const studentOverviews = [];
    let fullySubmittedCount = 0;
    let pendingCount = 0;

    for (const student of students) {
        const regSubjectsMap = new Map();

        // From enrolledSubjects
        if (Array.isArray(student.enrolledSubjects) && student.enrolledSubjects.length > 0) {
            student.enrolledSubjects.forEach((es) => {
                if (es.subject && es.subject._id) {
                    regSubjectsMap.set(es.subject._id.toString(), {
                        _id: es.subject._id,
                        name: es.subject.name,
                    });
                }
            });
        }

        // From student.subject string
        if (student.subject) {
            const foundSub = defaultClassSubjects.find(
                (ds) => ds.name?.toLowerCase() === student.subject.toLowerCase()
            );
            if (foundSub) {
                regSubjectsMap.set(foundSub._id.toString(), {
                    _id: foundSub._id,
                    name: foundSub.name,
                });
            }
        }

        // Fallback to default class subjects
        if (regSubjectsMap.size === 0) {
            defaultClassSubjects.forEach((sub) => {
                regSubjectsMap.set(sub._id.toString(), {
                    _id: sub._id,
                    name: sub.name,
                });
            });
        }

        // Also ensure any subject for which this student already has a recorded result in StudentSubjectResult is included in regSubjectsMap!
        const sResults = studentResultsMap.get(student._id.toString()) || [];
        sResults.forEach((r) => {
            const sId = (r.subject?._id || r.subject)?.toString();
            if (sId && !regSubjectsMap.has(sId)) {
                regSubjectsMap.set(sId, {
                    _id: r.subject?._id || r.subject,
                    name: r.subjectName || r.subject?.name || "Subject",
                });
            }
        });

        // Also check if existingCard has any additional subjectResults
        const existingCard = cardMap.get(student._id.toString()) || null;
        if (existingCard && Array.isArray(existingCard.subjectResults)) {
            existingCard.subjectResults.forEach((cr) => {
                const sId = cr.subject?.toString();
                if (sId && !regSubjectsMap.has(sId)) {
                    regSubjectsMap.set(sId, {
                        _id: cr.subject,
                        name: cr.subjectName || "Subject",
                    });
                }
            });
        }

        const registeredSubjects = Array.from(regSubjectsMap.values());

        const submittedSubjectDetails = [];
        const pendingSubjects = [];
        let totalScoreSum = 0;

        for (const sub of registeredSubjects) {
            const resultMatch = sResults.find(
                (r) => (r.subject?._id || r.subject)?.toString() === sub._id.toString() ||
                       (r.subjectName && r.subjectName.toLowerCase() === sub.name.toLowerCase())
            );

            if (resultMatch) {
                submittedSubjectDetails.push({
                    subjectId: sub._id,
                    subjectName: sub.name,
                    testScore: resultMatch.testScore,
                    examScore: resultMatch.examScore,
                    totalScore: resultMatch.totalScore,
                    grade: resultMatch.grade,
                    letterGrade: getLetterGrade(resultMatch.grade),
                    remark: resultMatch.remark,
                    recordedBy: resultMatch.recordedBy ? resultMatch.recordedBy.name : "Subject Teacher",
                    status: resultMatch.status || "submitted",
                });
                totalScoreSum += (resultMatch.totalScore || 0);
            } else {
                pendingSubjects.push(sub.name);
            }
        }

        const totalRegistered = registeredSubjects.length;
        const submittedCount = submittedSubjectDetails.length;
        const isFullySubmitted = totalRegistered > 0 && submittedCount === totalRegistered;

        // Calculate average ONLY when all registered subjects have valid submitted results
        const averageScore = isFullySubmitted && totalRegistered > 0
            ? Number((totalScoreSum / totalRegistered).toFixed(1))
            : null;

        const evaluation = averageScore !== null ? getOverallEvaluation(averageScore) : null;

        if (isFullySubmitted) {
            fullySubmittedCount++;
        } else {
            pendingCount++;
        }

        studentOverviews.push({
            student: {
                _id: student._id,
                name: student.name,
                StudentId: student.StudentId,
                email: student.email,
                currentClassLevel: student.currentClassLevel,
                program: student.program,
            },
            totalRegistered,
            submittedCount,
            pendingCount: pendingSubjects.length,
            pendingSubjects,
            isFullySubmitted,
            totalScore: totalScoreSum,
            averageScore,
            overallGrade: evaluation ? evaluation.grade : "—",
            overallRemark: evaluation ? evaluation.remark : (isFullySubmitted ? "Complete" : `${pendingSubjects.length} Pending`),
            submittedSubjects: submittedSubjectDetails,
            reportCard: existingCard ? {
                _id: existingCard._id,
                position: existingCard.position,
                positionFormatted: existingCard.positionFormatted,
                teacherComment: existingCard.teacherComment,
                principalComment: existingCard.principalComment,
                status: existingCard.status,
                published: existingCard.published,
                publishedAt: existingCard.publishedAt,
            } : null,
            status: existingCard?.status || (isFullySubmitted ? "ready" : "pending_subjects"),
        });
    }

    // Sort by averageScore descending (ties supported), then name
    studentOverviews.sort((a, b) => {
        if (a.averageScore !== null && b.averageScore !== null) {
            return b.averageScore - a.averageScore;
        }
        if (a.averageScore !== null) return -1;
        if (b.averageScore !== null) return 1;
        return a.student.name.localeCompare(b.student.name);
    });

    let rank = 1;
    for (let i = 0; i < studentOverviews.length; i++) {
        if (studentOverviews[i].averageScore !== null) {
            if (i > 0 && studentOverviews[i].averageScore === studentOverviews[i - 1].averageScore) {
                studentOverviews[i].displayRank = studentOverviews[i - 1].displayRank;
            } else {
                studentOverviews[i].displayRank = getOrdinal(rank);
            }
            rank++;
        } else {
            studentOverviews[i].displayRank = "—";
        }
    }

    const overallClassStatus = existingCards.length > 0 ? existingCards[0].status : "draft";

    res.status(200).json({
        status: "Success",
        message: "Class results overview fetched successfully",
        data: {
            classLevel: classLevelDoc,
            program: targetProgram?.doc || null,
            academicYear: academicYearDoc,
            academicTerm: academicTermDoc,
            students: studentOverviews,
            summary: {
                totalStudents: students.length,
                program: targetProgram?.doc || null,
                fullySubmittedCount,
                pendingCount,
                allCompleted: students.length > 0 && fullySubmittedCount === students.length,
                overallStatus: overallClassStatus,
                isPublished: existingCards.length > 0 && existingCards[0].published,
            },
        },
    });
});

//@desc Get class report cards (Teacher or Admin)
//@route GET /api/v1/report-cards/class/:classLevelId
//@access Private (Teacher or Admin)
exports.getClassReportCardsCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId } = req.params;
    const { academicYearId, academicTermId } = req.query;

    const explicitProgram = req.query.programId || req.query.program;
    const targetProgram = await resolveTargetProgram(req.userAuth, classLevelId, academicYearId, explicitProgram);

    const filter = {
        classLevel: classLevelId,
        "subjectResults.0": { $exists: true }, // Only return report cards that have recorded results
    };
    if (academicYearId) filter.academicYear = academicYearId;
    if (academicTermId) filter.academicTerm = academicTermId;

    let cards = await StudentReportCard.find(filter)
        .populate("student", "name email StudentId currentClassLevel program")
        .populate("program", "name code")
        .populate("academicYear", "name")
        .populate("academicTerm", "name")
        .populate("classLevel", "name")
        .populate("approvedBy", "name email")
        .populate("submittedBy", "name email")
        .sort({ position: 1 });

    if (targetProgram) {
        const tId = targetProgram.id.toString();
        cards = cards.filter((c) => {
            const cardProgId = c.program ? (c.program._id || c.program).toString() : null;
            const stuProgId = c.student?.program ? (c.student.program._id || c.student.program).toString() : null;
            return cardProgId === tId || stuProgId === tId;
        });
    }

    res.status(200).json({
        status: "Success",
        message: "Class report cards fetched successfully",
        data: cards,
        program: targetProgram?.doc || null,
        totalCount: cards.length,
    });
});

//@desc Teacher submit class results to admin (Individual or Batch)
//@route POST /api/v1/report-cards/class/submit
//@access Private (Teacher only)
exports.submitClassReportCardsCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId, academicYearId, academicTermId, reportCardId, studentId } = req.body;

    // A. Single student submission
    if (reportCardId || studentId) {
        let card = null;
        if (reportCardId && mongoose.Types.ObjectId.isValid(reportCardId)) {
            card = await StudentReportCard.findById(reportCardId)
                .populate("student", "name StudentId currentClassLevel")
                .populate("classLevel", "name");
        }
        if (!card && studentId) {
            const studentQuery = {
                $or: [
                    ...(mongoose.Types.ObjectId.isValid(studentId) ? [{ student: studentId }] : []),
                    { studentID: studentId },
                ],
            };
            if (academicYearId) studentQuery.academicYear = academicYearId;
            if (academicTermId) studentQuery.academicTerm = academicTermId;
            if (classLevelId) studentQuery.classLevel = classLevelId;
            card = await StudentReportCard.findOne(studentQuery)
                .populate("student", "name StudentId currentClassLevel")
                .populate("classLevel", "name");
        }

        if (!card && studentId) {
            const studentDoc = await Student.findOne({
                $or: [
                    ...(mongoose.Types.ObjectId.isValid(studentId) ? [{ _id: studentId }] : []),
                    { StudentId: studentId },
                ],
            });

            if (studentDoc) {
                const subjectResultsQuery = {
                    student: studentDoc._id,
                    ...(academicYearId ? { academicYear: academicYearId } : {}),
                    ...(academicTermId ? { academicTerm: academicTermId } : {}),
                };
                if (classLevelId) subjectResultsQuery.classLevel = classLevelId;

                const recordedScores = await StudentSubjectResult.find(subjectResultsQuery).populate("subject", "name");
                if (recordedScores.length > 0) {
                    const subjectResults = recordedScores.map((s) => ({
                        subject: s.subject?._id || s.subject,
                        subjectName: s.subjectName || s.subject?.name || "Subject",
                        testScore: s.testScore,
                        examScore: s.examScore,
                        score: s.totalScore,
                        totalMark: 100,
                        grade: s.grade,
                        letterGrade: getLetterGrade(s.grade),
                        remarks: s.remark,
                        status: s.grade >= 40 ? "Passed" : "Failed",
                    }));

                    let totalScore = 0;
                    subjectResults.forEach((sr) => {
                        totalScore += Number(sr.score || 0);
                    });
                    const count = subjectResults.length;
                    const averageScore = count > 0 ? Number((totalScore / count).toFixed(1)) : 0;

                    card = new StudentReportCard({
                        student: studentDoc._id,
                        studentID: studentDoc.StudentId,
                        academicYear: academicYearId,
                        academicTerm: academicTermId,
                        classLevel: classLevelId || studentDoc.currentClassLevel,
                        program: studentDoc.program,
                        subjectResults,
                        totalScore,
                        totalMaxScore: count * 100,
                        averageScore,
                        overallGrade: getLetterGrade(averageScore),
                        overallRemark: getSubjectRemark(averageScore),
                        status: "submitted_to_admin",
                        submittedBy: req.userAuth?._id,
                        submittedAt: new Date(),
                    });
                    await card.save();

                    // Also sync teacher submission to individual ExamResult records so they appear in Admin results queue
                    await ExamResult.updateMany(
                        {
                            $or: [
                                ...(studentDoc.StudentId ? [{ studentID: studentDoc.StudentId }] : []),
                                { studentID: studentDoc._id.toString() },
                                { student: studentDoc._id },
                            ],
                            ...(academicYearId ? { academicYear: academicYearId } : {}),
                            ...(academicTermId ? { academicTerm: academicTermId } : {}),
                        },
                        {
                            $set: {
                                isTeacherPublished: true,
                                teacherPublishedAt: new Date(),
                                teacherPublishedBy: req.userAuth?._id,
                            }
                        }
                    );

                    return res.status(200).json({
                        status: "Success",
                        message: `Successfully submitted report card for ${studentDoc.name} to Admin for review.`,
                        data: card,
                    });
                }
            }
        }

        if (!card) {
            return res.status(404).json({
                status: "failed",
                message: "Student report card not found for submission. Please ensure subject marks are recorded first.",
            });
        }

        // Validate that student has subject results recorded
        if (!Array.isArray(card.subjectResults) || card.subjectResults.length === 0) {
            return res.status(400).json({
                status: "failed",
                message: `Cannot submit result for ${card.student?.name || card.studentID}. No subject scores have been entered yet.`,
            });
        }

        const prevStatus = card.status || "draft";
        card.status = "submitted_to_admin";
        card.submittedBy = req.userAuth?._id;
        card.submittedAt = new Date();
        card.rejectionReason = "";

        if (!Array.isArray(card.reviewHistory)) {
            card.reviewHistory = [];
        }
        card.reviewHistory.push({
            action: "submitted",
            performedBy: req.userAuth?._id,
            performerModel: "Teacher",
            performerName: req.userAuth?.name || "Class Teacher",
            timestamp: new Date(),
            reason: "Submitted to Admin for review and approval",
            previousStatus: prevStatus,
            newStatus: "submitted_to_admin",
        });

        await card.save();

        const sId = card.student?._id || card.student;
        const sReg = card.studentID || card.student?.StudentId;
        await ExamResult.updateMany(
            {
                $or: [
                    ...(sReg ? [{ studentID: sReg }] : []),
                    ...(sId ? [{ studentID: sId.toString() }, { student: sId }] : []),
                ],
                ...(card.academicYear ? { academicYear: card.academicYear } : {}),
                ...(card.academicTerm ? { academicTerm: card.academicTerm } : {}),
            },
            {
                $set: {
                    isTeacherPublished: true,
                    teacherPublishedAt: new Date(),
                    teacherPublishedBy: req.userAuth?._id,
                }
            }
        );

        return res.status(200).json({
            status: "Success",
            message: `Successfully submitted report card for ${card.student?.name || card.studentID} to Admin for review.`,
            data: card,
        });
    }

    // B. Bulk class submission
    if (!classLevelId || !academicYearId || !academicTermId) {
        return res.status(400).json({
            status: "failed",
            message: "Class Level, Academic Year, and Academic Term are required to submit results.",
        });
    }

    const explicitProgram = req.body.programId || req.body.program || req.query.programId;
    const targetProgram = await resolveTargetProgram(req.userAuth, classLevelId, academicYearId, explicitProgram);

    // Auto-compile any missing student cards from StudentSubjectResult in this class before submitting
    const bulkSubResultsQuery = {
        classLevel: classLevelId,
        academicYear: academicYearId,
        academicTerm: academicTermId,
    };
    const allSubjectResults = await StudentSubjectResult.find(bulkSubResultsQuery).populate("subject", "name");
    const studentResultsMap = new Map();
    for (const sr of allSubjectResults) {
        const sKey = sr.student.toString();
        if (!studentResultsMap.has(sKey)) studentResultsMap.set(sKey, []);
        studentResultsMap.get(sKey).push(sr);
    }

    for (const [sId, sResults] of studentResultsMap) {
        const existing = await StudentReportCard.findOne({
            student: sId,
            academicYear: academicYearId,
            academicTerm: academicTermId,
            classLevel: classLevelId,
        });

        if (!existing && sResults.length > 0) {
            const stu = await Student.findById(sId);
            if (stu) {
                const subjectResults = sResults.map((s) => ({
                    subject: s.subject?._id || s.subject,
                    subjectName: s.subjectName || s.subject?.name || "Subject",
                    testScore: s.testScore,
                    examScore: s.examScore,
                    score: s.totalScore,
                    totalMark: 100,
                    grade: s.grade,
                    letterGrade: getLetterGrade(s.grade),
                    remarks: s.remark,
                    status: s.grade >= 40 ? "Passed" : "Failed",
                }));

                let totalScore = 0;
                subjectResults.forEach((sr) => {
                    totalScore += Number(sr.score || 0);
                });
                const count = subjectResults.length;
                const averageScore = count > 0 ? Number((totalScore / count).toFixed(1)) : 0;

                const newCard = new StudentReportCard({
                    student: stu._id,
                    studentID: stu.StudentId,
                    academicYear: academicYearId,
                    academicTerm: academicTermId,
                    classLevel: classLevelId,
                    program: stu.program,
                    subjectResults,
                    totalScore,
                    totalMaxScore: count * 100,
                    averageScore,
                    overallGrade: getLetterGrade(averageScore),
                    overallRemark: getSubjectRemark(averageScore),
                    status: "calculated",
                });
                await newCard.save();
            }
        }
    }

    let cards = await StudentReportCard.find({
        classLevel: classLevelId,
        academicYear: academicYearId,
        academicTerm: academicTermId,
    }).populate("student", "name StudentId program");

    if (targetProgram) {
        const tId = targetProgram.id.toString();
        cards = cards.filter((c) => {
            const cardProgId = c.program ? (c.program._id || c.program).toString() : null;
            const stuProgId = c.student?.program ? (c.student.program._id || c.student.program).toString() : null;
            return cardProgId === tId || stuProgId === tId;
        });
    }

    if (cards.length === 0) {
        const progNotice = targetProgram ? ` for program "${targetProgram.doc?.name || targetProgram.id}"` : "";
        return res.status(404).json({
            status: "failed",
            message: `No report cards found for this class and term${progNotice}. Please enter subject marks and calculate results first.`,
        });
    }

    // Filter eligible cards (must have recorded subject results and not already published)
    const eligibleCards = cards.filter((c) => {
        const hasScores = Array.isArray(c.subjectResults) && c.subjectResults.length > 0;
        const isNotPublished = !c.published;
        return hasScores && isNotPublished;
    });

    if (eligibleCards.length === 0) {
        return res.status(400).json({
            status: "failed",
            message: "No eligible complete report cards found to submit. All cards either lack subject marks or are already published.",
        });
    }

    const eligibleIds = eligibleCards.map((c) => c._id);
    const now = new Date();

    for (const card of eligibleCards) {
        const prevStatus = card.status || "draft";
        card.status = "submitted_to_admin";
        card.submittedBy = req.userAuth?._id;
        card.submittedAt = now;
        card.rejectionReason = "";

        if (!Array.isArray(card.reviewHistory)) {
            card.reviewHistory = [];
        }
        card.reviewHistory.push({
            action: "submitted",
            performedBy: req.userAuth?._id,
            performerModel: "Teacher",
            performerName: req.userAuth?.name || "Class Teacher",
            timestamp: now,
            reason: "Batch submitted to Admin for review and approval",
            previousStatus: prevStatus,
            newStatus: "submitted_to_admin",
        });

        await card.save();
    }

    // Also sync teacher submission to individual ExamResult records for all submitted students
    const bulkStudentIds = eligibleCards.map(c => c.student?._id || c.student).filter(Boolean);
    const bulkStudentRegNos = eligibleCards.map(c => c.studentID || c.student?.StudentId).filter(Boolean);
    if (bulkStudentIds.length > 0 || bulkStudentRegNos.length > 0) {
        await ExamResult.updateMany(
            {
                $or: [
                    { studentID: { $in: bulkStudentRegNos } },
                    { studentID: { $in: bulkStudentIds.map(id => id.toString()) } },
                    { student: { $in: bulkStudentIds } },
                ],
                ...(academicYearId ? { academicYear: academicYearId } : {}),
                ...(academicTermId ? { academicTerm: academicTermId } : {}),
            },
            {
                $set: {
                    isTeacherPublished: true,
                    teacherPublishedAt: now,
                    teacherPublishedBy: req.userAuth?._id,
                }
            }
        );
    }

    const skippedCount = cards.length - eligibleCards.length;

    res.status(200).json({
        status: "Success",
        message: `Successfully submitted ${eligibleCards.length} student report cards to Admin for review.${skippedCount > 0 ? ` (${skippedCount} incomplete or already published cards were skipped)` : ""}`,
        submittedCount: eligibleCards.length,
        skippedCount,
        totalCount: cards.length,
    });
});

//@desc Teacher resubmit corrected student results to admin (Individual or Batch)
//@route POST /api/v1/report-cards/class/resubmit
//@access Private (Teacher only)
exports.resubmitClassReportCardsCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId, academicYearId, academicTermId, reportCardId, studentId } = req.body;

    // A. Single student resubmission
    if (reportCardId || studentId) {
        let card = null;
        if (reportCardId && mongoose.Types.ObjectId.isValid(reportCardId)) {
            card = await StudentReportCard.findById(reportCardId);
        }
        if (!card && studentId) {
            const studentQuery = {
                $or: [
                    ...(mongoose.Types.ObjectId.isValid(studentId) ? [{ student: studentId }] : []),
                    { studentID: studentId },
                ],
            };
            if (academicYearId) studentQuery.academicYear = academicYearId;
            if (academicTermId) studentQuery.academicTerm = academicTermId;
            if (classLevelId) studentQuery.classLevel = classLevelId;
            card = await StudentReportCard.findOne(studentQuery);
        }

        if (!card) {
            return res.status(404).json({ status: "failed", message: "Report card not found for resubmission." });
        }

        // Fetch latest saved subject scores from StudentSubjectResult from database
        const latestScores = await StudentSubjectResult.find({
            student: card.student,
            academicYear: card.academicYear,
            academicTerm: card.academicTerm,
        }).populate("subject", "name");

        if (latestScores.length > 0) {
            card.subjectResults = latestScores.map((s) => ({
                subject: s.subject?._id || s.subject,
                subjectName: s.subjectName || s.subject?.name || "Subject",
                testScore: s.testScore,
                examScore: s.examScore,
                score: s.totalScore,
                totalMark: 100,
                grade: s.grade,
                letterGrade: getLetterGrade(s.grade),
                remarks: s.remark,
                status: s.grade >= 40 ? "Passed" : "Failed",
            }));

            let grandTotal = 0;
            card.subjectResults.forEach((sr) => {
                grandTotal += Number(sr.score || 0);
            });
            const count = card.subjectResults.length;
            card.totalScore = grandTotal;
            card.totalMaxScore = count * 100;
            card.averageScore = count > 0 ? Number((grandTotal / count).toFixed(1)) : 0;
            card.overallGrade = getLetterGrade(card.averageScore);
            card.overallRemark = getSubjectRemark(card.averageScore);
        }

        const prevStatus = card.status || "returned_for_correction";
        const oldRejectionReason = card.rejectionReason || "";
        card.status = "resubmitted";
        card.resubmittedBy = req.userAuth?._id;
        card.resubmittedAt = new Date();

        if (!Array.isArray(card.reviewHistory)) {
            card.reviewHistory = [];
        }
        card.reviewHistory.push({
            action: "resubmitted",
            performedBy: req.userAuth?._id,
            performerModel: "Teacher",
            performerName: req.userAuth?.name || "Class Teacher",
            timestamp: new Date(),
            reason: oldRejectionReason ? `Corrected in response to: "${oldRejectionReason}"` : "Resubmitted after correction",
            previousStatus: prevStatus,
            newStatus: "resubmitted",
        });

        await card.save();

        const sId = card.student?._id || card.student;
        const sReg = card.studentID || card.student?.StudentId;
        await ExamResult.updateMany(
            {
                $or: [
                    ...(sReg ? [{ studentID: sReg }] : []),
                    ...(sId ? [{ studentID: sId.toString() }, { student: sId }] : []),
                ],
                ...(card.academicYear ? { academicYear: card.academicYear } : {}),
                ...(card.academicTerm ? { academicTerm: card.academicTerm } : {}),
            },
            {
                $set: {
                    isTeacherPublished: true,
                    teacherPublishedAt: new Date(),
                    teacherPublishedBy: req.userAuth?._id,
                }
            }
        );

        return res.status(200).json({
            status: "Success",
            message: `Successfully resubmitted corrected results for ${card.studentID} to Admin for re-approval.`,
            data: card,
        });
    }

    // B. Bulk resubmission for all rejected/returned results in the class
    if (!classLevelId || !academicYearId || !academicTermId) {
        return res.status(400).json({
            status: "failed",
            message: "Class Level, Academic Year, and Academic Term are required to resubmit results.",
        });
    }

    const explicitProgram = req.body.programId || req.body.program || req.query.programId;
    const targetProgram = await resolveTargetProgram(req.userAuth, classLevelId, academicYearId, explicitProgram);

    let cards = await StudentReportCard.find({
        classLevel: classLevelId,
        academicYear: academicYearId,
        academicTerm: academicTermId,
        status: { $in: ["rejected", "returned_for_correction"] },
    }).populate("student", "name StudentId program");

    if (targetProgram) {
        const tId = targetProgram.id.toString();
        cards = cards.filter((c) => {
            const cardProgId = c.program ? (c.program._id || c.program).toString() : null;
            const stuProgId = c.student?.program ? (c.student.program._id || c.student.program).toString() : null;
            return cardProgId === tId || stuProgId === tId;
        });
    }

    if (cards.length === 0) {
        const progNotice = targetProgram ? ` for program "${targetProgram.doc?.name || targetProgram.id}"` : "";
        return res.status(404).json({
            status: "failed",
            message: `No returned/rejected report cards found in this class${progNotice} to resubmit.`,
        });
    }

    const now = new Date();
    for (const card of cards) {
        const latestScores = await StudentSubjectResult.find({
            student: card.student,
            academicYear: card.academicYear,
            academicTerm: card.academicTerm,
        }).populate("subject", "name");

        if (latestScores.length > 0) {
            card.subjectResults = latestScores.map((s) => ({
                subject: s.subject?._id || s.subject,
                subjectName: s.subjectName || s.subject?.name || "Subject",
                testScore: s.testScore,
                examScore: s.examScore,
                score: s.totalScore,
                totalMark: 100,
                grade: s.grade,
                letterGrade: getLetterGrade(s.grade),
                remarks: s.remark,
                status: s.grade >= 40 ? "Passed" : "Failed",
            }));

            let grandTotal = 0;
            card.subjectResults.forEach((sr) => {
                grandTotal += Number(sr.score || 0);
            });
            const count = card.subjectResults.length;
            card.totalScore = grandTotal;
            card.totalMaxScore = count * 100;
            card.averageScore = count > 0 ? Number((grandTotal / count).toFixed(1)) : 0;
            card.overallGrade = getLetterGrade(card.averageScore);
            card.overallRemark = getSubjectRemark(card.averageScore);
        }

        const prevStatus = card.status;
        const oldReason = card.rejectionReason || "";
        card.status = "resubmitted";
        card.resubmittedBy = req.userAuth?._id;
        card.resubmittedAt = now;

        if (!Array.isArray(card.reviewHistory)) {
            card.reviewHistory = [];
        }
        card.reviewHistory.push({
            action: "resubmitted",
            performedBy: req.userAuth?._id,
            performerModel: "Teacher",
            performerName: req.userAuth?.name || "Class Teacher",
            timestamp: now,
            reason: oldReason ? `Corrected in response to: "${oldReason}"` : "Resubmitted after correction",
            previousStatus: prevStatus,
            newStatus: "resubmitted",
        });

        await card.save();
    }

    const resubmitStudentIds = cards.map(c => c.student?._id || c.student).filter(Boolean);
    const resubmitStudentRegNos = cards.map(c => c.studentID || c.student?.StudentId).filter(Boolean);
    if (resubmitStudentIds.length > 0 || resubmitStudentRegNos.length > 0) {
        await ExamResult.updateMany(
            {
                $or: [
                    { studentID: { $in: resubmitStudentRegNos } },
                    { studentID: { $in: resubmitStudentIds.map(id => id.toString()) } },
                    { student: { $in: resubmitStudentIds } },
                ],
                ...(academicYearId ? { academicYear: academicYearId } : {}),
                ...(academicTermId ? { academicTerm: academicTermId } : {}),
            },
            {
                $set: {
                    isTeacherPublished: true,
                    teacherPublishedAt: now,
                    teacherPublishedBy: req.userAuth?._id,
                }
            }
        );
    }

    res.status(200).json({
        status: "Success",
        message: `Successfully resubmitted ${cards.length} corrected report cards to Admin.`,
        resubmittedCount: cards.length,
    });
});

//@desc Teacher update comment on student report card
//@route PATCH /api/v1/report-cards/:id/teacher-comment
//@access Private (Teacher only)
exports.updateTeacherCommentCtrl = AsyncHandler(async (req, res) => {
    const { teacherComment, studentId, academicYearId, academicTermId, classLevelId } = req.body;
    let card = null;

    if (req.params.id && req.params.id !== "new" && mongoose.Types.ObjectId.isValid(req.params.id)) {
        card = await StudentReportCard.findById(req.params.id);
    }

    if (!card && studentId && academicYearId && academicTermId && classLevelId) {
        card = await StudentReportCard.findOne({
            student: studentId,
            academicYear: academicYearId,
            academicTerm: academicTermId,
            classLevel: classLevelId,
        });

        if (!card) {
            const studentDoc = await Student.findById(studentId);
            if (studentDoc) {
                card = new StudentReportCard({
                    student: studentDoc._id,
                    studentID: studentDoc.StudentId,
                    academicYear: academicYearId,
                    academicTerm: academicTermId,
                    classLevel: classLevelId,
                    teacherComment: teacherComment || "",
                    status: "draft",
                });
                await card.save();
            }
        }
    }

    if (!card) {
        return res.status(404).json({ status: "failed", message: "Report card not found" });
    }

    if (card.published) {
        return res.status(400).json({
            status: "failed",
            message: "This report card has already been officially published. It cannot be modified by teacher.",
        });
    }

    card.teacherComment = teacherComment || "";
    await card.save();

    res.status(200).json({
        status: "Success",
        message: "Teacher comment updated successfully",
        data: card,
    });
});

//@desc Admin approve class results (Individual or Batch)
//@route PATCH /api/v1/report-cards/class/approve
//@access Private (Admin only)
exports.approveClassReportCardsCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId, academicYearId, academicTermId, reportCardId, studentId } = req.body;

    // A. Single student approval
    if (reportCardId || studentId) {
        let card = null;
        if (reportCardId && mongoose.Types.ObjectId.isValid(reportCardId)) {
            card = await StudentReportCard.findById(reportCardId);
        }
        if (!card && studentId) {
            card = await StudentReportCard.findOne({
                $or: [
                    ...(mongoose.Types.ObjectId.isValid(studentId) ? [{ student: studentId }] : []),
                    { studentID: studentId },
                ],
                ...(academicYearId ? { academicYear: academicYearId } : {}),
                ...(academicTermId ? { academicTerm: academicTermId } : {}),
                ...(classLevelId ? { classLevel: classLevelId } : {}),
            });
        }

        if (!card) {
            return res.status(404).json({ status: "failed", message: "Report card not found." });
        }

        const prevStatus = card.status || "submitted";
        card.status = "approved";
        card.approvedBy = req.userAuth?._id;
        card.approvedAt = new Date();
        card.rejectionReason = "";

        if (!Array.isArray(card.reviewHistory)) {
            card.reviewHistory = [];
        }
        card.reviewHistory.push({
            action: "approved",
            performedBy: req.userAuth?._id,
            performerModel: "Admin",
            performerName: req.userAuth?.name || "Admin",
            timestamp: new Date(),
            reason: "Approved by administrator",
            previousStatus: prevStatus,
            newStatus: "approved",
        });

        await card.save();

        return res.status(200).json({
            status: "Success",
            message: `Approved report card for ${card.studentID} successfully.`,
            data: card,
        });
    }

    // B. Bulk approval
    if (!classLevelId || !academicYearId || !academicTermId) {
        return res.status(400).json({
            status: "failed",
            message: "Class Level, Academic Year, and Academic Term are required to approve results.",
        });
    }

    const { programId } = req.body;
    const approveQuery = {
        classLevel: classLevelId,
        academicYear: academicYearId,
        academicTerm: academicTermId,
        status: { $in: ["submitted", "submitted_to_admin", "resubmitted"] },
    };
    if (programId && programId !== "all") {
        const studentIdsInProg = await Student.find({ program: programId }).distinct("_id");
        approveQuery.$or = [
            { program: programId },
            { student: { $in: studentIdsInProg } },
        ];
    }

    const cards = await StudentReportCard.find(approveQuery);

    const now = new Date();
    for (const card of cards) {
        const prevStatus = card.status;
        card.status = "approved";
        card.approvedBy = req.userAuth?._id;
        card.approvedAt = now;
        card.rejectionReason = "";

        if (!Array.isArray(card.reviewHistory)) {
            card.reviewHistory = [];
        }
        card.reviewHistory.push({
            action: "approved",
            performedBy: req.userAuth?._id,
            performerModel: "Admin",
            performerName: req.userAuth?.name || "Admin",
            timestamp: now,
            reason: "Batch approved by administrator",
            previousStatus: prevStatus,
            newStatus: "approved",
        });

        await card.save();
    }

    res.status(200).json({
        status: "Success",
        message: `Approved ${cards.length} student report cards successfully.`,
        approvedCount: cards.length,
    });
});

//@desc Admin reject class results with feedback (Individual or Batch)
//@route PATCH /api/v1/report-cards/class/reject
//@access Private (Admin only)
exports.rejectClassReportCardsCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId, academicYearId, academicTermId, reportCardId, studentId, rejectionReason } = req.body;

    if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({
            status: "failed",
            message: "A specific rejection reason is mandatory when returning results for correction.",
        });
    }

    const reasonText = rejectionReason.trim();
    const now = new Date();

    // A. Single student rejection
    if (reportCardId || studentId) {
        let card = null;
        if (reportCardId && mongoose.Types.ObjectId.isValid(reportCardId)) {
            card = await StudentReportCard.findById(reportCardId)
                .populate("student", "name StudentId");
        }
        if (!card && studentId) {
            card = await StudentReportCard.findOne({
                $or: [
                    ...(mongoose.Types.ObjectId.isValid(studentId) ? [{ student: studentId }] : []),
                    { studentID: studentId },
                ],
                ...(academicYearId ? { academicYear: academicYearId } : {}),
                ...(academicTermId ? { academicTerm: academicTermId } : {}),
                ...(classLevelId ? { classLevel: classLevelId } : {}),
            }).populate("student", "name StudentId");
        }

        if (!card) {
            return res.status(404).json({ status: "failed", message: "Report card not found." });
        }

        const prevStatus = card.status || "submitted";
        card.status = "returned_for_correction";
        card.published = false;
        card.rejectionReason = reasonText;
        card.rejectedBy = req.userAuth?._id;
        card.rejectedAt = now;

        if (!Array.isArray(card.reviewHistory)) {
            card.reviewHistory = [];
        }
        card.reviewHistory.push({
            action: "rejected",
            performedBy: req.userAuth?._id,
            performerModel: "Admin",
            performerName: req.userAuth?.name || "Admin",
            timestamp: now,
            reason: reasonText,
            previousStatus: prevStatus,
            newStatus: "returned_for_correction",
        });

        await card.save();

        return res.status(200).json({
            status: "Success",
            message: `Returned report card for ${card.student?.name || card.studentID} to class teacher for correction.`,
            data: card,
        });
    }

    // B. Bulk rejection
    if (!classLevelId || !academicYearId || !academicTermId) {
        return res.status(400).json({
            status: "failed",
            message: "Class Level, Academic Year, and Academic Term are required.",
        });
    }

    const { programId } = req.body;
    const rejectQuery = {
        classLevel: classLevelId,
        academicYear: academicYearId,
        academicTerm: academicTermId,
        published: false,
        status: { $in: ["submitted", "submitted_to_admin", "resubmitted", "approved"] },
    };
    if (programId && programId !== "all") {
        const studentIdsInProg = await Student.find({ program: programId }).distinct("_id");
        rejectQuery.$or = [
            { program: programId },
            { student: { $in: studentIdsInProg } },
        ];
    }

    // Only reject not-yet-published submitted cards (do NOT silently reverse already published results)
    const cards = await StudentReportCard.find(rejectQuery);

    if (cards.length === 0) {
        return res.status(404).json({
            status: "failed",
            message: "No submitted, unpublished report cards found in this class to return for correction.",
        });
    }

    for (const card of cards) {
        const prevStatus = card.status;
        card.status = "returned_for_correction";
        card.published = false;
        card.rejectionReason = reasonText;
        card.rejectedBy = req.userAuth?._id;
        card.rejectedAt = now;

        if (!Array.isArray(card.reviewHistory)) {
            card.reviewHistory = [];
        }
        card.reviewHistory.push({
            action: "rejected",
            performedBy: req.userAuth?._id,
            performerModel: "Admin",
            performerName: req.userAuth?.name || "Admin",
            timestamp: now,
            reason: reasonText,
            previousStatus: prevStatus,
            newStatus: "returned_for_correction",
        });

        await card.save();
    }

    res.status(200).json({
        status: "Success",
        message: `Returned ${cards.length} report cards to class teacher for correction.`,
        rejectedCount: cards.length,
    });
});

//@desc Admin publish class report cards to students (Individual or Batch)
//@route PATCH /api/v1/report-cards/class/publish
//@access Private (Admin only)
exports.publishClassReportCardsCtrl = AsyncHandler(async (req, res) => {
    const { classLevelId, academicYearId, academicTermId, reportCardId, studentId, publish = true } = req.body;
    const isPublishing = Boolean(publish);
    const now = new Date();

    // A. Single student publication
    if (reportCardId || studentId) {
        let card = null;
        if (reportCardId && mongoose.Types.ObjectId.isValid(reportCardId)) {
            card = await StudentReportCard.findById(reportCardId)
                .populate("student", "name StudentId");
        }
        if (!card && studentId) {
            card = await StudentReportCard.findOne({
                $or: [
                    ...(mongoose.Types.ObjectId.isValid(studentId) ? [{ student: studentId }] : []),
                    { studentID: studentId },
                ],
                ...(academicYearId ? { academicYear: academicYearId } : {}),
                ...(academicTermId ? { academicTerm: academicTermId } : {}),
                ...(classLevelId ? { classLevel: classLevelId } : {}),
            }).populate("student", "name StudentId");
        }

        if (!card) {
            return res.status(404).json({ status: "failed", message: "Report card not found for publication." });
        }

        const prevStatus = card.status;

        if (isPublishing) {
            // Validation: must have scores recorded and not be in draft/empty state
            if (!Array.isArray(card.subjectResults) || card.subjectResults.length === 0) {
                return res.status(400).json({
                    status: "failed",
                    message: `Cannot publish result for ${card.student?.name || card.studentID}: no subject scores recorded.`,
                });
            }

            card.published = true;
            card.status = "published";
            card.publishedAt = now;
            card.publishedBy = req.userAuth?._id;
            card.approvedBy = req.userAuth?._id;
            card.approvedAt = now;

            if (!Array.isArray(card.reviewHistory)) {
                card.reviewHistory = [];
            }
            card.reviewHistory.push({
                action: "published",
                performedBy: req.userAuth?._id,
                performerModel: "Admin",
                performerName: req.userAuth?.name || "Admin",
                timestamp: now,
                reason: "Officially published to student and parent portals",
                previousStatus: prevStatus,
                newStatus: "published",
            });

            await card.save();

            return res.status(200).json({
                status: "Success",
                message: `Officially published report card for ${card.student?.name || card.studentID}! Result is now visible in student and parent portals.`,
                data: card,
            });
        } else {
            // Unpublish single result
            card.published = false;
            card.status = "approved";
            card.publishedAt = null;
            card.publishedBy = null;

            if (!Array.isArray(card.reviewHistory)) {
                card.reviewHistory = [];
            }
            card.reviewHistory.push({
                action: "unpublished",
                performedBy: req.userAuth?._id,
                performerModel: "Admin",
                performerName: req.userAuth?.name || "Admin",
                timestamp: now,
                reason: "Unpublished by administrator",
                previousStatus: prevStatus,
                newStatus: "approved",
            });

            await card.save();

            return res.status(200).json({
                status: "Success",
                message: `Unpublished report card for ${card.student?.name || card.studentID}. It is no longer visible to students or parents.`,
                data: card,
            });
        }
    }

    // B. Bulk publication
    if (!classLevelId || !academicYearId || !academicTermId) {
        return res.status(400).json({
            status: "failed",
            message: "Class Level, Academic Year, and Academic Term are required.",
        });
    }

    const { programId } = req.body;
    const publishQuery = {
        classLevel: classLevelId,
        academicYear: academicYearId,
        academicTerm: academicTermId,
    };
    if (programId && programId !== "all") {
        const studentIdsInProg = await Student.find({ program: programId }).distinct("_id");
        publishQuery.$or = [
            { program: programId },
            { student: { $in: studentIdsInProg } },
        ];
    }

    const cards = await StudentReportCard.find(publishQuery);

    if (cards.length === 0) {
        return res.status(404).json({
            status: "failed",
            message: "No report cards found for this class and term.",
        });
    }

    if (isPublishing) {
        // Publish only complete, eligible results (must have subjects and not be rejected or empty)
        const eligibleCards = cards.filter((c) => {
            const hasScores = Array.isArray(c.subjectResults) && c.subjectResults.length > 0;
            const isEligibleStatus = ["submitted", "submitted_to_admin", "resubmitted", "approved", "calculated"].includes(c.status);
            return hasScores && isEligibleStatus;
        });

        if (eligibleCards.length === 0) {
            return res.status(400).json({
                status: "failed",
                message: "No eligible complete report cards found to publish. Cards must be submitted and have recorded subject scores.",
            });
        }

        for (const card of eligibleCards) {
            const prevStatus = card.status;
            card.published = true;
            card.status = "published";
            card.publishedAt = now;
            card.publishedBy = req.userAuth?._id;
            card.approvedBy = req.userAuth?._id;
            card.approvedAt = now;

            if (!Array.isArray(card.reviewHistory)) {
                card.reviewHistory = [];
            }
            card.reviewHistory.push({
                action: "published",
                performedBy: req.userAuth?._id,
                performerModel: "Admin",
                performerName: req.userAuth?.name || "Admin",
                timestamp: now,
                reason: "Batch officially published to student and parent portals",
                previousStatus: prevStatus,
                newStatus: "published",
            });

            await card.save();
        }

        const skippedCount = cards.length - eligibleCards.length;

        return res.status(200).json({
            status: "Success",
            message: `Officially released ${eligibleCards.length} report cards! Students can now view and download their results.${skippedCount > 0 ? ` (${skippedCount} incomplete or rejected cards were skipped)` : ""}`,
            publishedCount: eligibleCards.length,
            skippedCount,
            totalCount: cards.length,
        });
    } else {
        // Bulk unpublish
        const publishedCards = cards.filter((c) => c.published);
        for (const card of publishedCards) {
            const prevStatus = card.status;
            card.published = false;
            card.status = "approved";
            card.publishedAt = null;
            card.publishedBy = null;

            if (!Array.isArray(card.reviewHistory)) {
                card.reviewHistory = [];
            }
            card.reviewHistory.push({
                action: "unpublished",
                performedBy: req.userAuth?._id,
                performerModel: "Admin",
                performerName: req.userAuth?.name || "Admin",
                timestamp: now,
                reason: "Batch unpublished by administrator",
                previousStatus: prevStatus,
                newStatus: "approved",
            });

            await card.save();
        }

        return res.status(200).json({
            status: "Success",
            message: `Unpublished ${publishedCards.length} report cards. Students and parents can no longer access them.`,
            unpublishedCount: publishedCards.length,
        });
    }
});

//@desc Get audit and review history of a report card
//@route GET /api/v1/report-cards/:id/history
//@access Private (Admin or Teacher)
exports.getReportCardReviewHistoryCtrl = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    let card = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
        card = await StudentReportCard.findById(id)
            .populate("student", "name email StudentId currentClassLevel")
            .populate("classLevel", "name")
            .populate("academicYear", "name")
            .populate("academicTerm", "name")
            .populate("submittedBy", "name email teacherId")
            .populate("approvedBy", "name email")
            .populate("rejectedBy", "name email")
            .populate("publishedBy", "name email")
            .populate("resubmittedBy", "name email teacherId");
    }

    if (!card) {
        card = await StudentReportCard.findOne({ studentID: id })
            .populate("student", "name email StudentId currentClassLevel")
            .populate("classLevel", "name")
            .populate("academicYear", "name")
            .populate("academicTerm", "name")
            .populate("submittedBy", "name email teacherId")
            .populate("approvedBy", "name email")
            .populate("rejectedBy", "name email")
            .populate("publishedBy", "name email")
            .populate("resubmittedBy", "name email teacherId");
    }

    if (!card) {
        return res.status(404).json({ status: "failed", message: "Report card not found." });
    }

    res.status(200).json({
        status: "Success",
        data: {
            reportCardId: card._id,
            student: card.student,
            classLevel: card.classLevel,
            academicYear: card.academicYear,
            academicTerm: card.academicTerm,
            status: card.status,
            published: card.published,
            rejectionReason: card.rejectionReason,
            submittedBy: card.submittedBy,
            submittedAt: card.submittedAt,
            approvedBy: card.approvedBy,
            approvedAt: card.approvedAt,
            rejectedBy: card.rejectedBy,
            rejectedAt: card.rejectedAt,
            resubmittedBy: card.resubmittedBy,
            resubmittedAt: card.resubmittedAt,
            publishedBy: card.publishedBy,
            publishedAt: card.publishedAt,
            reviewHistory: card.reviewHistory || [],
        },
    });
});

//@desc Admin update principal comment and promotion status
//@route PATCH /api/v1/report-cards/:id/admin-comment
//@access Private (Admin only)
exports.updateAdminCommentCtrl = AsyncHandler(async (req, res) => {
    const { principalComment, promotionStatus, promoted } = req.body;
    const card = await StudentReportCard.findById(req.params.id);

    if (!card) {
        return res.status(404).json({ status: "failed", message: "Report card not found" });
    }

    if (principalComment !== undefined) card.principalComment = principalComment;
    if (promotionStatus !== undefined) card.promotionStatus = promotionStatus;
    if (promoted !== undefined) card.promoted = Boolean(promoted);

    await card.save();

    res.status(200).json({
        status: "Success",
        message: "Admin remarks and promotion status updated successfully.",
        data: card,
    });
});

//@desc Admin get overview of all class report cards by term
//@route GET /api/v1/report-cards/admin/overview
//@access Private (Admin only)
exports.getAdminReportCardOverviewCtrl = AsyncHandler(async (req, res) => {
    const { academicYearId, academicTermId, programId, program } = req.query;
    const progQuery = programId || program;

    const filter = {};
    if (academicYearId) filter.academicYear = academicYearId;
    if (academicTermId) filter.academicTerm = academicTermId;

    if (progQuery && progQuery !== "all") {
        const studentIdsInProgram = await Student.find({ program: progQuery }).distinct("_id");
        filter.$or = [
            { program: progQuery },
            { student: { $in: studentIdsInProgram } },
        ];
    }

    const cards = await StudentReportCard.find(filter)
        .populate("classLevel", "name")
        .populate("academicYear", "name")
        .populate("academicTerm", "name")
        .populate("program", "name code")
        .populate({
            path: "student",
            select: "name StudentId program",
            populate: { path: "program", select: "name code" },
        });

    // Group cards by classLevel + program + academicYear + academicTerm
    const groupsMap = new Map();

    for (const card of cards) {
        const classId = card.classLevel?._id?.toString() || "Unknown";
        const progId = (card.program?._id || card.program || card.student?.program?._id || card.student?.program)?.toString() || "all";
        const yearId = card.academicYear?._id?.toString() || "Unknown";
        const termId = card.academicTerm?._id?.toString() || "Unknown";
        const key = `${classId}_${progId}_${yearId}_${termId}`;

        if (!groupsMap.has(key)) {
            const resolvedProgDoc = card.program?._id ? card.program : card.student?.program?._id ? card.student.program : null;
            const progName = resolvedProgDoc?.name || (progId !== "all" ? "Program" : "All Programs");
            groupsMap.set(key, {
                classLevelId: card.classLevel?._id,
                className: card.classLevel?.name || "Unassigned",
                programId: progId !== "all" ? progId : null,
                programName: progName,
                academicYearId: card.academicYear?._id,
                academicYearName: card.academicYear?.name || "N/A",
                academicTermId: card.academicTerm?._id,
                academicTermName: card.academicTerm?.name || "N/A",
                totalStudents: 0,
                statusCounts: {
                    draft: 0,
                    calculated: 0,
                    submitted: 0,
                    approved: 0,
                    published: 0,
                    rejected: 0,
                },
                averageClassScore: 0,
                totalScoreSum: 0,
            });
        }

        const group = groupsMap.get(key);
        group.totalStudents += 1;
        const rawStatus = card.status || "draft";
        const st = ["submitted_to_admin", "resubmitted"].includes(rawStatus) ? "submitted" : rawStatus;
        if (group.statusCounts[st] !== undefined) group.statusCounts[st] += 1;
        group.totalScoreSum += card.averageScore || 0;
    }

    const summaries = Array.from(groupsMap.values()).map((g) => ({
        ...g,
        classAverage: g.totalStudents > 0 ? Number((g.totalScoreSum / g.totalStudents).toFixed(1)) : 0,
        overallStatus:
            g.statusCounts.published === g.totalStudents && g.totalStudents > 0
                ? "published"
                : g.statusCounts.approved === g.totalStudents && g.totalStudents > 0
                ? "approved"
                : g.statusCounts.submitted > 0
                ? "submitted"
                : g.statusCounts.rejected > 0
                ? "rejected"
                : "calculated",
    }));

    res.status(200).json({
        status: "Success",
        message: "Admin report cards summary fetched successfully",
        data: summaries,
    });
});

//@desc Student or Parent get latest published report card
//@route GET /api/v1/report-cards/student/report-card
//@access Private (Student or Parent)
exports.getStudentLatestReportCardCtrl = AsyncHandler(async (req, res) => {
    let studentObjectIds = [];
    let studentStringIds = [];

    if (req.userAuth?.role === "parent") {
        const Parent = require("../../models/Staff/Parent");
        const parent = await Parent.findById(req.userAuth._id);
        if (!parent || !parent.children || parent.children.length === 0) {
            return res.status(200).json({ status: "Success", data: null, message: "No linked children found." });
        }
        const targetChildId = req.query.studentId;
        let childrenToQuery = parent.children;
        if (targetChildId && targetChildId !== "all") {
            const match = parent.children.find((c) => c.toString() === targetChildId.toString());
            if (!match) {
                return res.status(403).json({ status: "failed", message: "Unauthorized access to this student's report card." });
            }
            childrenToQuery = [match];
        }
        const studentDocs = await Student.find({ _id: { $in: childrenToQuery } });
        studentDocs.forEach((s) => {
            studentObjectIds.push(s._id);
            if (s.StudentId) studentStringIds.push(s.StudentId);
            if (s.studentId) studentStringIds.push(s.studentId);
        });
    } else {
        const student = await Student.findById(req.userAuth?._id);
        if (!student) {
            return res.status(404).json({ status: "failed", message: "Student account not found." });
        }
        studentObjectIds.push(student._id);
        if (student.StudentId) studentStringIds.push(student.StudentId);
        if (student.studentId) studentStringIds.push(student.studentId);
    }

    const studentConditions = [];
    if (studentObjectIds.length > 0) studentConditions.push({ student: { $in: studentObjectIds } });
    if (studentStringIds.length > 0) studentConditions.push({ studentID: { $in: studentStringIds } });

    const card = await StudentReportCard.findOne({
        $and: [
            { $or: studentConditions },
            { published: true, status: "published" },
        ],
    })
        .populate("student", "name email StudentId currentClassLevel program dateAdmitted")
        .populate("academicYear", "name")
        .populate("academicTerm", "name")
        .populate("classLevel", "name")
        .populate("approvedBy", "name")
        .populate("publishedBy", "name")
        .populate("submittedBy", "name")
        .sort({ createdAt: -1 });

    if (!card) {
        return res.status(200).json({
            status: "Success",
            message: "No published report cards available yet.",
            data: null,
        });
    }

    res.status(200).json({
        status: "Success",
        data: card,
    });
});

//@desc Student or Parent get their published report cards list
//@route GET /api/v1/report-cards/student/my-report-cards
//@access Private (Student or Parent)
exports.getStudentPublishedReportCardsCtrl = AsyncHandler(async (req, res) => {
    let studentIds = [];

    if (req.userAuth?.role === "parent") {
        const Parent = require("../../models/Staff/Parent");
        const parent = await Parent.findById(req.userAuth._id);
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
                return res.status(403).json({ status: "failed", message: "Unauthorized access to this student's report cards." });
            }
            childrenToQuery = [match];
        }
        const studentDocs = await Student.find({ _id: { $in: childrenToQuery } });
        const studentObjectIds = [];
        const studentStringIds = [];
        studentDocs.forEach((s) => {
            studentObjectIds.push(s._id);
            if (s.StudentId) studentStringIds.push(s.StudentId);
            if (s.studentId) studentStringIds.push(s.studentId);
        });

        const studentConditions = [];
        if (studentObjectIds.length > 0) studentConditions.push({ student: { $in: studentObjectIds } });
        if (studentStringIds.length > 0) studentConditions.push({ studentID: { $in: studentStringIds } });

        // MANDATORY: Student and Parent CAN ONLY see report cards that have been officially published by Admin!
        const cards = await StudentReportCard.find({
            $and: [
                { $or: studentConditions },
                {
                    published: true,
                    status: "published",
                }
            ]
        })
            .populate("student", "name email StudentId currentClassLevel")
            .populate("academicYear", "name")
            .populate("academicTerm", "name")
            .populate("classLevel", "name")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            status: "Success",
            message: "Report cards retrieved successfully",
            data: cards,
        });
    } else {
        const student = await Student.findById(req.userAuth?._id);
        if (!student) {
            return res.status(404).json({ status: "failed", message: "Student account not found." });
        }
        const studentObjectIds = [student._id];
        const studentStringIds = [];
        if (student.StudentId) studentStringIds.push(student.StudentId);
        if (student.studentId) studentStringIds.push(student.studentId);

        const studentConditions = [{ student: { $in: studentObjectIds } }];
        if (studentStringIds.length > 0) studentConditions.push({ studentID: { $in: studentStringIds } });

        // MANDATORY: Student and Parent CAN ONLY see report cards that have been officially published by Admin!
        const cards = await StudentReportCard.find({
            $and: [
                { $or: studentConditions },
                {
                    published: true,
                    status: "published",
                }
            ]
        })
            .populate("student", "name email StudentId currentClassLevel")
            .populate("academicYear", "name")
            .populate("academicTerm", "name")
            .populate("classLevel", "name")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            status: "Success",
            message: "Report cards retrieved successfully",
            data: cards,
        });
    }
});

//@desc Student or Parent view specific term report card
//@route GET /api/v1/report-cards/student/term/:termId
//@access Private (Student or Parent)
exports.getStudentTermReportCardCtrl = AsyncHandler(async (req, res) => {
    const studentObjectIds = [];
    const studentStringIds = [];

    if (req.userAuth?.role === "parent") {
        const Parent = require("../../models/Staff/Parent");
        const parent = await Parent.findById(req.userAuth._id);
        if (!parent || !parent.children || parent.children.length === 0) {
            return res.status(404).json({ status: "failed", message: "No linked children found for this parent." });
        }
        const targetChildId = req.query.studentId;
        let childrenToQuery = parent.children;
        if (targetChildId && targetChildId !== "all") {
            const match = parent.children.find((c) => c.toString() === targetChildId.toString());
            if (!match) {
                return res.status(403).json({ status: "failed", message: "Unauthorized access to this student's report card." });
            }
            childrenToQuery = [match];
        }
        const studentDocs = await Student.find({ _id: { $in: childrenToQuery } });
        studentDocs.forEach((s) => {
            studentObjectIds.push(s._id);
            if (s.StudentId) studentStringIds.push(s.StudentId);
            if (s.studentId) studentStringIds.push(s.studentId);
        });
    } else {
        const student = await Student.findById(req.userAuth?._id);
        if (!student) {
            return res.status(404).json({ status: "failed", message: "Student account not found." });
        }
        studentObjectIds.push(student._id);
        if (student.StudentId) studentStringIds.push(student.StudentId);
        if (student.studentId) studentStringIds.push(student.studentId);
    }

    const { termId } = req.params;
    const { academicYearId } = req.query;

    const studentConditions = [];
    if (studentObjectIds.length > 0) studentConditions.push({ student: { $in: studentObjectIds } });
    if (studentStringIds.length > 0) studentConditions.push({ studentID: { $in: studentStringIds } });

    const filter = {
        academicTerm: termId,
        $or: studentConditions,
    };
    if (academicYearId) filter.academicYear = academicYearId;

    let reportCard = await StudentReportCard.findOne(filter)
        .populate("student", "name email StudentId currentClassLevel program dateAdmitted")
        .populate("academicYear", "name")
        .populate("academicTerm", "name")
        .populate("classLevel", "name")
        .populate("approvedBy", "name")
        .populate("publishedBy", "name")
        .populate("submittedBy", "name");

    if (!reportCard) {
        return res.status(404).json({
            status: "failed",
            message: "Report card not found for this academic term.",
        });
    }

    // MANDATORY WORKFLOW RULE: Student and parent CANNOT view report card until Admin officially publishes!
    const isOfficiallyPublished =
        reportCard.published === true &&
        reportCard.status === "published";

    if (!isOfficiallyPublished) {
        return res.status(403).json({
            status: "failed",
            message: "This report card is currently undergoing review and has not yet been officially published by school administration.",
        });
    }

    await syncMissingReportCardSubjects(reportCard, studentObjectIds[0]);

    res.status(200).json({
        status: "Success",
        message: "Term report card retrieved successfully",
        data: reportCard,
    });
});

//@desc Get dynamic complete report card for a single student (generated directly from subject results)
//@route GET /api/v1/report-cards/student/:studentId/full-report
//@access Private (Teacher, Admin, or Student if published)
exports.getStudentFullReportCardCtrl = AsyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { academicYearId, academicTermId, classLevelId } = req.query;

    const studentDoc = await Student.findOne({
        $or: [
            { _id: mongoose.Types.ObjectId.isValid(studentId) ? studentId : null },
            { StudentId: studentId },
        ].filter((c) => c._id !== null || c.StudentId !== null),
    })
        .populate("program", "name code subjects")
        .populate("enrolledSubjects.subject", "name classLevel teacher");

    if (!studentDoc) {
        return res.status(404).json({ status: "failed", message: `Student "${studentId}" not found.` });
    }

    // Resolve Academic Year
    let yearDoc = null;
    if (academicYearId) {
        yearDoc = await AcademicYear.findById(academicYearId);
    }
    if (!yearDoc) {
        yearDoc = (await AcademicYear.findOne({ isAcademicYear: true })) || (await AcademicYear.findOne());
    }

    // Resolve Academic Term
    let termDoc = null;
    if (academicTermId) {
        termDoc = await AcademicTerm.findById(academicTermId);
    }
    if (!termDoc) {
        termDoc = (await AcademicTerm.findOne({ isCurrent: true })) || (await AcademicTerm.findOne());
    }

    // Resolve Class Level
    let classDoc = null;
    if (classLevelId) {
        classDoc = await ClassLevel.findById(classLevelId).populate("subjects");
    }
    if (!classDoc) {
        const studentClass = studentDoc.currentClassLevel;
        if (studentClass) {
            classDoc = await ClassLevel.findOne({
                $or: [
                    { name: studentClass },
                    ...(mongoose.Types.ObjectId.isValid(studentClass) ? [{ _id: studentClass }] : []),
                ],
            }).populate("subjects");
        }
        if (!classDoc) {
            classDoc = (await ClassLevel.findOne())?.populate("subjects");
        }
    }

    // 1. Resolve student's registered subjects
    const regSubjectsMap = new Map();

    if (Array.isArray(studentDoc.enrolledSubjects) && studentDoc.enrolledSubjects.length > 0) {
        studentDoc.enrolledSubjects.forEach((es) => {
            if (es.subject && es.subject._id) {
                regSubjectsMap.set(es.subject._id.toString(), es.subject);
            }
        });
    }

    if (studentDoc.subject) {
        const subDoc = await Subject.findOne({
            name: { $regex: new RegExp(`^${studentDoc.subject.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i") },
        }).populate("teacher", "name");
        if (subDoc) {
            regSubjectsMap.set(subDoc._id.toString(), subDoc);
        }
    }

    if (regSubjectsMap.size === 0 && classDoc && Array.isArray(classDoc.subjects) && classDoc.subjects.length > 0) {
        classDoc.subjects.forEach((s) => {
            regSubjectsMap.set(s._id.toString(), s);
        });
    }

    if (regSubjectsMap.size === 0) {
        const fallbackSubs = await Subject.find().limit(12).populate("teacher", "name");
        fallbackSubs.forEach((s) => regSubjectsMap.set(s._id.toString(), s));
    }

    let registeredSubjectDocs = Array.from(regSubjectsMap.values());

    // 2. Query StudentSubjectResult for this student + year + term
    const subjectResultsQuery = {
        student: studentDoc._id,
        academicYear: yearDoc?._id,
        academicTerm: termDoc?._id,
    };
    if (classDoc?._id) {
        subjectResultsQuery.classLevel = classDoc._id;
    }

    const recordedResults = await StudentSubjectResult.find(subjectResultsQuery)
        .populate("subject", "name teacher")
        .populate("recordedBy", "name email");

    // 3. Query existing StudentReportCard
    const reportCardQuery = {
        student: studentDoc._id,
        academicYear: yearDoc?._id,
        academicTerm: termDoc?._id,
    };
    if (classDoc?._id) reportCardQuery.classLevel = classDoc._id;
    const existingCard = await StudentReportCard.findOne(reportCardQuery)
        .populate("approvedBy", "name email")
        .populate("publishedBy", "name email")
        .populate("submittedBy", "name email");

    let resolvedTeacherName = existingCard?.submittedBy?.name || null;
    if (!resolvedTeacherName && classDoc?._id) {
        const cta = await ClassTeacherAssignment.findOne({
            classLevel: classDoc._id,
            isActive: true,
            ...(studentDoc.program ? { program: studentDoc.program } : {}),
        }).populate("teacher", "name");
        if (cta?.teacher?.name) {
            resolvedTeacherName = cta.teacher.name;
        } else {
            const fallbackCta = await ClassTeacherAssignment.findOne({
                classLevel: classDoc._id,
                isActive: true,
            }).populate("teacher", "name");
            if (fallbackCta?.teacher?.name) {
                resolvedTeacherName = fallbackCta.teacher.name;
            }
        }
    }

    // Enforce student & parent publication rule: Cannot see until Admin approves!
    if (["student", "parent"].includes(req.userAuth?.role)) {
        const isApproved = existingCard && (existingCard.published || existingCard.status === "approved" || existingCard.status === "published" || Boolean(existingCard.approvedBy));
        if (!isApproved) {
            return res.status(403).json({
                status: "failed",
                message: "Your report card for this term has not been officially approved or published by school administration yet.",
            });
        }
    }

    // Also include any subjects present in recordedResults or existingCard.subjectResults
    recordedResults.forEach((r) => {
        const sId = (r.subject?._id || r.subject)?.toString();
        if (sId && !regSubjectsMap.has(sId)) {
            regSubjectsMap.set(sId, {
                _id: r.subject?._id || r.subject,
                name: r.subjectName || r.subject?.name || "Subject",
                teacher: r.recordedBy,
            });
        }
    });

    if (existingCard && Array.isArray(existingCard.subjectResults)) {
        existingCard.subjectResults.forEach((cr) => {
            const sId = cr.subject?.toString();
            if (sId && !regSubjectsMap.has(sId)) {
                regSubjectsMap.set(sId, {
                    _id: cr.subject,
                    name: cr.subjectName || "Subject",
                });
            }
        });
    }

    registeredSubjectDocs = Array.from(regSubjectsMap.values());

    // 4. Construct complete subject rows with teacher names and Pending state
    const tableRows = [];
    let totalScoreSum = 0;
    let submittedCount = 0;

    for (const sub of registeredSubjectDocs) {
        const subIdStr = sub._id.toString();
        const subName = sub.name || "Subject";

        // Find match in StudentSubjectResult
        const recordedMatch = recordedResults.find(
            (r) => (r.subject?._id || r.subject)?.toString() === subIdStr ||
                   (r.subjectName && r.subjectName.toLowerCase() === subName.toLowerCase())
        );

        let teacherName = "Subject Teacher";
        if (recordedMatch?.recordedBy?.name) {
            teacherName = recordedMatch.recordedBy.name;
        } else if (sub.teacher && typeof sub.teacher === "object" && sub.teacher.name) {
            teacherName = sub.teacher.name;
        } else if (sub.teacher) {
            const tDoc = await Teacher.findById(sub.teacher).select("name");
            if (tDoc?.name) teacherName = tDoc.name;
        }

        if (recordedMatch) {
            submittedCount++;
            totalScoreSum += (recordedMatch.totalScore || 0);
            tableRows.push({
                subjectId: sub._id,
                subjectName: subName,
                testScore: recordedMatch.testScore,
                examScore: recordedMatch.examScore,
                totalScore: recordedMatch.totalScore,
                grade: recordedMatch.grade,
                letterGrade: getLetterGrade(recordedMatch.grade),
                remark: recordedMatch.remark || getSubjectRemark(recordedMatch.grade),
                subjectTeacher: teacherName,
                status: "Submitted",
                resultId: recordedMatch._id,
            });
        } else {
            // Check if existing reportCard has this subject
            const cardMatch = existingCard?.subjectResults?.find(
                (cr) => (cr.subject?.toString() === subIdStr) || (cr.subjectName && cr.subjectName.toLowerCase() === subName.toLowerCase())
            );

            if (cardMatch && (cardMatch.testScore !== null || cardMatch.examScore !== null || cardMatch.score > 0)) {
                submittedCount++;
                const tot = cardMatch.score !== undefined ? cardMatch.score : cardMatch.totalScore;
                totalScoreSum += (tot || 0);
                tableRows.push({
                    subjectId: sub._id,
                    subjectName: subName,
                    testScore: cardMatch.testScore !== undefined ? cardMatch.testScore : null,
                    examScore: cardMatch.examScore !== undefined ? cardMatch.examScore : cardMatch.score,
                    totalScore: tot,
                    grade: cardMatch.grade,
                    letterGrade: cardMatch.letterGrade || getLetterGrade(cardMatch.grade),
                    remark: cardMatch.remarks || getSubjectRemark(cardMatch.grade),
                    subjectTeacher: teacherName,
                    status: "Submitted",
                    resultId: cardMatch._id,
                });
            } else {
                tableRows.push({
                    subjectId: sub._id,
                    subjectName: subName,
                    testScore: null,
                    examScore: null,
                    totalScore: null,
                    grade: null,
                    letterGrade: "—",
                    remark: "Pending",
                    subjectTeacher: teacherName,
                    status: "Pending",
                    resultId: null,
                });
            }
        }
    }

    const totalRegisteredSubjects = tableRows.length;
    const pendingSubjectsCount = totalRegisteredSubjects - submittedCount;
    const isFullySubmitted = totalRegisteredSubjects > 0 && submittedCount === totalRegisteredSubjects;

    // Calculate average ONLY when all required subjects have valid submitted results!
    const averageScore = isFullySubmitted && totalRegisteredSubjects > 0
        ? Number((totalScoreSum / totalRegisteredSubjects).toFixed(1))
        : null;

    const evaluation = averageScore !== null ? getOverallEvaluation(averageScore) : null;

    const responseCard = {
        _id: existingCard?._id || null,
        student: {
            _id: studentDoc._id,
            name: studentDoc.name,
            StudentId: studentDoc.StudentId,
            email: studentDoc.email,
            currentClassLevel: classDoc?.name || studentDoc.currentClassLevel,
            program: studentDoc.program,
        },
        studentID: studentDoc.StudentId,
        academicYear: yearDoc,
        academicTerm: termDoc,
        classLevel: classDoc,
        subjectResults: tableRows,
        totalScore: totalScoreSum,
        totalMaxScore: totalRegisteredSubjects * 100,
        averageScore,
        overallGrade: evaluation ? evaluation.grade : "—",
        overallRemark: evaluation ? evaluation.remark : (isFullySubmitted ? "Complete" : `${pendingSubjectsCount} Pending Subjects`),
        position: existingCard?.position || null,
        positionFormatted: existingCard?.positionFormatted || (existingCard?.position ? getOrdinal(existingCard.position) : "—"),
        totalStudents: existingCard?.totalStudents || 0,
        teacherComment: existingCard?.teacherComment || (averageScore !== null ? getDefaultTeacherComment(averageScore) : ""),
        principalComment: existingCard?.principalComment || (averageScore !== null ? getDefaultPrincipalComment(averageScore) : ""),
        promoted: existingCard?.promoted || (averageScore !== null && averageScore >= 50),
        promotionStatus: existingCard?.promotionStatus || (averageScore !== null && averageScore >= 50 ? "Promoted" : "Pending"),
        status: existingCard?.status || (isFullySubmitted ? "ready" : "draft"),
        published: existingCard?.published || false,
        publishedAt: existingCard?.publishedAt || null,
        approvedAt: existingCard?.approvedAt || null,
        approvedBy: existingCard?.approvedBy || null,
        submittedAt: existingCard?.submittedAt || null,
        submittedBy: existingCard?.submittedBy || (resolvedTeacherName ? { name: resolvedTeacherName } : null),
        attendance: existingCard?.attendance || { daysOpened: 65, daysPresent: 60, daysAbsent: 5 },
        traits: existingCard?.traits || { punctuality: "Good", attentiveness: "Good", neatness: "Good", politeness: "Good", teamwork: "Good" },
        nextTermBegins: existingCard?.nextTermBegins || null,
        progress: {
            totalRegisteredSubjects,
            submittedCount,
            pendingSubjectsCount,
            isFullySubmitted,
            completionPercentage: totalRegisteredSubjects > 0 ? Math.round((submittedCount / totalRegisteredSubjects) * 100) : 0,
        },
    };

    res.status(200).json({
        status: "Success",
        message: "Student full report card fetched successfully",
        data: responseCard,
    });
});

//@desc Get single report card by ID (Teacher or Admin)
//@route GET /api/v1/report-cards/:id
//@access Private (Teacher or Admin)
exports.getSingleReportCardByIdCtrl = AsyncHandler(async (req, res) => {
    const card = await StudentReportCard.findById(req.params.id)
        .populate("student", "name email StudentId currentClassLevel program dateAdmitted")
        .populate("academicYear", "name")
        .populate("academicTerm", "name")
        .populate("classLevel", "name")
        .populate("approvedBy", "name email")
        .populate("publishedBy", "name email")
        .populate("submittedBy", "name email");

    if (!card) {
        return res.status(404).json({ status: "failed", message: "Report card not found" });
    }

    res.status(200).json({
        status: "Success",
        message: "Report card retrieved successfully",
        data: card,
    });
});

//@desc Student view latest published report card (Section 21 & 26: GET /api/v1/report-cards/student/report-card)
//@route GET /api/v1/report-cards/student/report-card
//@desc Student or Parent view latest published report card (Section 21 & 26: GET /api/v1/report-cards/student/report-card)
//@route GET /api/v1/report-cards/student/report-card
//@access Private (Student or Parent)
exports.getStudentLatestReportCardCtrl = AsyncHandler(async (req, res) => {
    let studentDoc = null;

    if (req.userAuth?.role === "parent") {
        const Parent = require("../../models/Staff/Parent");
        const parent = await Parent.findById(req.userAuth._id);
        if (!parent || !parent.children || parent.children.length === 0) {
            return res.status(404).json({ status: "failed", message: "No linked children found for this parent." });
        }
        const targetChildId = req.query.studentId;
        if (targetChildId && targetChildId !== "all") {
            const match = parent.children.find((c) => c.toString() === targetChildId.toString());
            if (!match) {
                return res.status(403).json({ status: "failed", message: "Unauthorized access to this student's report card." });
            }
            studentDoc = await Student.findById(match);
        } else {
            studentDoc = await Student.findById(parent.children[0]);
        }
    } else {
        studentDoc = await Student.findById(req.userAuth?._id);
    }

    if (!studentDoc) {
        return res.status(404).json({ status: "failed", message: "Student account not found." });
    }

    const studentMatchConditions = [{ student: studentDoc._id }];
    if (studentDoc.StudentId) {
        studentMatchConditions.push({ studentID: studentDoc.StudentId });
    }
    if (studentDoc.studentId) {
        studentMatchConditions.push({ studentID: studentDoc.studentId });
    }

    // MANDATORY WORKFLOW RULE: Student and Parent CAN ONLY see report cards that have been approved or published by Admin!
    const reportCard = await StudentReportCard.findOne({
        $and: [
            { $or: studentMatchConditions },
            {
                $or: [
                    { published: true },
                    { status: "published" },
                    { status: "approved" },
                    { approvedBy: { $exists: true, $ne: null } }
                ]
            }
        ]
    })
        .populate("student", "name email StudentId currentClassLevel program dateAdmitted")
        .populate("academicYear", "name")
        .populate("academicTerm", "name")
        .populate("classLevel", "name")
        .populate("approvedBy", "name")
        .populate("publishedBy", "name")
        .populate("submittedBy", "name")
        .sort({ createdAt: -1 });

    if (!reportCard) {
        return res.status(403).json({
            status: "failed",
            message: "Report card has not yet been approved or published by school administration.",
        });
    }

    await syncMissingReportCardSubjects(reportCard, studentDoc._id);

    res.status(200).json({
        status: "Success",
        message: "Latest report card retrieved successfully",
        data: reportCard,
    });
});

//@desc Get a student's recorded subjects for a term (Teacher or Admin)
//@route GET /api/v1/report-cards/student/:studentId/subjects
//@access Private (Teacher or Admin)
exports.getStudentExistingSubjectResultsCtrl = AsyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { academicYearId, academicTermId } = req.query;

    const studentDoc = await Student.findOne({
        $or: [
            { _id: mongoose.Types.ObjectId.isValid(studentId) ? studentId : null },
            { StudentId: studentId },
        ].filter((c) => c._id !== null || c.StudentId !== null),
    })
        .populate("program", "name code")
        .populate("enrolledSubjects.subject");

    if (!studentDoc) {
        return res.status(404).json({
            status: "failed",
            message: `Student with identifier "${studentId}" was not found.`,
        });
    }

    let yearId = academicYearId;
    let termId = academicTermId;

    if (!yearId) {
        const activeYear = (await AcademicYear.findOne({ isCurrent: true })) || (await AcademicYear.findOne());
        yearId = activeYear?._id;
    }
    if (!termId) {
        const activeTerm = (await AcademicTerm.findOne({ isCurrent: true })) || (await AcademicTerm.findOne());
        termId = activeTerm?._id;
    }

    // 1. Fetch from StudentSubjectResult
    const filter = { student: studentDoc._id };
    if (yearId) filter.academicYear = yearId;
    if (termId) filter.academicTerm = termId;

    const subjectResults = await StudentSubjectResult.find(filter).populate("subject", "name").sort({ createdAt: 1 });

    // 2. Also check if StudentReportCard has additional subjects
    const reportCard = await StudentReportCard.findOne({
        student: studentDoc._id,
        ...(yearId ? { academicYear: yearId } : {}),
        ...(termId ? { academicTerm: termId } : {}),
    });

    const combinedMap = new Map();

    // Fill from StudentSubjectResult
    subjectResults.forEach((sr) => {
        const key = (sr.subjectName || sr.subject?.name || "").trim().toLowerCase();
        if (key) {
            combinedMap.set(key, {
                _id: sr._id,
                subjectId: sr.subject?._id || sr.subject,
                subjectName: sr.subjectName || sr.subject?.name || "Subject",
                testScore: sr.testScore !== undefined ? sr.testScore : null,
                examScore: sr.examScore !== undefined ? sr.examScore : null,
                totalScore: sr.totalScore !== undefined ? sr.totalScore : null,
                grade: sr.grade !== undefined ? sr.grade : null,
                remark: sr.remark || getSubjectRemark(sr.grade || 0),
                recordedBy: sr.recordedBy,
                status: sr.status || "saved",
            });
        }
    });

    // Fill from report card if not already present
    if (reportCard && Array.isArray(reportCard.subjectResults)) {
        reportCard.subjectResults.forEach((sr) => {
            const key = (sr.subjectName || "").trim().toLowerCase();
            if (key && !combinedMap.has(key)) {
                combinedMap.set(key, {
                    _id: sr._id,
                    subjectId: sr.subject,
                    subjectName: sr.subjectName || "Subject",
                    testScore: sr.testScore !== undefined ? sr.testScore : null,
                    examScore: sr.examScore !== undefined ? sr.examScore : sr.score,
                    totalScore: sr.score !== undefined ? sr.score : sr.totalScore,
                    grade: sr.grade !== undefined ? sr.grade : sr.score,
                    remark: sr.remarks || getSubjectRemark(sr.grade || sr.score || 0),
                    status: sr.status || "saved",
                });
            }
        });
    }

    // 3. Also include student's direct subject and all enrolled subjects if not yet in combinedMap
    if (studentDoc.subject) {
        const key = studentDoc.subject.trim().toLowerCase();
        if (key && !combinedMap.has(key)) {
            const subDoc = await Subject.findOne({
                name: { $regex: new RegExp(`^${key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i") },
            });
            combinedMap.set(key, {
                _id: subDoc?._id || new mongoose.Types.ObjectId(),
                subjectId: subDoc?._id || null,
                subjectName: subDoc?.name || studentDoc.subject,
                testScore: null,
                examScore: null,
                totalScore: null,
                grade: null,
                remark: "Poor",
                isExisting: false,
                status: "draft",
            });
        }
    }

    if (Array.isArray(studentDoc.enrolledSubjects)) {
        for (const item of studentDoc.enrolledSubjects) {
            if (!item || !item.subject) continue;
            const subObj = item.subject;
            const subName = (subObj.name || "").trim();
            const key = subName.toLowerCase();
            if (key && !combinedMap.has(key)) {
                combinedMap.set(key, {
                    _id: subObj._id,
                    subjectId: subObj._id,
                    subjectName: subName,
                    testScore: null,
                    examScore: null,
                    totalScore: null,
                    grade: null,
                    remark: "Poor",
                    isExisting: false,
                    status: "draft",
                });
            }
        }
    }

    const subjectsList = Array.from(combinedMap.values());

    let grandTotal = 0;
    let validSubjectCount = 0;
    subjectsList.forEach((s) => {
        if (s.totalScore !== null && !isNaN(s.totalScore)) {
            grandTotal += Number(s.totalScore);
            validSubjectCount++;
        }
    });

    const averagePercentage = validSubjectCount > 0 ? Number((grandTotal / validSubjectCount).toFixed(1)) : 0;

    res.status(200).json({
        status: "Success",
        data: {
            student: studentDoc,
            subjects: subjectsList,
            grandTotal,
            totalMaxMarks: validSubjectCount * 100,
            averagePercentage,
            reportCard: reportCard || null,
        },
    });
});

//@desc Save multiple student subjects in student's report table (Teacher or Admin)
//@route POST /api/v1/report-cards/student/save-subjects
//@access Private (Teacher or Admin)
exports.saveStudentMultiSubjectResultsCtrl = AsyncHandler(async (req, res) => {
    const { studentId, academicYearId, academicTermId, classLevelId, subjects } = req.body;

    if (!studentId) {
        return res.status(400).json({ status: "failed", message: "studentId is required." });
    }
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
        return res.status(400).json({ status: "failed", message: "Please provide an array of subject scores." });
    }

    const studentDoc = await Student.findOne({
        $or: [
            { _id: mongoose.Types.ObjectId.isValid(studentId) ? studentId : null },
            { StudentId: studentId },
        ].filter((c) => c._id !== null || c.StudentId !== null),
    }).populate("program", "name code");

    if (!studentDoc) {
        return res.status(404).json({ status: "failed", message: `Student with identifier "${studentId}" was not found.` });
    }

    let yearId = academicYearId;
    let termId = academicTermId;
    let cLevelId = classLevelId;

    if (!yearId) {
        const activeYear = (await AcademicYear.findOne({ isCurrent: true })) || (await AcademicYear.findOne());
        yearId = activeYear?._id;
    }
    if (!termId) {
        const activeTerm = (await AcademicTerm.findOne({ isCurrent: true })) || (await AcademicTerm.findOne());
        termId = activeTerm?._id;
    }
    if (!cLevelId) {
        let classDoc = null;
        if (studentDoc.currentClassLevel) {
            classDoc = await ClassLevel.findOne({
                name: { $regex: new RegExp(`^${studentDoc.currentClassLevel.trim()}$`, "i") },
            });
        }
        cLevelId = classDoc?._id;
    }

    const validationErrors = [];
    const savedSubjectRecords = [];

    for (const item of subjects) {
        const subjectName = (item.subjectName || "").trim();
        const testScore = item.testScore;
        const examScore = item.examScore;

        if (!subjectName) {
            continue; // Skip rows without a subject name
        }

        const numTest = Number(testScore);
        const numExam = Number(examScore);

        if (isNaN(numTest) || numTest < 0 || numTest > 30) {
            validationErrors.push(`${subjectName}: Test score must be between 0 and 30 marks (received: ${testScore}).`);
            continue;
        }
        if (isNaN(numExam) || numExam < 0 || numExam > 70) {
            validationErrors.push(`${subjectName}: Exam score must be between 0 and 70 marks (received: ${examScore}).`);
            continue;
        }

        const totalScore = numTest + numExam;
        const grade = totalScore;
        const remark = getSubjectRemark(grade);
        const letterGrade = getLetterGrade(grade);
        const status = grade >= 40 ? "Passed" : "Failed";

        // Find or create subject doc
        let resolvedSubject = null;
        if (item.subjectId && mongoose.Types.ObjectId.isValid(item.subjectId)) {
            resolvedSubject = await Subject.findById(item.subjectId);
        }
        if (!resolvedSubject) {
            resolvedSubject = await Subject.findOne({
                name: { $regex: new RegExp(`^${subjectName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i") },
            });
        }

        // Upsert into StudentSubjectResult
        const subjectResultQuery = {
            student: studentDoc._id,
            ...(yearId ? { academicYear: yearId } : {}),
            ...(termId ? { academicTerm: termId } : {}),
            ...(cLevelId ? { classLevel: cLevelId } : {}),
            ...(resolvedSubject ? { subject: resolvedSubject._id } : { subjectName: subjectName }),
        };

        const updatedResult = await StudentSubjectResult.findOneAndUpdate(
            subjectResultQuery,
            {
                $set: {
                    student: studentDoc._id,
                    studentID: studentDoc.StudentId,
                    academicYear: yearId,
                    academicTerm: termId,
                    classLevel: cLevelId,
                    subject: resolvedSubject?._id || null,
                    subjectName: resolvedSubject?.name || subjectName,
                    testScore: numTest,
                    examScore: numExam,
                    totalScore,
                    grade,
                    remark,
                    recordedBy: req.userAuth?._id,
                    recordedAt: new Date(),
                    status: "saved",
                },
            },
            { upsert: true, new: true, runValidators: true }
        );

        savedSubjectRecords.push(updatedResult);
    }

    if (validationErrors.length > 0 && savedSubjectRecords.length === 0) {
        return res.status(400).json({
            status: "failed",
            message: "Validation failed for entered subjects.",
            errors: validationErrors,
        });
    }

    // Now sync all recorded subjects into StudentReportCard
    let reportCard = await StudentReportCard.findOne({
        student: studentDoc._id,
        ...(yearId ? { academicYear: yearId } : {}),
        ...(termId ? { academicTerm: termId } : {}),
        ...(cLevelId ? { classLevel: cLevelId } : {}),
    });

    if (!reportCard) {
        reportCard = new StudentReportCard({
            student: studentDoc._id,
            studentID: studentDoc.StudentId,
            academicYear: yearId,
            academicTerm: termId,
            classLevel: cLevelId,
            subjectResults: [],
            status: "saved",
            published: false,
        });
    }

    // Fetch all current subject results for this student from DB to ensure complete sync
    const allStudentSubjects = await StudentSubjectResult.find({
        student: studentDoc._id,
        ...(yearId ? { academicYear: yearId } : {}),
        ...(termId ? { academicTerm: termId } : {}),
    });

    reportCard.subjectResults = allStudentSubjects.map((s) => ({
        subject: s.subject,
        subjectName: s.subjectName,
        testScore: s.testScore,
        examScore: s.examScore,
        score: s.totalScore,
        totalMark: 100,
        grade: s.grade,
        letterGrade: getLetterGrade(s.grade),
        remarks: s.remark,
        status: s.grade >= 40 ? "Passed" : "Failed",
    }));

    // Calculate grand total, total max marks, and average percentage
    let grandTotal = 0;
    reportCard.subjectResults.forEach((sr) => {
        grandTotal += Number(sr.score || sr.totalScore || 0);
    });

    const subjectCount = reportCard.subjectResults.length;
    const averageScore = subjectCount > 0 ? Number((grandTotal / subjectCount).toFixed(1)) : 0;

    reportCard.totalScore = grandTotal;
    reportCard.totalMaxScore = subjectCount * 100;
    reportCard.averageScore = averageScore;
    reportCard.overallGrade = getLetterGrade(averageScore);
    reportCard.overallRemark = getSubjectRemark(averageScore);
    if (["draft", "calculated"].includes(reportCard.status)) {
        reportCard.status = "saved";
    }

    await reportCard.save();

    // Recalculate cohort ranking if classLevel is present
    if (cLevelId && yearId && termId) {
        const cohort = await StudentReportCard.find({
            classLevel: cLevelId,
            academicYear: yearId,
            academicTerm: termId,
        }).sort({ averageScore: -1 });

        let currentRank = 1;
        for (let i = 0; i < cohort.length; i++) {
            if (i > 0 && cohort[i].averageScore < cohort[i - 1].averageScore) {
                currentRank = i + 1;
            }
            cohort[i].position = currentRank;
            cohort[i].positionFormatted = getOrdinal(currentRank);
            cohort[i].totalStudents = cohort.length;
            await cohort[i].save();
            if (cohort[i]._id.toString() === reportCard._id.toString()) {
                reportCard.position = currentRank;
                reportCard.positionFormatted = getOrdinal(currentRank);
                reportCard.totalStudents = cohort.length;
            }
        }
    }

    res.status(200).json({
        status: "Success",
        message: `Successfully saved ${savedSubjectRecords.length} subject results for ${studentDoc.name}.`,
        data: {
            reportCard,
            subjectResults: allStudentSubjects,
            grandTotal,
            totalMaxMarks: subjectCount * 100,
            averagePercentage: averageScore,
            errors: validationErrors.length > 0 ? validationErrors : undefined,
        },
    });
});


