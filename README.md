# 🎓 School Learning API

## 🚀 Overview
A robust RESTful API built for a school learning platform that enables users to access courses, lessons, and educational resources. The system supports user authentication, role-based access (students & admins), and media uploads using Cloudinary.

---

## 🛠️ Tech Stack
- Node.js
- Express.js
- MongoDB (Mongoose)
- JWT Authentication

---

## ✨ Features

### 👤 Authentication & Authorization
- User registration & login
- JWT-based authentication
- Role-based access control (Admin, Student)
- Protected routes

---

### 📚 Course Management
- Create, update, delete courses (Admin only)
- Enroll students in courses
- View all available courses
- Course categorization

---

### 🎥 Lesson & Content Management
- Add lessons to courses
- Structured learning modules

---

### 👨‍🎓 Student Features
- Enroll in program

---

### 👑 Admin Features
- Manage users (students/instructors)
- Manage courses & lessons
- Monitor platform activity
  
---

## 📂 API Endpoints

### 🔐 Auth Routes
- POST `/api/admin/register`
- POST `/api/admin/login`
- POST `/api/students/login`
- POST `/api/teachers/login`

---  
## Routes
`/api/v1/academic-years`
`/api/v1/academic-terms`
`/api/v1/class-levels`
`/api/v1/programs`
`/api/v1/subjects`
`/api/v1/years-group`
`/api/v1/teachers/api/v1/teachers`
`/api/v1/exams`
`/api/v1/students`
`/api/v1/questions`
`/api/v1/exam-results`


---

## 🔗 Live API
https://your-api-link.com

---

## 📂 GitHub Repository
https://github.com/maleekadedotun/school_management_system.git

---

## ⚙️ Installation
cd school_management_system
npm install
npm run server

```bash
git clone https://github.com/your-username/school-learning-api
cd school-learning-api
npm install
npm run dev
