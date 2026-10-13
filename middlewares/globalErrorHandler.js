const globalErrorHandler = (err, req, res, next) =>{
    //status
    //message
    //stack

    const stack = err.stack;
    const message = err.message;
    const status = err.status ? err.status : "Failed";
    let statusCode = err.statusCode;
    if (!statusCode) {
      if (err.name === "ValidationError" || err.name === "CastError") {
        statusCode = 400;
      } else if (res.statusCode && res.statusCode >= 400) {
        statusCode = res.statusCode;
      } else {
        statusCode = 500;
      }
    }
    res.status(statusCode).json({
        status,
        message,
        stack,
    })

}

const notFoundErr = (req, res, next) => {
    const err = new Error(`Can't find ${req.originalUrl} on the server`)
    next(err)
}

module.exports = {globalErrorHandler, notFoundErr}