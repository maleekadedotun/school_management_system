const jwt = require("jsonwebtoken");

const generateToken = (id) => {
    console.log("JWT_SECRET is:", process.env.JWT_SECRET);

    return jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: "5d"});
}

module.exports = generateToken;