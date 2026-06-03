# 🚀 St. Charles School Management System — Deployment Guide

This document provides complete instructions for pushing your digital campus workspace to **GitHub** and deploying the frontend to **Vercel**, the backend to **Render/Heroku**, and sync with your live **Supabase** database.

---

## 1. Preparation for GitHub
The workspace has been pre-configured with premium standard `.gitignore` rules in both root and `/server` folders. 
Binary databases (`stcharles.db`, WAL lockfiles), node packages (`node_modules`), and production builds (`dist/`) are safely ignored, keeping your Git commits clean and secure.

To push to GitHub, run these commands in your local terminal:
```bash
# 1. Initialize Git repository
git init

# 2. Add all source files to staging
git add .

# 3. Commit your changes
git commit -m "feat: complete live SQLite backend integration for St. Charles Academy"

# 4. Create your remote repository on GitHub, then link and push:
git branch -M main
git remote add origin https://github.com/your-username/st-charles-sms.git
git push -u origin main
```

---

## 2. Deploying the Database to Supabase
1. Log in to your [Supabase Dashboard](https://supabase.com/).
2. Create a new project named **St. Charles Academy**.
3. Open the **SQL Editor** on your Supabase dashboard sidebar.
4. Open the [supabase_schema.sql](file:///home/peter/Desktop/stcharlse/supabase_schema.sql) file inside your local workspace. Copy its entire contents, paste it into the Supabase SQL editor, and click **Run**.
5. Your database tables, optimized performance indexes, seeded datasets, and security RLS policies will be instantly set up!

---

## 3. Environment Variables & Setup
To run the server locally or host on Vercel, you need to configure the following environment variables:

- `DATABASE_URL`: Your Supabase transaction connection string. You can retrieve this from **Supabase Dashboard** -> **Settings** -> **Database** -> **Connection string** (Choose URI format, e.g. `postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres?sslmode=require`).
- `GROQ_API_KEY`: Your Groq API key (to power the Llama 3 AI chatbot and OCR timetable parser).
- `JWT_SECRET`: `stcharles_jwt_private_key_2026` (Or any strong custom key for signing secure auth tokens).

### Local Setup:
Add these keys to your `server/.env` file:
```env
DATABASE_URL=your_supabase_postgresql_connection_string
GROQ_API_KEY=your_groq_api_key
JWT_SECRET=stcharles_jwt_private_key_2026
```

---

## 4. Deploying to Vercel
1. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
2. Select your imported **st-charles-sms** GitHub repository.
3. Configure the project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (Keep as the root of the repository)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Environment Variables**: Add `DATABASE_URL`, `GROQ_API_KEY`, and `JWT_SECRET`.
4. Click **Deploy**!

Your stunning digital management campus and server backend will be live and active on the web in seconds!

