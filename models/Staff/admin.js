const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");


const adminSchema = new mongoose.Schema(
    {
        name:{
            type: String,
            required: true,
        },
        email:{
            type: String,
            required: true,
        },
         password:{
            type: String,
            required: true,
        },
         role:{
            type: String,
            default: "admin",
        },
    },
    {
        timestamps: true,
    }
);
// hash password
adminSchema.pre("save",async function (next) {
    if (!this.isModified("password")) {
        next()
    }
    // salt
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt)
    next();
})

// verify password
adminSchema.methods.verifyPassword = async function(enteredPassword){
    return await bcrypt.compare(enteredPassword, this.password);
}
// model
const Admin = mongoose.model("Admin", adminSchema);

module.exports = Admin