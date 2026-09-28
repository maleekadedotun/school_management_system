const AsyncHandler = require("express-async-handler");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Admin = require("../../models/Staff/admin");
const Teacher = require("../../models/Staff/Teacher");
const ExamResult = require("../../models/Academy/ExamResults");
const generateToken = require("../../utils/generateToken");
const verifyToken = require("../../utils/verifyToken");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");


//@desc register admin
//@route POST /api/v1/admin/register
//@access private
exports.adminRegisterCtrl = AsyncHandler(async(req,res) => {
    const {name, email, password} = req.body    
    
    // if email exist
    const adminFound = await Admin.findOne({email});
    if (adminFound) {
        throw new Error("Admin already exist")
        // res.json("User already exist")
    }
  
    // create user
    const user = await Admin.create({
        name,
        email,
        password: await hashedPassword(password),
    })
    res.status(201).json({
        status: "Success",
        user,
        message: "Admin register successfully",
    })  
});

//@desc login admin
//@route POST /api/v1/admin/login
//@access private
exports.adminLoginCtrl =  AsyncHandler(async(req, res) => {
    const {password, email} = req.body;
        const user = await Admin.findOne({email});
        if (!user) {
           return res.json({message: "Invalid login credentials"})
        }
        // verify password

        const isMatched = await isPasswordMatched(password, user.password);
        if (!isMatched) {
           return res.json({message: "Invalid login credentials"})   
        }
        else{
            return res.json({
                data: generateToken(user._id), 
                user, 
                // verify,
                message: "Admin logged in Successfully",
            })
        }
        
        // if (user && await user.verifyPassword(password)) {
        // //   const token = generateToken(user._id)
        // //   if (token) {
        //     // const verify = verifyToken(token);
        //     // console.log(verify);
            
        // //    }
        //     return res.json({
        //         data: generateToken(user._id), 
        //         user, 
        //         // verify,
        //         message: "Admin logged in Successfully",
        //     })
        // }
        // else{
        //     res.json({message: "Invalid login credentials"})
        // }
    
})

//@desc all admin
//@route GET /api/v1/admin/
//@access private
exports.getAllAdminCtrl = AsyncHandler( async(req,res) => {
    // const admins = await Admin.find();
    res.status(200).json(res.results)
})

//@desc single admin
//@route GET /api/v1/admin/:id
//@access private
exports.getAdminProfileCtrl = AsyncHandler( async(req,res) => {
//    console.log(req.userAuth);
   const admin = await Admin.findById(req.userAuth._id).select("-password -createdAt -updatedAt")
   .populate("academicYears")
   .populate("academicTerms") 
   .populate("yearGroups") 
   .populate("classLevel") 
   .populate("programs").populate("students");
   if (!admin) {
        throw new Error("Not an admin")
   }
   else{
    res.status(200).json({
        status: "Success",
        admin,
        message: "Admin profile fetched successfully",

    })
   }
   
}) 

//@desc update admin
//@route PUT /api/v1/admin/update/:id
//@access private
exports.updateAdminCtrl = AsyncHandler(async(req,res) => {
    console.log("REQ BODY:", req.body);

    const {name, email, password} = req.body;
   
   // find user
   //   const userFound = await Admin.findById(req.userAuth._id)
    // find email
    const emailExist = await Admin.findOne({email});
    console.log(emailExist);
    
    if (emailExist) {
        throw new Error("Email is taken/exist")
    } 
    // check if password is updating
    if (password) {
        // update
        const admin = await Admin.findByIdAndUpdate(req.userAuth._id, {
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
            data: admin,
            message: "Admin updated successfully",
        })
    }
    else{
                // update
        const admin = await Admin.findByIdAndUpdate(req.userAuth._id, {
            email,
            name,
        }, 
        {
            new: true,
            runValidators: true,
        });
        res.status(200).json({
            status: "Success",
            data: admin,
            message: "Admin updated successfully",
        })
    }

    
    // res.status(200).json({
    //             status: "Success",
    //             // data: admin,
    //             message: "Admin updated successfully",
    // })
 
});

