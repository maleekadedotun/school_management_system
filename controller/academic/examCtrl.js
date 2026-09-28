const AsyncHandler = require("express-async-handler");
const Teacher = require("../../models/Staff/Teacher");
const Admin = require("../../models/Staff/admin");
const Exam = require("../../models/Academy/Exam");
const Subject = require("../../models/Academy/Subject");
const ClassLevel = require("../../models/Academy/ClassLevel");
const Program = require("../../models/Academy/program");
const AcademicTerm = require("../../models/Academy/AcademicTerm");
const AcademicYear = require("../../models/Academy/AcademicYear");
const Question = require("../../models/Academy/Question");


//@desc create exam
//@route POST /api/v1/exams
//@access teacher and admin

exports.createExamCtrl = AsyncHandler(async(req, res) =>{
    const {
        name,
        description,
        subject,
        program,
        academicTerm, 
        duration,
        examDate,
        examTime,
        examType,
        classLevel,
        academicYear,
    } = req.body;

    // find teacher or admin
    let teacherFound = await Teacher.findById(req.userAuth?._id);
    let adminFound = null;
    if (!teacherFound) {
        adminFound = await Admin.findById(req.userAuth?._id);
    }
    
    if (!teacherFound && !adminFound) {
        throw new Error("Teacher or Administrator not found");
    }

    // check if exam exist
    const examExists = await Exam.findOne({name});
    if (examExists) {
        throw new Error("Exam already exists");
    }

    const examCreated = new Exam({
        name,
        description,
        subject,
        academicTerm, 
        academicYear,
        classLevel,
        duration,
        examDate,
        examTime,
        examType,
        program,
        createdBy: req.userAuth._id,
    });

    if (teacherFound) {
        teacherFound.examsCreated.push(examCreated?._id);
        await teacherFound.save();
    }

    // save exam
    await examCreated.save();

    res.status(201).json({
        status: "Success",
        message: "Exam created successfully",
        data: examCreated,
    });
});

// Helper to normalize class levels (e.g. "Level 200", "200 Level", "200L" -> "200")
const normalizeClassLevel = (val) => {
    if (!val) return "";
    const str = (val.name || val.title || val._id || val).toString().trim().toLowerCase();
    const num = str.match(/\d+/)?.[0];
    return num || str;
};

