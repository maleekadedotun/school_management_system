const AsyncHandler = require("express-async-handler");
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
    const { name, password, email, classLevels, subject } = req.body;
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

        if (matchedTeacher) {
            studentData.assignedTeacher = matchedTeacher._id;
        }
    }

    const studentCreated = await Student.create(studentData);

    // student to admin
    adminFound.students.push(studentCreated?._id);
    // save
    await adminFound.save();

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
//@desc  student profile
//@route GET /api/v1/teachers/profile
//@access public student only

exports.fetchStudentProfile = AsyncHandler(async (req, res) => {
    const student = await Student.findById(req.userAuth?.id)
        .select("-password -createdAt -updatedAt")
        .populate("examsResults");
    if (!student) {
        throw new Error("Student not found")
    }

    // get student profile
    const studentProfile = {
        name: student?.name,
        email: student?.email,
        currentClassLevel: student?.currentClassLevel,
        program: student?.program,
        dateAdmitted: student?.dateAdmitted,
        isSuspended: student?.isSuspended,
        isWithDrawn: student?.isWithDrawn,
        studentId: student?.StudentId,
        prefectName: student?.prefectName,
    };

    // get student exam results
    const examResults = student?.examsResults;
    // current exam results
    const currentExamResult = examResults[examResults.length - 1];
    // check if exam is published
    const isPublished = currentExamResult?.isPublished
    // console.log(currentExamResult);

    res.status(201).json({
        status: "Success",
        message: "Student profile fetched successfully",
        data: {
            studentProfile,
            currentExamResult: isPublished ? currentExamResult : []
        }
    })
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
    // find email
    const emailExist = await Student.findOne({ email });
    console.log(emailExist);

    if (emailExist) {
        throw new Error("Email is taken/exist")
    }
    // check if password is updating
    if (password) {
        // update
        const student = await Student.findByIdAndUpdate(req.userAuth._id, {
            password: await hashedPassword(password),
            email,
        },
            {
                new: true,
                runValidators: true,
            });
        // res.status(200).json({
        //     status: "Success",
        //     data: student,
        //     message: "Student updated successfully",
        // })
    }
    else {
        // update
        const student = await Student.findByIdAndUpdate(req.userAuth._id, {
            email,
        },
            {
                new: true,
                runValidators: true,
            });
        res.status(200).json({
            status: "Success",
            data: student,
            message: "Student updated successfully",
        })
    }
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
    if (program) {
        if (mongoose.Types.ObjectId.isValid(program)) {
            updateSet.program = program;
        } else {
            const prog = await Program.findOne({ name: program });
            if (prog) updateSet.program = prog._id;
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
    // res.json("Taking");
    // get student
    const studentFound = await Student.findById(req.userAuth.id);
    if (!studentFound) {
        throw new Error("Student not found");
    }
    // get examID
    const examFound = await Exam.findById(req.params.examID).populate("questions").populate("academicTerm");
    console.log(examFound);

    if (!examFound) {
        throw new Error("Exam not found");

    }
    // console.log({
    //     studentFound, examFound
    // });
    // get question
    const questions = examFound?.questions
    // get student answer
    const studentAnswers = req.body.answers;

    // check if student answered all questions
    if (questions.length !== studentAnswers.length) {
        throw new Error("You must answer all questions")
    }
    const studentFoundResults = await ExamResults.findOne({ student: studentFound?._id });
    if (studentFoundResults) {
        throw new Error("You have already written this exam")
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

        // check if the answer is correct
        if (question.correctAnswer === studentAnswers[i]) {
            correctAnswers++;
            score++;
            question.isCorrect = true;
        }
        else {
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
    })
    // push the results
    studentFound.examsResults.push(examResults?._id);
    // save report to student
    await studentFound.save();

    // promote
    // promot student to level 200
    if (examFound.academicTerm.name === "3rd Term" && status === "Passed" &&
        studentFound.currentClassLevel === "Level 100") {
        studentFound.classLevels.push("Level 200");
        studentFound.currentClassLevel = "Level 200";
        await studentFound.save();
    }

    // promot student to level 300
    if (examFound.academicTerm.name === "3rd Term" && status === "Passed" &&
        studentFound.currentClassLevel === "Level 200") {
        studentFound.classLevels.push("Level 300");
        studentFound.currentClassLevel = "Level 300";
        await studentFound.save();
    }

    // promot student to level 400
    if (examFound.academicTerm.name === "3rd Term" && status === "Passed" &&
        studentFound.currentClassLevel === "Level 300") {
        studentFound.classLevels.push("Level 400");
        studentFound.currentClassLevel = "Level 400";
        await studentFound.save();
    }

    // promote student to graduate
    if (examFound.academicTerm.name === "3rd Term" && status === "Passed" &&
        studentFound.currentClassLevel === "Level 400") {
        studentFound.isGraduated = true
        studentFound.yearGraduated = new Date();
        await studentFound.save();
    }
    // send response
    res.status(200).json({
        status: "Success",
        data: "You have submitted your exam check later for the results",
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