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


//@desc  GET all question
//@route POST /api/v1/questions
//@access teacher only
exports.fetchAllQuestionsCtrl = AsyncHandler(async(req, res) => {
    const questions = await Question.find()
    res.status(200).json({
        status: "Success",
        message: "Question fetched successfully",
        data: questions,
    })
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