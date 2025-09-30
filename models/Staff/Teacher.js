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
            // type: mongoose.Schema.Types.ObjectId,
            type: String,
            ref: "Subject",
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

// const mongoose = require("mongoose");

// const teacherSchema = new mongoose.Schema(
//     {
//         name: {
//             type: String,
//             required: true,
//         },

//         email: {
//             type: String,
//             required: true,
//         },

//         password: {
//             type: String,
//             required: true,
//         },

//         dateEmployed: {
//             type: Date,
//             default: Date.now,
//         },

//         teacherId: {
//             type: String,
//             required: true,
//             default: function () {
//                 return (
//                     "TEA" +
//                     Math.floor(100 + Math.random() * 90) +
//                     Date.now().toString().slice(2, 4) +
//                     this.name
//                         .split(" ")
//                         .map((n) => n[0])
//                         .join("")
//                         .toUpperCase()
//                 );
//             },
//         },

//         isWithDrawn: {
//             type: Boolean,
//             default: false,
//         },

//         isSuspended: {
//             type: Boolean,
//             default: false,
//         },

//         role: {
//             type: String,
//             default: "teacher",
//         },

//         subject: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Subject",
//             required: true,
//         },

//         applicationStatus: {
//             type: String,
//             enum: ["pending", "approved", "rejected"],
//             default: "pending",
//         },

//         program: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Program",
//             required: true,
//         },

//         classLevel: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "ClassLevel",
//             required: true,
//         },

//         academicYear: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "AcademicYear",
//             // required: true,
//         },

//         examsCreated: [
//             {
//                 type: mongoose.Schema.Types.ObjectId,
//                 ref: "Exam",
//             },
//         ],

//         createdBy: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Admin",
//             // required: true,
//         },

//         academicTerm: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "AcademicTerm",
//             // required: true,
//         },
//     },
//     {
//         timestamps: true,
//     }
// );

// const Teacher = mongoose.model("Teacher", teacherSchema);

// module.exports = Teacher;