//@desc delete admin
//@route DELETE /api/v1/admin/delete/:id
//@access private
exports.deleteAdminCtrl = (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "Admin deleted successfully"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

//@desc admin suspend teacher
//@route PUT /api/v1/admin/teacher/suspend/:id
//@access private
exports.adminSuspendTeacherCtrl = AsyncHandler(async (req, res) => {
    const teacher = await Teacher.findByIdAndUpdate(
        req.params.id,
        { isSuspended: true },
        { new: true }
    );
    if (!teacher) {
        throw new Error("Teacher not found");
    }
    res.status(200).json({
        status: "Success",
        message: "Teacher suspended successfully",
        data: teacher,
    });
});

//@desc admin unsuspend teacher
//@route PUT /api/v1/admin/teacher/unsuspend/:id
//@access private
exports.adminUnSuspendTeacherCtrl = AsyncHandler(async (req, res) => {
    const teacher = await Teacher.findByIdAndUpdate(
        req.params.id,
        { isSuspended: false },
        { new: true }
    );
    if (!teacher) {
        throw new Error("Teacher not found");
    }
    res.status(200).json({
        status: "Success",
        message: "Teacher unsuspended successfully",
        data: teacher,
    });
});

//@desc admin withdraw teacher
//@route PUT /api/v1/admin/teacher/withdraw/:id
//@access private
exports.adminWithdrawTeacherCtrl = AsyncHandler(async (req, res) => {
    const teacher = await Teacher.findByIdAndUpdate(
        req.params.id,
        { isWithDrawn: true },
        { new: true }
    );
    if (!teacher) {
        throw new Error("Teacher not found");
    }
    res.status(200).json({
        status: "Success",
        message: "Teacher withdrawn successfully",
        data: teacher,
    });
});

//@desc admin unwithdraw teacher
//@route PUT /api/v1/admin/teacher/unwithdraw/:id
//@access private
exports.adminUnWithdrawTeacherCtrl = AsyncHandler(async (req, res) => {
    const teacher = await Teacher.findByIdAndUpdate(
        req.params.id,
        { isWithDrawn: false },
        { new: true }
    );
    if (!teacher) {
        throw new Error("Teacher not found");
    }
    res.status(200).json({
        status: "Success",
        message: "Teacher unwithdrawn successfully",
        data: teacher,
    });
});

//@desc admin publish exam result
//@route PUT /api/v1/admin/publish/exam/:id
//@access private
exports.adminPublishExamResultCtrl = AsyncHandler(async (req, res) => {
    const examId = req.params.id;
    // Check if the parameter matches an Exam or an ExamResult
    let filter = { exam: examId };
    if (examId.match(/^[0-9a-fA-F]{24}$/)) {
        filter = { $or: [{ exam: examId }, { _id: examId }] };
    }
    const updateResult = await ExamResult.updateMany(filter, { isPublished: true });
    res.status(200).json({
        status: "Success",
        message: "Exam results published successfully",
        data: updateResult,
    });
});

//@desc admin unpublish exam result
//@route PUT /api/v1/admin/unpublish/exam/:id
//@access private
exports.adminUnPublishExamResultCtrl = AsyncHandler(async (req, res) => {
    const examId = req.params.id;
    let filter = { exam: examId };
    if (examId.match(/^[0-9a-fA-F]{24}$/)) {
        filter = { $or: [{ exam: examId }, { _id: examId }] };
    }
    const updateResult = await ExamResult.updateMany(filter, { isPublished: false });
    res.status(200).json({
        status: "Success",
        message: "Exam results unpublished successfully",
        data: updateResult,
    });
});

//@desc  admin forgot password (generates reset token)
//@route POST /api/v1/admin/forgot-password
//@access public
exports.adminForgotPasswordCtrl = AsyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            status: "failed",
            message: "Please provide your registered administrator email address"
        });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    if (!admin) {
        return res.status(404).json({
            status: "failed",
            message: "No administrator account found with that email address"
        });
    }

    // Generate secure random reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Token valid for 30 minutes
    admin.passwordResetToken = hashedToken;
    admin.passwordResetExpires = Date.now() + 30 * 60 * 1000;
    await admin.save({ validateBeforeSave: false });

    return res.status(200).json({
        status: "success",
        message: "Identity verified. Password reset token generated successfully.",
        resetToken,
        admin: {
            name: admin.name,
            email: admin.email,
            role: admin.role || "admin",
        }
    });
});

//@desc  admin reset password
//@route POST /api/v1/admin/reset-password
//@route POST /api/v1/admin/reset-password/:token
//@access public
exports.adminResetPasswordCtrl = AsyncHandler(async (req, res) => {
    const token = req.params.token || req.body.token;
    const { password, email } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({
            status: "failed",
            message: "Password is required and must be at least 6 characters long"
        });
    }

    let admin = null;

    if (token) {
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        admin = await Admin.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() },
        });
    }

    // Fallback: If verifying with email directly
    if (!admin && email) {
        admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    }

    if (!admin) {
        return res.status(400).json({
            status: "failed",
            message: "Invalid or expired password reset request. Please request a new token or verify your details."
        });
    }

    // Set new password
    admin.password = await hashedPassword(password);
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    await admin.save({ validateBeforeSave: false });

    return res.status(200).json({
        status: "success",
        message: "Password reset successful. You can now log in with your new password.",
    });
});