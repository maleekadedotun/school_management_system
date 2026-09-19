const Admin = require("../models/Staff/admin");

const isAdmin = async (req, res, next) => {
  const userId = req?.userAuth?._id;
  if (!userId) {
    const err = new Error("Access Denied, admin authentication required");
    err.statusCode = 401;
    return next(err);
  }
  const userFound = await Admin.findById(userId);
  if (userFound?.role === "admin") {
    next();
  } else {
    const err = new Error("Access Denied, admin only");
    err.statusCode = 403;
    next(err);
  }
};

module.exports = isAdmin;