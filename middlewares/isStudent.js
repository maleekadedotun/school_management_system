// import verifyToken from "../utils/verifyToken";

const Student = require("../models/Academy/Student");
const verifyToken = require("../utils/verifyToken");

const isStudent = async (req, res, next) => {
    // find user
   const userId = req?.userAuth?._id
   const studentFound = await Student.findById(userId);
   // check if is an admin
   if (studentFound?.role === "student") {
        next();
   } else {
        next(new Error("Access Denied, student only"))
   }
}

module.exports = isStudent;