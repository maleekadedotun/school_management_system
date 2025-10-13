// import verifyToken from "../utils/verifyToken";

const Admin = require("../models/Staff/admin");

const verifyToken = require("../utils/verifyToken");

const isLoggedIn = 
// async (req, res, next) => {
//     // isLoggedIn = req.userAuth
//     // console.log(req.userAuth);
    
//     // if (isLoggedIn) {
//     //     next();
//     // } else {
//     //     const err = new Error("You are not login");
//     //     next();
//     // }

//     // get token from headers
//     const headerObj = req.headers
//     const token = headerObj?.authorization?.split(" ")[1];
//     // verified token
//     const verifiedToken = verifyToken(token)
//     if (verifiedToken) {
//     // save user into the req.obj
//     // find the admin
//     const user = await Admin.findById(verifiedToken.id).select("name email role")   
//         req.userAuth = user;
//         next();
//     } else {
//         const err = new Error("Token expired/Invalid");
//         next(err)
//     }
// }

module.exports = isLoggedIn