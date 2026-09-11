# Backend Exposure Guide - ngrok Setup

## Quick Start

### 1. Download ngrok
- Go to https://ngrok.com/download
- Download Windows version
- Extract to a folder (e.g., `C:\ngrok`)
- Add to PATH or run from folder

### 2. Start Your Backend
```bash
cd C:\Users\PRATIK DAS\OneDrive\Documents\Desktop\Vibeathon\backend
node server.js
```

### 3. Start ngrok (in new terminal)
```bash
ngrok http 5000
```

### 4. Copy the HTTPS URL
ngrok will show something like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:5000
```

**Copy this URL:** `https://abc123.ngrok-free.app`

### 5. Update Frontend API URLs

You need to replace `http://localhost:5000` with your ngrok URL in these files:

**Files to update:**
- `frontend/js/participants.js`
- `frontend/js/participant-dashboard.js`
- `frontend/js/admin-auth.js`
- `frontend/js/admin-dashboard.js`
- `frontend/js/authfetch.js` (if it exists)

**Find and replace:**
```javascript
// OLD
"http://localhost:5000/api/..."

// NEW
"https://abc123.ngrok-free.app/api/..."
```

### 6. Redeploy Frontend
```bash
cd frontend
vercel --prod
```

## Alternative: Use Environment Variable

Instead of hardcoding, you can use a config file:

**Create `frontend/js/config.js`:**
```javascript
const API_URL = "https://abc123.ngrok-free.app";
export { API_URL };
```

**Then in other files:**
```javascript
import { API_URL } from './config.js';

// Use API_URL instead of hardcoded URL
fetch(`${API_URL}/api/auth/login`, ...)
```

## Important Notes

- ⚠️ **ngrok URL changes** every time you restart ngrok (free tier)
- ✅ **Keep ngrok running** during the event
- ✅ **Keep backend running** on your laptop
- 🔄 **If ngrok restarts**, update frontend URLs and redeploy

## Troubleshooting

**CORS Error:**
- Make sure your Vercel URL is in `backend/server.js` CORS origins
- Restart backend after changing CORS

**Connection Failed:**
- Check ngrok is running
- Check backend is running
- Check firewall allows Node.js

**ngrok Tunnel Expired:**
- Free tier has session limits
- Restart ngrok and update frontend URLs
