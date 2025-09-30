const AsyncHandler = require("express-async-handler");
const Teacher = require("../../models/Staff/Teacher");
const Exam = require("../../models/Academy/Exam");
const Subject = require("../../models/Academy/Subject");


//@desc create exam
//@route POST /api/v1/exams
//@access teacher only

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
    } = req.body
    // find teacher
    const teacherFound = await Teacher.findById(req.userAuth?._id);
    // console.log(teacherFound," teacher");
    
    if (!teacherFound) {
        throw new Error("Teacher not found");
    }
    // check if exam exist
    const examExists = await Exam.findOne({name});
    if (examExists) {
        throw new Error("Exam already exists");
    }
    // const subjectFound = await Subject.findById(subject);
    // if (!subjectFound) {
    //   throw new Error("Invalid Subject ID provided");
    // }

    const examCreated =  new Exam({
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
    // find teacher
    console.log("Subject:", subject, subject.length);

    // push exam to teacher
    teacherFound.examsCreated.push(examCreated?._id);
    // save exam
    await examCreated.save();
    await teacherFound.save();  

    res.status(201).json({
        status: "Success",
        message: "Exam created successfully",
        data: examCreated,
    });
});

//@desc  GET all exams
//@route POST /api/v1/exams
//@access teacher only

exports.fetchAllExamsCtrl = AsyncHandler(async(req, res) => {
    const exams = await Exam.find()
    res.status(200).json({
        status: "Success",
        message: "Exams fetched successfully",
        data: exams,
    })
});

//@desc  GET all exams
//@route POST /api/v1/exams
//@access teacher only

exports.fetchExamCtrl = AsyncHandler(async(req, res) => {
    const examId = await Exam.findById(req.params.id);
    // console.log(examId);
    
    res.status(200).json({
        status: "Success",
        message: "Single exam fetched successfully",
        data: examId,
    });
});

//@desc update exam
//@route PUT /api/v1/exams/:id
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
        // classLevel,
        academicYear,
    } = req.body;
    // check if already exist
    const examFound = await Exam.findOne({name});
    if (examFound) {
        throw new Error("Exam already exist");
    }
    const examUpdated = await Exam.findByIdAndUpdate(req.params.id,
        {
            name,
            description,
            subject,
            program,
            academicTerm, 
            duration,
            examDate,
            examTime,
            examType,
            // classLevel,
            academicYear,
            createdBy: req.userAuth._id,
        },
        {
            new: true,
        }
    );

    res.status(201).json({
        status : "Success",
        message: "Exam updated successfully",
        data: examUpdated,
    })
});