// Filter exams so a student sees ONLY exams matching:
// 1. Their class level
// 2. The subject(s) they are offering in their class OR under their assigned program
// 3. Their assigned teacher, program teacher, subject teacher, or school administration
const filterExamsForStudent = (exams, student) => {
    if (!student || !exams || !Array.isArray(exams)) return exams || [];

    const studentClassNorm = normalizeClassLevel(student.currentClassLevel);

    // Student program identifiers
    const studentProgId = student.program?._id
        ? student.program._id.toString()
        : (student.program ? student.program.toString() : null);
    const studentProgName = (student.program?.name || (typeof student.program === "string" ? student.program : "")).trim().toLowerCase();

    // Primary assigned teacher
    const primaryTeacherId = student.assignedTeacher?._id
        ? student.assignedTeacher._id.toString()
        : (student.assignedTeacher ? student.assignedTeacher.toString() : null);
    const primaryTeacherName = (student.assignedTeacher?.name || "").trim().toLowerCase();

    // Collect subjects the student is offering in their class or under their program
    const offeredSubjects = [];

    // 1. Primary subject
    if (student.subject) {
        const subName = (student.subject.name || student.subject).toString().trim().toLowerCase();
        const subId = student.subject._id ? student.subject._id.toString() : null;
        offeredSubjects.push({
            id: subId,
            nameNorm: subName,
            teacherIds: primaryTeacherId ? [primaryTeacherId] : [],
            teacherNames: primaryTeacherName ? [primaryTeacherName] : [],
        });
    }

    // 2. Enrolled subjects for this class level or program
    if (student.enrolledSubjects && Array.isArray(student.enrolledSubjects)) {
        for (const enr of student.enrolledSubjects) {
            const enrClassNorm = normalizeClassLevel(enr.classLevel);
            // Must match student's class level (or be general)
            if (!enrClassNorm || !studentClassNorm || enrClassNorm === studentClassNorm) {
                const sObj = enr.subject;
                if (!sObj) continue;
                const sId = sObj._id ? sObj._id.toString() : (sObj.toString().match(/^[0-9a-fA-F]{24}$/) ? sObj.toString() : null);
                const sName = (sObj.name || sObj).toString().trim().toLowerCase();

                const sTeacherId = sObj.teacher?._id ? sObj.teacher._id.toString() : (sObj.teacher ? sObj.teacher.toString() : null);
                const sTeacherName = (sObj.teacher?.name || "").trim().toLowerCase();

                const teacherIds = [];
                const teacherNames = [];
                if (sTeacherId) teacherIds.push(sTeacherId);
                if (sTeacherName) teacherNames.push(sTeacherName);
                if (primaryTeacherId && !teacherIds.includes(primaryTeacherId)) teacherIds.push(primaryTeacherId);
                if (primaryTeacherName && !teacherNames.includes(primaryTeacherName)) teacherNames.push(primaryTeacherName);

                offeredSubjects.push({
                    id: sId,
                    nameNorm: sName,
                    teacherIds,
                    teacherNames,
                });
            }
        }
    }

    // 3. If student.program has subjects array populated
    if (student.program && Array.isArray(student.program.subjects)) {
        for (const pSub of student.program.subjects) {
            if (!pSub) continue;
            const pId = pSub._id ? pSub._id.toString() : (pSub.toString().match(/^[0-9a-fA-F]{24}$/) ? pSub.toString() : null);
            const pName = (pSub.name || pSub).toString().trim().toLowerCase();
            const pTeacherId = pSub.teacher?._id ? pSub.teacher._id.toString() : (pSub.teacher ? pSub.teacher.toString() : null);
            const pTeacherName = (pSub.teacher?.name || "").trim().toLowerCase();

            const teacherIds = [];
            const teacherNames = [];
            if (pTeacherId) teacherIds.push(pTeacherId);
            if (pTeacherName) teacherNames.push(pTeacherName);
            if (primaryTeacherId && !teacherIds.includes(primaryTeacherId)) teacherIds.push(primaryTeacherId);
            if (primaryTeacherName && !teacherNames.includes(primaryTeacherName)) teacherNames.push(primaryTeacherName);

            offeredSubjects.push({
                id: pId,
                nameNorm: pName,
                teacherIds,
                teacherNames,
            });
        }
    }

    return exams.filter((exam) => {
        // --- Condition 1: Class level match ---
        const examClassNorm = normalizeClassLevel(exam.classLevel);
        if (studentClassNorm && examClassNorm && studentClassNorm !== examClassNorm) {
            return false;
        }

        // --- Condition 2: Subject offering / Program match ---
        const examSubId = exam.subject?._id ? exam.subject._id.toString() : (exam.subject ? exam.subject.toString() : "");
        const examSubName = (exam.subject?.name || exam.subject || "").toString().trim().toLowerCase();

        // Check if exam is under student's assigned program
        const examProgId = exam.program?._id ? exam.program._id.toString() : (exam.program ? exam.program.toString() : "");
        const examProgName = (exam.program?.name || exam.program || "").toString().trim().toLowerCase();
        const subProgId = exam.subject?.program?._id ? exam.subject.program._id.toString() : (exam.subject?.program ? exam.subject.program.toString() : "");
        const subProgName = (exam.subject?.program?.name || exam.subject?.program || "").toString().trim().toLowerCase();

        const isUnderStudentProgram = Boolean(
            (studentProgId && (studentProgId === examProgId || studentProgId === subProgId)) ||
            (studentProgName && (studentProgName === examProgName || studentProgName === subProgName))
        );

        const matchedOffered = offeredSubjects.find((os) => {
            const idMatch = os.id && examSubId && os.id === examSubId;
            const nameMatch = os.nameNorm && examSubName && (os.nameNorm === examSubName || examSubName.includes(os.nameNorm) || os.nameNorm.includes(examSubName));
            return idMatch || nameMatch;
        });

        if (!matchedOffered && !isUnderStudentProgram) {
            return false;
        }

        // --- Condition 3: Assigned Teacher / Authority match ---
        const examCreatorId = exam.createdBy?._id ? exam.createdBy._id.toString() : (exam.createdBy ? exam.createdBy.toString() : "");
        const examCreatorName = (exam.createdBy?.name || "").trim().toLowerCase();
        const examCreatorRole = (exam.createdBy?.role || "").toLowerCase();

        // Admin exams are ALWAYS open to eligible students
        const isAdminExam = examCreatorRole === "admin" || examCreatorName.includes("administration") || (!examCreatorId && !examCreatorName);

        // If the subject is part of the student's assigned program, allow exam created by any teacher assigned to that program or subject
        if (isUnderStudentProgram || isAdminExam) {
            return true;
        }

        const isAssignedTeacher =
            (matchedOffered && examCreatorId && matchedOffered.teacherIds.includes(examCreatorId)) ||
            (matchedOffered && examCreatorName && matchedOffered.teacherNames.some(tn => tn && (tn === examCreatorName || examCreatorName.includes(tn) || tn.includes(examCreatorName)))) ||
            (primaryTeacherId && examCreatorId && examCreatorId === primaryTeacherId) ||
            (primaryTeacherName && examCreatorName && (examCreatorName === primaryTeacherName || examCreatorName.includes(primaryTeacherName) || primaryTeacherName.includes(examCreatorName))) ||
            (!primaryTeacherId && !matchedOffered?.teacherIds?.length);

        return isAssignedTeacher;
    });
};

