const AsyncHandler = require("express-async-handler");
const Exam = require("../../models/Academy/Exam");
const Question = require("../../models/Academy/Question");


//@desc create question
//@route POST /api/v1/questions/:examID/
//@access Teachers Only
exports.createQuestion = AsyncHandler(async(req, res) => {
    const {
        question, 
        optionA, 
        optionB,
        optionC, 
        optionD,
        correctAnswer,
    } = req.body;
    // find the exam
    const examFound = await Exam.findById(req.params.examID);
    if (!examFound) {
        throw new Error("Exam not found");
    }
    // check if question exists
    const questionExitsts = await Question.findOne({question})
    if (questionExitsts) {
        throw new Error("Question already exists")
    }
    // create exam
    const questionCreated = await Question.create({
        question, 
        optionA, 
        optionB,
        optionC, 
        optionD,
        correctAnswer,
        createdBy: req.userAuth._id,
    });
    // push the question to te exam
    examFound.questions.push(questionCreated._id);
    // save 
    await examFound.save();
    res.status(201).json({
        status: "Success",
        message: "Question created successfully",
        data: questionCreated,
    });
});


//@desc  GET all questions created by the logged in teacher
//@route GET /api/v1/questions
//@access teacher only
exports.fetchAllQuestionsCtrl = AsyncHandler(async(req, res) => {
    const teacherId = req.userAuth?._id;
    const filter = teacherId ? { createdBy: teacherId } : {};

    const questions = await Question.find(filter)
        .populate({
            path: "createdBy",
            model: "Teacher",
            select: "name email teacherId role",
        })
        .sort({ createdAt: -1 });

    // Look up associated exams to attach exam information to each question
    const exams = await Exam.find().select("name subject program questions").populate("subject program");
    const questionToExamMap = {};
    exams.forEach(exam => {
        if (exam.questions && Array.isArray(exam.questions)) {
            exam.questions.forEach(qId => {
                questionToExamMap[qId.toString()] = {
                    _id: exam._id,
                    name: exam.name,
                    subject: exam.subject?.name,
                    program: exam.program?.name,
                };
            });
        }
    });

    const populatedQuestions = questions.map(q => {
        const qObj = q.toObject();
        qObj.exam = questionToExamMap[q._id.toString()] || null;
        return qObj;
    });

    res.status(200).json({
        status: "Success",
        message: "Teacher questions fetched successfully",
        data: populatedQuestions,
    });
});

//@desc  GET single question
//@route POST /api/v1/questions/:id
//@access teacher only

exports.fetchQuestionCtrl = AsyncHandler(async(req, res) => {
    const questionID = await Question.findById(req.params.id);
    // console.log(examId);
    
    res.status(200).json({
        status: "Success",
        message: "Single question fetched successfully",
        data: questionID,
    });
});

//@desc update quetion
//@route PUT /api/v1/questions/:id
//@access private teacher only

exports.updateQuestionCtrl = AsyncHandler(async(req, res) => {
    const {
        question, 
        optionA, 
        optionB,
        optionC, 
        optionD,
        correctAnswer,
    } = req.body;
    // check if already exist
    const questionFound = await Question.findOne({question});
    if (questionFound) {
        throw new Error("Question already exist");
    }
    const questionUpdate = await Question.findByIdAndUpdate(req.params.id,
        {
            question, 
            optionA, 
            optionB,
            optionC, 
            optionD,
            correctAnswer,
            createdBy: req.userAuth._id,
        },
        {
            new: true,
        }
    );

    res.status(201).json({
        status : "Success",
        message: "Question updated successfully",
        data: questionUpdate,
    })
});

//@desc Admin get all questions with filters (teacherName, teacherId, date)
//@route GET /api/v1/questions/admin
//@access private Admin only

exports.getAllQuestionsAdminCtrl = AsyncHandler(async (req, res) => {
    const { teacherId, teacherName, startDate, endDate, date, search } = req.query;

    let filter = {};

    if (startDate || endDate || date) {
        if (date) {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            filter.createdAt = { $gte: start, $lte: end };
        } else {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }
    }

    let questions = await Question.find(filter)
        .populate({
            path: "createdBy",
            model: "Teacher",
            select: "name email teacherId role"
        })
        .sort({ createdAt: -1 });

    // Look up associated exams to attach exam information to each question
    const exams = await Exam.find().select("name subject program questions").populate("subject program");
    const questionToExamMap = {};
    exams.forEach(exam => {
        if (exam.questions && Array.isArray(exam.questions)) {
            exam.questions.forEach(qId => {
                questionToExamMap[qId.toString()] = {
                    _id: exam._id,
                    name: exam.name,
                    subject: exam.subject?.name,
                    program: exam.program?.name,
                };
            });
        }
    });

    let populatedQuestions = questions.map(q => {
        const qObj = q.toObject();
        qObj.exam = questionToExamMap[q._id.toString()] || null;
        return qObj;
    });

    // In-memory filtering for teacherId, teacherName, and search text
    if (teacherId || teacherName || search) {
        populatedQuestions = populatedQuestions.filter(q => {
            const teacher = q.createdBy || {};
            const matchesId = !teacherId || 
                (teacher.teacherId && teacher.teacherId.toLowerCase().includes(teacherId.toLowerCase())) ||
                (teacher._id && teacher._id.toString() === teacherId);

            const matchesName = !teacherName ||
                (teacher.name && teacher.name.toLowerCase().includes(teacherName.toLowerCase()));

            const matchesSearch = !search ||
                q.question.toLowerCase().includes(search.toLowerCase()) ||
                (teacher.name && teacher.name.toLowerCase().includes(search.toLowerCase())) ||
                (teacher.teacherId && teacher.teacherId.toLowerCase().includes(search.toLowerCase()));

            return matchesId && matchesName && matchesSearch;
        });
    }

    res.status(200).json({
        status: "Success",
        message: "Questions fetched successfully",
        data: populatedQuestions,
    });
});