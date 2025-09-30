const mongoose = require("mongoose");

const examResultsSchema = new mongoose.Schema(
    {
        student:{
            type: Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },

        exam:{
            type: Schema.Types.ObjectId,
            ref: "Exam",
            required: true,
        },

        grade:{
            type: Number,
            required: true,
        },

        program:{
            type: Schema.Types.ObjectId,
            ref: "Program",
            required: true,
        },

        score:{
            type: Number,
            required: true,
        },

        passMark:{
            type: Number,
            required: true,
            default: 50,
        },

        status:{
            type: String,
            required: true,
            enum: ["failed", "passed"],
            default: "failed",
        },

        // Excellent/Good/Poor

        remarks:{
            type: String,
            required: true,
            enum: ["Excellent", "Good", "Poor"],
            default: "Poor",
        },

        position:{
            type: Number,
            required: true,
        },

        subject:{
            type: String,
            ref: "Subject",
        },

        classLevel:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
        },

        academicTerm:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicTerm",
            required: true,
        },

        academicTear:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
            required: true,
        },

        isPublished:{
            type: Boolean,
            default: false,
        },

    },
    
    {
        timestamps: true,
    }
);

// model
// compile
const ExamResults = mongoose.model("ExamResult", examResultsSchema)

module.exports = ExamResults;