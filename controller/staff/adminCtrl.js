const asyncHandler = require("express-async-handler")
const Admin = require("../../models/Staff/admin");
const generateToken = require("../../utils/generateToken");
const verifyToken = require("../../utils/verifyToken");

//@desc register admin
//@route POST /api/v1/admin/register
//@access private
exports.adminRegisterCtrl = asyncHandler(async(req,res) => {
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
        password,
    })
    res.status(201).json({
        status: "Success",
        user,
    })  
});

//@desc login admin
//@route POST /api/v1/admin/login
//@access private
exports.adminLoginCtrl =  asyncHandler(async(req, res) => {
    const {password, email} = req.body;
        const user = await Admin.findOne({email});
        if (!user) {
           return res.json({message: "Invalid login credentials"})
        }
        if (user && await user.verifyPassword(password)) {
          const token = generateToken(user._id)
        //   if (token) {
            const verify = verifyToken(token);
            console.log(verify);
            
        //    }
            return res.json({data: generateToken(user._id), user, verify})
        }
        else{
            res.json({message: "Invalid login credentials"})
        }
    
})

//@desc all admin
//@route GET /api/v1/admin/
//@access private
exports.getAllAdminCtrl = (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "all Admins"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

//@desc single admin
//@route GET /api/v1/admin/:id
//@access private
exports.getSingleAdminCtrl = (req,res) => {
    try {
        console.log(req.userAuth);
        
        res.status(201).json({
            status: "Success",
            data: "Single Admin"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

//@desc update admin
//@route PUT /api/v1/admin/update/:id
//@access private
exports.updateAdminCtrl =  (req,res) => {
    try {
        res.status(201).json({
            status: "Success",
            data: "Admin Updated"
        })
    } catch (error) {
        res.json({
            status: "Failed",
            error: error.message,
        })
    }
}

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