const AsyncHandler = require("express-async-handler");
const Admin = require("../../models/Staff/admin");
const AcademicTerm = require("../../models/Academy/AcademicTerm");
const mongoose = require("mongoose");



//@desc create academic term
//@route POST /api/v1/academic-terms
//@access private
exports.createAcademicTermCtrl = AsyncHandler(async(req, res) => {
    // console.log("BODY ===>", req.body);
    const {name, description, duration} = req.body;
    // find if exist
    const academicTerm = await AcademicTerm.findOne({name});
    if (academicTerm) {
        throw new Error("Academic term already exist")
    }
    const academicTermCreated = await AcademicTerm.create({
        name,
        description,
        duration,
        createdBy: req.userAuth._id
    });
    // push academic into admin
    const admin = await Admin.findById(req.userAuth._id);
    admin.academicTerms.push(academicTermCreated._id);
    // save
    await admin.save();

    res.status(201).json({
        status : "Success",
        message: "Academic term created successfully",
        data: academicTermCreated,
    })
});

//@desc get all academic term
//@route GET /api/v1/academic-terms
//@access private

exports.fetchAcademicTermsCtrl = AsyncHandler(async(req, res) => {
    const academicTerm = await AcademicTerm.find();

    res.status(201).json({
        status : "Success",
        message: "Academic terms fetched successfully",
        data: academicTerm,
    })
});

//@desc get single academic term
//@route GET /api/v1/academic-terms/:id
//@access private

exports.fetchAcademicTermCtrl = AsyncHandler(async (req, res) => {
  const id = req.params.id.trim();

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: "Error",
      message: "Invalid academic term ID",
    });
  }

  const academicTerm = await AcademicTerm.findById(id);

  if (!academicTerm) {
    return res.status(404).json({
      status: "Error",
      message: "Academic term not found",
    });
  }

  res.status(200).json({
    status: "Success",
    message: "Academic term fetched successfully",
    data: academicTerm,
  });
});


//@desc update academic term
//@route PUT /api/v1/academic-years/:id
//@access private

exports.updateAcademicTermCtrl = AsyncHandler(async(req, res) => {
    const {name, description, duration} = req.body;
    // check if already exist
    const academicTermFoud = await AcademicTerm.findOne({name});
    if (academicTermFoud) {
        throw new Error("Academic term already exist");
    }
    const academicTerm = await AcademicTerm.findByIdAndUpdate(req.params.id,
        {
            name,
            description,
            duration,
            createdBy: req.userAuth._id,
        },
        {
            new: true,
        }
    );

    res.status(201).json({
        status : "Success",
        message: "Academic term updated successfully",
        data: academicTerm,
    })
});

//@desc delete academic term
//@route delete /api/v1/academic-terms/:id
//@access private

exports.deleteAcademicTermCtrl = AsyncHandler(async(req, res) => {
    
    await AcademicTerm.findByIdAndDelete(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "Academic term deleted successfully",
    })
});