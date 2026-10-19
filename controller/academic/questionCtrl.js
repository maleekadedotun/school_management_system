const AsyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Exam = require("../../models/Academy/Exam");
const Question = require("../../models/Academy/Question");
const AcademicYear = require("../../models/Academy/AcademicYear");
const AcademicTerm = require("../../models/Academy/AcademicTerm");

// Helper to safely resolve AcademicYear to ObjectId and Name
async function resolveAcademicYear(inputYear, examYear) {
    let yearId = undefined;
    let yearName = undefined;

    // 1. If input is a valid 24-hex ObjectId
    if (inputYear && mongoose.Types.ObjectId.isValid(inputYear) && String(new mongoose.Types.ObjectId(inputYear)) === String(inputYear)) {
        yearId = new mongoose.Types.ObjectId(inputYear);
        const found = await AcademicYear.findById(inputYear).select("name");
        if (found) yearName = found.name;
    } else if (inputYear && typeof inputYear === "string" && inputYear.trim()) {
        yearName = inputYear.trim();
        const escaped = yearName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const found = await AcademicYear.findOne({
            $or: [
                { name: yearName },
                { name: { $regex: new RegExp(`^${escaped}$`, "i") } }
            ]
        });
        if (found) {
            yearId = found._id;
            yearName = found.name;
        }
    }

    // 2. Fallback to examYear if yearId is not yet resolved
    if (!yearId && examYear) {
        if (typeof examYear === "object" && examYear._id) {
            yearId = examYear._id;
            if (!yearName) yearName = examYear.name;
        } else if (mongoose.Types.ObjectId.isValid(examYear)) {
            yearId = examYear;
            if (!yearName) {
                const found = await AcademicYear.findById(examYear).select("name");
                if (found) yearName = found.name;
            }
        }
    }

    return { yearId, yearName };
}

// Helper to safely resolve AcademicTerm to ObjectId and Name
async function resolveAcademicTerm(inputTerm, examTerm) {
    let termId = undefined;
    let termName = undefined;

    // 1. If input is a valid 24-hex ObjectId
    if (inputTerm && mongoose.Types.ObjectId.isValid(inputTerm) && String(new mongoose.Types.ObjectId(inputTerm)) === String(inputTerm)) {
        termId = new mongoose.Types.ObjectId(inputTerm);
        const found = await AcademicTerm.findById(inputTerm).select("name");
        if (found) termName = found.name;
    } else if (inputTerm && typeof inputTerm === "string" && inputTerm.trim()) {
        termName = inputTerm.trim();
        const escaped = termName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let found = await AcademicTerm.findOne({
            $or: [
                { name: termName },
                { name: { $regex: new RegExp(`^${escaped}$`, "i") } }
            ]
        });
        if (!found) {
            // Fuzzy match (e.g. "First Term" matches "FIRST TERM 2026")
            const firstToken = termName.split(" ")[0];
            if (firstToken && firstToken.length > 2) {
                found = await AcademicTerm.findOne({
                    name: { $regex: new RegExp(firstToken, "i") }
                });
            }
        }
        if (found) {
            termId = found._id;
            termName = found.name;
        }
    }

    // 2. Fallback to examTerm if termId is not yet resolved
    if (!termId && examTerm) {
        if (typeof examTerm === "object" && examTerm._id) {
            termId = examTerm._id;
            if (!termName) termName = examTerm.name;
        } else if (mongoose.Types.ObjectId.isValid(examTerm)) {
            termId = examTerm;
            if (!termName) {
                const found = await AcademicTerm.findById(examTerm).select("name");
                if (found) termName = found.name;
            }
        }
    }

    return { termId, termName };
}


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
        academicYear,
        academicTerm,
    } = req.body;

    // find the exam
    const examFound = await Exam.findById(req.params.examID);
    if (!examFound) {
        throw new Error("Exam not found");
    }

    // check if question exists
    const questionExists = await Question.findOne({ question });
    if (questionExists) {
        throw new Error("Question already exists");
    }

    const { yearId, yearName } = await resolveAcademicYear(academicYear, examFound.academicYear);
    const { termId, termName } = await resolveAcademicTerm(academicTerm, examFound.academicTerm);

    const questionData = {
        question,
        optionA,
        optionB,
        optionC,
        optionD,
        correctAnswer,
        createdBy: req.userAuth._id,
        exam: examFound._id,
    };
    if (yearId) questionData.academicYear = yearId;
    if (yearName) questionData.academicYearName = yearName;
    if (termId) questionData.academicTerm = termId;
    if (termName) questionData.academicTermName = termName;

    // create question saved according to the exam, academic year, and term
    const questionCreated = await Question.create(questionData);

    // push the question to the exam
    if (!examFound.questions) {
        examFound.questions = [];
    }
    const alreadyLinked = examFound.questions.some(q => q.toString() === questionCreated._id.toString());
    if (!alreadyLinked) {
        examFound.questions.push(questionCreated._id);
        await examFound.save();
    }

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
        .populate("academicYear", "name fromYear toYear isCurrent")
        .populate("academicTerm", "name description duration")
        .populate("exam", "name description examType subject program academicTerm academicYear classLevel duration passMark totalMark")
        .sort({ createdAt: -1 });

    // Look up associated exams to attach full exam information to each question
    const exams = await Exam.find()
        .select("name description subject program academicTerm academicYear examType classLevel duration passMark totalMark questions")
        .populate("subject program academicTerm academicYear classLevel");

    const questionToExamMap = {};
    exams.forEach(exam => {
        if (exam.questions && Array.isArray(exam.questions)) {
            exam.questions.forEach(qId => {
                const idStr = qId?._id ? qId._id.toString() : qId.toString();
                questionToExamMap[idStr] = {
                    _id: exam._id,
                    name: exam.name,
                    description: exam.description,
                    examType: exam.examType || "Exam",
                    subject: exam.subject?.name || (typeof exam.subject === "string" ? exam.subject : ""),
                    program: exam.program?.name || (typeof exam.program === "string" ? exam.program : ""),
                    academicTerm: exam.academicTerm?.name || (typeof exam.academicTerm === "string" ? exam.academicTerm : ""),
                    academicTermId: exam.academicTerm?._id || (typeof exam.academicTerm === "string" ? exam.academicTerm : ""),
                    academicYear: exam.academicYear?.name || (typeof exam.academicYear === "string" ? exam.academicYear : ""),
                    academicYearId: exam.academicYear?._id || (typeof exam.academicYear === "string" ? exam.academicYear : ""),
                    classLevel: exam.classLevel?.name || (typeof exam.classLevel === "string" ? exam.classLevel : ""),
                    duration: exam.duration,
                    passMark: exam.passMark,
                    totalMark: exam.totalMark,
                };
            });
        }
    });

    const populatedQuestions = questions.map(q => {
        const qObj = q.toObject();
        const mappedExam = questionToExamMap[q._id.toString()] || (q.exam ? {
            _id: q.exam._id || q.exam,
            name: q.exam.name,
            description: q.exam.description,
            examType: q.exam.examType || "Exam",
            subject: q.exam.subject?.name,
            program: q.exam.program?.name,
            academicTerm: q.exam.academicTerm?.name || (q.academicTerm?.name || q.academicTerm),
            academicYear: q.exam.academicYear?.name || (q.academicYear?.name || q.academicYear),
            classLevel: q.exam.classLevel?.name,
            duration: q.exam.duration,
            passMark: q.exam.passMark,
            totalMark: q.exam.totalMark,
        } : null);

        qObj.exam = mappedExam;
        qObj.academicYear = mappedExam?.academicYear || q.academicYear?.name || q.academicYearName || (typeof q.academicYear === "string" ? q.academicYear : null);
        qObj.academicTerm = mappedExam?.academicTerm || q.academicTerm?.name || q.academicTermName || (typeof q.academicTerm === "string" ? q.academicTerm : null);
        qObj.examType = mappedExam?.examType || "Exam";
        return qObj;
    });

    res.status(200).json({
        status: "Success",
        message: "Teacher questions fetched successfully",
        data: populatedQuestions,
    });
});

