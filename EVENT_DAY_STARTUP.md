# 🚀 Event Day Startup Guide - Vibeathon Platform

## Prerequisites Checklist

Before the event starts, make sure you have:
- ✅ ngrok installed and configured
- ✅ Node.js installed
- ✅ Backend dependencies installed (`npm install` in backend folder)
- ✅ Firebase credentials configured
- ✅ Gemini API key in `.env` file

---

## Step-by-Step Startup Process

### 1️⃣ Start the Backend Server

Open **Terminal 1** (PowerShell or Command Prompt):

```bash
# Navigate to backend folder
cd C:\Users\PRATIK DAS\OneDrive\Documents\Desktop\Vibeathon\backend

# Start the backend server
node server.js
```

**Expected Output:**
```
[dotenv] injecting env...
Firebase Admin SDK initialized ✅
Server running on port 5000
```

**✅ Keep this terminal open and running during the entire event!**

---

### 2️⃣ Start ngrok

Open **Terminal 2** (separate window):

```bash
# Start ngrok on port 5000
ngrok http 5000
```

**Expected Output:**
```
Session Status    online
Forwarding        https://xxxx-xxx-xxx-xxx.ngrok-free.app -> http://localhost:5000
```

**📋 IMPORTANT:** Copy the HTTPS forwarding URL (e.g., `https://xxxx-xxx-xxx-xxx.ngrok-free.app`)

**✅ Keep this terminal open during the entire event!**

---

### 3️⃣ Update Frontend URLs (If ngrok URL Changed)

**⚠️ ONLY if your ngrok URL is different from:** `https://90bf-136-232-208-50.ngrok-free.app`

If the URL changed, you need to update frontend files:

1. Update these files with your new ngrok URL:
   - `frontend/js/config.js`
   - `frontend/js/participant-dashboard.js`
   - `frontend/js/admin-dashboard.js`
   - `frontend/js/participants.js`
   - `frontend/js/admin-auth.js`

2. Redeploy to Vercel:
   ```bash
   cd frontend
   vercel --prod
   ```

**💡 TIP:** To avoid this, use ngrok with a static domain (see below)

---

## 🎯 Quick Start Commands (Copy-Paste Ready)

### Terminal 1 - Backend:
```bash
cd C:\Users\PRATIK DAS\OneDrive\Documents\Desktop\Vibeathon\backend && node server.js
```

### Terminal 2 - ngrok:
```bash
ngrok http 5000
```

---

## ✅ Verification Checklist

Before participants start logging in:

1. **Backend Running:**
   - [ ] Terminal 1 shows "Server running on port 5000"
   - [ ] No error messages in terminal

2. **ngrok Running:**
   - [ ] Terminal 2 shows "Session Status: online"
   - [ ] HTTPS forwarding URL is displayed

3. **Frontend Working:**
   - [ ] Visit https://vcc-tawny.vercel.app
   - [ ] Try participant login
   - [ ] Try admin login
   - [ ] Check browser console for errors

---

## 🔧 Troubleshooting

### Backend won't start:
- Check if port 5000 is already in use
- Verify `.env` file exists with `GEMINI_API_KEY`
- Check Firebase credentials are correct

### ngrok shows error:
- Make sure backend is running first
- Try restarting ngrok
- Check your internet connection

### Frontend can't connect:
- Verify ngrok URL matches the one in frontend code
- Check browser console for CORS errors
- Make sure both backend and ngrok are running

---

## 🛑 Shutting Down After Event

1. **Stop ngrok:** Press `Ctrl+C` in Terminal 2
2. **Stop backend:** Press `Ctrl+C` in Terminal 1
3. **Close terminals**

---

## 💡 Pro Tips

### Use ngrok Static Domain (Recommended)

To avoid updating frontend URLs every time:

1. Sign up at https://ngrok.com
2. Get your authtoken
3. Run: `ngrok config add-authtoken YOUR_TOKEN`
4. Start with: `ngrok http 5000`

You'll get a consistent URL that doesn't change!

### Keep Laptop Awake

- Plug in your laptop
- Disable sleep mode in Windows settings
- Disable screen timeout

### Monitor During Event

- Keep both terminals visible
- Watch for any error messages
- Have the admin dashboard open to monitor submissions

---

## 📞 Emergency Backup Plan

If your laptop crashes or internet fails:

1. **Backend Backup:** Deploy to Render.com (free tier)
2. **Frontend:** Already on Vercel (no action needed)
3. **Update frontend URLs** to point to Render instead of ngrok

---

## 🎉 You're Ready!

Your Vibeathon platform is ready to handle 45 participants!

**Production URL:** https://vcc-tawny.vercel.app

Good luck with your event! 🚀
