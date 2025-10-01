const AsyncHandler = require("express-async-handler");
const Teacher = require("../../models/Staff/Teacher");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");
const generateToken = require("../../utils/generateToken");
// const Admin = require("../../models/Staff/admin");

//@desc register teacher
//@route POST /api/v1/teacher/admin/register
//@access private

exports.adminRegisterTeacher = AsyncHandler(async(req, res) => {
    const {name, password, email} = req.body
    const teacher = await Teacher.findOne({email})
    if (teacher) {
        throw new Error("teacher already exist");
    }

    const hashPassword = await hashedPassword(password);
    const teacherCreated = await Teacher.create({
        name,
        email,
        password: hashPassword,
    });
    res.status(201).json({
        status: "Success",
        message: "Teacher created successfully",
        data: teacherCreated,
    })
});

//@desc login teacher
//@route POST /api/v1/teacher/admin/login
//@access public

exports.teacherLogin = AsyncHandler(async(req, res) => {
    const {email, password} = req.body;
    const teacher = await Teacher.findOne({email});
    if (!teacher) {
        res.status(404).json("Invalid login credentials")
    }

    // verify password
    const isMatched = await isPasswordMatched(password, teacher?.password);
    if (!isMatched) {
        res.status(404).json("Invalid login credentials");
    }
    else{
        res.status(201).json({
            status: "Success",
            message: "Teacher loggedIn successfully",
            data: generateToken(teacher?.id)
        });
    }

  
});

//@desc all teacher
//@route GET /api/v1/teachers/admin/
//@access public admin only

exports.fetchAllTeachersAdmin = AsyncHandler(async(req, res) =>{
    const teachers = await Teacher.find();
    res.status(201).json({
        status: "Success",
        message: "Teachers fetched successfully",
        data: teachers
    })
});

//@desc single teacher
//@route GET /api/v1/teachers/:teacherID/admin/
//@access public admin only

exports.fetchTeacherAdmin = AsyncHandler(async(req, res) =>{
    const teacherID = req.params.teacherID
    const teacher = await Teacher.findById(teacherID);
    if (!teacher) {
        throw new Error("Teacher not found")
    }
    res.status(201).json({
        status: "Success",
        message: "Teacher fetched successfully",
        data: teacher,
    })
});

//@desc  teacher profile
//@route GET /api/v1/teachers/profile
//@access public admin only

exports.fetchTeacherProfile = AsyncHandler(async(req, res) =>{
    const teacher = await Teacher.findById(req.userAuth?.id).select("-password -createdAt -updatedAt");
    if (!teacher) {
        throw new Error("Teacher not found")
    }
    res.status(201).json({
        status: "Success",
        message: "Teacher profile fetched successfully",
        data: teacher,
    })
});

//@desc  teacher update profile 
//@route PUT /api/v1/teacher/:teacherID/update/profile
//@access public teache only

exports.updateTeacherCtrl = AsyncHandler(async(req,res) => {
    const {name, email, password} = req.body;
   
   // find user
   //   const userFound = await Admin.findById(req.userAuth._id)
    // find email
    const emailExist = await Teacher.findOne({email});
    console.log(emailExist);
    
    if (emailExist) {
        throw new Error("Email is taken/exist")
    } 
    // check if password is updating
    if (password) {
        // update
        const teacher = await Teacher.findByIdAndUpdate(req.userAuth._id, {
            password: await hashedPassword(password),
            email,
            name,
        }, 
        {
            new: true,
            runValidators: true,
        });
        res.status(200).json({
            status: "Success",
            data: teacher,
            message: "Teacher updated successfully",
        })
    }
    else{
        // update
        const teacher = await Teacher.findByIdAndUpdate(req.userAuth._id, {
            email,
            name,
        }, 
        {
            new: true,
            runValidators: true,
        });
        res.status(200).json({
            status: "Success",
            data: teacher,
            message: "Teacher updated successfully",
        })
    }
});

//@desc  admin updating teacher profile 
//@route PUT /api/v1/admin/:teacherID/update/profile
//@access private teache only

// exports.adminUpdateTeacherCtrl = AsyncHandler(async(req,res) => {
//     const {program, subject, academicYear, classLevel} = req.body;
//     const teacherFound = await Teacher.findById(req.params.teacherID)
//     // console.log(teacherFound);
    

//     if (!teacherFound) {
//         throw new Error("Teacher not found");
//     }
//     if (teacherFound.isWithDrawn) {
//         throw new Error("Access denied, teacher is withdrawn");
        
//     }
//     // assign a program
//     if (program) {
//         teacherFound.program = program;
//         await teacherFound.save();
//         res.status(200).json({
//             status: "Success",
//             data: teacherFound,
//             message: "Teacher updated successfully",
//         })
//     }

//     // assign a subject
//     if (subject) {
//         teacherFound.subject = subject;
//         await teacherFound.save();
//         res.status(200).json({
//             status: "Success",
//             data: teacherFound,
//             message: "Teacher updated successfully",
//         })
//     }

//     // assign a classLevel
//     if (classLevel) {
//         teacherFound.subject = classLevel;
//         await teacherFound.save();
//         res.status(200).json({
//             status: "Success",
//             data: teacherFound,
//             message: "Teacher updated successfully",
//         })
//     }

//       // assign a academicYear
//     if (academicYear) {
//         teacherFound.subject = academicYear;
//         await teacherFound.save();
//         res.status(200).json({
//             status: "Success",
//             data: teacherFound,
//             message: "Teacher updated successfully",
//         })

//     }  
//     // res.status(400).json({
//     //     status: "Fail",
//     //     message: "No update fields provided",
//     // });  
// });

exports.adminUpdateTeacherCtrl = AsyncHandler(async (req, res) => {
    const { program, subject, academicYear, classLevel } = req.body;
    const teacherFound = await Teacher.findById(req.params.teacherID);

    if (!teacherFound) {
        throw new Error("Teacher not found");
    }

    if (teacherFound.isWithDrawn) {
        throw new Error("Access denied, teacher is withdrawn");
    }

    let updated = false;

    if (program) {
        teacherFound.program = program;
        updated = true;
    }
    if (subject) {
        teacherFound.subject = subject;
        updated = true;
    }
    if (classLevel) {
        teacherFound.classLevel = classLevel;
        updated = true;
    }
    if (academicYear) {
        teacherFound.academicYear = academicYear;
        updated = true;
    }

    if (!updated) {
        return res.status(400).json({
            status: "Fail",
            message: "No update fields provided",
        });
    }

    await teacherFound.save();

    res.status(200).json({
        status: "Success",
        data: teacherFound,
        message: "Teacher updated successfully",
    });
});


