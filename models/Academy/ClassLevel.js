const mongoose = require("mongoose");

const classLevelSchema = new mongoose.Schema(
    {
        // level 100, 200, 300, 400
        name:{
            type: String,
            required: true,
        },

        description: {
            type: String,
            required: true,
        },  

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },  

        // Student will be added to the class level when they are registered

        students:[
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Student",
            },  
        ],

        // Optional 

        subjects:[
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Subject",
            },  
        ],

        teachers:[
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Teacher",
            },  
        ]
    },
    
    {
        timestamps: true,
    }
);

// model
// compile
const ClassLevel = mongoose.model("ClassLevel", classLevelSchema)

module.exports = ClassLevel