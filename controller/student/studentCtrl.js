const AsyncHandler = require("express-async-handler");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");
const generateToken = require("../../utils/generateToken");

const Student = require("../../models/Academy/Student");

//@desc register student
//@route POST /api/v1/students/admin/register
//@access private Admin only

exports.adminRegisterStudent = AsyncHandler(async(req, res) => {
    const {name, password, email} = req.body
    const student = await Student.findOne({email})
    if (student) {
        throw new Error("Student already exist");
    }

    const hashPassword = await hashedPassword(password);
    const studentCreated = await Student.create({
        name,
        email,
        password: hashPassword,
    });
    res.status(201).json({
        status: "Success",
        message: "Student created successfully",
        data: studentCreated,
    })
});

//@desc login student
//@route POST /api/v1/students/login
//@access public

exports.studentLogin = AsyncHandler(async(req, res) => {
    const {email, password} = req.body;
    const student = await Student.findOne({email});
    if (!student) {
        res.status(404).json("Invalid login credentials")
    }

    // verify password
    const isMatched = await isPasswordMatched(password, student?.password);
    if (!isMatched) {
        res.status(404).json("Invalid login credentials");
    }
    else{
        res.status(201).json({
            status: "Success",
            message: "Student loggedIn successfully",
            data: generateToken(student?.id)
        });
    }

  
});

//@desc  student profile
//@route GET /api/v1/teachers/profile
//@access public student only

exports.fetchStudentProfile = AsyncHandler(async(req, res) =>{
    const student = await Student.findById(req.userAuth?.id).select("-password -createdAt -updatedAt");
    if (!student) {
        throw new Error("Student not found")
    }
    res.status(201).json({
        status: "Success",
        message: "Student profile fetched successfully",
        data: student,
    })
});


//@desc all student
//@route GET /api/v1/students/admin/
//@access public admin only

exports.fetchAllStudentsAdmin = AsyncHandler(async(req, res) =>{
    const students = await Student.find();
    res.status(201).json({
        status: "Success",
        message: "Teachers fetched successfully",
        data: students
    });
});


//@desc single student
//@route GET /api/v1/students/:studentID/admin/
//@access public admin only

exports.fetchStudentAdmin = AsyncHandler(async(req, res) =>{
    const studentID = req.params.studentID
    const student = await Student.findById(studentID);
    if (!student) {
        throw new Error("Student not found")
    }
    res.status(201).json({
        status: "Success",
        message: "Student fetched successfully",
        data: student,
    })
});

//@desc  student update profile 
//@route PUT /api/v1/students/update
//@access public student only

exports.updateStudentCtrl = AsyncHandler(async(req,res) => {
    const {email, password} = req.body;
    // find email
    const emailExist = await Student.findOne({email});
    console.log(emailExist);
    
    if (emailExist) {
        throw new Error("Email is taken/exist")
    } 
    // check if password is updating
    if (password) {
        // update
        const student = await Student.findByIdAndUpdate(req.userAuth._id, {
            password: await hashedPassword(password),
            email,
        }, 
        {
            new: true,
            runValidators: true,
        });
        // res.status(200).json({
        //     status: "Success",
        //     data: student,
        //     message: "Student updated successfully",
        // })
    }
    else{
        // update
        const student = await Student.findByIdAndUpdate(req.userAuth._id, {
            email,
        }, 
        {
            new: true,
            runValidators: true,
        });
        res.status(200).json({
            status: "Success",
            data: student,
            message: "Student updated successfully",
        })
    }
});

//@desc   Admin updating student e.g: assigning class...
//@route PUT /api/v1/students/:studentID/update/admin
//@access private Admin only

exports.adminUpdateStudentCtrl = AsyncHandler(async(req, res) => {
    const {
        name,
        email,
        classLevels,
        academicYear,
        program,
        prefectName,
    } = req.body;
    const studentFound = await Student.findById(req.params.studentID);
    if(!studentFound) {
        throw new Error("Student not found");
    }
    // update
    const studentUpdated = await Student.findByIdAndUpdate(req.params.studentID, {
        $set:{
        name,
        email,
        // classLevels,
        academicYear,
        program,
        prefectName,
        },
        $addToSet: {
            classLevels,
        }
    },
    {
        new: true,
        runValidators: true,
    });
    // send response
    res.status(200).json({
        status: "Success",
        message: "Student updated successfully",
        data: studentUpdated,
    })
})