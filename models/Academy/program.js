const mongoose = require("mongoose");

const programSchema = new mongoose.Schema(
    {
        name:{
            type: String,
            required: true,
        },

        description:{
            type: String,
            required: true,
        },

        duration:{
            type: String,
            required: true,
            default: "4 years"
        },
        // created automatically
        //CSFTY
        code: {
            type: String,
            default: function () {
                return (
                    this.name
                    .split(" ")
                    .map(name => name[0])
                    .join("")
                    .toUpperCase() +
                    Math.floor(10 + Math.random() * 90) +
                    Math.floor(10 + Math.random() * 90) 
                );
            },
        },

        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
        // we will push the teacher that are in charge of the program
        teachers: [
            {
                type: Schema.Types.ObjectId,
                ref: "Teacher",
                // required: [],
            },
        ],

        students: [
            {
                type: Schema.Types.ObjectId,
                ref: "Student",
                required: [],
            },
        ],

        // We will push the subjects that are in the program when the program is created
        subjects: [
            {
                types: Schema.Types.ObjectId,
                ref: "Subject",
                required: [],
            },
        ],
        
    },
    {
        timestamps: true,
    }
);

// model
const Program = mongoose.model(Admin, "programSchema")

module.exports = Program