exports.filterExamsForStudent = filterExamsForStudent;
exports.normalizeClassLevel = normalizeClassLevel;

//@desc  GET all exams
//@route GET /api/v1/exams
//@access all authenticated staff, teachers, and students

exports.fetchAllExamsCtrl = AsyncHandler(async(req, res) => {
    const rawExams = await Exam.find()
        .populate({
            path: "questions",
            populate: {
                path: "createdBy"
            },
        })
        .populate("subject program academicTerm classLevel academicYear")
        .sort({ createdAt: -1 })
        .lean();

    // Populate createdBy from either Teacher or Admin
    let exams = await Promise.all(
        rawExams.map(async (exam) => {
            if (!exam.createdBy) {
                return {
                    ...exam,
                    createdBy: {
                        name: "School Administration",
                        role: "admin",
                    },
                };
            }

            const teacher = await Teacher.findById(exam.createdBy).select("name email teacherId role subject classLevel").lean();
            if (teacher) {
                return {
                    ...exam,
                    createdBy: {
                        ...teacher,
                        role: teacher.role || "teacher",
                    },
                };
            }

            const admin = await Admin.findById(exam.createdBy).select("name email role").lean();
            if (admin) {
                return {
                    ...exam,
                    createdBy: {
                        ...admin,
                        role: "admin",
                    },
                };
            }

            return {
                ...exam,
                createdBy: {
                    _id: exam.createdBy,
                    name: "School Administration",
                    role: "admin",
                },
            };
        })
    );

    // Identify if requester is a student
    const Student = require("../../models/Academy/Student");
    const verifyToken = require("../../utils/verifyToken");

    let studentRequester = null;

    // Check req.userAuth (if auth middleware was applied)
    if (req.userAuth && (req.userAuth.role === "student" || req.userAuth.StudentId || req.userAuth.classLevels)) {
        studentRequester = await Student.findById(req.userAuth._id || req.userAuth.id)
            .populate("program")
            .populate("assignedTeacher")
            .populate({
                path: "enrolledSubjects.subject",
                populate: { path: "teacher program" }
            })
            .lean();
    }

    // Check Authorization Bearer header
    if (!studentRequester && req.headers?.authorization) {
        const token = req.headers.authorization.split(" ")[1];
        if (token) {
            try {
                const decoded = verifyToken(token);
                if (decoded?.id) {
                    studentRequester = await Student.findById(decoded.id)
                        .populate("program")
                        .populate("assignedTeacher")
                        .populate({
                            path: "enrolledSubjects.subject",
                            populate: { path: "teacher program" }
                        })
                        .lean();
                }
            } catch (err) {
                // Not a valid student token
            }
        }
    }

    // Check query params (?studentId=... or ?studentID=...)
    if (!studentRequester && (req.query.studentId || req.query.studentID)) {
        const sId = req.query.studentId || req.query.studentID;
        studentRequester = await Student.findOne({
            $or: [
                { _id: sId.match(/^[0-9a-fA-F]{24}$/) ? sId : null },
                { StudentId: sId }
            ]
        })
        .populate("program")
        .populate("assignedTeacher")
        .populate({
            path: "enrolledSubjects.subject",
            populate: { path: "teacher program" }
        })
        .lean();
    }

    // If requester is a student: filter exams to only those set for their class, offering subject, and assigned teacher
    if (studentRequester) {
        // Auto-match teacher if student.assignedTeacher is not set in DB
        if (!studentRequester.assignedTeacher && studentRequester.subject) {
            const subRegex = new RegExp(`^${studentRequester.subject.toString().trim()}$`, "i");
            const matchedTeacher = await Teacher.findOne({
                $or: [{ subject: studentRequester.subject }, { subject: subRegex }]
            }).lean();
            if (matchedTeacher) {
                studentRequester.assignedTeacher = matchedTeacher;
            }
        }
        exams = filterExamsForStudent(exams, studentRequester);
    }

    res.status(200).json({
        status: "Success",
        message: "Exams fetched successfully",
        data: exams,
    });
});

