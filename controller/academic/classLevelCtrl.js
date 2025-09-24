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
    const classLevel = await ClassLevel.find();

    res.status(201).json({
        status : "Success",
        message: "Class levels fetched successfully",
        data: classLevel,
    })
});

//@desc get single class level
//@route GET /api/v1/class-levels/:id
//@access private

exports.fetchClassLevelCtrl = AsyncHandler(async(req, res) => {
    // console.log(req.params.id, "single");
    
    const classLevel = await ClassLevel.findById(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "academic year fetched successfully",
        data: classLevel,
    })
});

//@desc update class level
//@route PUT /api/v1/class-levels/:id
//@access private

exports.updateClassLevelCtrl = AsyncHandler(async(req, res) => {
    const {name, description, students, teachers, subjects} = req.body;
    // check if already exist
    const classLevelFound = await ClassLevel.findOne({name});
    if (classLevelFound) {
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
    
    await AcademicYear.findByIdAndDelete(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "Class level deleted successfully",
    })
});