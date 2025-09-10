const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
    {
        name:{
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
            required: true,
        },

        createdBy: {
            type: Schema.Types.ObjectId,
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