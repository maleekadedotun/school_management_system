const AsyncHandler = require("express-async-handler");
const Admin = require("../../models/Staff/admin");
const Subject = require("../../models/Academy/Subject");
const YearGroup = require("../../models/Academy/YearGroup");
const AcademicYear = require("../../models/Academy/AcademicYear");

//@desc create year group
//@route POST /api/v1/years-group
//@access private
// exports.createYearGroupCtrl = AsyncHandler(async(req, res) => {
//     const {name, academicYear} = req.body;
//     // find if exist
//     const yearGroup = await YearGroup.findOne({name});
//     if (yearGroup) {
//         throw new Error("Year Group/Graduation already exist")
//     }
//     const yearGroupCreated = await YearGroup.create({
//         name,
//         academicYear,
//         createdBy: req.userAuth._id,
//     });
//     // find the admin
//     const admin = await Admin.findById(req.userAuth._id)
//     if (!admin) {
//         throw new Error("Admin not found")

//     }
//     // push to year group
//     admin.yearGroups.push(yearGroupCreated._id)
//     // save
//     await admin.save();

//     res.status(201).json({
//         status : "Success",
//         message: "Year group created successfully",
//         data: yearGroupCreated,
//     })
// });

exports.createYearGroupCtrl = AsyncHandler(async (req, res) => {
    const { name, academicYear } = req.body;

    // Validate required fields
    if (!name || !academicYear) {
        return res.status(400).json({
            status: "Failed",
            message: "Name and academic year are required",
        });
    }

    // Check if the academic year exists
    const academicYearExists = await AcademicYear.findById(academicYear);

    if (!academicYearExists) {
        return res.status(404).json({
            status: "Failed",
            message: "Academic year not found",
        });
    }

    // Check if the year group already exists
    const existingYearGroup = await YearGroup.findOne({
        name,
        academicYear,
    });

    if (existingYearGroup) {
        return res.status(400).json({
            status: "Failed",
            message: "Year Group/Graduation already exists",
        });
    }

    // Create the year group
    const yearGroupCreated = await YearGroup.create({
        name,
        academicYear,
        createdBy: req.userAuth._id,
    });

    // Find the admin
    const admin = await Admin.findById(req.userAuth._id);

    if (!admin) {
        return res.status(404).json({
            status: "Failed",
            message: "Admin not found",
        });
    }

    // Add the year group to the admin
    admin.yearGroups.push(yearGroupCreated._id);

    await admin.save();

    // Return the year group with its academic year populated
    const populatedYearGroup = await YearGroup.findById(
        yearGroupCreated._id
    ).populate("academicYear");

    res.status(201).json({
        status: "Success",
        message: "Year group created successfully",
        data: populatedYearGroup,
    });
});

//@desc get all year groups
//@route GET /api/v1/years-group
//@access private

exports.fetchYearsGroupCtrl = AsyncHandler(async (req, res) => {
    const yearGroup = await YearGroup.find().populate("academicYear");

    res.status(200).json({
        status: "Success",
        message: "Years group fetched successfully",
        data: yearGroup,
    })
});

//@desc get single year group
//@route GET /api/v1/years-group/:id
//@access private

exports.fetchYearGroupCtrl = AsyncHandler(async (req, res) => {
    // console.log(req.params.id, "single");

    const yearGroup = await YearGroup.findById(req.params.id);

    res.status(201).json({
        status: "Success",
        message: "Year group fetched successfully",
        data: yearGroup,
    })
});

//@desc update year group
//@route PUT /api/v1/years-group/:id
//@access private

exports.updateYearGroupCtrl = AsyncHandler(async (req, res) => {
    const { name, academicYear } = req.body;
    // check if already exist
    const yearGroupFound = await YearGroup.findOne({ name });
    if (yearGroupFound && yearGroupFound._id.toString() !== req.params.id) {
        throw new Error("Year Group already exists");
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
    ).populate("academicYear");

    res.status(200).json({
        status: "Success",
        message: "Year group updated successfully",
        data: yearGroup,
    })
});

//@desc delete year group
//@route delete /api/v1/year-group/:id
//@access private

exports.deleteYearGroupCtrl = AsyncHandler(async (req, res) => {

    await YearGroup.findByIdAndDelete(req.params.id);

    res.status(200).json({
        status: "Success",
        message: "Year group deleted successfully",
    })
});