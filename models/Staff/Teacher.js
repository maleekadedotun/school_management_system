const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
    {
        // level 100, 200, 300, 400
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

          dateEmployed:{
            type: String,
            default: Date.now,
        },

        // Optional 

        teacherId:{
            type: String,
            required: true,
            default: function () {
                return (
                    "TEA" +
                    Math.floor(100 + Math.random() * 90) +
                    Date.now().toString().slice(2, 4) +
                    this.name
                    .split(" ")
                    .map(name => name[0])
                    .join("")
                    .toUpperCase()
                )
            }
        },
        // if withdrawn, the teacher will not be able to login
        isWithDrawn:{
            type: Boolean,
            default: false,
        },  

        // if suspended, the teacher can login, but cannot perform any task.
          isSuspended:{
            type: Boolean,
            default: false,
        },

        role:{
            type: String,
            default: "teacher",
        },

        subject:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "SUbject",
            // required: true
        },

        applicationStatus:{
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },

        program:{
            type: String,
        },

        classLevel:{
            type: String,
        },

        academicYear:{
            type: String,
        },

        examsCreated:[{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Exam",
        }],
        
        createdBy:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            // required: true,
        },

        academicTerm:{
            type: String,
        },
        
    },
    
    {
        timestamps: true,
    }
);

// model
// compile
const Teacher = mongoose.model("teacher", teacherSchema)

module.exports = Teacher