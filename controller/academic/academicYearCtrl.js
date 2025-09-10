const AsyncHandler = require("express-async-handler");
const AcademicYear = require("../../models/Academy/AcademicYear");
const Admin = require("../../models/Staff/admin");


//@desc create academic year
//@route POST /api/v1/academic-years
//@access private
exports.createAcademicYearCtrl = AsyncHandler(async(req, res) => {
    // console.log("BODY ===>", req.body);
    const {name, fromYear, toYear} = req.body;
    // find if exist
    const academicYear = await AcademicYear.findOne({name});
    if (academicYear) {
        throw new Error("Academic year already exist")
    }
    const academicYearCreated = await AcademicYear.create({
        name,
        fromYear,
        toYear,
        createdBy: req.userAuth._id
    });
    // push academic into admin
    const admin = await Admin.findById(req.userAuth._id);
    admin.academicYears.push(academicYearCreated._id);
    // save
    await admin.save();

    res.status(201).json({
        status : "Success",
        message: "academic year created successfully",
        data: academicYearCreated,
    })
});

//@desc get all academic year
//@route GET /api/v1/academic-years
//@access private

exports.fetchAcademicYearsCtrl = AsyncHandler(async(req, res) => {
    const academicYear = await AcademicYear.find();

    res.status(201).json({
        status : "Success",
        message: "academic years fetched successfully",
        data: academicYear,
    })
});

//@desc get single academic year
//@route GET /api/v1/academic-years/:id
//@access private

exports.fetchAcademicYearCtrl = AsyncHandler(async(req, res) => {
    const academicYear = await AcademicYear.findById(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "academic year fetched successfully",
        data: academicYear,
    })
});

//@desc update academic year
//@route PUT /api/v1/academic-years/:id
//@access private

exports.updateAcademicYearCtrl = AsyncHandler(async(req, res) => {
    const {name, fromYear, toYear} = req.body;
    // check if already exist
    const academicYearFound = await AcademicYear.findOne({name});
    if (academicYearFound) {
        throw new Error("Academic year already exist");
    }
    const academicYear = await AcademicYear.findByIdAndUpdate(req.params.id,
        {
            name,
            fromYear,
            toYear,
            createdBy: req.userAuth._id,
        },
        {
            new: true,
        }
    );

    res.status(201).json({
        status : "Success",
        message: "academic year updated successfully",
        data: academicYear,
    })
});

//@desc delete academic year
//@route delete /api/v1/academic-years/:id
//@access private

exports.deleteAcademicYearCtrl = AsyncHandler(async(req, res) => {
    
    await AcademicYear.findByIdAndDelete();

    res.status(201).json({
        status : "Success",
        message: "academic year deleted successfully",
    })
});