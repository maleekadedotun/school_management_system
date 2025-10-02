const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
    {
        question:{
            type: String,
            required: true,
        },

        optionA :{
            type: String,
            required: true,
        },

        optionB :{
            type: String,
            required: true,
        },

        optionC :{
            type: String,
            required: true,
        },

        optionD :{
            type: String,
            required: true,
        },

        correctAnswer: {
            type: String,
            required: true,
        },

        isCorrect: {
            type: Boolean,
            default: false,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            required: true,
        },
        
    },
    
    {
        timestamps: true,
    }
);

// model
// compile
const Question = mongoose.model("Question", questionSchema)

module.exports = Question