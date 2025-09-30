const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
    {
        name:{
            type: String,
            required: true,
        },

        description:{
            type: String,
            required: true,
        },

        subject:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            required: true,
        },

        program:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            required: true,
        },

        passMark:{
            type: Number,
            required: true,
            default: 50,
        },

        totalMark:{
            type: Number,
            required: true,
            default: 100,
        },

        academicTerm:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicTerm",
            required: true,
        },

        duration:{
            type: String,
            required: true,
            default: "30 minutes",
        },

        examDate:{
            type: Date,
            required: true,
            default: new Date(),
        },

        examTime:{
            type: String,
            required: true,
        },

        examType:{
            type: String,
            required: true,
            default: "Quiz",
        },

        examStatus:{
            type: String,
            required: true,
            default: "pending",
            enum: ["pending", "live"],
        },

        questions:[
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Question",
            },
        ],

        classLevel: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
            required: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            required: true,
        },

        academicYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
            required: true,
        },
        
    },
    
    {
        timestamps: true,
    }
);

// model
// compile
const Exam = mongoose.model("Exam", examSchema)

module.exports = Exam;