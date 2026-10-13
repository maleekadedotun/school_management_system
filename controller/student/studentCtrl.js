const AsyncHandler = require("express-async-handler");
const crypto = require("crypto");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");
const generateToken = require("../../utils/generateToken");

const mongoose = require("mongoose");
const Student = require("../../models/Academy/Student");
const Exam = require("../../models/Academy/Exam");
const ExamResults = require("../../models/Academy/ExamResults");
const Admin = require("../../models/Staff/admin");
const Teacher = require("../../models/Staff/Teacher");
const ClassLevel = require("../../models/Academy/ClassLevel");
const Program = require("../../models/Academy/program");
const AcademicYear = require("../../models/Academy/AcademicYear");
const AcademicTerm = require("../../models/Academy/AcademicTerm");
const Subject = require("../../models/Academy/Subject");
const Question = require("../../models/Academy/Question");

const safeEscapeRegex = (str) => {
    return (str || "").toString().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Helper: check if a subject is a core subject
const isCoreSubject = (subject) => {
    if (!subject) return false;
    if (subject.isCore === true) return true;
    const name = (typeof subject === "string" ? subject : subject.name || "").toLowerCase().trim();
    return /^(math|mathematics|english|general math)/i.test(name);
};

// Helper: resolve core subjects (Mathematics and English) for a student / program
const resolveCoreSubjectsForStudent = async (programIdOrDoc = null) => {
    let progId = null;
    if (programIdOrDoc) {
        progId = typeof programIdOrDoc === "object" && programIdOrDoc._id ? programIdOrDoc._id : programIdOrDoc;
    }

    const findCoreSubject = async (regex) => {
        if (progId) {
            const inProg = await Subject.findOne({
                program: progId,
                name: { $regex: regex }
            }).populate("teacher academicTerms program");
            if (inProg) return inProg;
        }
        return await Subject.findOne({
            name: { $regex: regex }
        }).populate("teacher academicTerms program");
    };

    const math = await findCoreSubject(/^math(ematics)?$/i);
    const eng = await findCoreSubject(/^english/i);

    return [math, eng].filter(Boolean);
};

//@desc register student
//@route POST /api/v1/students/admin/register
//@access private Admin only

exports.adminRegisterStudent = AsyncHandler(async (req, res) => {
    const { name, password, email, classLevels, subject, subjects, subjectIds, program } = req.body;
    // find admin
    const adminFound = await Admin.findById(req.userAuth._id);
    if (!adminFound) {
        throw new Error("Admin not found");
    }
    const student = await Student.findOne({ email });
    if (student) {
        throw new Error("Student already exist");
    }

    const hashPassword = await hashedPassword(password);
    const studentData = {
        name,
        email,
        password: hashPassword,
    };

    if (classLevels) {
        const cLevel = Array.isArray(classLevels) ? classLevels[classLevels.length - 1] : classLevels;
        studentData.currentClassLevel = cLevel;
        studentData.classLevels = Array.isArray(classLevels) ? classLevels : [classLevels];
    }
    if (subject) {
        if (mongoose.Types.ObjectId.isValid(subject)) {
            const Subject = require("../../models/Academy/Subject");
            const sDoc = await Subject.findById(subject);
            studentData.subject = sDoc ? sDoc.name : subject;
        } else {
            studentData.subject = subject;
        }
    }
    if (req.body.enrolledSubjects && Array.isArray(req.body.enrolledSubjects)) {
        studentData.enrolledSubjects = req.body.enrolledSubjects;
    } else {
        studentData.enrolledSubjects = [];
    }

    // Support explicitly selected multiple subjects
    const explicitSubs = Array.isArray(subjects) ? subjects : (subjects ? [subjects] : (Array.isArray(subjectIds) ? subjectIds : (subjectIds ? [subjectIds] : [])));
    if (explicitSubs.length > 0) {
        const Subject = require("../../models/Academy/Subject");
        for (const s of explicitSubs) {
            if (!s) continue;
            const sStr = typeof s === "object" && s._id ? s._id.toString() : s.toString().trim();
            let sDoc = null;
            if (mongoose.Types.ObjectId.isValid(sStr)) {
                sDoc = await Subject.findById(sStr);
            }
            if (!sDoc) {
                sDoc = await Subject.findOne({ name: { $regex: new RegExp(`^${safeEscapeRegex(sStr)}$`, "i") } });
            }
            if (sDoc) {
                const alreadyEnrolled = studentData.enrolledSubjects.some(
                    e => (e.subject?._id || e.subject)?.toString() === sDoc._id.toString()
                );
                if (!alreadyEnrolled) {
                    studentData.enrolledSubjects.push({
                        subject: sDoc._id,
                        classLevel: studentData.currentClassLevel || (sDoc.classLevel && !sDoc.classLevel.includes("100") ? sDoc.classLevel : "") || "",
                        dateEnrolled: new Date(),
                    });
                }
                if (!studentData.subject) {
                    studentData.subject = sDoc.name;
                }
            }
        }
    }

    // Auto-pick program and auto-enroll student into ALL subjects under that program
    let programFound = null;
    if (program) {
        if (mongoose.Types.ObjectId.isValid(program)) {
            programFound = await Program.findById(program);
        } else {
            programFound = await Program.findOne({ name: program });
        }

        if (programFound) {
            studentData.program = programFound._id;

            // Find all subjects belonging to this program
            const Subject = require("../../models/Academy/Subject");
            const progSubjects = await Subject.find({
                $or: [
                    { program: programFound._id },
                    ...(Array.isArray(programFound.subjects) && programFound.subjects.length > 0 ? [{ _id: { $in: programFound.subjects } }] : [])
                ]
            });

            // Automatically enroll student into every subject under this program
            for (const pSub of progSubjects) {
                const alreadyEnrolled = studentData.enrolledSubjects.some(
                    e => (e.subject?._id || e.subject)?.toString() === pSub._id.toString()
                );
                if (!alreadyEnrolled) {
                    studentData.enrolledSubjects.push({
                        subject: pSub._id,
                        classLevel: studentData.currentClassLevel || (pSub.classLevel && !pSub.classLevel.includes("100") ? pSub.classLevel : "") || "",
                        dateEnrolled: new Date(),
                    });
                }
            }

            // If primary subject not set, default to first program subject
            if (!studentData.subject && progSubjects.length > 0) {
                studentData.subject = progSubjects[0].name;
            }
        }
    }

    // Always ensure Mathematics and English are enrolled as core subjects for all students
    const generalCoreSubjects = await resolveCoreSubjectsForStudent(programFound);
    for (const cSub of generalCoreSubjects) {
        const alreadyEnrolled = studentData.enrolledSubjects.some(
            e => (e.subject?._id || e.subject)?.toString() === cSub._id.toString()
        );
        if (!alreadyEnrolled) {
            studentData.enrolledSubjects.push({
                subject: cSub._id,
                classLevel: studentData.currentClassLevel || (cSub.classLevel && !cSub.classLevel.includes("100") ? cSub.classLevel : "") || "",
                dateEnrolled: new Date(),
            });
        }
    }

    // Auto-pick teacher if subject and class are provided
    if (studentData.subject && studentData.currentClassLevel) {
        const classDigits = studentData.currentClassLevel.toString().match(/\d+/)?.[0];
        const classQuery = [
            { classLevel: studentData.currentClassLevel },
            { classLevel: { $regex: new RegExp(`^${safeEscapeRegex(studentData.currentClassLevel)}$`, "i") } },
            ...(classDigits ? [{ classLevel: { $regex: new RegExp(`(^|\\b|\\D)${classDigits}(\\D|\\b|$)`, "i") } }] : [])
        ];
        const subjectQuery = [
            { subject: studentData.subject },
            { subject: { $regex: new RegExp(`^${safeEscapeRegex(studentData.subject)}$`, "i") } }
        ];

        // 1. Strict match on BOTH subject and class level
        let matchedTeacher = await Teacher.findOne({
            $and: [
                { $or: subjectQuery },
                { $or: classQuery }
            ]
        });

        // 2. Fallback ONLY to a teacher who has NO class level restriction (universal subject teacher)
        if (!matchedTeacher) {
            matchedTeacher = await Teacher.findOne({
                $and: [
                    { $or: subjectQuery },
                    {
                        $or: [
                            { classLevel: "" },
                            { classLevel: null },
                            { classLevel: { $exists: false } }
                        ]
                    }
                ]
            });
        }

        if (matchedTeacher) {
            studentData.assignedTeacher = matchedTeacher._id;
        }
    }

    const studentCreated = await Student.create(studentData);

    // student to admin
    adminFound.students.push(studentCreated?._id);
    await adminFound.save();

    // Link student to Program document if assigned
    if (programFound) {
        try {
            await Program.findByIdAndUpdate(programFound._id, {
                $addToSet: { students: studentCreated._id }
            });
        } catch (progErr) {
            console.error("Error linking student to program:", progErr);
        }
    }

    res.status(201).json({
        status: "Success",
        message: "Student created successfully",
        data: studentCreated,
    });
});

//@desc login student
//@route POST /api/v1/students/login
//@access public

// exports.studentLogin = AsyncHandler(async(req, res) => {
//     const {email, password} = req.body;
//     const student = await Student.findOne({email});
//     if (!student) {
//         res.status(404).json("Invalid login credentials")
//     }

//     // verify password
//     const isMatched = await isPasswordMatched(password, student?.password);
//     if (!isMatched) {
//         res.status(404).json("Invalid login credentials");
//     }
//     else{
//         res.status(201).json({
//             status: "Success",
//             message: "Student loggedIn successfully",
//             data: generateToken(student?.id)
//         });
//     }


// });

exports.studentLogin = AsyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const student = await Student.findOne({ email });

    if (!student) {
        return res.status(401).json({
            message: "Invalid login credentials"
        });
    }

    // Verify password
    const isMatched = await isPasswordMatched(
        password,
        student.password
    );

    if (!isMatched) {
        return res.status(401).json({
            message: "Invalid login credentials"
        });
    }

    return res.status(200).json({
        status: "Success",
        message: "Student loggedIn successfully",
        data: generateToken(student._id),
        user: {
            _id: student._id,
            name: student.name,
            email: student.email,
            role: student.role
        }
    });
});

