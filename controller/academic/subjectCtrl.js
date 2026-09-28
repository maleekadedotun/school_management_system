const AsyncHandler = require("express-async-handler");
const Admin = require("../../models/Staff/admin");
const Subject = require("../../models/Academy/Subject");
const Program = require("../../models/Academy/program");


//@desc create subjects
//@route POST /api/v1/subjects/:programID
//@access private
exports.createSubjectCtrl = AsyncHandler(async(req, res) => {
    const {name, description, academicTerms, classLevel} = req.body;
     const programFound = await Program.findById(req.params.programID);
    if (!programFound) {
        throw new Error("Program not found")
    }
    // find if exist
    const subjectFound = await Subject.findOne({name});
    if (subjectFound) {
        throw new Error("Subject already exist")
    }
    const subjectCreated = await Subject.create({
        name,
        description,
        academicTerms,
        classLevel: classLevel || "Level 100",
        program: programFound._id,
        createdBy: req.userAuth._id,
    });
    // push to the program
    programFound.subjects.push(subjectCreated._id);
    // save
    await programFound.save();

    // Auto-enroll all students assigned to this program into this new subject
    try {
        const Student = require("../../models/Academy/Student");
        await Student.updateMany(
            { program: programFound._id },
            {
                $addToSet: {
                    enrolledSubjects: {
                        subject: subjectCreated._id,
                        classLevel: subjectCreated.classLevel || "Level 100",
                        dateEnrolled: new Date(),
                    }
                }
            }
        );
    } catch (enrollErr) {
        console.error("Error auto-enrolling students to new program subject:", enrollErr);
    }

    res.status(201).json({
        status : "Success",
        message: "Subject created successfully",
        data: subjectCreated,
    })
});

//@desc get all subects
//@route GET /api/v1/subjects
//@access private

exports.fetchSubjectsCtrl = AsyncHandler(async(req, res) => {
    const filter = req.query.program ? { program: req.query.program } : {};
    const subjects = await Subject.find(filter).populate("program academicTerms teacher");

    res.status(200).json({
        status : "Success",
        message: "Subjects fetched successfully",
        data: subjects,
    })
});

//@desc get single subject
//@route GET /api/v1/subjects/:id
//@access private

exports.fetchSubjectCtrl = AsyncHandler(async(req, res) => {
    // console.log(req.params.id, "single");
    
    const subjectId = await Subject.findById(req.params.id).populate("program academicTerms teacher");

    res.status(201).json({
        status : "Success",
        message: "academic year fetched successfully",
        data: subjectId,
    })
});

//@desc update subject
//@route PUT /api/v1/subjects/:id
//@access private

exports.updateSubjectCtrl = AsyncHandler(async(req, res) => {
    const {name, description, academicTerms, classLevel} = req.body;
    // check if already exist
    const subjectFound = await Subject.findOne({name});
    if (subjectFound && subjectFound._id.toString() !== req.params.id) {
        throw new Error("Subject already exist");
    }
    const updatePayload = {
        name,
        description,
        academicTerms,
        createdBy: req.userAuth._id,
    };
    if (classLevel) {
        updatePayload.classLevel = classLevel;
    }
    const subject = await Subject.findByIdAndUpdate(req.params.id,
        updatePayload,
        {
            new: true,
        }
    );

    res.status(201).json({
        status : "Success",
        message: "Subject updated successfully",
        data: subject,
    })
});

//@desc delete subject
//@route delete /api/v1/subjects/:id
//@access private

exports.deleteSubjectCtrl = AsyncHandler(async(req, res) => {
    
    await Subject.findByIdAndDelete(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "Suject deleted successfully",
    })
});