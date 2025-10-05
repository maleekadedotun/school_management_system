const AsyncHandler = require("express-async-handler");
const Admin = require("../../models/Staff/admin");
const Program = require("../../models/Academy/program");

//@desc create program
//@route POST /api/v1/programs
//@access private
exports.createProgramCtrl = AsyncHandler(async(req, res) => {
    // console.log("BODY ===>", req.body);
    const {name, description} = req.body;
    // find if exist
    const programFound = await Program.findOne({name});
    if (programFound) {
        throw new Error("Program already exist")
    }
    const programCreated = await Program.create({
        name,
        description,
        createdBy: req.userAuth._id
    });
    // push program into admin
    const admin = await Admin.findById(req.userAuth._id);
    admin.programs.push(programCreated._id);
    // save
    await admin.save();

    res.status(201).json({
        status : "Success",
        message: "Program created successfully",
        data: programCreated,
    })
});

//@desc get all progarms
//@route GET /api/v1/programs
//@access private

exports.fetchProgramsCtrl = AsyncHandler(async(req, res) => {
    const progarms = await Program.find();

    res.status(201).json({
        status : "Success",
        message: "Programs fetched successfully",
        data: progarms,
    })
});

//@desc get single program
//@route GET /api/v1/programs/:id
//@access private

exports.fetchProgramCtrl = AsyncHandler(async(req, res) => {
    // console.log(req.params.id, "single");
    
    const programId = await Program.findById(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "academic year fetched successfully",
        data: programId,
    })
});

//@desc update program
//@route PUT /api/v1/programs/:id
//@access private

exports.updateProgramCtrl = AsyncHandler(async(req, res) => {
    const {name, description} = req.body;
    // check if already exist
    const programFound = await Program.findOne({name});
    if (programFound) {
        throw new Error("Program already exist");
    }
    const program = await Program.findByIdAndUpdate(req.params.id,
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
        message: "Program updated successfully",
        data: program,
    })
});

//@desc delete program
//@route delete /api/v1/program/:id
//@access private

exports.deleteProgramCtrl = AsyncHandler(async(req, res) => {
    
    await Program.findByIdAndDelete(req.params.id);

    res.status(201).json({
        status : "Success",
        message: "Program deleted successfully",
    })
});