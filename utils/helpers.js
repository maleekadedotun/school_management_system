const bcrypt = require("bcryptjs");

exports.hashedPassword = async(password) =>{
    const salt = await bcrypt.genSalt(10);
    // hashPassword
    const hash = await bcrypt.hash(password, salt);
    return hash;
}

exports.isPasswordMatched = async(password, hash) =>{
    return await bcrypt.compare(password, hash);
}