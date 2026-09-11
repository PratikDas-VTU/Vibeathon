# 🚀 Render.com Backend Deployment Guide

## Prerequisites Checklist

Before starting, make sure you have:
- ✅ GitHub account
- ✅ Render.com account (sign up at https://render.com - FREE)
- ✅ Your Firebase service account JSON file
- ✅ Your Gemini API key

---

## Step 1: Push Backend to GitHub

### 1.1 Create a New GitHub Repository

1. Go to https://github.com/new
2. Repository name: `vibeathon-backend`
3. Description: `Vibeathon 2026 Backend API`
4. **Important:** Set to **Private** (to protect your API keys)
5. **DO NOT** initialize with README
6. Click **Create repository**

### 1.2 Push Your Code to GitHub

Open PowerShell in your backend folder and run:

```bash
cd C:\Users\PRATIK DAS\OneDrive\Documents\Desktop\Vibeathon\backend

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial backend deployment"

# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/vibeathon-backend.git

# Push to GitHub
git push -u origin main
```

**⚠️ IMPORTANT:** Make sure `.gitignore` includes:
- `node_modules/`
- `.env`
- `firebase-service-account.json`

---

## Step 2: Deploy to Render.com

### 2.1 Create New Web Service

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect GitHub"** (if first time)
4. Select your `vibeathon-backend` repository
5. Click **"Connect"**

### 2.2 Configure Web Service

Fill in the following settings:

| Setting | Value |
|---------|-------|
| **Name** | `vibeathon-backend` |
| **Region** | `Singapore` (closest to India) |
| **Branch** | `main` |
| **Root Directory** | (leave blank) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

Click **"Advanced"** to add environment variables.

### 2.3 Add Environment Variables

Click **"Add Environment Variable"** for each:

#### 1. GEMINI_API_KEY
- **Key:** `GEMINI_API_KEY`
- **Value:** `YOUR_GEMINI_API_KEY_HERE`

#### 2. PORT
- **Key:** `PORT`
- **Value:** `5000`

#### 3. Firebase Service Account (as JSON string)

**Option A: Copy entire JSON content**
- **Key:** `FIREBASE_SERVICE_ACCOUNT`
- **Value:** Copy the ENTIRE content of `firebase-service-account.json` as a single line

**Option B: Individual Firebase fields** (recommended)
- **Key:** `FIREBASE_PROJECT_ID`
- **Value:** (from your firebase-service-account.json)

- **Key:** `FIREBASE_PRIVATE_KEY`
- **Value:** (from your firebase-service-account.json - keep the `\n` characters)

- **Key:** `FIREBASE_CLIENT_EMAIL`
- **Value:** (from your firebase-service-account.json)

### 2.4 Deploy

1. Click **"Create Web Service"**
2. Wait 3-5 minutes for deployment
3. You'll get a URL like: `https://vibeathon-backend.onrender.com`

---

## Step 3: Update Backend Code for Render

### 3.1 Update firebaseConfig.js

Your current code should work, but verify it reads from environment variables:

```javascript
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT || 
  require("./firebase-service-account.json")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://vibeathon-vcc-default-rtdb.firebaseio.com"
});

module.exports = admin;
```

### 3.2 Update server.js PORT

Verify your server.js uses environment PORT:

```javascript
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## Step 4: Update Frontend URLs

Once Render deployment is complete, you'll have a URL like:
`https://vibeathon-backend.onrender.com`

### 4.1 Update All Frontend Files

Replace all occurrences of:
```
https://2496-2405-201-e07a-d82a-2d08-ed78-a067-1cf6.ngrok-free.app
```

With:
```
https://vibeathon-backend.onrender.com
```

**Files to update:**
- `frontend/js/config.js`
- `frontend/js/participants.js`
- `frontend/js/participant-dashboard.js`
- `frontend/js/participant-auth-guard.js`
- `frontend/js/admin-dashboard.js`
- `frontend/js/admin-auth.js`

### 4.2 Update Backend CORS

Update `backend/server.js` CORS to allow Render URL:

```javascript
app.use(
  cors({
    origin: [
      "https://vcc-tawny.vercel.app",
      "https://vibeathon-backend.onrender.com", // Add this
      "http://localhost:3000"
    ],
    credentials: true
  })
);
```

### 4.3 Deploy Frontend to Vercel

```bash
cd frontend
vercel --prod
```

---

## Step 5: Test Your Deployment

### 5.1 Test Backend Health

Visit: `https://vibeathon-backend.onrender.com/`

You should see a response (or 404 if no root route defined).

### 5.2 Test API Endpoints

Try logging in at: `https://vcc-tawny.vercel.app/participant-login.html`

### 5.3 Test Admin Dashboard

Try: `https://vcc-tawny.vercel.app/admin-login.html`

---

## ⚠️ Important Notes

### Free Tier Limitations

1. **Cold Starts:**
   - After 15 minutes of inactivity, Render "spins down" your service
   - First request after spin-down takes 30-60 seconds
   - **Solution:** Keep a browser tab open pinging your backend every 10 minutes

2. **Keep-Alive Script (Optional):**

Create `keep-alive.js` in backend:

```javascript
const https = require('https');

setInterval(() => {
  https.get('https://vibeathon-backend.onrender.com/', (res) => {
    console.log(`Keep-alive ping: ${res.statusCode}`);
  });
}, 14 * 60 * 1000); // Every 14 minutes
```

Add to `server.js`:
```javascript
if (process.env.NODE_ENV === 'production') {
  require('./keep-alive');
}
```

### Environment Variable for Keep-Alive

Add to Render:
- **Key:** `NODE_ENV`
- **Value:** `production`

---

## 🎯 Event Day Checklist

**30 minutes before event:**
1. ✅ Visit `https://vibeathon-backend.onrender.com/` to wake up service
2. ✅ Test participant login
3. ✅ Test admin login
4. ✅ Keep admin dashboard open
5. ✅ Keep a browser tab pinging backend every 10 min

**During event:**
1. ✅ Monitor Render dashboard for errors
2. ✅ Keep backend tab open
3. ✅ Have laptop + ngrok ready as backup

---

## 🔧 Troubleshooting

### Backend won't start on Render

**Check Render logs:**
1. Go to Render dashboard
2. Click on your service
3. Click "Logs" tab
4. Look for errors

**Common issues:**
- Missing environment variables
- Firebase credentials incorrect
- Port configuration wrong

### Frontend can't connect to backend

**Check:**
1. CORS settings in server.js
2. Frontend URLs are correct
3. Render service is running (not sleeping)

### Slow response times

**Solutions:**
1. Wake up service before event
2. Use keep-alive script
3. Upgrade to paid tier ($7/month for no cold starts)

---

## 💰 Optional: Upgrade to Paid Tier

If you want guaranteed uptime with no cold starts:

1. Go to Render dashboard
2. Select your service
3. Click "Settings"
4. Change Instance Type to **"Starter" ($7/month)**
5. No cold starts, faster performance

**Worth it for important events!**

---

## 🎉 You're Done!

Your backend is now:
- ✅ Deployed to Render.com
- ✅ Accessible via HTTPS
- ✅ Auto-scaling for 45+ users
- ✅ No ngrok needed
- ✅ More reliable than laptop

**Render URL:** `https://vibeathon-backend.onrender.com`

**Frontend URL:** `https://vcc-tawny.vercel.app`

**Ready for your event!** 🚀
