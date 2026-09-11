# Vercel Deployment Guide for Vibeathon Frontend

## Prerequisites
- GitHub account
- Vercel account (sign up at vercel.com with GitHub)

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Easiest)

1. **Push to GitHub:**
   ```bash
   cd C:\Users\PRATIK DAS\OneDrive\Documents\Desktop\Vibeathon
   git init
   git add .
   git commit -m "Initial commit - Vibeathon platform"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy on Vercel:**
   - Go to https://vercel.com
   - Click "Add New Project"
   - Import your GitHub repository
   - Set Root Directory: `frontend`
   - Click "Deploy"
   - Done! ✅

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   cd frontend
   vercel --prod
   ```

4. **Follow prompts:**
   - Set up and deploy? Yes
   - Which scope? (Select your account)
   - Link to existing project? No
   - What's your project's name? vibeathon
   - In which directory is your code located? ./
   - Want to override settings? No

## After Deployment

1. **Get your URL:**
   - Vercel will provide a URL like: `https://vibeathon-xyz.vercel.app`

2. **Update Backend URL:**
   - You'll need to update API URLs in frontend files
   - Replace `http://localhost:5000` with your backend URL (ngrok or Render)

## Important Notes

- **Root Directory:** Make sure Vercel knows to deploy from the `frontend` folder
- **Environment Variables:** None needed for frontend (API URL is hardcoded)
- **Custom Domain:** You can add a custom domain in Vercel dashboard (optional)

## Troubleshooting

- **404 errors:** Check that `vercel.json` is in the frontend folder
- **Build fails:** Ensure all files are committed to GitHub
- **CORS errors:** Update backend CORS settings to allow Vercel domain

## Next Steps

After frontend is deployed:
1. Set up backend (ngrok or Render)
2. Update API URLs in frontend code
3. Redeploy frontend with updated URLs
