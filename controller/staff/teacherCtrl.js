const AsyncHandler = require("express-async-handler");
const crypto = require("crypto");
const Teacher = require("../../models/Staff/Teacher");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");
const generateToken = require("../../utils/generateToken");
const Admin = require("../../models/Staff/admin");
// const Admin = require("../../models/Staff/admin");

//@desc register teacher
//@route POST /api/v1/teacher/admin/register
//@access private

exports.adminRegisterTeacher = AsyncHandler(async(req, res) => {
    // find admin
    const adminFound = await Admin.findById(req.userAuth._id)
    if (!adminFound) {
        throw new Error("Admin not found")
    }
    const {name, password, email, subject, classLevel, program} = req.body;
    const teacher = await Teacher.findOne({email});
    if (teacher) {
        throw new Error("teacher already exist");
    }

    const hashPassword = await hashedPassword(password);
    const teacherCreated = await Teacher.create({
        name,
        email,
        password: hashPassword,
        subject,
        classLevel,
        program,
    });
    // teacher to admin
    adminFound.teachers.push(teacherCreated?._id);
    // save
    await adminFound.save();

    // Auto-link any existing students with matching subject & class level, or matching subject
    if (subject) {
        try {
            const Student = require("../../models/Academy/Student");
            const subjectQuery = [
                { subject: subject },
                { subject: { $regex: new RegExp(`^${subject.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&')}$`, "i") } }
            ];

            if (classLevel) {
                const classDigits = classLevel.toString().match(/\d+/)?.[0];
                const classQuery = [
                    { currentClassLevel: classLevel },
                    { currentClassLevel: { $regex: new RegExp(`^${classLevel.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&')}$`, "i") } },
                    ...(classDigits ? [{ currentClassLevel: { $regex: new RegExp(`(^|\\b|\\D)${classDigits}(\\D|\\b|$)`, "i") } }] : [])
                ];
                await Student.updateMany(
                    {
                        $and: [
                            { $or: subjectQuery },
                            { $or: classQuery }
                        ]
                    },
                    { $set: { assignedTeacher: teacherCreated._id } }
                );
            } else {
                await Student.updateMany(
                    { $or: subjectQuery },
                    { $set: { assignedTeacher: teacherCreated._id } }
                );
            }
        } catch (e) {
            console.error("Error auto-linking students to new teacher:", e);
        }
    }
    
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
        return res.status(401).json({ message: "Invalid login credentials" });
    }

    // verify password
    const isMatched = await isPasswordMatched(password, teacher?.password);
    if (!isMatched) {
        return res.status(401).json({ message: "Invalid login credentials" });
    }

    return res.status(200).json({
        status: "Success",
        message: "Teacher loggedIn successfully",
        data: generateToken(teacher?._id),
        user: {
            _id: teacher._id,
            name: teacher.name,
            email: teacher.email,
            role: teacher.role || "teacher",
        }
    });
});

//@desc all teacher
//@route GET /api/v1/teachers/admin/
//@access public admin only

