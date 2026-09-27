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
        .populate({
            path: "questions",
            populate: {
                path: "createdBy"
            },
        })
        .populate("subject program academicTerm classLevel academicYear")
        .populate({
            path: "createdBy",
            model: "Teacher",
            select: "name email teacherId role"
        })
        .sort({ createdAt: -1 });

    res.status(200).json({
        status: "Success",
        message: "Exams fetched successfully",
        data: exams,
    });
});

//@desc  GET single exams
//@route POST /api/v1/exams/:id
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
//@route PUT /api/v1/exams//:id/update/teacher
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
    await Exam.findByIdAndDelete(req.params.id);
    res.status(200).json({
        status: "Success",
        message: "Exam deleted successfully",
    });
});