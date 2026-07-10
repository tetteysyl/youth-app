# Saviour YPG — Firebase Edition (Vercel)

Church youth group management system for PCG Saviour Congregation, Madina-West.  
**Live URL:** https://ypg-app.vercel.app  
**Repository:** https://github.com/tetteysyl/youth-app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.9 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Auth | Firebase Authentication (email/password) |
| Database | Cloud Firestore (NoSQL) |
| File Storage | Firebase Storage |
| State | Zustand |
| Email | Nodemailer |
| Notifications | Firebase Cloud Messaging (FCM) |
| Deployment | Vercel |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── admin/members/        # List & manage members (admin)
│   │   ├── approve-member/       # Approve pending registrations
│   │   ├── attendance/           # Mark & fetch attendance
│   │   ├── broadcast/            # Send broadcast messages
│   │   ├── cells/                # Cell group management
│   │   ├── cron/birthdays/       # Birthday & YAF lifecycle cron
│   │   ├── dashboard/            # Dashboard stats
│   │   ├── meetings/             # Meeting CRUD
│   │   ├── messages/             # Direct / group / cell messages
│   │   ├── member-settings/      # Update distant-member status
│   │   ├── notify-meeting/       # FCM meeting notifications
│   │   ├── notify-attendance/    # Absence inquiry emails
│   │   ├── profile-photo/        # Upload to Firebase Storage
│   │   ├── reports/              # Report submit / approve
│   │   └── send-bible-quote/     # Daily verse broadcast
│   ├── dashboard/
│   │   ├── admin/                # Pending approvals, roles, cells
│   │   ├── attendance/[id]/      # Mark attendance per meeting
│   │   ├── broadcast/            # Send messages to all members
│   │   ├── evangelism/           # Evangelism coordinator page
│   │   ├── events/               # Events calendar
│   │   ├── finance/              # Income & expense tracker
│   │   ├── meetings/             # View / schedule meetings
│   │   ├── members/              # Member directory
│   │   ├── messages/             # Direct + group + cell chat
│   │   └── reports/              # Submit & view reports
│   ├── login/                    # Sign in + register page
│   └── pending/                  # Awaiting approval screen
├── components/
│   ├── AuthProvider.tsx           # Hydrates Zustand from Firebase session
│   ├── ProfilePhotoModal.tsx      # react-easy-crop upload flow
│   └── Sidebar.tsx
└── lib/
    ├── email.ts                   # Nodemailer helpers
    ├── firebase.ts                # Client-side Firebase init
    ├── firebase-admin.ts          # Admin SDK (server-only)
    ├── roles.ts                   # Role types, labels, permissions
    └── store.ts                   # Zustand auth store
```

---

## Roles & Permissions

| Role | Key Permissions |
|---|---|
| **President** | Full access — approve/reject members, manage roles, schedule meetings, mark attendance, remove members |
| **Vice President** | Executive access — send broadcasts, draft reports |
| **General Secretary** | Publish reports, send broadcasts |
| **Asst. General Secretary** | Draft reports (pending approval) |
| **Financial Secretary / Treasurer** | View finance records |
| **Male / Female Organizer** | Executive messaging |
| **Evangelism Coordinator** | Member-level access only |
| **Member** | View dashboard, check in to meetings, send direct/cell messages |
| **Pending** | Redirected to /pending until approved |
| **Rejected** | Redirected to login |

---

## Key Features

- **Member lifecycle** — register → president approves → full access
- **YAF system** — members who turn 30 get a 366-day grace period; president notified; countdown shown on dashboard
- **Age validation** — 18–30 years old to register; under-18 → Children Service, over-30 → YAF
- **Cells** — Charis, Eleos, Kleos, Dunamis; members choose at registration
- **Distant member** — toggle that opts member out of in-person meetings
- **Meetings** — schedule, mark attendance, block excluded members
- **Messages** — group chat (Everyone), direct messages, cell group chat
- **Reports** — text or PDF; execs draft, president/GS publish
- **Notifications** — in-app bell + FCM push notifications
- **Profile photo** — react-easy-crop circular crop, stored in Firebase Storage
- **Birthday cron** — daily at midnight; sends birthday notifications + YAF transition at age 30

---

## Environment Variables

Set these in Vercel dashboard → Project Settings → Environment Variables:

```env
# Firebase Admin SDK (from Firebase Console → Project Settings → Service Accounts)
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Email (Gmail App Password recommended)
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-password

# Cron job security
CRON_SECRET=your-random-secret-string

# Firebase Cloud Messaging server key
FCM_SERVER_KEY=your-fcm-server-key
```

> The Firebase client-side config (apiKey, projectId, etc.) is embedded directly in `src/lib/firebase.ts` since it is public-safe.

---

## Local Development

```bash
# 1. Clone the repository
git clone https://github.com/tetteysyl/youth-app.git
cd youth-app

# 2. Install dependencies
npm install

# 3. Create .env.local and add environment variables above

# 4. Run development server
npm run dev
# Open http://localhost:3000
```

---

## Deployment (Vercel)

```bash
# Push to GitHub — Vercel auto-deploys on every push to main
git add .
git commit -m "your message"
git push origin main
```

Or deploy manually:
```bash
npm install -g vercel
vercel --prod
```

---

## Birthday / YAF Cron

The cron endpoint is at `/api/cron/birthdays`. Set it up in Vercel:

Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/birthdays", "schedule": "0 0 * * *" }
  ]
}
```

The endpoint:
- Sends birthday notifications to all members with today's birthday
- When a member turns 30: sets `isYaf = true`, sends a 1-year countdown notification, notifies the president
- When a member's 366-day YAF period ends: sends a "closing in 30 days" warning at day 336

---

## Firestore Collections

| Collection | Description |
|---|---|
| `members` | All user profiles (role, cell, YAF status, etc.) |
| `meetings` | Meeting records with status (active / ended) |
| `attendance` | Per-meeting attendance records |
| `messages` | Direct, group, and cell messages |
| `notifications` | Per-user notification inbox |
| `reports` | Text and PDF reports with approval status |
| `cells` | Cell group definitions and member lists |
| `events` | Event calendar entries |
| `finance` | Income and expense records |

---

## Important Notes

- **Do not redeploy without instruction** — the live app at ypg-app.vercel.app is in production use
- Firebase Storage rules must allow authenticated reads/writes for profile photo uploads
- FCM requires HTTPS (works on Vercel automatically)
- The `CRON_SECRET` header must match when calling `/api/cron/birthdays` from Vercel Cron
