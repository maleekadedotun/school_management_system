const Teacher = require("../models/Staff/Teacher");
const Admin = require("../models/Staff/admin");

const isTeacher = async (req, res, next) => {
    // Check if role on req.userAuth is teacher or admin
    if (req?.userAuth?.role === "teacher" || req?.userAuth?.role === "admin") {
        return next();
    }
    const userId = req?.userAuth?._id;
    const teacherFound = await Teacher.findById(userId);
    if (teacherFound?.role === "teacher") {
        return next();
    }
    const adminFound = await Admin.findById(userId);
    if (adminFound?.role === "admin") {
        return next();
    }
    next(new Error("Access Denied, teacher or admin only"));
};

module.exports = isTeacher;