//@desc  student forgot password (generates reset token)
//@route POST /api/v1/students/forgot-password
//@access public
exports.studentForgotPasswordCtrl = AsyncHandler(async (req, res) => {
    const { email, studentId } = req.body;

    if (!email && !studentId) {
        return res.status(400).json({
            status: "failed",
            message: "Please provide your registered email address or Matriculation Student ID"
        });
    }

    const query = [];
    if (email) query.push({ email: email.toLowerCase().trim() });
    if (studentId) query.push({ StudentId: studentId.trim() });

    const student = await Student.findOne({ $or: query });

    if (!student) {
        return res.status(404).json({
            status: "failed",
            message: "No active student account found with the provided details"
        });
    }

    // Generate secure random reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Token valid for 30 minutes
    student.passwordResetToken = hashedToken;
    student.passwordResetExpires = Date.now() + 30 * 60 * 1000;
    await student.save({ validateBeforeSave: false });

    return res.status(200).json({
        status: "success",
        message: "Identity verified. Password reset token generated successfully.",
        resetToken,
        student: {
            name: student.name,
            email: student.email,
            studentId: student.StudentId,
        }
    });
});

//@desc  student reset password
//@route POST /api/v1/students/reset-password
//@route POST /api/v1/students/reset-password/:token
//@access public
exports.studentResetPasswordCtrl = AsyncHandler(async (req, res) => {
    const token = req.params.token || req.body.token;
    const { password, email, studentId } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({
            status: "failed",
            message: "Password is required and must be at least 6 characters long"
        });
    }

    let student = null;

    if (token) {
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        student = await Student.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() },
        });
    }

    // Fallback: If verifying with email and studentId directly
    if (!student && (email || studentId)) {
        const query = [];
        if (email) query.push({ email: email.toLowerCase().trim() });
        if (studentId) query.push({ StudentId: studentId.trim() });
        student = await Student.findOne({ $or: query });
    }

    if (!student) {
        return res.status(400).json({
            status: "failed",
            message: "Invalid or expired password reset request. Please request a new token or verify your details."
        });
    }

    // Set new password
    student.password = await hashedPassword(password);
    student.passwordResetToken = undefined;
    student.passwordResetExpires = undefined;
    await student.save({ validateBeforeSave: false });

    return res.status(200).json({
        status: "success",
        message: "Password reset successful. You can now log in with your new password.",
    });
});
//@desc  student profile
//@route GET /api/v1/teachers/profile
//@access public student only

exports.fetchStudentProfile = AsyncHandler(async (req, res) => {
    const studentId = req.userAuth?.id || req.userAuth?._id;
    const student = await Student.findById(studentId)
        .select("-password -createdAt -updatedAt")
        .populate({
            path: "examsResults",
            populate: [
                {
                    path: "exam",
                    populate: [
                        { path: "subject" },
                        { path: "program" },
                        { path: "academicTerm" },
                        { path: "academicYear" },
                        { path: "classLevel" }
                    ]
                },
                { path: "classLevel" },
                { path: "academicTerm" },
                { path: "academicYear" }
            ]
        })
        .populate("program")
        .populate("academicYear")
        .populate({
            path: "assignedTeacher",
            select: "name email subject classLevel"
        })
        .populate({
            path: "enrolledSubjects.subject",
            populate: [
                { path: "teacher", select: "name email" },
                { path: "academicTerms", select: "name" },
                { path: "program", select: "name" }
            ]
        });

    if (!student) {
        throw new Error("Student not found");
    }

    // get student profile
    const studentProfile = {
        _id: student?._id,
        name: student?.name,
        email: student?.email,
        currentClassLevel: student?.currentClassLevel,
        classLevels: student?.classLevels || [],
        program: student?.program,
        academicYear: student?.academicYear,
        assignedTeacher: student?.assignedTeacher,
        subject: student?.subject,
        enrolledSubjects: student?.enrolledSubjects || [],
        dateAdmitted: student?.dateAdmitted,
        isSuspended: student?.isSuspended,
        isWithDrawn: student?.isWithDrawn,
        isGraduated: student?.isGraduated,
        yearGraduated: student?.yearGraduated,
        studentId: student?.StudentId,
        StudentId: student?.StudentId,
        prefectName: student?.prefectName,
        role: student?.role || "student",
        examsResults: student?.examsResults || [],
    };

    // Auto-sync subjects under student's assigned program if not yet enrolled
    if (student.program) {
        const Subject = require("../../models/Academy/Subject");
        const progId = student.program._id || student.program;
        const progSubjects = await Subject.find({
            $or: [
                { program: progId },
                ...(Array.isArray(student.program.subjects) && student.program.subjects.length > 0 ? [{ _id: { $in: student.program.subjects } }] : [])
            ]
        }).populate("teacher academicTerms program");

        const enrolledSubIds = (student.enrolledSubjects || []).map(item =>
            (item.subject?._id || item.subject)?.toString()
        );

        const newSyncItems = [];
        for (const pSub of progSubjects) {
            const pId = pSub._id.toString();
            if (!enrolledSubIds.includes(pId)) {
                const entry = {
                    subject: pSub,
                    classLevel: student.currentClassLevel || (pSub.classLevel && !pSub.classLevel.includes("100") ? pSub.classLevel : "") || "",
                    dateEnrolled: student.dateAdmitted || new Date(),
                };
                studentProfile.enrolledSubjects.push(entry);
                newSyncItems.push({
                    subject: pSub._id,
                    classLevel: student.currentClassLevel || (pSub.classLevel && !pSub.classLevel.includes("100") ? pSub.classLevel : "") || "",
                    dateEnrolled: new Date(),
                });
            }
        }

        if (newSyncItems.length > 0) {
            try {
                await Student.findByIdAndUpdate(student._id, {
                    $addToSet: { enrolledSubjects: { $each: newSyncItems } }
                });
            } catch (err) {
                console.error("Error auto-syncing program subjects in profile:", err);
            }
        }
    }

    // get student exam results - students can ONLY see results that are published by admin
    const allExamResults = student?.examsResults || [];
    const publishedResults = allExamResults.filter(r => r?.isPublished === true);
    const hasPendingReview = allExamResults.some(r => r?.isPublished === false);
    const currentExamResult = publishedResults[publishedResults.length - 1] || null;

    // Distinguish two-tier pending review statuses:
    // 1. Pending Teacher review (teacher hasn't reviewed & published yet)
    const pendingTeacherReview = allExamResults.filter(r => !r?.isTeacherPublished && !r?.isPublished);
    // 2. Pending Admin review (teacher published, awaiting admin final release)
    const pendingAdminReview = allExamResults.filter(r => r?.isTeacherPublished === true && !r?.isPublished);

    // Collect all exam IDs written/completed by this student (including unpublished)
    const writtenExamIds = [...new Set(
        allExamResults
            .map(r => (r?.exam?._id || r?.exam)?.toString())
            .filter(Boolean)
    )];

    res.status(200).json({
        status: "Success",
        message: "Student profile fetched successfully",
        data: {
            studentProfile,
            currentExamResult: currentExamResult,
            examResults: publishedResults,
            allExamResults: allExamResults,
            writtenExamIds: writtenExamIds,
            hasPendingReview: hasPendingReview,
            pendingTeacherReviewCount: pendingTeacherReview.length,
            pendingAdminReviewCount: pendingAdminReview.length,
        }
    });
});


//@desc all student
//@route GET /api/v1/students/admin/
//@access public admin only

exports.fetchAllStudentsAdmin = AsyncHandler(async (req, res) => {
    const students = await Student.find()
        .populate("program academicYear assignedTeacher")
        .populate({
            path: "enrolledSubjects.subject",
            select: "name description classLevel academicTerms program"
        });

    const Subject = require("../../models/Academy/Subject");
    for (const st of students) {
        if ((!st.enrolledSubjects || st.enrolledSubjects.length === 0) && st.subject) {
            const sName = st.subject.trim();
            const sDoc = await Subject.findOne({
                name: { $regex: new RegExp(`^${safeEscapeRegex(sName)}$`, "i") }
            });
            if (sDoc) {
                const newEntry = {
                    subject: sDoc._id,
                    classLevel: st.currentClassLevel || (sDoc.classLevel && !sDoc.classLevel.includes("100") ? sDoc.classLevel : "") || "",
                    dateEnrolled: st.dateAdmitted || new Date(),
                };
                st.enrolledSubjects = [{
                    subject: sDoc,
                    classLevel: newEntry.classLevel,
                    dateEnrolled: newEntry.dateEnrolled,
                }];
                await Student.findByIdAndUpdate(st._id, {
                    $set: { enrolledSubjects: [newEntry] }
                });
            }
        }
    }

    res.status(200).json({
        status: "Success",
        message: "Students fetched successfully",
        data: students
    });
});


//@desc single student
//@route GET /api/v1/students/:studentID/admin/
//@access public admin only

