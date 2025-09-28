// import verifyToken from "../utils/verifyToken";

const Teacher = require("../models/Staff/Teacher");

const verifyToken = require("../utils/verifyToken");

const isTeacher = async (req, res, next) => {
    // find user
   const userId = req?.userAuth?._id
   const teacherFound = await Teacher.findById(userId);
   // check if is an admin
   if (teacherFound?.role === "teacher") {
        next();
   } else {
        next(new Error("Access Denied, teacher only"))
   }
}

module.exports = isTeacher;