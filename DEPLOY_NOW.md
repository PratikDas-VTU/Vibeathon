# Render.com Deployment - Quick Start

## Step 1: Check Git Status

First, let's check if your backend is already a git repository:

```bash
cd C:\Users\PRATIK DAS\OneDrive\Documents\Desktop\Vibeathon\backend
git status
```

If you see "fatal: not a git repository", continue to Step 2.
If you see git status output, skip to Step 3.

---

## Step 2: Initialize Git Repository

```bash
cd C:\Users\PRATIK DAS\OneDrive\Documents\Desktop\Vibeathon\backend

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Vibeathon backend"
```

---

## Step 3: Create GitHub Repository

1. Go to: https://github.com/new
2. Repository name: `vibeathon-backend`
3. Description: `Vibeathon 2026 Backend API`
4. **IMPORTANT:** Select **Private** (to protect your API keys)
5. **DO NOT** check "Add a README file"
6. Click **"Create repository"**

---

## Step 4: Push to GitHub

After creating the repository, GitHub will show you commands. Use these:

```bash
# Add remote (replace YOUR_USERNAME with your actual GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/vibeathon-backend.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**If you get authentication error:**
- GitHub now requires Personal Access Token instead of password
- Go to: https://github.com/settings/tokens
- Click "Generate new token (classic)"
- Select scopes: `repo`
- Copy the token and use it as password when pushing

---

## Step 5: Deploy to Render.com

### 5.1 Sign Up / Login to Render

1. Go to: https://render.com
2. Click **"Get Started for Free"**
3. Sign up with GitHub (recommended)

### 5.2 Create New Web Service

1. Click **"New +"** button (top right)
2. Select **"Web Service"**
3. Click **"Connect GitHub"** (if first time)
4. Find and select **`vibeathon-backend`** repository
5. Click **"Connect"**

### 5.3 Configure Service

Fill in these settings:

| Field | Value |
|-------|-------|
| **Name** | `vibeathon-backend` |
| **Region** | `Singapore` (closest to India) |
| **Branch** | `main` |
| **Root Directory** | (leave blank) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

### 5.4 Add Environment Variables

Click **"Advanced"** button, then **"Add Environment Variable"** for each:

#### Variable 1: GEMINI_API_KEY
- **Key:** `GEMINI_API_KEY`
- **Value:** `YOUR_GEMINI_API_KEY` (get from your .env file or Google AI Studio)

#### Variable 2: PORT
- **Key:** `PORT`
- **Value:** `5000`

#### Variable 3: FIREBASE_SERVICE_ACCOUNT
- **Key:** `FIREBASE_SERVICE_ACCOUNT`
- **Value:** Open `firebase-service-account.json` and copy the ENTIRE content (it's a JSON object)

**IMPORTANT:** The Firebase JSON should be on ONE LINE. If it has line breaks, that's okay - Render will handle it.

### 5.5 Deploy!

1. Click **"Create Web Service"**
2. Wait 3-5 minutes for deployment
3. Watch the logs - you should see:
   ```
   ==> Building...
   ==> Installing dependencies...
   ==> Starting server...
   Server running on port 5000
   ```

4. Once deployed, you'll get a URL like:
   ```
   https://vibeathon-backend.onrender.com
   ```

**COPY THIS URL!** You'll need it for the next step.

---

## Step 6: Test Your Backend

Visit your Render URL in browser:
```
https://vibeathon-backend.onrender.com/
```

You should see a response (or 404 if no root route - that's okay!).

Test the API:
```
https://vibeathon-backend.onrender.com/api/health
```

---

## Step 7: Update Frontend URLs

Now we need to update all frontend files to use your new Render URL instead of ngrok.

**I'll create a script to do this automatically in the next step!**

---

## ⚠️ IMPORTANT NOTES

### Cold Start Warning
- Render free tier "spins down" after 15 minutes of inactivity
- First request after spin-down takes 30-60 seconds to wake up
- **Solution:** Visit your backend URL 30 minutes before the event starts

### Keep Backend Awake During Event
- Keep a browser tab open with your backend URL
- Refresh it every 10 minutes during the event
- Or use the keep-alive script (I can help you set this up)

---

## 🎉 Next Steps

Once your backend is deployed:
1. ✅ Copy your Render URL
2. ✅ Update frontend files (I'll help with this)
3. ✅ Deploy frontend to Vercel
4. ✅ Test everything end-to-end

**Ready to proceed? Let me know your Render URL once it's deployed!**