//@desc  GET single question
//@route GET /api/v1/questions/:id
//@access teacher only

exports.fetchQuestionCtrl = AsyncHandler(async(req, res) => {
    const questionID = await Question.findById(req.params.id)
        .populate({
            path: "createdBy",
            model: "Teacher",
            select: "name email teacherId role",
        })
        .populate("academicYear", "name")
        .populate("academicTerm", "name")
        .populate("exam", "name examType academicYear academicTerm subject classLevel");

    if (!questionID) {
        throw new Error("Question not found");
    }

    res.status(200).json({
        status: "Success",
        message: "Single question fetched successfully",
        data: questionID,
    });
});

//@desc update question
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
        examId,
        academicYear,
        academicTerm,
    } = req.body;

    // check if already exist on a different question
    if (question) {
        const questionFound = await Question.findOne({ question, _id: { $ne: req.params.id } });
        if (questionFound) {
            throw new Error("Question already exists");
        }
    }

    const updateFields = {
        question, 
        optionA, 
        optionB,
        optionC, 
        optionD,
        correctAnswer,
        createdBy: req.userAuth._id,
    };
    if (examId) updateFields.exam = examId;
    if (academicYear) {
        const { yearId, yearName } = await resolveAcademicYear(academicYear);
        if (yearId) updateFields.academicYear = yearId;
        if (yearName) updateFields.academicYearName = yearName;
    }
    if (academicTerm) {
        const { termId, termName } = await resolveAcademicTerm(academicTerm);
        if (termId) updateFields.academicTerm = termId;
        if (termName) updateFields.academicTermName = termName;
    }

    const questionUpdate = await Question.findByIdAndUpdate(
        req.params.id,
        updateFields,
        { new: true }
    );

    // If exam was updated, update exam questions links
    if (examId) {
        await Exam.updateMany(
            { questions: req.params.id, _id: { $ne: examId } },
            { $pull: { questions: req.params.id } }
        );
        const targetExam = await Exam.findById(examId);
        if (targetExam && !targetExam.questions.includes(req.params.id)) {
            targetExam.questions.push(req.params.id);
            await targetExam.save();
        }
    }

    res.status(200).json({
        status: "Success",
        message: "Question updated successfully",
        data: questionUpdate,
    });
});

