// import verifyToken from "../utils/verifyToken";
const Student = require("../models/Academy/Student");
const verifyToken = require("../utils/verifyToken");

const isStudentLogin = async (req, res, next) => {
    // get token from headers
    const headerObj = req.headers
    const token = headerObj?.authorization?.split(" ")[1];
    // verified token
    const verifiedToken = verifyToken(token)
    if (verifiedToken) {
    // save user into the req.obj
    // find the admin
    const user = await Student.findById(verifiedToken.id).select("name email role")   
        req.userAuth = user;
        next();
    } else {
        const err = new Error("Token expired/Invalid");
        next(err)
    }
}

module.exports = isStudentLogin