exports.fetchStudentAdmin = AsyncHandler(async (req, res) => {
    const studentID = req.params.studentID;
    const student = await Student.findById(studentID)
        .populate("program academicYear assignedTeacher")
        .populate({
            path: "enrolledSubjects.subject",
            select: "name description classLevel academicTerms program"
        });
    if (!student) {
        throw new Error("Student not found");
    }

    if ((!student.enrolledSubjects || student.enrolledSubjects.length === 0) && student.subject) {
        const Subject = require("../../models/Academy/Subject");
        const sName = student.subject.trim();
        const sDoc = await Subject.findOne({
            name: { $regex: new RegExp(`^${safeEscapeRegex(sName)}$`, "i") }
        });
        if (sDoc) {
            const newEntry = {
                subject: sDoc._id,
                classLevel: student.currentClassLevel || (sDoc.classLevel && !sDoc.classLevel.includes("100") ? sDoc.classLevel : "") || "",
                dateEnrolled: student.dateAdmitted || new Date(),
            };
            student.enrolledSubjects = [{
                subject: sDoc,
                classLevel: newEntry.classLevel,
                dateEnrolled: newEntry.dateEnrolled,
            }];
            await Student.findByIdAndUpdate(student._id, {
                $set: { enrolledSubjects: [newEntry] }
            });
        }
    }
    // Fetch all exam results associated with this student
    const ExamResults = require("../../models/Academy/ExamResults");
    const results = await ExamResults.find({
        $or: [
            { studentID: student.StudentId },
            { studentID: { $regex: new RegExp(`^${student.StudentId}$`, "i") } },
            { studentID: student._id.toString() }
        ]
    })
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

    const studentObj = student.toObject();
    studentObj.examResults = results;

    res.status(200).json({
        status: "Success",
        message: "Student fetched successfully",
        data: studentObj,
    });
});

//@desc  student update profile 
//@route PUT /api/v1/students/update
//@access public student only

exports.updateStudentCtrl = AsyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const studentId = req.userAuth?._id || req.userAuth?.id;

    const updateData = {};
    if (email) {
        const emailExist = await Student.findOne({ email, _id: { $ne: studentId } });
        if (emailExist) {
            throw new Error("Email is taken/exist");
        }
        updateData.email = email;
    }
    if (password) {
        updateData.password = await hashedPassword(password);
    }

    const student = await Student.findByIdAndUpdate(
        studentId,
        updateData,
        {
            new: true,
            runValidators: true,
        }
    ).select("-password");

    res.status(200).json({
        status: "Success",
        data: student,
        message: "Student updated successfully",
    });
});

//@desc   Admin updating student e.g: assigning class...
//@route PUT /api/v1/students/:studentID/update/admin
//@access private Admin only

exports.adminUpdateStudentCtrl = AsyncHandler(async (req, res) => {
    const {
        name,
        email,
        classLevels,
        academicYear,
        program,
        subject,
        prefectName,
        isSuspended,
        isWithDrawn,
    } = req.body;
    const studentFound = await Student.findById(req.params.studentID);
    if (!studentFound) {
        throw new Error("Student not found");
    }

    const updateSet = {};
    const updateOps = { $set: updateSet };
    if (name !== undefined && name !== "") updateSet.name = name;
    if (email !== undefined && email !== "") updateSet.email = email;
    if (prefectName !== undefined) updateSet.prefectName = prefectName;
    if (isSuspended !== undefined) updateSet.isSuspended = isSuspended;
    if (isWithDrawn !== undefined) updateSet.isWithDrawn = isWithDrawn;

    // Handle subject assignment (can be ObjectId or name)
    if (subject !== undefined && subject !== "") {
        if (mongoose.Types.ObjectId.isValid(subject)) {
            const Subject = require("../../models/Academy/Subject");
            const sDoc = await Subject.findById(subject);
            updateSet.subject = sDoc ? sDoc.name : subject;
        } else {
            updateSet.subject = subject;
        }
    }

    // Set class level and track history
    if (classLevels) {
        updateSet.currentClassLevel = classLevels;
        if (!updateOps.$addToSet) updateOps.$addToSet = {};
        updateOps.$addToSet.classLevels = classLevels;
    }

    const Subject = require("../../models/Academy/Subject");
    const activeClassLevel = updateSet.currentClassLevel || studentFound.currentClassLevel || "";

    const findSubjectDoc = async (identifier) => {
        if (!identifier) return null;
        const str = typeof identifier === "object" && identifier._id ? identifier._id.toString() : identifier.toString().trim();
        if (mongoose.Types.ObjectId.isValid(str)) {
            const byId = await Subject.findById(str);
            if (byId) return byId;
        }
        const escaped = safeEscapeRegex(str);
        return await Subject.findOne({ name: { $regex: new RegExp(`^${escaped}$`, "i") } });
    };

    // Handle explicit subjects (from req.body.subjects, req.body.subjectIds, etc.)
    const explicitSubs = Array.isArray(req.body.subjects)
        ? req.body.subjects
        : (req.body.subjects ? [req.body.subjects] : (Array.isArray(req.body.subjectIds) ? req.body.subjectIds : (req.body.subjectIds ? [req.body.subjectIds] : null)));

    let currentEnrolled = [];
    let enrollmentsModified = false;

    if (explicitSubs !== null) {
        enrollmentsModified = true;
        const explicitDocs = [];
        for (const s of explicitSubs) {
            if (!s) continue;
            const sDoc = await findSubjectDoc(s);
            if (sDoc) {
                if (!explicitDocs.some(d => d._id.toString() === sDoc._id.toString())) {
                    explicitDocs.push(sDoc);
                }
            }
        }

        // Build the new enrolledSubjects list based EXACTLY on explicitDocs
        const updatedEnrolled = [];
        for (const sDoc of explicitDocs) {
            const existing = Array.isArray(studentFound.enrolledSubjects)
                ? studentFound.enrolledSubjects.find(e => (e.subject?._id || e.subject)?.toString() === sDoc._id.toString())
                : null;
            updatedEnrolled.push({
                subject: sDoc._id,
                classLevel: classLevels || existing?.classLevel || activeClassLevel || (sDoc.classLevel && !sDoc.classLevel.includes("100") ? sDoc.classLevel : "") || "",
                dateEnrolled: existing?.dateEnrolled || new Date(),
            });
        }
        currentEnrolled = updatedEnrolled;

        // Synchronize student.subject with active subjects
        if (explicitDocs.length > 0) {
            const reqSubDoc = subject ? await findSubjectDoc(subject) : null;
            const matchedInDocs = reqSubDoc && explicitDocs.some(d => d._id.toString() === reqSubDoc._id.toString());
            updateSet.subject = matchedInDocs ? reqSubDoc.name : explicitDocs[0].name;
        } else {
            updateSet.subject = "";
        }
    } else if (req.body.enrolledSubjects !== undefined && Array.isArray(req.body.enrolledSubjects)) {
        enrollmentsModified = true;
        currentEnrolled = [...req.body.enrolledSubjects];
    } else {
        // Fallback: If no explicit subjects array sent, preserve existing enrollments
        if (Array.isArray(studentFound.enrolledSubjects)) {
            for (const item of studentFound.enrolledSubjects) {
                const sId = item.subject?._id || item.subject;
                if (sId) {
                    currentEnrolled.push({
                        subject: sId,
                        classLevel: item.classLevel || studentFound.currentClassLevel || "",
                        dateEnrolled: item.dateEnrolled || studentFound.dateAdmitted || new Date(),
                    });
                }
            }
        }
        if (subject !== undefined && subject !== "") {
            const sDoc = await findSubjectDoc(subject);
            if (sDoc) {
                updateSet.subject = sDoc.name;
                const alreadyIn = currentEnrolled.some(
                    e => (e.subject?._id || e.subject)?.toString() === sDoc._id.toString()
                );
                if (!alreadyIn) {
                    currentEnrolled.push({
                        subject: sDoc._id,
                        classLevel: activeClassLevel || (sDoc.classLevel && !sDoc.classLevel.includes("100") ? sDoc.classLevel : "") || "",
                        dateEnrolled: new Date(),
                    });
                    enrollmentsModified = true;
                }
            } else {
                updateSet.subject = subject;
            }
        }
    }

    // Handle program assignment (ObjectId or name)
    let matchedProgramDoc = null;
    if (program) {
        if (mongoose.Types.ObjectId.isValid(program)) {
            matchedProgramDoc = await Program.findById(program);
        } else {
            matchedProgramDoc = await Program.findOne({ name: program });
        }
        if (matchedProgramDoc) {
            updateSet.program = matchedProgramDoc._id;

            // Auto-enroll subjects under this program if requested or if explicit subjects weren't given
            const progSubjects = await Subject.find({
                $or: [
                    { program: matchedProgramDoc._id },
                    ...(Array.isArray(matchedProgramDoc.subjects) && matchedProgramDoc.subjects.length > 0 ? [{ _id: { $in: matchedProgramDoc.subjects } }] : [])
                ]
            });

            if (req.body.autoEnrollProgramSubjects === true || (explicitSubs === null && req.body.enrolledSubjects === undefined)) {
                for (const pSub of progSubjects) {
                    const exists = currentEnrolled.some(
                        e => (e.subject?._id || e.subject)?.toString() === pSub._id.toString()
                    );
                    if (!exists) {
                        currentEnrolled.push({
                            subject: pSub._id,
                            classLevel: activeClassLevel || (pSub.classLevel && !pSub.classLevel.includes("100") ? pSub.classLevel : "") || "",
                            dateEnrolled: new Date(),
                        });
                        enrollmentsModified = true;
                    }
                }

                // Also ensure Mathematics and English are enrolled as core subjects
                const coreSubjects = await resolveCoreSubjectsForStudent(matchedProgramDoc);
                for (const cSub of coreSubjects) {
                    const exists = currentEnrolled.some(
                        e => (e.subject?._id || e.subject)?.toString() === cSub._id.toString()
                    );
                    if (!exists) {
                        currentEnrolled.push({
                            subject: cSub._id,
                            classLevel: activeClassLevel || (cSub.classLevel && !cSub.classLevel.includes("100") ? cSub.classLevel : "") || "",
                            dateEnrolled: new Date(),
                        });
                        enrollmentsModified = true;
                    }
                }
            }
        }
    }

    if (enrollmentsModified) {
        updateSet.enrolledSubjects = currentEnrolled;
    }

    // Handle academicYear assignment (ObjectId or name)
    if (academicYear) {
        if (mongoose.Types.ObjectId.isValid(academicYear)) {
            updateSet.academicYear = academicYear;
        } else {
            const yr = await AcademicYear.findOne({ name: academicYear });
            if (yr) updateSet.academicYear = yr._id;
        }
    }

    // AUTO-PICK TEACHER: if student has subject, auto-pick the teacher
    const activeClass = classLevels || studentFound.currentClassLevel;
    const activeSubject = updateSet.subject !== undefined ? updateSet.subject : studentFound.subject;

    if (activeSubject) {
        const subjectQuery = [
            { subject: activeSubject },
            { subject: { $regex: new RegExp(`^${safeEscapeRegex(activeSubject)}$`, "i") } }
        ];

        let matchedTeacher = null;
        if (activeClass) {
            let targetClassStr = activeClass;
            if (mongoose.Types.ObjectId.isValid(activeClass)) {
                const cDoc = await ClassLevel.findById(activeClass);
                if (cDoc && cDoc.name) targetClassStr = cDoc.name;
            }

            const classDigits = targetClassStr.toString().match(/\d+/)?.[0];
            const classQuery = [
                { classLevel: targetClassStr },
                { classLevel: { $regex: new RegExp(`^${safeEscapeRegex(targetClassStr)}$`, "i") } },
                ...(classDigits ? [{ classLevel: { $regex: new RegExp(`(^|\\b|\\D)${classDigits}(\\D|\\b|$)`, "i") } }] : [])
            ];

            matchedTeacher = await Teacher.findOne({
                $and: [
                    { $or: subjectQuery },
                    { $or: classQuery }
                ]
            });
        }

        // 2. Fallback ONLY to a teacher who has NO class level restriction (universal subject teacher)
        if (!matchedTeacher) {
            matchedTeacher = await Teacher.findOne({
                $and: [
                    { $or: subjectQuery },
                    {
                        $or: [
                            { classLevel: "" },
                            { classLevel: null },
                            { classLevel: { $exists: false } }
                        ]
                    }
                ]
            });
        }

        if (matchedTeacher) {
            updateSet.assignedTeacher = matchedTeacher._id;
        }
    }

    const studentUpdated = await Student.findByIdAndUpdate(
        req.params.studentID,
        updateOps,
        {
            new: true,
            runValidators: true,
        }
    )
    .populate("program academicYear assignedTeacher")
    .populate({
        path: "enrolledSubjects.subject",
        select: "name description classLevel academicTerms program"
    });

    // Also link student to Program document if assigned
    if (updateSet.program) {
        try {
            await Program.findByIdAndUpdate(updateSet.program, {
                $addToSet: { students: studentFound._id }
            });
        } catch (e) {
            console.error("Error linking student to program:", e);
        }
    }

    // send response
    res.status(200).json({
        status: "Success",
        message: "Student updated successfully",
        data: studentUpdated,
    });
});

