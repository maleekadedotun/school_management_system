const mongoose = require("mongoose");

const examResultsSchema = new mongoose.Schema(
    {
        studentID:{
            type: String,
            required: true,
        },

        exam:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Exam",
            required: true,
        },

        grade:{
            type: Number,
            required: true,
        },

        // program:{
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "Program",
        //     required: true,
        // },

        score:{
            type: Number,
            required: true,
        },

        passMark:{
            type: Number,
            required: true,
            default: 50,
        },
        answeredQuestions: [
            {
                type: Object,
            }
        ],

        status:{
            type: String,
            required: true,
            enum: ["Failed", "Passed"],
            default: "Failed",
        },

        // Excellent/Good/Poor

        remarks:{
            type: String,
            required: true,
            enum: ["Excellent", "Good", "Poor"],
            default: "Poor",
        },

        // position:{
        //     type: Number,
        //     required: true,
        // },

        // subject:{
        //     type: String,
        //     ref: "Subject",
        // },

        classLevel:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
        },

        academicTerm:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicTerm",
            required: true,
        },

        academicYear:{
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
const ExamResults = mongoose.model("ExamResults", examResultsSchema)

module.exports = ExamResults;