exports.fetchAllTeachersAdmin = AsyncHandler(async(req, res) =>{
    res.status(200).json(res.results);
    // console.log(res.results);;
    
    // // query string
    // const query = req.query;
    // // params/:id
    // const params = req.params;
    // console.log(query);
   
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
//@access public teacher only

exports.fetchTeacherProfile = AsyncHandler(async(req, res) =>{
    const teacherId = req.userAuth?._id || req.userAuth?.id || req.userAuth;
    const teacher = await Teacher.findById(teacherId).select("-password -createdAt -updatedAt");
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
//@access public teacher only

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
    const { name, email, program, subject, academicYear, classLevel } = req.body;
    const teacherFound = await Teacher.findById(req.params.teacherID);

    if (!teacherFound) {
        throw new Error("Teacher not found");
    }

    if (teacherFound.isWithDrawn) {
        throw new Error("Access denied, teacher is withdrawn");
    }

    let updated = false;

    if (name) {
        teacherFound.name = name;
        updated = true;
    }
    if (email) {
        teacherFound.email = email;
        updated = true;
    }
    if (program !== undefined) {
        teacherFound.program = program;
        updated = true;
    }
    if (subject !== undefined) {
        teacherFound.subject = subject;
        updated = true;
    }
    if (classLevel !== undefined) {
        teacherFound.classLevel = classLevel;
        updated = true;
    }
    if (academicYear !== undefined) {
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

    // Link teacher to program if found
    if (program) {
        try {
            const Program = require("../../models/Academy/program");
            const mongoose = require("mongoose");
            const query = [
                { name: program },
                ...(mongoose.Types.ObjectId.isValid(program) ? [{ _id: program }] : [])
            ];
            const progDoc = await Program.findOne({ $or: query });
            if (progDoc) {
                await Program.findByIdAndUpdate(progDoc._id, {
                    $addToSet: { teachers: teacherFound._id }
                });
            }
        } catch (e) {
            console.error("Error linking teacher to program:", e);
        }
    }

    // Auto-link any students matching this teacher's subject and class level, or matching subject
    if (teacherFound.subject) {
        try {
            const Student = require("../../models/Academy/Student");
            const subjectQuery = [
                { subject: teacherFound.subject },
                { subject: { $regex: new RegExp(`^${teacherFound.subject.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&')}$`, "i") } }
            ];

            if (teacherFound.classLevel) {
                const classDigits = teacherFound.classLevel.toString().match(/\d+/)?.[0];
                const classQuery = [
                    { currentClassLevel: teacherFound.classLevel },
                    { currentClassLevel: { $regex: new RegExp(`^${teacherFound.classLevel.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&')}$`, "i") } },
                    ...(classDigits ? [{ currentClassLevel: { $regex: new RegExp(`(^|\\b|\\D)${classDigits}(\\D|\\b|$)`, "i") } }] : [])
                ];
                await Student.updateMany(
                    {
                        $and: [
                            { $or: subjectQuery },
                            { $or: classQuery }
                        ]
                    },
                    { $set: { assignedTeacher: teacherFound._id } }
                );
            } else {
                await Student.updateMany(
                    { $or: subjectQuery },
                    { $set: { assignedTeacher: teacherFound._id } }
                );
            }
        } catch (e) {
            console.error("Error auto-linking students to teacher:", e);
        }
    }

    res.status(200).json({
        status: "Success",
        data: teacherFound,
        message: "Teacher updated successfully",
    });
});

//@desc  teacher forgot password (generates reset token)
//@route POST /api/v1/teachers/forgot-password
//@access public
exports.teacherForgotPasswordCtrl = AsyncHandler(async (req, res) => {
    const { email, teacherId } = req.body;

    if (!email && !teacherId) {
        return res.status(400).json({
            status: "failed",
            message: "Please provide your registered email address or Teacher ID"
        });
    }

    const query = [];
    if (email) query.push({ email: email.toLowerCase().trim() });
    if (teacherId) query.push({ teacherId: teacherId.trim() });

    const teacher = await Teacher.findOne({ $or: query });

    if (!teacher) {
        return res.status(404).json({
            status: "failed",
            message: "No teacher account found with the provided details"
        });
    }

    // Generate secure random reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Token valid for 30 minutes
    teacher.passwordResetToken = hashedToken;
    teacher.passwordResetExpires = Date.now() + 30 * 60 * 1000;
    await teacher.save({ validateBeforeSave: false });

    return res.status(200).json({
        status: "success",
        message: "Identity verified. Password reset token generated successfully.",
        resetToken,
        teacher: {
            name: teacher.name,
            email: teacher.email,
            teacherId: teacher.teacherId,
        }
    });
});

//@desc  teacher reset password
//@route POST /api/v1/teachers/reset-password
//@route POST /api/v1/teachers/reset-password/:token
//@access public
exports.teacherResetPasswordCtrl = AsyncHandler(async (req, res) => {
    const token = req.params.token || req.body.token;
    const { password, email, teacherId } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({
            status: "failed",
            message: "Password is required and must be at least 6 characters long"
        });
    }

    let teacher = null;

    if (token) {
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        teacher = await Teacher.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() },
        });
    }

    // Fallback: If verifying with email and/or teacherId directly
    if (!teacher && (email || teacherId)) {
        const query = [];
        if (email) query.push({ email: email.toLowerCase().trim() });
        if (teacherId) query.push({ teacherId: teacherId.trim() });
        teacher = await Teacher.findOne({ $or: query });
    }

    if (!teacher) {
        return res.status(400).json({
            status: "failed",
            message: "Invalid or expired password reset request. Please request a new token or verify your details."
        });
    }

    // Set new password
    teacher.password = await hashedPassword(password);
    teacher.passwordResetToken = undefined;
    teacher.passwordResetExpires = undefined;
    await teacher.save({ validateBeforeSave: false });

    return res.status(200).json({
        status: "success",
        message: "Password reset successful. You can now log in with your new password.",
    });
});



