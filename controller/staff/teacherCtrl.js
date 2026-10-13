const AsyncHandler = require("express-async-handler");
const crypto = require("crypto");
const Teacher = require("../../models/Staff/Teacher");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");
const generateToken = require("../../utils/generateToken");
const Admin = require("../../models/Staff/admin");

const safeEscapeRegex = (str) => {
    return (str || "").toString().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

//@desc register teacher
//@route POST /api/v1/teacher/admin/register
//@access private

exports.adminRegisterTeacher = AsyncHandler(async(req, res) => {
    // find admin
    const adminFound = await Admin.findById(req.userAuth._id)
    if (!adminFound) {
        throw new Error("Admin not found")
    }
    const {name, password, email, subject, subjects, classLevel, program} = req.body;
    const teacher = await Teacher.findOne({email});
    if (teacher) {
        throw new Error("teacher already exist");
    }

    const hashPassword = await hashedPassword(password);

    // Resolve subjects for multi-subject support
    const Subject = require("../../models/Academy/Subject");
    const mongoose = require("mongoose");
    const rawSubjects = [
        ...(Array.isArray(subjects) ? subjects : (subjects ? [subjects] : [])),
        ...(Array.isArray(req.body.subjectIds) ? req.body.subjectIds : (req.body.subjectIds ? [req.body.subjectIds] : [])),
        ...(Array.isArray(subject) ? subject : (subject ? [subject] : []))
    ];
    const resolvedSubjectIds = [];
    const resolvedSubjectNames = [];

    for (const s of rawSubjects) {
        if (!s) continue;
        const sStr = typeof s === "object" && s._id ? s._id.toString() : s.toString().trim();
        if (!sStr) continue;
        let sDoc = null;
        if (mongoose.Types.ObjectId.isValid(sStr)) {
            sDoc = await Subject.findById(sStr);
        }
        if (!sDoc) {
            const escaped = safeEscapeRegex(sStr);
            sDoc = await Subject.findOne({ name: { $regex: new RegExp(`^${escaped}$`, "i") } });
        }
        if (!sDoc) {
            sDoc = await Subject.findOne({ name: { $regex: new RegExp(`^${sStr.trim()}$`, "i") } });
        }
        if (sDoc) {
            if (!resolvedSubjectIds.some(id => id.toString() === sDoc._id.toString())) {
                resolvedSubjectIds.push(sDoc._id);
                resolvedSubjectNames.push(sDoc.name);
            }
        } else if (typeof s === "string" && s.trim() && !mongoose.Types.ObjectId.isValid(s.trim())) {
            resolvedSubjectNames.push(s.trim());
        }
    }

    const primarySubject = resolvedSubjectNames[0] || (typeof subject === "string" ? subject : "");

    const teacherCreated = await Teacher.create({
        name,
        email,
        password: hashPassword,
        subject: primarySubject,
        subjects: resolvedSubjectIds,
        classLevel,
        program,
    });
    // teacher to admin
    adminFound.teachers.push(teacherCreated?._id);
    // save
    await adminFound.save();

    // Link subjects to this teacher
    if (resolvedSubjectIds.length > 0) {
        await Subject.updateMany(
            { _id: { $in: resolvedSubjectIds } },
            { $set: { teacher: teacherCreated._id } }
        );
    }

    // Auto-link any existing students with matching subject & class level, or matching subject
    const allTeacherSubjectNames = [
        ...(primarySubject ? [primarySubject] : []),
        ...resolvedSubjectNames
    ].filter(Boolean);

    if (allTeacherSubjectNames.length > 0 || resolvedSubjectIds.length > 0) {
        try {
            const Student = require("../../models/Academy/Student");
            const subjectQueries = [
                ...allTeacherSubjectNames.flatMap(sName => [
                    { subject: sName },
                    { subject: { $regex: new RegExp(`^${safeEscapeRegex(sName)}$`, "i") } },
                ]),
                ...(resolvedSubjectIds.length > 0 ? [{ "enrolledSubjects.subject": { $in: resolvedSubjectIds } }] : [])
            ];

            if (classLevel) {
                const classDigits = classLevel.toString().match(/\d+/)?.[0];
                const classQuery = [
                    { currentClassLevel: classLevel },
                    { currentClassLevel: { $regex: new RegExp(`^${safeEscapeRegex(classLevel)}$`, "i") } },
                    ...(classDigits ? [{ currentClassLevel: { $regex: new RegExp(`(^|\\b|\\D)${classDigits}(\\D|\\b|$)`, "i") } }] : [])
                ];
                await Student.updateMany(
                    {
                        $and: [
                            { $or: subjectQueries },
                            { $or: classQuery }
                        ]
                    },
                    { $set: { assignedTeacher: teacherCreated._id } }
                );
            } else {
                await Student.updateMany(
                    { $or: subjectQueries },
                    { $set: { assignedTeacher: teacherCreated._id } }
                );
            }
        } catch (e) {
            console.error("Error auto-linking students to new teacher:", e);
        }
    }
    
    const populatedTeacher = await Teacher.findById(teacherCreated._id).populate("subjects");
    
    res.status(201).json({
        status: "Success",
        message: "Teacher created successfully",
        data: populatedTeacher || teacherCreated,
    })
});

//@desc login teacher
//@route POST /api/v1/teacher/admin/login
//@access public

exports.teacherLogin = AsyncHandler(async(req, res) => {
    const {email, password} = req.body;
    const teacher = await Teacher.findOne({email}).populate("subjects");
    if (!teacher) {
        return res.status(401).json({ message: "Invalid login credentials" });
    }

    // verify password
    const isMatched = await isPasswordMatched(password, teacher?.password);
    if (!isMatched) {
        return res.status(401).json({ message: "Invalid login credentials" });
    }

    return res.status(200).json({
        status: "Success",
        message: "Teacher loggedIn successfully",
        data: generateToken(teacher?._id),
        user: {
            _id: teacher._id,
            name: teacher.name,
            email: teacher.email,
            role: teacher.role || "teacher",
            subject: teacher.subject,
            subjects: teacher.subjects || [],
            classLevel: teacher.classLevel,
            program: teacher.program,
        }
    });
});

//@desc all teacher
//@route GET /api/v1/teachers/admin/
//@access public admin only

exports.fetchAllTeachersAdmin = AsyncHandler(async(req, res) =>{
    res.status(200).json(res.results);
    // console.log(res.results);;
    
    // // query string
    // const query = req.query;
    // // params/:id
    // const params = req.params;
    // console.log(query);
   
});

const resolveTeacherSubjects = async (teacher) => {
    if (!teacher) return [];
    const Subject = require("../../models/Academy/Subject");
    const mongoose = require("mongoose");
    const existingIds = new Set(
        (teacher.subjects || []).map(s => (s && s._id ? s._id.toString() : s?.toString())).filter(Boolean)
    );
    const mergedSubjects = [...(teacher.subjects || [])];

    // Find any subjects where teacher is assigned directly
    const directlyAssigned = await Subject.find({ teacher: teacher._id })
        .populate("program academicTerms");

    for (const dSub of directlyAssigned) {
        if (!existingIds.has(dSub._id.toString())) {
            mergedSubjects.push(dSub);
            existingIds.add(dSub._id.toString());
        }
    }

    // Also check teacher.subject if it's a string/name or ObjectId
    if (teacher.subject && typeof teacher.subject === "string") {
        const subName = teacher.subject.trim();
        const alreadyIn = mergedSubjects.some(
            s => s?.name?.toLowerCase() === subName.toLowerCase() || s?._id?.toString() === subName
        );
        if (!alreadyIn) {
            let namedSub = null;
            if (mongoose.Types.ObjectId.isValid(subName)) {
                namedSub = await Subject.findById(subName).populate("program academicTerms");
            }
            if (!namedSub) {
                const escaped = safeEscapeRegex(subName);
                namedSub = await Subject.findOne({ name: { $regex: new RegExp(`^${escaped}$`, "i") } })
                    .populate("program academicTerms");
            }
            if (namedSub && !existingIds.has(namedSub._id.toString())) {
                mergedSubjects.push(namedSub);
                existingIds.add(namedSub._id.toString());
            }
        }
    }

    return mergedSubjects;
};

//@desc single teacher
//@route GET /api/v1/teachers/:teacherID/admin/
//@access public admin only

exports.fetchTeacherAdmin = AsyncHandler(async(req, res) =>{
    const teacherID = req.params.teacherID
    const teacher = await Teacher.findById(teacherID).populate({
        path: "subjects",
        populate: [
            { path: "program" },
            { path: "academicTerms" }
        ]
    });
    if (!teacher) {
        throw new Error("Teacher not found")
    }

    const mergedSubjects = await resolveTeacherSubjects(teacher);
    const teacherObj = teacher.toObject ? teacher.toObject() : { ...teacher };
    teacherObj.subjects = mergedSubjects;

    res.status(200).json({
        status: "Success",
        message: "Teacher fetched successfully",
        data: teacherObj,
    })
});

//@desc  teacher profile
//@route GET /api/v1/teachers/profile
//@access public teacher only

exports.fetchTeacherProfile = AsyncHandler(async(req, res) =>{
    const teacherId = req.userAuth?._id || req.userAuth?.id || req.userAuth;
    const teacher = await Teacher.findById(teacherId)
        .select("-password -createdAt -updatedAt")
        .populate({
            path: "subjects",
            populate: [
                { path: "program" },
                { path: "academicTerms" }
            ]
        });
    if (!teacher) {
        throw new Error("Teacher not found")
    }

    const mergedSubjects = await resolveTeacherSubjects(teacher);
    const teacherObj = teacher.toObject ? teacher.toObject() : { ...teacher };
    teacherObj.subjects = mergedSubjects;

    res.status(200).json({
        status: "Success",
        message: "Teacher profile fetched successfully",
        data: teacherObj,
    })
});

//@desc  teacher assigned subjects
//@route GET /api/v1/teachers/my-subjects
//@access private teacher only

exports.fetchTeacherSubjectsCtrl = AsyncHandler(async(req, res) => {
    const teacherId = req.userAuth?._id || req.userAuth?.id || req.userAuth;
    const teacher = await Teacher.findById(teacherId).populate({
        path: "subjects",
        populate: [
            { path: "program" },
            { path: "academicTerms" }
        ]
    });
    if (!teacher) {
        throw new Error("Teacher not found");
    }

    const mergedSubjects = await resolveTeacherSubjects(teacher);
    res.status(200).json({
        status: "Success",
        message: "Teacher subjects fetched successfully",
        data: mergedSubjects,
    });
});

//@desc  teacher update profile 
//@route PUT /api/v1/teacher/:teacherID/update/profile
//@access public teacher only

exports.updateTeacherCtrl = AsyncHandler(async(req,res) => {
    const {name, email, password} = req.body;
   
   // find user
   //   const userFound = await Admin.findById(req.userAuth._id)
    // find email
    const emailExist = await Teacher.findOne({email});
    console.log(emailExist);
    
    if (emailExist) {
        throw new Error("Email is taken/exist")
    } 
    // check if password is updating
    if (password) {
        // update
        const teacher = await Teacher.findByIdAndUpdate(req.userAuth._id, {
            password: await hashedPassword(password),
            email,
            name,
        }, 
        {
            new: true,
            runValidators: true,
        });
        res.status(200).json({
            status: "Success",
            data: teacher,
            message: "Teacher updated successfully",
        })
    }
    else{
        // update
        const teacher = await Teacher.findByIdAndUpdate(req.userAuth._id, {
            email,
            name,
        }, 
        {
            new: true,
            runValidators: true,
        });
        res.status(200).json({
            status: "Success",
            data: teacher,
            message: "Teacher updated successfully",
        })
    }
});

//@desc  admin updating teacher profile 
//@route PUT /api/v1/admin/:teacherID/update/profile
//@access private teache only

// exports.adminUpdateTeacherCtrl = AsyncHandler(async(req,res) => {
//     const {program, subject, academicYear, classLevel} = req.body;
//     const teacherFound = await Teacher.findById(req.params.teacherID)
//     // console.log(teacherFound);
    

//     if (!teacherFound) {
//         throw new Error("Teacher not found");
//     }
//     if (teacherFound.isWithDrawn) {
//         throw new Error("Access denied, teacher is withdrawn");
        
//     }
//     // assign a program
//     if (program) {
//         teacherFound.program = program;
//         await teacherFound.save();
//         res.status(200).json({
//             status: "Success",
//             data: teacherFound,
//             message: "Teacher updated successfully",
//         })
//     }

//     // assign a subject
//     if (subject) {
//         teacherFound.subject = subject;
//         await teacherFound.save();
//         res.status(200).json({
//             status: "Success",
//             data: teacherFound,
//             message: "Teacher updated successfully",
//         })
//     }

//     // assign a classLevel
//     if (classLevel) {
//         teacherFound.subject = classLevel;
//         await teacherFound.save();
//         res.status(200).json({
//             status: "Success",
//             data: teacherFound,
//             message: "Teacher updated successfully",
//         })
//     }

//       // assign a academicYear
//     if (academicYear) {
//         teacherFound.subject = academicYear;
//         await teacherFound.save();
//         res.status(200).json({
//             status: "Success",
//             data: teacherFound,
//             message: "Teacher updated successfully",
//         })

//     }  
//     // res.status(400).json({
//     //     status: "Fail",
//     //     message: "No update fields provided",
//     // });  
// });

exports.adminUpdateTeacherCtrl = AsyncHandler(async (req, res) => {
    const { name, email, program, subject, subjects, subjectIds, academicYear, classLevel } = req.body;
    const teacherFound = await Teacher.findById(req.params.teacherID);

    if (!teacherFound) {
        throw new Error("Teacher not found");
    }

    if (teacherFound.isWithDrawn) {
        throw new Error("Access denied, teacher is withdrawn");
    }

    let updated = false;

    if (name) {
        teacherFound.name = name;
        updated = true;
    }
    if (email) {
        teacherFound.email = email;
        updated = true;
    }
    if (program !== undefined) {
        teacherFound.program = program;
        updated = true;
    }
    if (classLevel !== undefined) {
        teacherFound.classLevel = classLevel;
        updated = true;
    }
    if (academicYear !== undefined) {
        teacherFound.academicYear = academicYear;
        updated = true;
    }

    const Subject = require("../../models/Academy/Subject");
    const mongoose = require("mongoose");
    let resolvedSubjectIds = [];
    let resolvedSubjectNames = [];

    // Support both `subjects` (array), `subjectIds` (array), and `subject` (string or array)
    if (subjects !== undefined || subjectIds !== undefined || subject !== undefined) {
        const rawSubs = [
            ...(Array.isArray(subjects) ? subjects : (subjects ? [subjects] : [])),
            ...(Array.isArray(subjectIds) ? subjectIds : (subjectIds ? [subjectIds] : [])),
            ...(Array.isArray(subject) ? subject : (subject ? [subject] : []))
        ];

        for (const s of rawSubs) {
            if (!s) continue;
            const sStr = typeof s === "object" && s._id ? s._id.toString() : s.toString().trim();
            if (!sStr) continue;
            let sDoc = null;
            if (mongoose.Types.ObjectId.isValid(sStr)) {
                sDoc = await Subject.findById(sStr);
            }
            if (!sDoc) {
                const escaped = safeEscapeRegex(sStr);
                sDoc = await Subject.findOne({ name: { $regex: new RegExp(`^${escaped}$`, "i") } });
            }
            if (!sDoc) {
                sDoc = await Subject.findOne({ name: { $regex: new RegExp(`^${sStr.trim()}$`, "i") } });
            }
            if (sDoc) {
                if (!resolvedSubjectIds.some(id => id.toString() === sDoc._id.toString())) {
                    resolvedSubjectIds.push(sDoc._id);
                    resolvedSubjectNames.push(sDoc.name);
                }
            } else if (typeof s === "string" && s.trim() && !mongoose.Types.ObjectId.isValid(s.trim())) {
                resolvedSubjectNames.push(s.trim());
            }
        }

        teacherFound.subjects = resolvedSubjectIds;
        teacherFound.subject = resolvedSubjectNames[0] || (typeof subject === "string" ? subject : "");
        updated = true;

        // Assign teacher in Subject models and unassign removed subjects
        if (resolvedSubjectIds.length > 0) {
            await Subject.updateMany(
                { _id: { $in: resolvedSubjectIds } },
                { $set: { teacher: teacherFound._id } }
            );
            await Subject.updateMany(
                { teacher: teacherFound._id, _id: { $nin: resolvedSubjectIds } },
                { $unset: { teacher: 1 } }
            );
        } else {
            await Subject.updateMany(
                { teacher: teacherFound._id },
                { $unset: { teacher: 1 } }
            );
        }
    }

    if (!updated) {
        return res.status(400).json({
            status: "Fail",
            message: "No update fields provided",
        });
    }

    await teacherFound.save();

    // Link teacher to program if found
    if (program) {
        try {
            const Program = require("../../models/Academy/program");
            const query = [
                { name: program },
                ...(mongoose.Types.ObjectId.isValid(program) ? [{ _id: program }] : [])
            ];
            const progDoc = await Program.findOne({ $or: query });
            if (progDoc) {
                await Program.findByIdAndUpdate(progDoc._id, {
                    $addToSet: { teachers: teacherFound._id }
                });
            }
        } catch (e) {
            console.error("Error linking teacher to program:", e);
        }
    }

    // Auto-link any students matching this teacher's subjects and class level
    const allTeacherSubjectNames = [
        ...(teacherFound.subject ? [teacherFound.subject] : []),
        ...resolvedSubjectNames
    ].filter(Boolean);

    if (allTeacherSubjectNames.length > 0 || (teacherFound.subjects && teacherFound.subjects.length > 0)) {
        try {
            const Student = require("../../models/Academy/Student");
            const subjectQueries = [
                ...allTeacherSubjectNames.flatMap(sName => [
                    { subject: sName },
                    { subject: { $regex: new RegExp(`^${safeEscapeRegex(sName)}$`, "i") } }
                ]),
                ...(teacherFound.subjects && teacherFound.subjects.length > 0 ? [{ "enrolledSubjects.subject": { $in: teacherFound.subjects } }] : [])
            ];

            if (teacherFound.classLevel) {
                const classDigits = teacherFound.classLevel.toString().match(/\d+/)?.[0];
                const classQuery = [
                    { currentClassLevel: teacherFound.classLevel },
                    { currentClassLevel: { $regex: new RegExp(`^${safeEscapeRegex(teacherFound.classLevel)}$`, "i") } },
                    ...(classDigits ? [{ currentClassLevel: { $regex: new RegExp(`(^|\\b|\\D)${classDigits}(\\D|\\b|$)`, "i") } }] : [])
                ];
                await Student.updateMany(
                    {
                        $and: [
                            { $or: subjectQueries },
                            { $or: classQuery }
                        ]
                    },
                    { $set: { assignedTeacher: teacherFound._id } }
                );
            } else {
                await Student.updateMany(
                    { $or: subjectQueries },
                    { $set: { assignedTeacher: teacherFound._id } }
                );
            }
        } catch (e) {
            console.error("Error auto-linking students to teacher:", e);
        }
    }

    const populatedTeacher = await Teacher.findById(teacherFound._id).populate("subjects");

    res.status(200).json({
        status: "Success",
        data: populatedTeacher || teacherFound,
        message: "Teacher updated successfully",
    });
});

//@desc  teacher forgot password (generates reset token)
//@route POST /api/v1/teachers/forgot-password
//@access public
exports.teacherForgotPasswordCtrl = AsyncHandler(async (req, res) => {
    const { email, teacherId } = req.body;

    if (!email && !teacherId) {
        return res.status(400).json({
            status: "failed",
            message: "Please provide your registered email address or Teacher ID"
        });
    }

    const query = [];
    if (email) query.push({ email: email.toLowerCase().trim() });
    if (teacherId) query.push({ teacherId: teacherId.trim() });

    const teacher = await Teacher.findOne({ $or: query });

    if (!teacher) {
        return res.status(404).json({
            status: "failed",
            message: "No teacher account found with the provided details"
        });
    }

    // Generate secure random reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Token valid for 30 minutes
    teacher.passwordResetToken = hashedToken;
    teacher.passwordResetExpires = Date.now() + 30 * 60 * 1000;
    await teacher.save({ validateBeforeSave: false });

    return res.status(200).json({
        status: "success",
        message: "Identity verified. Password reset token generated successfully.",
        resetToken,
        teacher: {
            name: teacher.name,
            email: teacher.email,
            teacherId: teacher.teacherId,
        }
    });
});

//@desc  teacher reset password
//@route POST /api/v1/teachers/reset-password
//@route POST /api/v1/teachers/reset-password/:token
//@access public
exports.teacherResetPasswordCtrl = AsyncHandler(async (req, res) => {
    const token = req.params.token || req.body.token;
    const { password, email, teacherId } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({
            status: "failed",
            message: "Password is required and must be at least 6 characters long"
        });
    }

    let teacher = null;

    if (token) {
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        teacher = await Teacher.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() },
        });
    }

    // Fallback: If verifying with email and/or teacherId directly
    if (!teacher && (email || teacherId)) {
        const query = [];
        if (email) query.push({ email: email.toLowerCase().trim() });
        if (teacherId) query.push({ teacherId: teacherId.trim() });
        teacher = await Teacher.findOne({ $or: query });
    }

    if (!teacher) {
        return res.status(400).json({
            status: "failed",
            message: "Invalid or expired password reset request. Please request a new token or verify your details."
        });
    }

    // Set new password
    teacher.password = await hashedPassword(password);
    teacher.passwordResetToken = undefined;
    teacher.passwordResetExpires = undefined;
    await teacher.save({ validateBeforeSave: false });

    return res.status(200).json({
        status: "success",
        message: "Password reset successful. You can now log in with your new password.",
    });
});