//@desc  GET single exams
//@route GET /api/v1/exams/:id
//@access teacher, admin, and eligible student

exports.fetchExamCtrl = AsyncHandler(async(req, res) => {
    let exam = await Exam.findById(req.params.id)
        .populate("questions")
        .populate("subject program academicTerm classLevel academicYear")
        .lean();

    if (!exam) {
        throw new Error("Exam not found");
    }

    if (exam.createdBy) {
        const teacher = await Teacher.findById(exam.createdBy).select("name email teacherId role subject classLevel").lean();
        if (teacher) {
            exam.createdBy = { ...teacher, role: teacher.role || "teacher" };
        } else {
            const admin = await Admin.findById(exam.createdBy).select("name email role").lean();
            if (admin) {
                exam.createdBy = { ...admin, role: "admin" };
            } else {
                exam.createdBy = { _id: exam.createdBy, name: "School Administration", role: "admin" };
            }
        }
    } else {
        exam.createdBy = { name: "School Administration", role: "admin" };
    }

    // If requester is a student, ensure they are offering this subject with this assigned teacher in this class
    const Student = require("../../models/Academy/Student");
    const verifyToken = require("../../utils/verifyToken");
    let studentRequester = null;

    if (req.userAuth && (req.userAuth.role === "student" || req.userAuth.StudentId || req.userAuth.classLevels)) {
        studentRequester = await Student.findById(req.userAuth._id || req.userAuth.id)
            .populate("program")
            .populate("assignedTeacher")
            .populate({
                path: "enrolledSubjects.subject",
                populate: { path: "teacher program" }
            })
            .lean();
    } else if (req.headers?.authorization) {
        const token = req.headers.authorization.split(" ")[1];
        if (token) {
            try {
                const decoded = verifyToken(token);
                if (decoded?.id) {
                    studentRequester = await Student.findById(decoded.id)
                        .populate("program")
                        .populate("assignedTeacher")
                        .populate({
                            path: "enrolledSubjects.subject",
                            populate: { path: "teacher program" }
                        })
                        .lean();
                }
            } catch (err) {}
        }
    }

    if (studentRequester) {
        if (!studentRequester.assignedTeacher && studentRequester.subject) {
            const subRegex = new RegExp(`^${studentRequester.subject.toString().trim()}$`, "i");
            const matchedTeacher = await Teacher.findOne({
                $or: [{ subject: studentRequester.subject }, { subject: subRegex }]
            }).lean();
            if (matchedTeacher) {
                studentRequester.assignedTeacher = matchedTeacher;
            }
        }
        const allowed = filterExamsForStudent([exam], studentRequester);
        if (allowed.length === 0) {
            res.status(403);
            throw new Error("Access Denied: You can only access examinations set for your enrolled subject and assigned teacher in your class.");
        }
    }
    
    res.status(200).json({
        status: "Success",
        message: "Single exam fetched successfully",
        data: exam,
    });
});

