# Vibeathon — Version 2.0 (National AI Hackathon Platform)

A modern, high-intensity, AI-assisted development competition platform engineered for university and national hackathons with real-time prompt telemetry and autonomous LLM evaluation.

---

## 🏛️ Production Architecture

```
GitHub Repository: PratikDas-VTU/Vibeathon
  ├── frontend/   ──> Deployed on Vercel (Edge CDN, SSL, /api rewrite proxy)
  └── backend/    ──> Deployed on Render (Node.js/Express Web Service, Port 5000 / 0.0.0.0)
```

- **Frontend:** HTML5, CSS3 (HUD Arena styling), Vanilla JavaScript ES Modules, hosted on **Vercel**.
- **Backend:** Node.js, Express.js REST API hosted on **Render**.
- **Database & Identity:** **Firebase Realtime Database** & **Firebase Authentication**.
- **AI Evaluation Engine:** **Google Gemini API** (via background queue with rate-smoothing and trimmed mean aggregation).

---

## 📁 Repository Structure

```
Vibeathon/
├── index.html                     # Local quick-launch redirect to frontend/
├── .gitignore                     # Production security ignore patterns
├── README.md                      # Platform documentation
├── LICENSE                        # Project license
├── RENDER_DEPLOYMENT_GUIDE.md     # Step-by-step backend deployment guide
├── VERCEL_DEPLOYMENT.md           # Step-by-step frontend deployment guide
│
├── frontend/                      # Client-Side Application (Vercel Root)
│   ├── index.html                 # Arena welcome & competition landing page
│   ├── participant-login.html     # Participant login portal
│   ├── participant-dashboard.html # Participant telemetry workspace
│   ├── admin-login.html           # Administrator authentication
│   ├── admin-dashboard.html       # Mission control & evaluation dashboard
│   ├── vercel.json                # Vercel proxy rewrites (/api -> Render)
│   ├── css/                       # UI stylesheets
│   └── js/
│       ├── config.js              # Centralized API routing (proxied in prod)
│       ├── authfetch.js           # Authenticated fetch wrapper (Bearer tokens)
│       ├── participants.js        # Participant auth & session management
│       ├── participant-dashboard.js # Telemetry stream & submission pipeline
│       ├── admin-auth.js          # Admin sign-in controller
│       └── admin-dashboard.js     # Admin evaluation & leaderboard console
│
└── backend/                       # API Server Application (Render Root)
    ├── server.js                  # Express server entry point (0.0.0.0:PORT)
    ├── package.json               # Backend dependencies & npm start script
    ├── package-lock.json          # Dependency lockfile
    ├── firebaseConfig.js          # Resilient Firebase Admin SDK loader
    ├── firebase-database-rules.json # Realtime Database security rules
    ├── .env.example               # Environment variables template
    ├── teams.sample.csv           # Anonymized schema example for team data
    ├── middleware/
    │   ├── auth.js                # Participant token validation middleware
    │   └── verifyAdmin.js         # Admin role verification middleware
    ├── models/                    # Data models
    ├── routes/
    │   ├── auth.js                # Participant authentication endpoints
    │   ├── adminAuth.js           # Admin authentication endpoints
    │   ├── admin.js               # Admin telemetry & problem management
    │   ├── evaluatePrompts.js     # AI prompt evaluation endpoints
    │   ├── submission.js          # Participant submission & timer lifecycle
    │   └── team.js                # Team status & heartbeat endpoints
    ├── services/
    │   ├── evaluationQueue.js     # Rate-limited background queue for Gemini
    │   ├── firebaseService.js     # Centralized Firebase database operations
    │   └── geminiEvaluator.js     # Direct LLM prompt analysis
    └── scripts/
        └── create-admin.example.js # Safe, parameterized admin creation tool
```

---

## ⚙️ Environment Variables Setup

### Backend (Render Web Service)
Configure these environment variables in your **Render Dashboard** under **Environment**:

| Variable | Description | Example / Format |
|---|---|---|
| `PORT` | Listening port (assigned by Render) | `5000` |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIza...` |
| `GEMINI_MODEL` | Gemini Model Identifier | `gemini-3.6-flash` |
| `FIREBASE_WEB_API_KEY` | Firebase Web API Key for Auth REST API | `AIza...` |
| `FIREBASE_DATABASE_URL` | Firebase RTDB URL | `https://<project-id>-default-rtdb.firebaseio.com` |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON content of service account key | `{"type":"service_account",...}` |
| `FRONTEND_URL` *(Optional)* | Custom frontend domain for CORS | `https://your-app.vercel.app` |
| `DEMO_ADMIN_PASSWORD` *(Optional)* | Master password for fallback admin | Secure random string |

> **Alternative for Firebase Key:** Mount your service account JSON file using Render's **Secret Files** feature at `/etc/secrets/firebase-service-account.json` and set `FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/firebase-service-account.json`.

---

## 🚀 Deployment Instructions

### 1. Backend Deployment (Render)
1. In Render Dashboard, click **New +** → **Web Service**.
2. Connect the `PratikDas-VTU/Vibeathon` GitHub repository.
3. Configure the service settings:
   - **Name:** `vibeathon-backend`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Add the required environment variables listed above.
5. Click **Deploy Web Service**.
6. Copy your public service URL (e.g., `https://vibeathon-backend.onrender.com`).

### 2. Frontend Deployment (Vercel)
1. Update `frontend/vercel.json` with your Render backend URL:
   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://YOUR-BACKEND.onrender.com/api/:path*" },
       { "source": "/public/:path*", "destination": "https://YOUR-BACKEND.onrender.com/public/:path*" }
     ]
   }
   ```
2. In Vercel Dashboard, click **Add New...** → **Project**.
3. Import the `PratikDas-VTU/Vibeathon` repository.
4. Set **Root Directory** to `frontend`.
5. Click **Deploy**.

---

## 💻 Running Locally

### 1. Run the Backend
```bash
cd backend
npm install
cp .env.example .env
# Fill in your local .env credentials
npm start
```
The server will start on `http://localhost:5000`.

### 2. Run the Frontend
Open `frontend/index.html` in your browser or run a local static web server:
```bash
cd frontend
npx serve .
```
In local mode (`localhost`), the frontend automatically connects directly to `http://localhost:5000`.

---

## 🔒 Security Best Practices
- **Zero Secrets in Repository:** Real API keys, service account credentials, and passwords are never committed to version control.
- **Data Privacy:** Participant personal identifiable information (PII) is stored solely in secure Firebase storage and excluded from git.
- **Tokenized Sessions:** Role-based access tokens verify participant and administrator permissions.
