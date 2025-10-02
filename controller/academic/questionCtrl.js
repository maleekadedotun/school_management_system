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
})