//@desc delete question
//@route DELETE /api/v1/questions/:id
//@access private teacher and admin

exports.deleteQuestionCtrl = AsyncHandler(async(req, res) => {
    const question = await Question.findById(req.params.id);
    if (!question) {
        throw new Error("Question not found");
    }

    // Remove from any exam referencing it
    await Exam.updateMany(
        { questions: req.params.id },
        { $pull: { questions: req.params.id } }
    );

    await Question.findByIdAndDelete(req.params.id);

    res.status(200).json({
        status: "Success",
        message: "Question deleted successfully",
    });
});

//@desc Admin get all questions with filters (teacherName, teacherId, date, academicYear, academicTerm, examType)
//@route GET /api/v1/questions/admin
//@access private Admin only

exports.getAllQuestionsAdminCtrl = AsyncHandler(async (req, res) => {
    const { teacherId, teacherName, startDate, endDate, date, search, academicYear, academicTerm, examType } = req.query;

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
        .populate("academicYear", "name fromYear toYear isCurrent")
        .populate("academicTerm", "name description")
        .populate("exam", "name description examType subject program academicTerm academicYear classLevel duration passMark totalMark")
        .sort({ createdAt: -1 });

    // Look up associated exams to attach full exam information to each question
    const exams = await Exam.find()
        .select("name description subject program academicTerm academicYear examType classLevel duration passMark totalMark questions")
        .populate("subject program academicTerm academicYear classLevel");

    const questionToExamMap = {};
    exams.forEach(exam => {
        if (exam.questions && Array.isArray(exam.questions)) {
            exam.questions.forEach(qId => {
                const idStr = qId?._id ? qId._id.toString() : qId.toString();
                questionToExamMap[idStr] = {
                    _id: exam._id,
                    name: exam.name,
                    description: exam.description,
                    examType: exam.examType || "Exam",
                    subject: exam.subject?.name || (typeof exam.subject === "string" ? exam.subject : ""),
                    program: exam.program?.name || (typeof exam.program === "string" ? exam.program : ""),
                    academicTerm: exam.academicTerm?.name || (typeof exam.academicTerm === "string" ? exam.academicTerm : ""),
                    academicTermId: exam.academicTerm?._id || (typeof exam.academicTerm === "string" ? exam.academicTerm : ""),
                    academicYear: exam.academicYear?.name || (typeof exam.academicYear === "string" ? exam.academicYear : ""),
                    academicYearId: exam.academicYear?._id || (typeof exam.academicYear === "string" ? exam.academicYear : ""),
                    classLevel: exam.classLevel?.name || (typeof exam.classLevel === "string" ? exam.classLevel : ""),
                    duration: exam.duration,
                    passMark: exam.passMark,
                    totalMark: exam.totalMark,
                };
            });
        }
    });

    let populatedQuestions = questions.map(q => {
        const qObj = q.toObject();
        const mappedExam = questionToExamMap[q._id.toString()] || (q.exam ? {
            _id: q.exam._id || q.exam,
            name: q.exam.name,
            description: q.exam.description,
            examType: q.exam.examType || "Exam",
            subject: q.exam.subject?.name,
            program: q.exam.program?.name,
            academicTerm: q.exam.academicTerm?.name || (q.academicTerm?.name || q.academicTerm),
            academicYear: q.exam.academicYear?.name || (q.academicYear?.name || q.academicYear),
            classLevel: q.exam.classLevel?.name,
            duration: q.exam.duration,
            passMark: q.exam.passMark,
            totalMark: q.exam.totalMark,
        } : null);

        qObj.exam = mappedExam;
        qObj.academicYear = mappedExam?.academicYear || q.academicYear?.name || q.academicYearName || (typeof q.academicYear === "string" ? q.academicYear : null);
        qObj.academicTerm = mappedExam?.academicTerm || q.academicTerm?.name || q.academicTermName || (typeof q.academicTerm === "string" ? q.academicTerm : null);
        qObj.examType = mappedExam?.examType || "Exam";
        return qObj;
    });

    // In-memory filtering for teacherId, teacherName, search, academicYear, academicTerm, examType
    if (teacherId || teacherName || search || academicYear || academicTerm || examType) {
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
                (teacher.teacherId && teacher.teacherId.toLowerCase().includes(search.toLowerCase())) ||
                (q.exam?.name && q.exam.name.toLowerCase().includes(search.toLowerCase()));

            const matchesYear = !academicYear ||
                (q.academicYear && q.academicYear.toLowerCase() === academicYear.toLowerCase());

            const matchesTerm = !academicTerm ||
                (q.academicTerm && q.academicTerm.toLowerCase() === academicTerm.toLowerCase());

            const matchesType = !examType ||
                (q.examType && q.examType.toLowerCase() === examType.toLowerCase());

            return matchesId && matchesName && matchesSearch && matchesYear && matchesTerm && matchesType;
        });
    }

    res.status(200).json({
        status: "Success",
        message: "Questions fetched successfully",
        data: populatedQuestions,
    });
});