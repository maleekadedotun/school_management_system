const jwt = require("jsonwebtoken");

const generateToken = (id) => {
    return jwt.sign({id}, "anyKey", {expiresIn: "5d"});
}

module.exports = generateToken;