//@desc   Student taking exam
//@route PUT /api/v1/students/exams/:examID/write
//@access Student Admin only

exports.studentWriteExamCtrl = AsyncHandler(async (req, res) => {
    // get student
    const studentId = req.userAuth?._id || req.userAuth?.id;
    const studentFound = await Student.findById(studentId)
        .populate("program")
        .populate("assignedTeacher")
        .populate({
            path: "enrolledSubjects.subject",
            populate: { path: "teacher program" }
        });

    if (!studentFound) {
        res.status(404);
        const err = new Error("Student not found");
        err.statusCode = 404;
        throw err;
    }
    // get examID
    const examFound = await Exam.findById(req.params.examID)
        .populate("questions")
        .populate("academicTerm")
        .populate("academicYear")
        .populate("subject")
        .populate("program")
        .populate("classLevel");

    if (!examFound) {
        res.status(404);
        const err = new Error("Exam not found");
        err.statusCode = 404;
        throw err;
    }

    // Resolve exam creator (Teacher or Admin) so authority / permissions are accurately evaluated
    let creatorDoc = null;
    if (examFound.createdBy) {
        creatorDoc = await Teacher.findById(examFound.createdBy).select("name email teacherId role subject classLevel").lean();
        if (!creatorDoc) {
            creatorDoc = await Admin.findById(examFound.createdBy).select("name email role").lean();
            if (creatorDoc) {
                creatorDoc.role = "admin";
            }
        }
    }
    if (!creatorDoc) {
        creatorDoc = { name: "School Administration", role: "admin" };
    }
    const examForFilter = examFound.toObject ? examFound.toObject() : { ...examFound };
    examForFilter.createdBy = creatorDoc;

    // Verify student is eligible: Exam must match their class, offered subject, and assigned teacher or admin
    const { filterExamsForStudent } = require("../academic/examCtrl");
    let studentForFilter = studentFound.toObject ? studentFound.toObject() : studentFound;
    if (!studentForFilter.assignedTeacher && studentForFilter.subject) {
        const subRegex = new RegExp(`^${studentForFilter.subject.toString().trim()}$`, "i");
        const matchedTeacher = await Teacher.findOne({
            $or: [{ subject: studentForFilter.subject }, { subject: subRegex }]
        }).lean();
        if (matchedTeacher) {
            studentForFilter.assignedTeacher = matchedTeacher;
        }
    }
    const eligibleExams = filterExamsForStudent([examForFilter], studentForFilter);
    if (!eligibleExams || eligibleExams.length === 0) {
        res.status(403);
        const err = new Error("You are only eligible to take examinations set for your enrolled subject and assigned teacher in your class.");
        err.statusCode = 403;
        throw err;
    }

    // get question
    const questions = examFound?.questions || [];
    // get student answer
    const studentAnswers = req.body.answers;

    // check if exam has questions
    if (!questions || questions.length === 0) {
        res.status(400);
        const err = new Error("This exam does not have any questions yet.");
        err.statusCode = 400;
        throw err;
    }

    // check if student answered all questions
    if (!studentAnswers || questions.length !== studentAnswers.length) {
        res.status(400);
        const err = new Error("You must answer all questions");
        err.statusCode = 400;
        throw err;
    }
    const studentFoundResults = await ExamResults.findOne({
        $or: [
            { studentID: studentFound?.StudentId },
            { studentID: studentFound?._id.toString() },
            { _id: { $in: studentFound.examsResults || [] } }
        ],
        $and: [
            {
                $or: [
                    { exam: examFound?._id },
                    { examsTaken: examFound?._id }
                ]
            }
        ]
    });
    if (studentFoundResults) {
        res.status(400);
        const err = new Error("You have already written this exam");
        err.statusCode = 400;
        throw err;
    }

    // check id student is suspended/withdrawn
    if (studentFound.isSuspended || studentFound.isWithDrawn) {
        res.status(403);
        const err = new Error("You are suspended/withdrawn, you can't take this exam");
        err.statusCode = 403;
        throw err;
    }

    // Build report object
    let correctAnswers = 0;
    let wrongAnswers = 0;
    let totalQuestions = 0;
    let status = "" //passed/ failed
    let remarks = "" // Excelent, very good, good, fair, poor
    let grade = 0;
    let score = 0;
    let answeredQuestions = [];

    // check for answers
    for (let i = 0; i < questions.length; i++) {
        // find question
        const question = questions[i];
        // console.log(question);

        // check if the answer is correct (supports optionA-D keys, letter codes, or option text)
        const ans = (studentAnswers[i] || "").toString().trim().toLowerCase();
        const corr = (question.correctAnswer || "").toString().trim().toLowerCase();
        const optA = (question.optionA || "").toString().trim().toLowerCase();
        const optB = (question.optionB || "").toString().trim().toLowerCase();
        const optC = (question.optionC || "").toString().trim().toLowerCase();
        const optD = (question.optionD || "").toString().trim().toLowerCase();

        let isCorrect = ans === corr;
        if (!isCorrect) {
            if (corr === "optiona" || corr === "a") isCorrect = (ans === "optiona" || ans === "a" || ans === optA);
            else if (corr === "optionb" || corr === "b") isCorrect = (ans === "optionb" || ans === "b" || ans === optB);
            else if (corr === "optionc" || corr === "c") isCorrect = (ans === "optionc" || ans === "c" || ans === optC);
            else if (corr === "optiond" || corr === "d") isCorrect = (ans === "optiond" || ans === "d" || ans === optD);
            else if (corr === optA) isCorrect = (ans === "optiona" || ans === "a" || ans === optA);
            else if (corr === optB) isCorrect = (ans === "optionb" || ans === "b" || ans === optB);
            else if (corr === optC) isCorrect = (ans === "optionc" || ans === "c" || ans === optC);
            else if (corr === optD) isCorrect = (ans === "optiond" || ans === "d" || ans === optD);
        }

        if (isCorrect) {
            correctAnswers++;
            score++;
            question.isCorrect = true;
        }
        else {
            question.isCorrect = false;
            wrongAnswers++;
        }

    }

    // calculate repport
    totalQuestions = questions.length;
    grade = Math.round((correctAnswers / totalQuestions) * 100);
    answeredQuestions = questions.map(question => {
        return {
            question: question.question,
            correctAnswer: question.correctAnswer,
            isCorrect: question.isCorrect,
            // answeredQuestions: answeredQuestions,
        }
    });

    const isExamTypeExam = ["final", "exam", "examination"].includes((examFound.examType || "").toLowerCase());
    const isTestType = ["test", "quiz", "continuous assessment", "ca"].includes((examFound.examType || "").toLowerCase());
    const effectiveTotalMark = examFound.totalMark || (isTestType ? 30 : 70);
    const effectivePassMark = examFound.passMark !== undefined ? Number(examFound.passMark) : (isTestType ? 15 : 40);
    const scaledScore = Math.round(((correctAnswers / totalQuestions) * effectiveTotalMark) * 10) / 10;

    // calculate status (pass mark 40 for Exam out of 70, 15 for Test out of 30)
    const passThreshold = effectivePassMark <= 100 && effectiveTotalMark === 100
        ? effectivePassMark
        : (effectivePassMark / effectiveTotalMark) * 100;
    if (grade >= passThreshold || scaledScore >= effectivePassMark) {
        status = "Passed";
    }
    else {
        status = "Failed";
    }

    // Remarks
    if (grade >= 80) {
        remarks = "Excellent";
    }
    else if (grade >= 70) {
        remarks = "Very Good";
    }
    else if (grade >= 60) {
        remarks = "Good";
    }
    else if (grade >= 40) {
        remarks = "Fair";
    } else {
        remarks = "Poor";
    }
    const yearId = examFound.academicYear?._id || examFound.academicYear;
    const termId = examFound.academicTerm?._id || examFound.academicTerm;
    const classId = examFound.classLevel?._id || examFound.classLevel;
    const subjectId = examFound.subject?._id || examFound.subject;
    const subjectName = examFound.subject?.name || (typeof examFound.subject === "string" ? examFound.subject : "Subject");
    const programId = examFound.program?._id || examFound.program || studentFound.program?._id || studentFound.program;
    const programName = examFound.program?.name || studentFound.program?.name || "";

    // Check if an existing ExamResult exists for this student in this subject & term so test & exam are saved together in one line
    let examResults = await ExamResults.findOne({
        $or: [
            { studentID: studentFound?.StudentId, subject: subjectId, academicTerm: termId },
            { studentID: studentFound?._id.toString(), subject: subjectId, academicTerm: termId },
            { _id: { $in: studentFound.examsResults || [] }, subject: subjectId, academicTerm: termId }
        ]
    });

    if (examResults) {
        if (isExamTypeExam) {
            examResults.examScore = scaledScore;
        } else {
            examResults.testScore = scaledScore;
        }
        const combinedTotal = (examResults.testScore || 0) + (examResults.examScore || 0);
        examResults.score = combinedTotal;
        examResults.grade = Math.min(100, Math.round(combinedTotal));
        examResults.passMark = 40;
        examResults.status = combinedTotal >= 40 ? "Passed" : "Failed";

        if (examResults.grade >= 80) examResults.remarks = "Excellent";
        else if (examResults.grade >= 70) examResults.remarks = "Very Good";
        else if (examResults.grade >= 60) examResults.remarks = "Good";
        else if (examResults.grade >= 40) examResults.remarks = "Fair";
        else examResults.remarks = "Poor";

        if (Array.isArray(answeredQuestions) && answeredQuestions.length > 0) {
            examResults.answeredQuestions = answeredQuestions;
        }
        if (!examResults.examsTaken) examResults.examsTaken = [];
        if (!examResults.examsTaken.includes(examFound._id)) {
            examResults.examsTaken.push(examFound._id);
        }
        await examResults.save();
    } else {
        examResults = await ExamResults.create({
            studentID: studentFound?.StudentId,
            exam: examFound?._id,
            examsTaken: [examFound?._id],
            grade,
            score: scaledScore,
            passMark: effectivePassMark,
            testScore: isExamTypeExam ? 0 : scaledScore,
            examScore: isExamTypeExam ? scaledScore : 0,
            status,
            remarks,
            subject: subjectId,
            subjectName: subjectName,
            program: programId,
            programName: programName,
            currentClassLevel: studentFound.currentClassLevel || (examFound.classLevel?.name || ""),
            classLevel: classId,
            academicTerm: termId,
            academicYear: yearId,
            answeredQuestions: answeredQuestions,
            isTeacherPublished: false,
            isPublished: false,
        });

        if (!studentFound.examsResults.includes(examResults._id)) {
            studentFound.examsResults.push(examResults._id);
            await studentFound.save();
        }
    }

    // Automatically document score into StudentSubjectResult for Report Card system
    try {
        const StudentSubjectResult = require("../../models/Academy/StudentSubjectResult");

        if (yearId && termId && classId && subjectId) {
            let subjectResult = await StudentSubjectResult.findOne({
                student: studentFound._id,
                academicYear: yearId,
                academicTerm: termId,
                classLevel: classId,
                subject: subjectId,
            });

            // If it's a test/quiz, score is scaled to max 30 marks
            // If it's a final exam, score is scaled to max 70 marks
            const scaledScore = isExamTypeExam
                ? Math.min(70, Math.round(((grade || 0) / 100) * 70 * 10) / 10)
                : Math.min(30, Math.round(((grade || 0) / 100) * 30 * 10) / 10);

            if (!subjectResult) {
                const initTest = isExamTypeExam ? 0 : scaledScore;
                const initExam = isExamTypeExam ? scaledScore : 0;
                subjectResult = new StudentSubjectResult({
                    student: studentFound._id,
                    studentID: studentFound.StudentId,
                    academicYear: yearId,
                    academicTerm: termId,
                    classLevel: classId,
                    subject: subjectId,
                    subjectName: subjectName,
                    testScore: initTest,
                    examScore: initExam,
                    totalScore: initTest + initExam,
                    grade: Math.min(100, Math.round(initTest + initExam)),
                    recordedBy: examFound.createdBy || studentFound._id,
                    status: "saved",
                });
            } else {
                if (isExamTypeExam) {
                    subjectResult.examScore = scaledScore;
                } else {
                    subjectResult.testScore = scaledScore;
                }
                subjectResult.totalScore = (subjectResult.testScore || 0) + (subjectResult.examScore || 0);
                subjectResult.grade = Math.min(100, Math.round(subjectResult.totalScore));
            }

            await subjectResult.save();
        }
    } catch (ssrErr) {
        console.error("Auto-document to StudentSubjectResult error:", ssrErr.message);
    }

    // promote
    // promot student to level 200
    if (examFound.academicTerm && examFound.academicTerm.name === "3rd Term" && status === "Passed" &&
        studentFound.currentClassLevel === "Level 100") {
        studentFound.classLevels.push("Level 200");
        studentFound.currentClassLevel = "Level 200";
        await studentFound.save();
    }

    // promot student to level 300
    if (examFound.academicTerm && examFound.academicTerm.name === "3rd Term" && status === "Passed" &&
        studentFound.currentClassLevel === "Level 200") {
        studentFound.classLevels.push("Level 300");
        studentFound.currentClassLevel = "Level 300";
        await studentFound.save();
    }

    // promot student to level 400
    if (examFound.academicTerm && examFound.academicTerm.name === "3rd Term" && status === "Passed" &&
        studentFound.currentClassLevel === "Level 300") {
        studentFound.classLevels.push("Level 400");
        studentFound.currentClassLevel = "Level 400";
        await studentFound.save();
    }

    // promote student to graduate
    if (examFound.academicTerm && examFound.academicTerm.name === "3rd Term" && status === "Passed" &&
        studentFound.currentClassLevel === "Level 400") {
        studentFound.isGraduated = true;
        studentFound.yearGraduated = new Date();
        await studentFound.save();
    }
    // send response
    res.status(200).json({
        status: "Success",
        message: "Exam submitted successfully! Your submission has been delivered to your respective teacher's dashboard for review. Once verified and published by your teacher, it will proceed to administration for final release.",
        data: examResults,
        examId: examFound?._id,
    });
});


