const AsyncHandler = require("express-async-handler");
const Admin = require("../../models/Staff/admin");
const Subject = require("../../models/Academy/Subject");
const YearGroup = require("../../models/Academy/YearGroup");

//@desc create year group
//@route POST /api/v1/years-group
//@access private
exports.createYearGroupCtrl = AsyncHandler(async(req, res) => {
    const {name, academicYear} = req.body;
    // find if exist
    const yearGroup = await YearGroup.findOne({name});
    if (yearGroup) {
        throw new Error("Year Group/Graduation already exist")
    }
    const yearGroupCreated = await YearGroup.create({
        name,
        academicYear,
        createdBy: req.userAuth._id,
    });
    // find the admin
    const admin = await Admin.findById(req.userAuth._id)
    if (!admin) {
        throw new Error("Admin not found")
        
    }
    // push to year group
    admin.yearGroups.push(yearGroupCreated._id)
    // save
    await admin.save();

    res.status(201).json({
        status : "Success",
        message: "Year group created successfully",
        data: yearGroupCreated,
    })
});

//@desc get all year groups
//@route GET /api/v1/years-group
//@access private

exports.fetchYearsGroupCtrl = AsyncHandler(async(req, res) => {
    const yearGroup = await YearGroup.find();

    res.status(201).json({
        status : "Success",
        message: "Years group fetched successfully",
        data: yearGroup,
    })
});

//@desc get single year group
//@route GET /api/v1/years-group/:id
//@access private

exports.fetchYearGroupCtrl = AsyncHandler(async(req, res) => {
    // console.log(req.params.id, "single");
    
    const yearGroup = await YearGroup.findById(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "Year group fetched successfully",
        data: yearGroup,
    })
});

//@desc update year group
//@route PUT /api/v1/years-group/:id
//@access private

exports.updateYearGroupCtrl = AsyncHandler(async(req, res) => {
    const {name, academicYear} = req.body;
    // check if already exist
    const yearGroupFound = await YearGroup.findOne({name});
    if (yearGroupFound) {
        throw new Error("Subject already exist");
    }
    const yearGroup = await YearGroup.findByIdAndUpdate(req.params.id,
        {
            name,
            academicYear,
            createdBy: req.userAuth._id,
        },
        {
            new: true,
        }
    );

    res.status(201).json({
        status : "Success",
        message: "Subject updated successfully",
        data: yearGroup,
    })
});

//@desc delete year group
//@route delete /api/v1/year-group/:id
//@access private

exports.deleteYearGroupCtrl = AsyncHandler(async(req, res) => {
    
    await YearGroup.findByIdAndDelete(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "Suject deleted successfully",
    })
});