const AsyncHandler = require("express-async-handler");
const ExamResult = require("../../models/Academy/ExamResults");
const Student = require("../../models/Academy/Student");
// const { path } = require("../../app/app");


//@desc checkig result
//@route POST /api/v1/check-results/:id/checking
//@access private Student only

exports.checkExamResultsCtrl = AsyncHandler(async(req, res) => {
    // find the student
    const studentFound = await Student.findById(req.userAuth?._id);
    if (!studentFound) {
        throw new Error("No student found")
    }
    // find the result
    const examResult = await ExamResult.findById({
        studentID: studentFound?.StudentId,
        _id: req.params.id,
    })
    .populate({
        path: "exam",
        populate: {
            path: "questions",
        }
    })
    // .populate("exam")
    .populate("classLevel")
    .populate("academicTerm")
    .populate("academicYear");
    // check if exam is published
    if (examResult?.isPublished === false) {
        throw new Error("Exam result not available, check out later.")
    }
    res.status(200).json({
        status: "Success",
        message: "Exam result",
        data: examResult,
        student: studentFound,
    })
});

//@desc All exam Results (name, id)
//@route POST /api/v1/check-results
//@access private Student only

exports.fetchExamResultsCtrl = AsyncHandler(async(req, res) => {
    const results = await ExamResult.find().select("exam").populate("exam");
    res.status(200).json({
        status: "Success",
        message: "Exam results fetched successfully",
        data: results,
    })
});


//@desc Admin publish exam result
//@route POST /api/v1/check-results/:id/admin-toggle-publish
//@access private Admin only

exports.adminToggleExamResult = AsyncHandler(async(req, res) => {
    // find the exam result
    const examResult = await ExamResult.findById(req.params.id)
    if (!examResult) {
        throw new Error("Exam result not found")
    }
        const publishResult  = await ExamResult.findByIdAndUpdate(req.params?.id, {
            isPublished: req.body.publish,
        }, 
    {
        new: true,
    }
    )
    res.status(200).json({
        status: "Success",
        message: "Exam Results Updated",
        data: publishResult,
    })
});