//@desc teacher get students strictly in their assigned class level offering the teacher subject alone
//@route GET /api/v1/students/teacher
//@route GET /api/v1/students/teacher/class-students
//@access private teacher only
exports.fetchTeacherClassStudentsCtrl = AsyncHandler(async (req, res) => {
    const teacher = await Teacher.findById(req.userAuth?._id);
    if (!teacher) {
        throw new Error("Teacher not found");
    }

    // Only return empty list if teacher has NEITHER classLevel NOR subject assigned
    if (!teacher.classLevel && !teacher.subject) {
        return res.status(200).json({
            status: "Success",
            message: "No class level or subject assigned to your account yet.",
            data: [],
            teacherClassLevel: null,
            teacherProgram: teacher.program || null,
            teacherSubject: null,
        });
    }

    const mongoose = require("mongoose");
    const Subject = require("../../models/Academy/Subject");
    const ClassLevel = require("../../models/Academy/ClassLevel");

    let targetClassName = (teacher.classLevel || "").toString().trim();

    // If teacher.classLevel is an ObjectId, resolve the ClassLevel document's name
    if (teacher.classLevel && mongoose.Types.ObjectId.isValid(teacher.classLevel)) {
        const cDoc = await ClassLevel.findById(teacher.classLevel);
        if (cDoc && cDoc.name) {
            targetClassName = cDoc.name.trim();
        }
    }

    // Extract digits to isolate level number (e.g. "200" from "Level 200", "200L", "200")
    const extractLevelNumber = (str) => {
        if (!str || typeof str !== "string") return null;
        const match = str.match(/\d+/);
        return match ? match[0] : null;
    };

    const teacherLevelNumber = extractLevelNumber(targetClassName);

    // Build regex to match level number boundary-checked so "200" matches "Level 200" or "200L" but NEVER "400"
    const levelRegex = teacherLevelNumber
        ? new RegExp(`(^|\\b|\\D)${teacherLevelNumber}(\\D|\\b|$)`, "i")
        : targetClassName ? new RegExp(`^${safeEscapeRegex(targetClassName)}$`, "i") : null;

    // Collect all subject IDs and names associated with this teacher
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

    // Look up Subject documents linked to teacher (by teacher ref or name or _id)
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

    const hasTeacherSubject = teacherSubjectNames.size > 0 || teacherSubjectIds.size > 0;

    // Base database filter
    const orConditions = [];

    if (targetClassName) {
        orConditions.push({ currentClassLevel: targetClassName });
        orConditions.push({ currentClassLevel: teacher.classLevel });
        if (levelRegex) {
            orConditions.push({ currentClassLevel: { $regex: levelRegex } });
        }
    }

    if (hasTeacherSubject) {
        Array.from(teacherSubjectNames).forEach((name) => {
            const esc = safeEscapeRegex(name);
            orConditions.push({ subject: { $regex: new RegExp(`^${esc}$`, "i") } });
        });
        if (teacherSubjectIds.size > 0) {
            orConditions.push({
                "enrolledSubjects.subject": { $in: Array.from(teacherSubjectIds).map(id => new mongoose.Types.ObjectId(id)) }
            });
        }
    }

    orConditions.push({ assignedTeacher: teacher._id });

    const filter = orConditions.length > 0 ? { $or: orConditions } : {};

    const rawStudents = await Student.find(filter)
        .populate("program academicYear assignedTeacher")
        .populate("enrolledSubjects.subject")
        .select("-password")
        .sort({ createdAt: -1 });

    // Strict filtering:
    // 1) Student MUST match teacher's class level (if teacher has classLevel).
    // 2) If teacher has subject(s), student MUST be offering the teacher's subject alone!
    const strictStudents = rawStudents.filter((student) => {
        // 1. Class level check
        if (targetClassName) {
            const studentLevel = (student.currentClassLevel || "").trim();
            const studentLevelNum = extractLevelNumber(studentLevel);
            let classMatches = false;
            if (teacherLevelNumber && studentLevelNum) {
                classMatches = studentLevelNum === teacherLevelNumber;
            } else {
                classMatches = studentLevel.toLowerCase() === targetClassName.toLowerCase();
            }
            if (!classMatches) {
                return false;
            }
        }

        // 2. Subject offering check: MUST offer the teacher's subject alone
        if (hasTeacherSubject) {
            let offersSubject = false;

            // Check student's direct subject field
            if (student.subject) {
                const sSubStr = student.subject.toString().trim().toLowerCase();
                const sSubId = student.subject._id ? student.subject._id.toString() : student.subject.toString();
                if (teacherSubjectNames.has(sSubStr) || teacherSubjectIds.has(sSubId)) {
                    offersSubject = true;
                }
            }

            // Check student's enrolledSubjects array
            if (!offersSubject && Array.isArray(student.enrolledSubjects)) {
                for (const item of student.enrolledSubjects) {
                    if (!item || !item.subject) continue;
                    const subObj = item.subject;
                    const subId = (subObj._id || subObj).toString();
                    const subName = (subObj.name || "").toString().trim().toLowerCase();

                    if (teacherSubjectIds.has(subId) || teacherSubjectNames.has(subName)) {
                        offersSubject = true;
                        break;
                    }
                }
            }

            // Student does NOT offer the teacher's subject
            if (!offersSubject) {
                return false;
            }
        }

        return true;
    });

    res.status(200).json({
        status: "Success",
        message: "Students strictly in your class offering your subject fetched successfully",
        data: strictStudents,
        teacherClassLevel: targetClassName || null,
        teacherProgram: teacher.program || null,
        teacherSubject: teacher.subject || null,
    });
});

