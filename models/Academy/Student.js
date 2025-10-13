const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
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

        StudentId:{
            type: String,
            required: true,
            default: function () {
                return (
                    "STU" +
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

        // if withdrawn, the student will not be able to login
        isWithDrawn:{
            type: Boolean,
            default: false,
        },  

        // if suspended, the student can login, but cannot perform any task.
          isSuspended:{
            type: Boolean,
            default: false,
        },

        role:{
            type: String,
            default: "student",
        },

        // class are from level 1-6
        // Keep track of the class level the student is in
        // classLevel: [{
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "ClassLevel",
        // }],

        // currentClassLevel: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "ClassLevel",
        //     default: function () {
        //         return this.classLevel.length > 0 
        //             ? this.classLevel[this.classLevel.length - 1] 
        //             : null;
        //     }
        // },

        classLevels:[
            {
                type: String,
            }
        ],

        currentClassLevel: {
            type: String,
            default: function () {
                return this.classLevels[this.classLevels.length - 1]
            }
        },

        

        academicYear:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
            // required: true,
        },

        dateAdmitted:{
            type: Date,
            default: Date.now,
        },

        academicYear:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
            // required: true,
        },

        examsResults:[
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "ExamResults",
            },
        ],

        program:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            // required: true,
        },

        isPromotedToLevel200:{
            type: Boolean,
            default: false,
        },

        isPromotedToLevel300:{
            type: Boolean,
            default: false,
        },

        isPromotedToLevel400:{
            type: Boolean,
            default: false,
        },

        isGraduated:{
            type: Boolean,
            default: false,
        },

        prefectName: {
            type: String
        },

        // behaviourReport:[{
        //     type: Schema.types.ObjectId,
        //     ref: "BehaviourReport",
        // },],

        // financialReport:[
        //     {
        //         type: Schema.types.ObjectId,
        //         ref: "FinancialReport",
        //     },
        // ],

        // year group
        yearGraduated:{
            type: Date,
        },
        
    },
    
    {
        timestamps: true,
    }
);

// model
// compile
const Student = mongoose.model("Student", studentSchema)

module.exports = Student