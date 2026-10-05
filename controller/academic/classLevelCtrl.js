const AsyncHandler = require("express-async-handler");
const Admin = require("../../models/Staff/admin");
const ClassLevel = require("../../models/Academy/ClassLevel");


//@desc create class level 
//@route POST /api/v1/academic-class-levels
//@access private
exports.createClassLevelCtrl = AsyncHandler(async(req, res) => {
    // console.log("BODY ===>", req.body);
    const {name, description, duration} = req.body;
    // find if exist
    const classLevel = await ClassLevel.findOne({name});
    if (classLevel) {
        throw new Error("Class level already exist")
    }
    const classLevelCreated = await ClassLevel.create({
        name,
        description,
        createdBy: req.userAuth._id
    });
    // push academic into admin
    const admin = await Admin.findById(req.userAuth._id);
    admin.classLevel.push(classLevelCreated._id);
    // save
    await admin.save();

    res.status(201).json({
        status : "Success",
        message: "Class level created successfully",
        data: classLevelCreated,
    })
});

//@desc get all class levels
//@route GET /api/v1/class-levels
//@access private

exports.fetchClassLevelsCtrl = AsyncHandler(async(req, res) => {
    const classLevels = await ClassLevel.find().lean();
    const Student = require("../../models/Academy/Student");
    const Subject = require("../../models/Academy/Subject");

    const allStudents = await Student.find({}, "name StudentId currentClassLevel classLevels email").lean();
    const allSubjects = await Subject.find({}, "name description classLevel").lean();

    const enriched = classLevels.map((lvl) => {
        const lvlName = (lvl.name || "").trim().toLowerCase();
        const lvlId = lvl._id.toString();

        const enrolledStudents = allStudents.filter((s) => {
            const current = (s.currentClassLevel || (Array.isArray(s.classLevels) && s.classLevels.length > 0 ? s.classLevels[s.classLevels.length - 1] : "") || "").trim().toLowerCase();
            return current && (current === lvlName || current === lvlId);
        });

        const classSubjects = allSubjects.filter((sub) => {
            const subLvl = (sub.classLevel || "").trim().toLowerCase();
            return subLvl && (subLvl === lvlName || subLvl === lvlId);
        });

        return {
            ...lvl,
            students: enrolledStudents,
            subjects: classSubjects,
            studentCount: enrolledStudents.length,
            subjectCount: classSubjects.length,
        };
    });

    res.status(200).json({
        status : "Success",
        message: "Class levels fetched successfully",
        data: enriched,
    });
});

//@desc get single class level
//@route GET /api/v1/class-levels/:id
//@access private

exports.fetchClassLevelCtrl = AsyncHandler(async(req, res) => {
    const classLevel = await ClassLevel.findById(req.params.id).lean();
    if (!classLevel) {
        return res.status(404).json({
            status: "Failed",
            message: "Class level not found",
        });
    }

    const Student = require("../../models/Academy/Student");
    const Subject = require("../../models/Academy/Subject");

    const lvlName = (classLevel.name || "").trim().toLowerCase();
    const lvlId = classLevel._id.toString();

    const allStudents = await Student.find({}, "name StudentId currentClassLevel classLevels email").lean();
    const allSubjects = await Subject.find({}, "name description classLevel").lean();

    const enrolledStudents = allStudents.filter((s) => {
        const current = (s.currentClassLevel || (Array.isArray(s.classLevels) && s.classLevels.length > 0 ? s.classLevels[s.classLevels.length - 1] : "") || "").trim().toLowerCase();
        return current && (current === lvlName || current === lvlId);
    });

    const classSubjects = allSubjects.filter((sub) => {
        const subLvl = (sub.classLevel || "").trim().toLowerCase();
        return subLvl && (subLvl === lvlName || subLvl === lvlId);
    });

    res.status(200).json({
        status : "Success",
        message: "Class level fetched successfully",
        data: {
            ...classLevel,
            students: enrolledStudents,
            subjects: classSubjects,
            studentCount: enrolledStudents.length,
            subjectCount: classSubjects.length,
        },
    });
});

//@desc update class level
//@route PUT /api/v1/class-levels/:id
//@access private

exports.updateClassLevelCtrl = AsyncHandler(async(req, res) => {
    const {name, description} = req.body;
    // check if already exist
    const classLevelFound = await ClassLevel.findOne({name});
    if (classLevelFound && classLevelFound._id.toString() !== req.params.id) {
        throw new Error("Class level already exist");
    }
    const classLevel = await ClassLevel.findByIdAndUpdate(req.params.id,
        {
            name,
            description,
            createdBy: req.userAuth._id,
        },
        {
            new: true,
        }
    );

    res.status(201).json({
        status : "Success",
        message: "Class level updated successfully",
        data: classLevel,
    })
});

//@desc delete class level
//@route delete /api/v1/class-level/:id
//@access private

exports.deleteClassLevelCtrl = AsyncHandler(async(req, res) => {
    
    await ClassLevel.findByIdAndDelete(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "Class level deleted successfully",
    })
});