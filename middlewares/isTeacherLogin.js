const Teacher = require("../models/Staff/Teacher");
const Admin = require("../models/Staff/admin");
const verifyToken = require("../utils/verifyToken");

const isTeacherLogin = async (req, res, next) => {
    // get token from headers
    const headerObj = req.headers;
    const token = headerObj?.authorization?.split(" ")[1];
    // verified token
    const verifiedToken = verifyToken(token);
    if (verifiedToken) {
        // find teacher first
        let user = await Teacher.findById(verifiedToken.id).select("name email role teacherId");
        // if not teacher, check admin
        if (!user) {
            user = await Admin.findById(verifiedToken.id).select("name email role");
        }
        if (!user) {
            return next(new Error("User not found or invalid token"));
        }
        req.userAuth = user;
        next();
    } else {
        const err = new Error("Token expired/Invalid");
        next(err);
    }
};

module.exports = isTeacherLogin;