//@desc fetch student enrolled subjects arranged from 100L to Final
//@route GET /api/v1/students/enrolled-subjects
//@access private student only (or admin/teacher with query ?studentId=)
exports.fetchStudentEnrolledSubjectsCtrl = AsyncHandler(async (req, res) => {
    let studentId = req.userAuth?.id || req.userAuth?._id;
    if ((req.userAuth?.role === "admin" || req.userAuth?.role === "teacher") && req.query.studentId) {
        studentId = req.query.studentId;
    }

    const Subject = require("../../models/Academy/Subject");
    const student = await Student.findById(studentId)
        .populate({
            path: "program",
            populate: [
                { path: "subjects" },
                { path: "teachers", select: "name email" }
            ]
        })
        .populate({
            path: "enrolledSubjects.subject",
            populate: [
                { path: "teacher", select: "name email" },
                { path: "academicTerms", select: "name" },
                { path: "program", select: "name" }
            ]
        })
        .populate({
            path: "examsResults",
            populate: [
                {
                    path: "exam",
                    populate: [
                        { path: "subject" },
                        { path: "classLevel" }
                    ]
                },
                { path: "classLevel" }
            ]
        });

    if (!student) {
        throw new Error("Student not found");
    }

    // 1. Fetch available class levels in the system
    const dbClassLevels = await ClassLevel.find().sort({ createdAt: 1 });
    
    // Standard tiers from registered classes
    const standardLevels = dbClassLevels.length > 0
        ? dbClassLevels.map(c => c.name.trim()).filter(Boolean)
        : ["jss 1", "JSS 2 Class", "JSS 3 class"];
    
    // Combine unique names
    const classLevelNamesSet = new Set(standardLevels);
    dbClassLevels.forEach(c => {
        if (c.name && c.name.trim()) {
            classLevelNamesSet.add(c.name.trim());
        }
    });
    // Also include student's current & historical classLevels
    if (student.classLevels && Array.isArray(student.classLevels)) {
        student.classLevels.forEach(lvl => {
            if (lvl && lvl.trim()) classLevelNamesSet.add(lvl.trim());
        });
    }
    if (student.currentClassLevel) {
        classLevelNamesSet.add(student.currentClassLevel.trim());
    }

    // Helper: extract numeric tier for sorting (e.g. "Level 100" -> 100, "200L" -> 200, "Final" -> 999)
    const getLevelSortOrder = (name) => {
        const lower = (name || "").toLowerCase().trim();
        if (lower.includes("final")) return 999;
        const match = lower.match(/\d+/);
        if (match) {
            return parseInt(match[0], 10);
        }
        return 500;
    };

    // Helper: generate nice short code (e.g. "100L", "200L", "300L", "400L / Final", "Final Year")
    const getShortCode = (name) => {
        const lower = (name || "").toLowerCase().trim();
        const digits = lower.match(/\d+/)?.[0];
        if (lower.includes("final")) {
            return digits ? `${digits}L / Final` : "Final Year";
        }
        if (digits) {
            return `${digits}L`;
        }
        return name;
    };

    // Filter to canonical levels so we don't have messy duplicates like "400 levels", "400l", "Level 400"
    const canonicalMap = new Map();
    Array.from(classLevelNamesSet).forEach(name => {
        const lower = name.toLowerCase().trim();
        const digits = lower.match(/\d+/)?.[0];
        const isFinal = lower.includes("final");
        
        // Ignore corrupted non-class entries
        if (!digits && !isFinal && !lower.includes("level")) return;

        const key = isFinal ? "final" : (digits || lower);
        
        if (!canonicalMap.has(key)) {
            canonicalMap.set(key, name);
        } else {
            const current = canonicalMap.get(key);
            if (/^level\s*\d+/i.test(name) && !/^level\s*\d+/i.test(current)) {
                canonicalMap.set(key, name);
            }
        }
    });

    const sortedClasses = Array.from(canonicalMap.values()).sort((a, b) => {
        return getLevelSortOrder(a) - getLevelSortOrder(b);
    });

    // 2. Collect student's enrolled subjects
    const enrolledSubjectsList = [];
    const enrolledKeySet = new Set(); // to prevent duplicate subject in same class level

    // From student.enrolledSubjects
    if (student.enrolledSubjects && student.enrolledSubjects.length > 0) {
        for (const item of student.enrolledSubjects) {
            if (item.subject) {
                let subObj = typeof item.subject === "object" && item.subject.name ? item.subject : null;
                const subId = subObj ? subObj._id?.toString() : item.subject?.toString();
                if (!subObj && subId && mongoose.Types.ObjectId.isValid(subId)) {
                    subObj = await Subject.findById(subId).populate("teacher academicTerms program");
                }
                if (!subObj && typeof item.subject === "string") {
                    subObj = await Subject.findOne({
                        name: { $regex: new RegExp(`^${item.subject.trim()}$`, "i") }
                    }).populate("teacher academicTerms program");
                }
                const subName = subObj ? subObj.name : (typeof item.subject === "string" && !mongoose.Types.ObjectId.isValid(item.subject) ? item.subject : "Subject");
                const cLevel = (item.classLevel && !item.classLevel.includes("100") ? item.classLevel : "") || student.currentClassLevel || "";
                const dedupeKey = `${subId || subName}-${cLevel}`.toLowerCase();

                if (!enrolledKeySet.has(dedupeKey)) {
                    enrolledKeySet.add(dedupeKey);
                    enrolledSubjectsList.push({
                        _id: subId || item._id,
                        subjectId: subId,
                        name: subName,
                        description: subObj?.description || "",
                        duration: subObj?.duration || "3 months",
                        teacher: subObj?.teacher || null,
                        academicTerms: subObj?.academicTerms || null,
                        program: subObj?.program || null,
                        classLevel: cLevel,
                        isCore: isCoreSubject(subObj || subName),
                        dateEnrolled: item.dateEnrolled || student.dateAdmitted || new Date(),
                    });
                }
            }
        }
    }

    // Backwards compatibility: From student.subject (legacy single subject)
    if (student.subject) {
        let studentSubName = student.subject.trim();
        let sDoc = null;
        if (mongoose.Types.ObjectId.isValid(studentSubName)) {
            sDoc = await Subject.findById(studentSubName).populate("teacher academicTerms program");
            if (sDoc) studentSubName = sDoc.name;
        } else {
            sDoc = await Subject.findOne({
                name: { $regex: new RegExp(`^${safeEscapeRegex(studentSubName)}$`, "i") }
            }).populate("teacher academicTerms program");
        }
        const targetClass = student.currentClassLevel || "";
        const dedupeKey = `${studentSubName}-${targetClass}`.toLowerCase();
        
        const alreadyExists = Array.from(enrolledKeySet).some(k => k.startsWith(studentSubName.toLowerCase()));
        if (!alreadyExists) {
            enrolledKeySet.add(dedupeKey);
            const enrolledEntry = {
                _id: sDoc?._id || new mongoose.Types.ObjectId(),
                subjectId: sDoc?._id?.toString() || null,
                name: sDoc?.name || studentSubName,
                description: sDoc?.description || "Course Curriculum Subject",
                duration: sDoc?.duration || "3 months",
                teacher: sDoc?.teacher || student.assignedTeacher || null,
                academicTerms: sDoc?.academicTerms || null,
                program: sDoc?.program || student.program || null,
                classLevel: targetClass,
                dateEnrolled: student.dateAdmitted || new Date(),
            };
            enrolledSubjectsList.push(enrolledEntry);

            // Also persist to student.enrolledSubjects for future queries
            try {
                if (sDoc?._id) {
                    await Student.findByIdAndUpdate(student._id, {
                        $addToSet: {
                            enrolledSubjects: {
                                subject: sDoc._id,
                                classLevel: targetClass,
                                dateEnrolled: new Date(),
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Auto-syncing legacy subject error:", e);
            }
        }
    }

    // Auto-sync & include all subjects under the student's assigned program
    if (student.program) {
        const progId = student.program._id || student.program;
        const progSubjects = await Subject.find({
            $or: [
                { program: progId },
                ...(Array.isArray(student.program.subjects) && student.program.subjects.length > 0 ? [{ _id: { $in: student.program.subjects } }] : [])
            ]
        }).populate("teacher academicTerms program");

        const syncList = [];
        for (const pSub of progSubjects) {
            const subId = pSub._id ? pSub._id.toString() : "";
            const subName = pSub.name || "Subject";
            const cLevel = student.currentClassLevel || (pSub.classLevel && !pSub.classLevel.includes("100") ? pSub.classLevel : "") || "";
            const dedupeKey = `${subId || subName}-${cLevel}`.toLowerCase();

            if (!enrolledKeySet.has(dedupeKey)) {
                enrolledKeySet.add(dedupeKey);
                enrolledSubjectsList.push({
                    _id: subId,
                    subjectId: subId,
                    name: subName,
                    description: pSub.description || "Program Curriculum Subject",
                    duration: pSub.duration || "3 months",
                    teacher: pSub.teacher || student.assignedTeacher || null,
                    academicTerms: pSub.academicTerms || null,
                    program: pSub.program || student.program || null,
                    classLevel: cLevel,
                    dateEnrolled: student.dateAdmitted || new Date(),
                });
                syncList.push({
                    subject: pSub._id,
                    classLevel: cLevel,
                    dateEnrolled: new Date(),
                });
            }
        }

        if (syncList.length > 0) {
            try {
                await Student.findByIdAndUpdate(student._id, {
                    $addToSet: { enrolledSubjects: { $each: syncList } }
                });
            } catch (e) {
                console.error("Auto-syncing program subjects error:", e);
            }
        }
    }

    // Auto-sync & include core subjects (Mathematics and English) generally
    const generalCoreSubjects = await resolveCoreSubjectsForStudent(student.program);
    const coreSyncList = [];
    for (const cSub of generalCoreSubjects) {
        const subId = cSub._id ? cSub._id.toString() : "";
        const subName = cSub.name || "Core Subject";
        const cLevel = student.currentClassLevel || (cSub.classLevel && !cSub.classLevel.includes("100") ? cSub.classLevel : "") || "";
        const dedupeKey = `${subId || subName}-${cLevel}`.toLowerCase();

        if (!enrolledKeySet.has(dedupeKey)) {
            enrolledKeySet.add(dedupeKey);
            enrolledSubjectsList.push({
                _id: subId,
                subjectId: subId,
                name: subName,
                description: cSub.description || "Core Compulsory Subject",
                duration: cSub.duration || "3 months",
                teacher: cSub.teacher || student.assignedTeacher || null,
                academicTerms: cSub.academicTerms || null,
                program: cSub.program || student.program || null,
                classLevel: cLevel,
                isCore: true,
                dateEnrolled: student.dateAdmitted || new Date(),
            });
            coreSyncList.push({
                subject: cSub._id,
                classLevel: cLevel,
                dateEnrolled: new Date(),
            });
        }
    }
    if (coreSyncList.length > 0) {
        try {
            await Student.findByIdAndUpdate(student._id, {
                $addToSet: { enrolledSubjects: { $each: coreSyncList } }
            });
        } catch (e) {
            console.error("Auto-syncing core subjects error:", e);
        }
    }

    // Also populate from student's exam results across class levels if not yet in enrolled
    if (student.examsResults && student.examsResults.length > 0) {
        for (const resItem of student.examsResults) {
            const exam = resItem.exam;
            const examSub = exam?.subject;
            if (examSub) {
                const subId = examSub._id?.toString();
                const subName = examSub.name;
                const examClass = resItem.classLevel?.name || exam.classLevel?.name || student.currentClassLevel || "";
                const dedupeKey = `${subId || subName}-${examClass}`.toLowerCase();

                if (!enrolledKeySet.has(dedupeKey)) {
                    enrolledKeySet.add(dedupeKey);
                    enrolledSubjectsList.push({
                        _id: subId || resItem._id,
                        subjectId: subId,
                        name: subName,
                        description: examSub.description || "",
                        duration: examSub.duration || "3 months",
                        teacher: examSub.teacher || null,
                        academicTerms: examSub.academicTerms || null,
                        program: examSub.program || null,
                        classLevel: examClass,
                        dateEnrolled: resItem.createdAt || new Date(),
                    });
                }
            }
        }
    }

    // Helper to check if a subject matches a class level
    const matchClassLevel = (subjectClass, targetClass) => {
        if (!subjectClass || !targetClass) return false;
        const subTrim = subjectClass.toString().trim().toLowerCase();
        const tarTrim = targetClass.toString().trim().toLowerCase();
        if (subTrim === tarTrim) return true;

        const subDigits = subTrim.match(/\d+/)?.[0];
        const tarDigits = tarTrim.match(/\d+/)?.[0];
        if (subDigits && tarDigits && subDigits === tarDigits) return true;

        if (subTrim.includes("final") && tarTrim.includes("final")) return true;
        return false;
    };

    // 3. Arrange subjects under each class level from 100L to Final
    const currentDigits = (student.currentClassLevel || "").match(/\d+/)?.[0];
    const arrangedByClass = sortedClasses.map((clsName) => {
        const clsDigits = clsName.match(/\d+/)?.[0];
        const isFinal = clsName.toLowerCase().includes("final") || clsDigits === "400";
        const shortCode = getShortCode(clsName);

        // Filter subjects for this class and deduplicate by subject name/id
        const seenInClass = new Set();
        const subjectsForClass = enrolledSubjectsList.filter(s => {
            if (!matchClassLevel(s.classLevel, clsName)) return false;
            const normKey = (s.name || s._id).toString().toLowerCase().trim();
            if (seenInClass.has(normKey)) return false;
            seenInClass.add(normKey);
            return true;
        });

        // Is completed: if student's current level digits > this level digits
        let isCompleted = false;
        let isCurrent = false;
        if (currentDigits && clsDigits) {
            const currNum = parseInt(currentDigits, 10);
            const thisNum = parseInt(clsDigits, 10);
            if (currNum > thisNum) isCompleted = true;
            if (currNum === thisNum) isCurrent = true;
        } else if (student.currentClassLevel) {
            isCurrent = student.currentClassLevel.toLowerCase() === clsName.toLowerCase();
        }

        return {
            classLevel: clsName,
            shortCode,
            isCurrent,
            isCompleted,
            isFinal,
            count: subjectsForClass.length,
            subjects: subjectsForClass,
        };
    });

    // Filter to standard progression (100L to 400L / Final) or levels that have enrolled subjects
    const relevantArranged = arrangedByClass.filter((group) => {
        const digits = group.classLevel.match(/\d+/)?.[0];
        const num = digits ? parseInt(digits, 10) : null;
        if (num && num <= 400) return true;
        if (group.isFinal) return true;
        if (group.count > 0) return true;
        return false;
    });

    res.status(200).json({
        status: "Success",
        message: "Enrolled subjects fetched successfully",
        data: {
            arrangedByClass: relevantArranged,
            allEnrolled: enrolledSubjectsList,
            totalEnrolled: enrolledSubjectsList.length,
            currentClassLevel: student.currentClassLevel || "",
            studentName: student.name,
            studentId: student.StudentId,
        }
    });
});

//@desc student self-enroll into subject(s) for a specific class level
//@route POST /api/v1/students/enroll-subject
//@access private student only
exports.studentEnrollSubjectCtrl = AsyncHandler(async (req, res) => {
    const studentId = req.userAuth?.id || req.userAuth?._id;
    const { subjectId, subjectIds, classLevel } = req.body;

    const idsToEnroll = Array.isArray(subjectIds)
        ? subjectIds
        : (subjectIds ? [subjectIds] : (subjectId ? [subjectId] : []));

    if (idsToEnroll.length === 0) {
        throw new Error("Subject ID is required for enrollment");
    }

    const Subject = require("../../models/Academy/Subject");
    const student = await Student.findById(studentId);
    if (!student) {
        throw new Error("Student not found");
    }

    if (!student.enrolledSubjects) {
        student.enrolledSubjects = [];
    }

    const newlyEnrolled = [];
    const alreadyEnrolledNames = [];

    for (const sId of idsToEnroll) {
        if (!sId) continue;
        const subjectDoc = await Subject.findById(sId);
        if (!subjectDoc) continue;

        const targetClass = (classLevel || student.currentClassLevel || (subjectDoc.classLevel && !subjectDoc.classLevel.includes("100") ? subjectDoc.classLevel : "") || "").trim();

        // Check if already enrolled in this subject for this class level
        const alreadyEnrolled = student.enrolledSubjects.some(
            item => (item.subject?._id || item.subject)?.toString() === subjectDoc._id.toString() &&
                    (item.classLevel || "").toLowerCase() === targetClass.toLowerCase()
        );

        if (alreadyEnrolled) {
            alreadyEnrolledNames.push(subjectDoc.name);
            continue;
        }

        student.enrolledSubjects.push({
            subject: subjectDoc._id,
            classLevel: targetClass,
            dateEnrolled: new Date(),
        });
        newlyEnrolled.push(subjectDoc);

        // Also update legacy subject field if not set
        if (!student.subject) {
            student.subject = subjectDoc.name;
        }
    }

    if (newlyEnrolled.length === 0 && alreadyEnrolledNames.length > 0) {
        throw new Error(`You are already enrolled in: ${alreadyEnrolledNames.join(", ")}`);
    }

    await student.save();

    const enrolledNames = newlyEnrolled.map(s => s.name).join(", ");
    let message = `Successfully enrolled in ${newlyEnrolled.length} subject(s)`;
    if (newlyEnrolled.length === 1) {
        const enrolledClass = classLevel || (newlyEnrolled[0].classLevel && !newlyEnrolled[0].classLevel.includes("100") ? newlyEnrolled[0].classLevel : "") || student.currentClassLevel || "";
        message = `Successfully enrolled in ${newlyEnrolled[0].name}${enrolledClass ? ` (${enrolledClass})` : ""}`;
    } else if (newlyEnrolled.length > 1) {
        message = `Successfully enrolled in: ${enrolledNames}`;
    }

    res.status(200).json({
        status: "Success",
        message,
        data: {
            newlyEnrolled,
            totalEnrolled: student.enrolledSubjects.length,
        }
    });
});

//@desc student unenroll from subject
//@route DELETE /api/v1/students/unenroll-subject/:subjectId
//@access private student only
exports.studentUnenrollSubjectCtrl = AsyncHandler(async (req, res) => {
    const studentId = req.userAuth?.id || req.userAuth?._id;
    const { subjectId } = req.params;
    const { classLevel } = req.query;

    const student = await Student.findById(studentId);
    if (!student) {
        throw new Error("Student not found");
    }

    student.enrolledSubjects = (student.enrolledSubjects || []).filter(item => {
        const matchesSubject = item.subject?.toString() === subjectId;
        const matchesClass = classLevel ? item.classLevel?.toLowerCase() === classLevel.toLowerCase() : true;
        return !(matchesSubject && matchesClass);
    });

    if (student.enrolledSubjects.length > 0) {
        const Subject = require("../../models/Academy/Subject");
        const nextSub = await Subject.findById(student.enrolledSubjects[0].subject);
        if (nextSub) student.subject = nextSub.name;
    } else {
        student.subject = "";
    }

    await student.save();

    res.status(200).json({
        status: "Success",
        message: "Subject unenrolled successfully",
        data: student.enrolledSubjects,
    });
});

//@desc Fetch exams for student's class, offered subject, and assigned teacher
//@route GET /api/v1/students/exams
//@access Private (Student only)
exports.fetchStudentClassExamsCtrl = AsyncHandler(async (req, res) => {
    const studentId = req.userAuth?._id || req.userAuth?.id;
    const student = await Student.findById(studentId)
        .populate("program")
        .populate("assignedTeacher")
        .populate({
            path: "enrolledSubjects.subject",
            populate: { path: "teacher program" }
        })
        .lean();

    if (!student) {
        throw new Error("Student not found");
    }

    if (!student.assignedTeacher && student.subject) {
        const Teacher = require("../../models/Staff/Teacher");
        const subRegex = new RegExp(`^${student.subject.toString().trim()}$`, "i");
        const matchedTeacher = await Teacher.findOne({
            $or: [{ subject: student.subject }, { subject: subRegex }]
        }).lean();
        if (matchedTeacher) {
            student.assignedTeacher = matchedTeacher;
        }
    }

    const { filterExamsForStudent } = require("../academic/examCtrl");
    const Exam = require("../../models/Academy/Exam");
    const Teacher = require("../../models/Staff/Teacher");
    const Admin = require("../../models/Staff/admin");

    const rawExams = await Exam.find()
        .populate({
            path: "questions",
            populate: { path: "createdBy" }
        })
        .populate("subject program academicTerm classLevel academicYear")
        .sort({ createdAt: -1 })
        .lean();

    const exams = await Promise.all(
        rawExams.map(async (exam) => {
            if (!exam.createdBy) {
                return { ...exam, createdBy: { name: "School Administration", role: "admin" } };
            }
            const teacher = await Teacher.findById(exam.createdBy).select("name email teacherId role subject classLevel").lean();
            if (teacher) {
                return { ...exam, createdBy: { ...teacher, role: teacher.role || "teacher" } };
            }
            const admin = await Admin.findById(exam.createdBy).select("name email role").lean();
            if (admin) {
                return { ...exam, createdBy: { ...admin, role: "admin" } };
            }
            return { ...exam, createdBy: { _id: exam.createdBy, name: "School Administration", role: "admin" } };
        })
    );

    const filtered = filterExamsForStudent(exams, student);

    res.status(200).json({
        status: "Success",
        message: "Student class exams fetched successfully",
        data: filtered,
    });
});

//@desc Teacher lookup student by studentId
//@route GET /api/v1/students/teacher/lookup/:studentId
//@access private Teacher only
exports.teacherLookupStudentCtrl = AsyncHandler(async (req, res) => {
    const { studentId } = req.params;
    if (!studentId || !studentId.trim()) {
        return res.status(400).json({
            status: "failed",
            message: "Student ID is required."
        });
    }

    const teacher = await Teacher.findById(req.userAuth?._id);
    if (!teacher) {
        return res.status(404).json({
            status: "failed",
            message: "Teacher account not found."
        });
    }

    // Find student by StudentId or _id
    let student = null;
    const cleanId = studentId.trim();
    if (cleanId.match(/^[0-9a-fA-F]{24}$/)) {
        student = await Student.findById(cleanId)
            .populate("program academicYear assignedTeacher")
            .populate("enrolledSubjects.subject");
    }
    if (!student) {
        student = await Student.findOne({
            StudentId: { $regex: new RegExp(`^${cleanId}$`, "i") }
        })
            .populate("program academicYear assignedTeacher")
            .populate("enrolledSubjects.subject");
    }

    if (!student) {
        return res.status(404).json({
            status: "failed",
            message: `Student with identifier "${cleanId}" was not found.`
        });
    }

    // Strictly verify teacher access
    const { isStudentInTeacherClassAndOfferingSubject, getTeacherSubjectInfo, extractLevelNumber } = require("../academic/examResultsCtrl");
    const teacherSubjectInfo = await getTeacherSubjectInfo(teacher);

    let targetClassName = (teacher.classLevel || "").toString().trim();
    if (teacher.classLevel && mongoose.Types.ObjectId.isValid(teacher.classLevel)) {
        const cDoc = await ClassLevel.findById(teacher.classLevel);
        if (cDoc && cDoc.name) targetClassName = cDoc.name.trim();
    }
    const teacherLevelNumber = extractLevelNumber(targetClassName);

    const isAllowed = isStudentInTeacherClassAndOfferingSubject(
        student,
        teacher,
        teacherSubjectInfo,
        targetClassName,
        teacherLevelNumber
    );

    if (!isAllowed) {
        return res.status(403).json({
            status: "failed",
            message: `Student "${student.name}" (${student.StudentId}) is not in your assigned class or does not offer your subject.`
        });
    }

    res.status(200).json({
        status: "Success",
        message: "Student details retrieved successfully",
        data: {
            _id: student._id,
            name: student.name,
            StudentId: student.StudentId,
            email: student.email,
            currentClassLevel: student.currentClassLevel,
            program: student.program,
            programName: student.program?.name || "",
            subject: student.subject,
            enrolledSubjects: student.enrolledSubjects,
        }
    });
});