# Anjava Service Architecture

```mermaid
flowchart LR
  user([Developer])

  subgraph service["Anjava Service Layer"]
    web["Next.js Web App\nCustomer UI\nlogin/register, webcam guide,\nextension guide, dashboard,\nreports, settings"]
    extension["Chrome Extension\nPlasmo MV3\npopup, background,\noffscreen detection,\ncontent toast"]
    mediapipe["MediaPipe Pose Analyzer\nbrowser/extension camera frames\nnose, eyes, ears, shoulders,\nlandmark visibility"]
    ai["AI Posture Analyzer\n/v1/baseline/cal\n/v1/posture/detect/batch\nposture issues:\nturtle_neck, round_shoulder,\nshoulder_tilted, slouch,\ndark_environment"]
    backend["Backend API Server\nsession, timeline, dashboard,\nhealth score, badges,\nsettings, push token sync"]
    next_proxy["Next.js API Proxy\n/api/auth/*\n/api/backend/*\n/api/ai/*"]
  end

  subgraph oauth["OAuth / Auth Layer"]
    google["Google OAuth"]
    naver["Naver OAuth"]
    kakao["Kakao OAuth"]
  end

  subgraph storage["Storage Layer"]
    mysql["MySQL\nuser, session,\ntimeline, score data"]
    mongo["MongoDB\nposture/baseline logs,\nanalytics documents"]
    chrome_storage["chrome.storage.local\nextension token,\nbaseline, session state"]
    browser_storage["Browser Storage\nlocalStorage/cookies\nweb token/session"]
  end

  subgraph notify["Notification Layer"]
    fcm["FCM / Web Push"]
    chrome_notify["Chrome Notifications"]
    page_toast["In-page Posture Toast"]
  end

  user --> web
  user --> extension

  web --> browser_storage
  extension --> chrome_storage

  web --> next_proxy
  next_proxy --> backend
  next_proxy --> ai

  web --> mediapipe
  extension --> mediapipe
  mediapipe --> ai
  ai --> backend

  backend --> mysql
  backend --> mongo
  backend --> fcm

  extension --> backend
  backend --> extension

  fcm --> web
  extension --> chrome_notify
  extension --> page_toast

  next_proxy --> google
  next_proxy --> naver
  next_proxy --> kakao

  web -->|"BASELINE_DONE\n/webcam-test?extId=..."| extension
  extension -->|"timeline sync\nsession state"| backend
  backend -->|"dashboard data\nhealth score\nbadges"| web
```

## Main Flows

1. User signs up or logs in through the Next.js web app.
2. OAuth login is routed through Next.js auth/proxy routes and external OAuth providers.
3. The web app guides the user through webcam setup, baseline measurement, extension installation, and dashboard usage.
4. The extension stores its own token and baseline state in `chrome.storage.local`.
5. Camera frames are converted into MediaPipe posture frames with face/shoulder landmarks and visibility values.
6. Baseline calibration uses `/v1/baseline/cal`; operational posture detection uses `/v1/posture/detect/batch`.
7. Detection results are synced to backend timeline/session APIs and surfaced through dashboard, Chrome notification, and page toast flows.
8. Dashboard and report screens fetch session, timeline, health score, warning counts, badges, and settings data from backend APIs.

