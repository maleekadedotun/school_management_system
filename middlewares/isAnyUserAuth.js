const Teacher = require("../models/Staff/Teacher");
const Admin = require("../models/Staff/admin");
const Student = require("../models/Academy/Student");
const verifyToken = require("../utils/verifyToken");

const isAnyUserAuth = async (req, res, next) => {
    try {
        const headerObj = req.headers;
        const token = headerObj?.authorization?.split(" ")[1];
        if (!token) {
            const err = new Error("No token provided");
            err.statusCode = 401;
            return next(err);
        }

        const verifiedToken = verifyToken(token);
        if (!verifiedToken) {
            const err = new Error("Token expired or invalid");
            err.statusCode = 401;
            return next(err);
        }

        // Try Admin
        let user = await Admin.findById(verifiedToken.id).select("name email role");
        // Try Teacher
        if (!user) {
            user = await Teacher.findById(verifiedToken.id).select("name email role teacherId subject");
        }
        // Try Student
        if (!user) {
            user = await Student.findById(verifiedToken.id).select("name email role StudentId");
        }

        if (!user) {
            const err = new Error("User not found or invalid token");
            err.statusCode = 401;
            return next(err);
        }

        req.userAuth = user;
        next();
    } catch (error) {
        error.statusCode = 401;
        next(error);
    }
};

module.exports = isAnyUserAuth;
