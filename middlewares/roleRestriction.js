const roleRestriction = (...roles) => {
  return (req, res, next) => {
    if (!req.userAuth || !roles.includes(req.userAuth.role)) {
      const err = new Error("You do not have permission to perform this action");
      err.statusCode = 403;
      return next(err);
    }
    next();
  };
};

module.exports = roleRestriction;