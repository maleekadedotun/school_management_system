const AsyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const Admin = require("../../models/Staff/admin");
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
    const admins = await Admin.find();
    res.status(200).json({
        status: "Success",
        message: "Admins fetched successfully",
        data: admins,
    })
})

//@desc single admin
//@route GET /api/v1/admin/:id
//@access private
exports.getAdminProfileCtrl = AsyncHandler( async(req,res) => {
//    console.log(req.userAuth);
   const admin = await Admin.findById(req.userAuth._id).select("-password -createdAt -updatedAt").populate("academicYears");   
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
//@route PUT /api/v1/admin/suspend/teacher/:id
//@access private
exports.adminSuspendTeacherCtrl = (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "Admin has suspend teacher"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

//@desc admin unsuspend teacher
//@route PUT /api/v1/admin/unsuspend/teacher/:id
//@access private
exports.adminUnSuspendTeacherCtrl =  (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "Admin has unsuspend teacher"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

//@desc admin withdraw teacher
//@route PUT /api/v1/admin/withdraw/teacher/:id
//@access private
exports.adminWithdrawTeacherCtrl = (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "Admin has withdraw teacher"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

//@desc admin unwithdraw teacher
//@route PUT /api/v1/admin/unwithdraw/teacher/:id
//@access private
exports.adminUnWithdrawTeacherCtrl = (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "Admin has unwithdraw teacher"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

//@desc admin publish teacher
//@route PUT /api/v1/admin/publish/exam/:id
//@access private
exports.adminPublishExamResultCtrl = (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "Admin publishing exam result"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

//@desc admin unpublish exam result
//@route PUT /api/v1/admin/unpublish/exam/:id
//@access private
exports.adminUnPublishExamResultCtrl =  (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "Admin unpublishing exam result"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}