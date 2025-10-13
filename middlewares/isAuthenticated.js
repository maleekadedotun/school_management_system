const verifyToken = require("../utils/verifyToken");

const isAuthenticated = (model) => {
    return async (req, res, next) => {
    // isLoggedIn = req.userAuth
    // console.log(req.userAuth);
    
    // if (isLoggedIn) {
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
    const user = await model.findById(verifiedToken.id).select("name email role")   
        req.userAuth = user;
        next();
    } else {
        const err = new Error("Token expired/Invalid");
        next(err)
    }
}
}

module.exports = isAuthenticated;