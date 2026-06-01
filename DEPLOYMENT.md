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

## 3. Deploying the Backend Server (e.g. Render / Heroku)
Deploy the server backend folder `/server` to any Node hosting provider.

### Staging Environment Variables:
Configure these environment variables in your server's hosting settings:
- `PORT` = `3001`
- `JWT_SECRET` = `stcharles_jwt_private_key_2026` (Use a strong unique string)
- `DATABASE_URL` = (Your Supabase PostgreSQL Connection String, which you copy from your Supabase Project Settings -> Database -> Connection string -> URI)

---

## 4. Deploying the Frontend to Vercel
1. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
2. Select your imported **st-charles-sms** GitHub repository.
3. Configure the project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (Root directory, as index.html is in the root workspace folder)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Environment Variables**:
     - `VITE_API_URL`: your deployed backend server root URL (e.g. `https://st-charles-api.onrender.com`). If not set, it defaults to `http://localhost:3001` for local execution.
4. Click **Deploy**!

Your stunning Ivy League digital management campus will be live and active on the web in seconds!