//@desc update exam
//@route PUT /api/v1/exams/:id/update/teacher
//@access private

exports.updateExamCtrl = AsyncHandler(async(req, res) => {
    const {
        name,
        description,
        subject,
        program,
        academicTerm, 
        duration,
        examDate,
        examTime,
        examType,
        classLevel,
        academicYear,
    } = req.body;

    const existingExam = await Exam.findById(req.params.id);
    if (!existingExam) {
        throw new Error("Exam not found");
    }

    // check if already exist with different id
    if (name && name !== existingExam.name) {
        const examFound = await Exam.findOne({ name });
        if (examFound) {
            throw new Error("Exam already exists");
        }
    }

    const examUpdated = await Exam.findByIdAndUpdate(
        req.params.id,
        {
            name: name || existingExam.name,
            description: description || existingExam.description,
            subject: subject || existingExam.subject,
            program: program || existingExam.program,
            academicTerm: academicTerm || existingExam.academicTerm, 
            duration: duration || existingExam.duration,
            examDate: examDate || existingExam.examDate,
            examTime: examTime || existingExam.examTime,
            examType: examType || existingExam.examType,
            classLevel: classLevel || existingExam.classLevel,
            academicYear: academicYear || existingExam.academicYear,
        },
        {
            new: true,
        }
    );

    res.status(200).json({
        status : "Success",
        message: "Exam updated successfully",
        data: examUpdated,
    });
});

//@desc Admin get all exams created by teachers with filters (date, teacherId, teacher name)
//@route GET /api/v1/exams/admin/teacher-exams
//@access private Admin only

exports.getAllTeacherExamsAdminCtrl = AsyncHandler(async (req, res) => {
    const { teacherId, teacherName, startDate, endDate, examDate, subject, program } = req.query;

    let query = {};

    if (startDate || endDate || examDate) {
        if (examDate) {
            const start = new Date(examDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(examDate);
            end.setHours(23, 59, 59, 999);
            query.examDate = { $gte: start, $lte: end };
        } else {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }
    }

    if (subject && subject !== "all") {
        query.subject = subject;
    }

    if (program && program !== "all") {
        query.program = program;
    }

    let exams = await Exam.find(query)
        .populate({
            path: "createdBy",
            model: "Teacher",
            select: "name email teacherId role"
        })
        .populate("subject")
        .populate("program")
        .populate("academicTerm")
        .populate("academicYear")
        .populate("classLevel")
        .populate("questions")
        .sort({ createdAt: -1 });

    // Filter by teacherId or teacherName if provided in query params
    if (teacherId || teacherName) {
        exams = exams.filter(exam => {
            const teacher = exam.createdBy;
            if (!teacher) return false;

            const matchesId = !teacherId || 
                (teacher.teacherId && teacher.teacherId.toLowerCase().includes(teacherId.toLowerCase())) ||
                (teacher._id && teacher._id.toString() === teacherId);

            const matchesName = !teacherName ||
                (teacher.name && teacher.name.toLowerCase().includes(teacherName.toLowerCase()));

            return matchesId && matchesName;
        });
    }

    res.status(200).json({
        status: "Success",
        message: "Teacher exams fetched successfully",
        data: exams,
    });
});

//@desc delete exam
//@route DELETE /api/v1/exams/:id
//@access private Admin & Teacher
exports.deleteExamCtrl = AsyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
        throw new Error("Exam not found");
    }

    if (!exam.createdBy) {
        throw new Error("Exam has no creator/author");
    }

    const creatorId = exam.createdBy.toString();
    const userId = (req.userAuth?._id || req.userAuth?.id)?.toString();

    // For admins, always allow deletion
    // For teachers, only allow if they are the creator
    if (req.userAuth.role !== "admin") {
        if (creatorId !== userId) {
            throw new Error("You can only delete exams that you have created");
        }
    }

    await Exam.findByIdAndDelete(req.params.id);
    res.status(200).json({
        status: "Success",
        message: "Exam deleted successfully",
    });
});