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

//@desc register student
//@route POST /api/v1/students/admin/register
//@access private Admin only

exports.adminRegisterStudent = AsyncHandler(async (req, res) => {
    const { name, password, email, classLevels, subject, program } = req.body;
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
        studentData.subject = subject;
    }
    if (req.body.enrolledSubjects && Array.isArray(req.body.enrolledSubjects)) {
        studentData.enrolledSubjects = req.body.enrolledSubjects;
    } else {
        studentData.enrolledSubjects = [];
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
                        classLevel: pSub.classLevel || studentData.currentClassLevel || "Level 100",
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

    // Auto-pick teacher if subject and class are provided
    if (studentData.subject && studentData.currentClassLevel) {
        const classDigits = studentData.currentClassLevel.toString().match(/\d+/)?.[0];
        const classQuery = [
            { classLevel: studentData.currentClassLevel },
            { classLevel: { $regex: new RegExp(`^${studentData.currentClassLevel.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&')}$`, "i") } },
            ...(classDigits ? [{ classLevel: { $regex: new RegExp(`(^|\\b|\\D)${classDigits}(\\D|\\b|$)`, "i") } }] : [])
        ];
        const subjectQuery = [
            { subject: studentData.subject },
            { subject: { $regex: new RegExp(`^${studentData.subject.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&')}$`, "i") } }
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
                    classLevel: pSub.classLevel || student.currentClassLevel || "Level 100",
                    dateEnrolled: student.dateAdmitted || new Date(),
                };
                studentProfile.enrolledSubjects.push(entry);
                newSyncItems.push({
                    subject: pSub._id,
                    classLevel: pSub.classLevel || student.currentClassLevel || "Level 100",
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
    const students = await Student.find().populate("program academicYear assignedTeacher");
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
    const student = await Student.findById(studentID).populate("program academicYear assignedTeacher");
    if (!student) {
        throw new Error("Student not found");
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
    if (name !== undefined && name !== "") updateSet.name = name;
    if (email !== undefined && email !== "") updateSet.email = email;
    if (prefectName !== undefined) updateSet.prefectName = prefectName;
    if (isSuspended !== undefined) updateSet.isSuspended = isSuspended;
    if (isWithDrawn !== undefined) updateSet.isWithDrawn = isWithDrawn;
    if (req.body.enrolledSubjects !== undefined) updateSet.enrolledSubjects = req.body.enrolledSubjects;

    // Handle subject assignment (can be ObjectId or name)
    if (subject !== undefined) {
        if (subject && mongoose.Types.ObjectId.isValid(subject)) {
            const Subject = require("../../models/Academy/Subject");
            const sDoc = await Subject.findById(subject);
            updateSet.subject = sDoc ? sDoc.name : subject;
        } else {
            updateSet.subject = subject;
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

            // Auto-enroll all subjects under this program
            const Subject = require("../../models/Academy/Subject");
            const progSubjects = await Subject.find({
                $or: [
                    { program: matchedProgramDoc._id },
                    ...(Array.isArray(matchedProgramDoc.subjects) && matchedProgramDoc.subjects.length > 0 ? [{ _id: { $in: matchedProgramDoc.subjects } }] : [])
                ]
            });

            const currentEnrolled = studentFound.enrolledSubjects || [];
            const newEnrollments = [];
            for (const pSub of progSubjects) {
                const exists = currentEnrolled.some(
                    e => (e.subject?._id || e.subject)?.toString() === pSub._id.toString()
                );
                if (!exists) {
                    newEnrollments.push({
                        subject: pSub._id,
                        classLevel: pSub.classLevel || updateSet.currentClassLevel || studentFound.currentClassLevel || "Level 100",
                        dateEnrolled: new Date(),
                    });
                }
            }

            if (newEnrollments.length > 0) {
                if (!updateOps.$addToSet) updateOps.$addToSet = {};
                updateOps.$addToSet.enrolledSubjects = { $each: newEnrollments };
            }
        }
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

    // Set class level and track history
    const updateOps = { $set: updateSet };
    if (classLevels) {
        updateSet.currentClassLevel = classLevels;
        updateOps.$addToSet = { classLevels: classLevels };
    }

    // AUTO-PICK TEACHER: if student has subject, auto-pick the teacher
    const activeClass = classLevels || studentFound.currentClassLevel;
    const activeSubject = updateSet.subject !== undefined ? updateSet.subject : studentFound.subject;

    if (activeSubject) {
        const subjectQuery = [
            { subject: activeSubject },
            { subject: { $regex: new RegExp(`^${activeSubject.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&')}$`, "i") } }
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
                { classLevel: { $regex: new RegExp(`^${targetClassStr.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&')}$`, "i") } },
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
        // NEVER match a teacher assigned to a different class level (e.g. 100L teacher for 400L student)!
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

        updateSet.assignedTeacher = matchedTeacher ? matchedTeacher._id : null;
    }

    const studentUpdated = await Student.findByIdAndUpdate(
        req.params.studentID,
        updateOps,
        {
            new: true,
            runValidators: true,
        }
    ).populate("program academicYear assignedTeacher");

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
        throw new Error("Student not found");
    }
    // get examID
    const examFound = await Exam.findById(req.params.examID)
        .populate("questions")
        .populate("academicTerm")
        .populate("subject")
        .populate("classLevel");

    if (!examFound) {
        throw new Error("Exam not found");
    }

    // Verify student is eligible: Exam must match their class, offered subject, and assigned teacher
    const { filterExamsForStudent } = require("../academic/examCtrl");
    let studentForFilter = studentFound.toObject ? studentFound.toObject() : studentFound;
    if (!studentForFilter.assignedTeacher && studentForFilter.subject) {
        const Teacher = require("../../models/Staff/Teacher");
        const subRegex = new RegExp(`^${studentForFilter.subject.toString().trim()}$`, "i");
        const matchedTeacher = await Teacher.findOne({
            $or: [{ subject: studentForFilter.subject }, { subject: subRegex }]
        }).lean();
        if (matchedTeacher) {
            studentForFilter.assignedTeacher = matchedTeacher;
        }
    }
    const eligibleExams = filterExamsForStudent([examFound], studentForFilter);
    if (!eligibleExams || eligibleExams.length === 0) {
        throw new Error("You are only eligible to take examinations set for your enrolled subject and assigned teacher in your class.");
    }

    // get question
    const questions = examFound?.questions || [];
    // get student answer
    const studentAnswers = req.body.answers;

    // check if student answered all questions
    if (!studentAnswers || questions.length !== studentAnswers.length) {
        throw new Error("You must answer all questions");
    }
    const studentFoundResults = await ExamResults.findOne({
        exam: examFound?._id,
        $or: [
            { studentID: studentFound?.StudentId },
            { studentID: studentFound?._id.toString() },
            { _id: { $in: studentFound.examsResults || [] } }
        ]
    });
    if (studentFoundResults) {
        throw new Error("You have already written this exam");
    }

    // check id student is suspended/withdrawn
    if (studentFound.isSuspended || studentFound.isWithDrawn) {
        throw new Error("You are suspended/withdrawn, you can't take this exam");
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
    grade = (correctAnswers / totalQuestions) * 100;
    answeredQuestions = questions.map(question => {
        return {
            question: question.question,
            correctAnswer: question.correctAnswer,
            isCorrect: question.isCorrect,
            // answeredQuestions: answeredQuestions,
        }
    });

    // calculate status
    if (grade >= 50) {
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
    else if (grade >= 50) {
        remarks = "Fair";
    } else {
        remarks = "Poor";
    }
    // generate results
    const examResults = await ExamResults.create({
        studentID: studentFound?.StudentId,
        exam: examFound?._id,
        grade,
        score,
        status,
        remarks,
        classLevel: examFound?.classLevel,
        academicTerm: examFound?.academicTerm,
        academicYear: examFound?.academicYear,
        answeredQuestions: answeredQuestions,
        isTeacherPublished: false, // Step 1: Delivered to respective teacher's dashboard for verification & publishing
        isPublished: false, // Step 2: Hidden from Admin and Student until respective teacher publishes it
    });
    // push the results
    studentFound.examsResults.push(examResults?._id);
    // save report to student
    await studentFound.save();

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


//@desc teacher get students strictly in their assigned class level
//@route GET /api/v1/students/teacher
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
    let targetClassName = teacher.classLevel || "";

    // If teacher.classLevel is an ObjectId, resolve the ClassLevel document's name
    if (teacher.classLevel && mongoose.Types.ObjectId.isValid(teacher.classLevel)) {
        const cDoc = await ClassLevel.findById(teacher.classLevel);
        if (cDoc && cDoc.name) {
            targetClassName = cDoc.name;
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
        : targetClassName ? new RegExp(`^${targetClassName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, "i") : null;

    const orConditions = [
        { assignedTeacher: teacher._id }
    ];

    if (teacher.subject) {
        const subEsc = teacher.subject.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        orConditions.push({ subject: teacher.subject });
        orConditions.push({ subject: { $regex: new RegExp(`^${subEsc}$`, "i") } });
    }

    if (targetClassName) {
        const classConditions = [
            { currentClassLevel: targetClassName },
            { currentClassLevel: teacher.classLevel }
        ];
        if (levelRegex) {
            classConditions.push({ currentClassLevel: { $regex: levelRegex } });
        }
        orConditions.push({ $or: classConditions });
    }

    const filter = { $or: orConditions };

    const rawStudents = await Student.find(filter)
        .populate("program academicYear assignedTeacher")
        .select("-password")
        .sort({ createdAt: -1 });

    // Strict secondary filtering in memory to GUARANTEE class & subject alignment
    const strictStudents = rawStudents.filter((student) => {
        const studentLevel = (student.currentClassLevel || "").trim();
        const studentLevelNum = extractLevelNumber(studentLevel);

        // 1. If teacher has a restricted class level, student MUST strictly match teacher's class level!
        // A 100L teacher must NEVER have a 400L student, even if mistakenly assigned
        if (targetClassName) {
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

        // 2. If explicitly assigned to this teacher and matches class level (or teacher has no class restriction)
        if (
            student.assignedTeacher &&
            (student.assignedTeacher._id?.toString() === teacher._id.toString() ||
             student.assignedTeacher.toString() === teacher._id.toString())
        ) {
            return true;
        }

        // 3. If teacher is assigned a subject and student takes this subject
        if (teacher.subject && student.subject) {
            const cleanTSub = teacher.subject.trim().toLowerCase();
            const cleanSSub = student.subject.trim().toLowerCase();
            if (cleanTSub === cleanSSub) {
                return true;
            }
        }

        // 4. If teacher has class level but no subject
        if (targetClassName && !teacher.subject) {
            return true;
        }

        return false;
    });

    res.status(200).json({
        status: "Success",
        message: "Students strictly in your class level fetched successfully",
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
    
    // Standard tiers from 100L to Final
    const standardLevels = ["Level 100", "Level 200", "Level 300", "Level 400"];
    
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
                const subObj = typeof item.subject === "object" ? item.subject : null;
                const subId = subObj ? subObj._id?.toString() : item.subject?.toString();
                const subName = subObj ? subObj.name : "Subject";
                const cLevel = item.classLevel || student.currentClassLevel || "Level 100";
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
                        dateEnrolled: item.dateEnrolled || student.dateAdmitted || new Date(),
                    });
                }
            }
        }
    }

    // Backwards compatibility: From student.subject (legacy single subject)
    if (student.subject) {
        const studentSubName = student.subject.trim();
        const targetClass = student.currentClassLevel || "Level 100";
        const dedupeKey = `${studentSubName}-${targetClass}`.toLowerCase();
        
        const alreadyExists = Array.from(enrolledKeySet).some(k => k.startsWith(studentSubName.toLowerCase()));
        if (!alreadyExists) {
            // Find subject doc if exists in DB
            const sDoc = await Subject.findOne({
                $or: [
                    { name: studentSubName },
                    { name: { $regex: new RegExp(`^${studentSubName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, "i") } }
                ]
            }).populate("teacher academicTerms program");

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
            const cLevel = pSub.classLevel || student.currentClassLevel || "Level 100";
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

    // Also populate from student's exam results across class levels if not yet in enrolled
    if (student.examsResults && student.examsResults.length > 0) {
        for (const resItem of student.examsResults) {
            const exam = resItem.exam;
            const examSub = exam?.subject;
            if (examSub) {
                const subId = examSub._id?.toString();
                const subName = examSub.name;
                const examClass = resItem.classLevel?.name || exam.classLevel?.name || student.currentClassLevel || "Level 100";
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
            currentClassLevel: student.currentClassLevel || "Level 100",
            studentName: student.name,
            studentId: student.StudentId,
        }
    });
});

//@desc student self-enroll into subject for a specific class level
//@route POST /api/v1/students/enroll-subject
//@access private student only
exports.studentEnrollSubjectCtrl = AsyncHandler(async (req, res) => {
    const studentId = req.userAuth?.id || req.userAuth?._id;
    const { subjectId, classLevel } = req.body;

    if (!subjectId) {
        throw new Error("Subject ID is required for enrollment");
    }

    const Subject = require("../../models/Academy/Subject");
    const subjectDoc = await Subject.findById(subjectId);
    if (!subjectDoc) {
        throw new Error("Subject not found");
    }

    const student = await Student.findById(studentId);
    if (!student) {
        throw new Error("Student not found");
    }

    const targetClass = (classLevel || subjectDoc.classLevel || student.currentClassLevel || "Level 100").trim();

    // Check if already enrolled in this subject for this class level
    const alreadyEnrolled = student.enrolledSubjects?.some(
        item => item.subject?.toString() === subjectDoc._id.toString() &&
                item.classLevel?.toLowerCase() === targetClass.toLowerCase()
    );

    if (alreadyEnrolled) {
        throw new Error(`You are already enrolled in ${subjectDoc.name} for ${targetClass}`);
    }

    // Add to enrolledSubjects
    if (!student.enrolledSubjects) {
        student.enrolledSubjects = [];
    }
    student.enrolledSubjects.push({
        subject: subjectDoc._id,
        classLevel: targetClass,
        dateEnrolled: new Date(),
    });

    // Also update legacy subject field if not set
    if (!student.subject) {
        student.subject = subjectDoc.name;
    }

    await student.save();

    res.status(200).json({
        status: "Success",
        message: `Successfully enrolled in ${subjectDoc.name} (${targetClass})`,
        data: {
            subject: subjectDoc,
            classLevel: targetClass,
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