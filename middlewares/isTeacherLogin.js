// import verifyToken from "../utils/verifyToken";
const Teacher = require("../models/Staff/Teacher");
const verifyToken = require("../utils/verifyToken");

const isTeacherLogin = async (req, res, next) => {
    // isTeacherLogin = req.userAuth
    // console.log(req.userAuth);
    
    // if (isTeacherLogin) {
    //     next();
    // } else {
    //     const err = new Error("You are not login");
    //     next();
    // }

    // get token from headers
    const headerObj = req.headers
    const token = headerObj?.authorization?.split(" ")[1];
    // verified token
    const verifiedToken = verifyToken(token)
    if (verifiedToken) {
    // save user into the req.obj
    // find the admin
    const user = await Teacher.findById(verifiedToken.id).select("name email role")   
        req.userAuth = user;
        next();
    } else {
        const err = new Error("Token expired/Invalid");
        next(err)
    }
}

module.exports = isTeacherLogin