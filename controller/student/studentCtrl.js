const AsyncHandler = require("express-async-handler");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");
const generateToken = require("../../utils/generateToken");

const Student = require("../../models/Academy/Student");
const Exam = require("../../models/Academy/Exam");
const ExamResults = require("../../models/Academy/ExamResults");
const Admin = require("../../models/Staff/admin");

//@desc register student
//@route POST /api/v1/students/admin/register
//@access private Admin only

exports.adminRegisterStudent = AsyncHandler(async(req, res) => {
    const {name, password, email} = req.body
    // find admin
    const adminFound = await Admin.findById(req.userAuth._id)
    if (!adminFound) {
        throw new Error("Admin not found")
    }
    const student = await Student.findOne({email})
    if (student) {
        throw new Error("Student already exist");
    }

    const hashPassword = await hashedPassword(password);
    const studentCreated = await Student.create({
        name,
        email,
        password: hashPassword,
    });

    // teacher to admin
    adminFound.students.push(studentCreated?._id);
    // save
    await adminFound.save()

    res.status(201).json({
        status: "Success",
        message: "Student created successfully",
        data: studentCreated,
    })
});

//@desc login student
//@route POST /api/v1/students/login
//@access public

exports.studentLogin = AsyncHandler(async(req, res) => {
    const {email, password} = req.body;
    const student = await Student.findOne({email});
    if (!student) {
        res.status(404).json("Invalid login credentials")
    }

    // verify password
    const isMatched = await isPasswordMatched(password, student?.password);
    if (!isMatched) {
        res.status(404).json("Invalid login credentials");
    }
    else{
        res.status(201).json({
            status: "Success",
            message: "Student loggedIn successfully",
            data: generateToken(student?.id)
        });
    }

  
});

//@desc  student profile
//@route GET /api/v1/teachers/profile
//@access public student only

exports.fetchStudentProfile = AsyncHandler(async(req, res) =>{
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
    const currentExamResult = examResults[examResults.length -1];
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

exports.fetchAllStudentsAdmin = AsyncHandler(async(req, res) =>{
    const students = await Student.find();
    res.status(201).json({
        status: "Success",
        message: "Teachers fetched successfully",
        data: students
    });
});


//@desc single student
//@route GET /api/v1/students/:studentID/admin/
//@access public admin only

exports.fetchStudentAdmin = AsyncHandler(async(req, res) =>{
    const studentID = req.params.studentID
    const student = await Student.findById(studentID);
    if (!student) {
        throw new Error("Student not found")
    }
    res.status(201).json({
        status: "Success",
        message: "Student fetched successfully",
        data: student,
    })
});

//@desc  student update profile 
//@route PUT /api/v1/students/update
//@access public student only

exports.updateStudentCtrl = AsyncHandler(async(req,res) => {
    const {email, password} = req.body;
    // find email
    const emailExist = await Student.findOne({email});
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
    else{
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

exports.adminUpdateStudentCtrl = AsyncHandler(async(req, res) => {
    const {
        name,
        email,
        classLevels,
        academicYear,
        program,
        prefectName,
        isSuspended,
        isWithDrawn,
    } = req.body;
    const studentFound = await Student.findById(req.params.studentID);
    if(!studentFound) {
        throw new Error("Student not found");
    }
    // update
    const studentUpdated = await Student.findByIdAndUpdate(req.params.studentID, {
        $set:{
            name,
            email,
            // classLevels,
            academicYear,
            program,
            prefectName,
            isSuspended,
            isWithDrawn,
        },
        $addToSet: {
            classLevels,
        }
    },
    {
        new: true,
        runValidators: true,
    });
    // send response
    res.status(200).json({
        status: "Success",
        message: "Student updated successfully",
        data: studentUpdated,
    })
});

//@desc   Student taking exam
//@route PUT /api/v1/students/exams/:examID/write
//@access Student Admin only

exports.studentWriteExamCtrl = AsyncHandler(async(req, res) => {
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
    const studentFoundResults = await ExamResults.findOne({student: studentFound?._id});
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
        else{
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
    else{
        status = "Failed";
    }
    
    // Remarks
    if (grade >= 80) {
        remarks = "Excellent";
    }
    else if (grade >= 70) {
        remarks = "Very Good";
    } 
    else if (grade>= 60) {
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
        studentFound.currentClassLevel === "Level 300") 
    {
        studentFound.classLevels.push("Level 400");
        studentFound.currentClassLevel = "Level 400";
        await studentFound.save();
    }
    
    // promote student to graduate
    if (examFound.academicTerm.name === "3rd Term" && status === "Passed" && 
        studentFound.currentClassLevel === "Level 400")
    {
        studentFound.isGraduated = true
        studentFound.yearGraduated = new Date();
        await studentFound.save();
    }
    // send response
    res.status(200).json({
        status: "Success",
        data: "You have submitted your exam check later for the results",
        // correctAnswers,
        // studentFound,
        // score,
        // status,
        // wrongAnswers,
        // // totalQuestions,
        // grade,
        // remarks,
        // answeredQuestions,
        // examResults,
        // data: questions,
        // studentAnswers,
    })
    
});