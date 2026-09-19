const verifyToken = require("../utils/verifyToken");

const isAuthenticated = (model) => {
  return async (req, res, next) => {
    try {
      const headerObj = req.headers;
      const token = headerObj?.authorization?.split(" ")[1];
      if (!token) {
        const err = new Error("No token provided");
        err.statusCode = 401;
        return next(err);
      }
      const verifiedToken = verifyToken(token);
      if (verifiedToken) {
        const user = await model.findById(verifiedToken.id).select("name email role");
        if (!user) {
          const err = new Error("User not found / Invalid token");
          err.statusCode = 401;
          return next(err);
        }
        req.userAuth = user;
        next();
      } else {
        const err = new Error("Token expired/Invalid");
        err.statusCode = 401;
        next(err);
      }
    } catch (error) {
      error.statusCode = 401;
      next(error);
    }
  };
};

module.exports = isAuthenticated;