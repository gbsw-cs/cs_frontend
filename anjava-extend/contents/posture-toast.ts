import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_idle"
}

const TOAST_ID = "anjava-posture-toast"
const STYLE_ID = "anjava-posture-style"
const WEB_RELAY_KEY = "__anjava_web_relay__"
const LISTENER_KEY = "__anjava_toast_listener__"

let dismissTimer: number | null = null

const TOAST_MESSAGES: Record<string, string> = {
  TURTLE_NECK: "거북목 자세가 감지됐어요. 목을 바르게 세워주세요.",
  turtle_neck: "거북목 자세가 감지됐어요. 목을 바르게 세워주세요.",
  SLOUCH: "구부정한 자세가 감지됐어요. 허리를 세워주세요.",
  SLOUCHING: "구부정한 자세가 감지됐어요. 허리를 세워주세요.",
  slouch: "구부정한 자세가 감지됐어요. 허리를 세워주세요.",
  slouching: "구부정한 자세가 감지됐어요. 허리를 세워주세요.",
  SHOULDER_ISSUE: "어깨 자세 이상이 감지됐어요. 어깨를 뒤로 펴주세요.",
  ROUND_SHOULDER: "라운드숄더가 감지됐어요. 어깨를 뒤로 펴주세요.",
  round_shoulder: "라운드숄더가 감지됐어요. 어깨를 뒤로 펴주세요.",
  SHOULDER_ASYMMETRY: "어깨 비대칭이 감지됐어요. 어깨 높이를 맞춰주세요.",
  shoulder_tilted: "어깨 비대칭이 감지됐어요. 어깨 높이를 맞춰주세요.",
  DARK_ENV: "어두운 환경이 감지됐어요. 주변 밝기를 높여주세요.",
  dark_env: "어두운 환경이 감지됐어요. 주변 밝기를 높여주세요.",
  GOOD_POSTURE: "자세가 교정됐어요. 바른 자세를 유지해보세요."
}

const POSTURE_IMAGE_BY_STATE: Record<string, string> = {
  TURTLE_NECK: "assets/turtleneck.png",
  ROUND_SHOULDER: "assets/round-shoulder.png",
  SHOULDER_ISSUE: "assets/round-shoulder.png",
  SHOULDER_ASYMMETRY: "assets/shoulder-notsame.png"
}

const NORMALIZED_POSTURE_STATE: Record<string, string> = {
  turtle_neck: "TURTLE_NECK",
  slouch: "SLOUCH",
  slouching: "SLOUCH",
  round_shoulder: "ROUND_SHOULDER",
  shoulder_issue: "SHOULDER_ISSUE",
  shoulder_tilted: "SHOULDER_ASYMMETRY",
  shoulder_asymmetry: "SHOULDER_ASYMMETRY",
  dark_environment: "DARK_ENV",
  dark_env: "DARK_ENV"
}

function getPostureImage(state?: string) {
  const normalized = state
    ? NORMALIZED_POSTURE_STATE[state.toLowerCase()] ?? state.toUpperCase()
    : ""
  return POSTURE_IMAGE_BY_STATE[normalized] ?? "assets/avatar.png"
}

type PostureAlertMessage = {
  type: "POSTURE_ALERT"
  state?: string
  message?: string
  soundEnabled?: boolean
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    #${TOAST_ID} {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 2147483647;
      width: min(500px, calc(100vw - 32px));
      overflow: hidden;
      border: 1px solid rgba(251, 113, 133, 0.36);
      border-radius: 18px;
      background: #ffffff;
      color: #18181b;
      box-shadow: 0 16px 42px rgba(15, 23, 42, 0.14);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Pretendard, sans-serif;
      pointer-events: auto;
      animation: anjava-toast-in 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #${TOAST_ID}:before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 4px;
      background: linear-gradient(90deg, #ef4444, #fb7185);
    }
    #${TOAST_ID}.is-good:before {
      background: linear-gradient(90deg, #2563eb, #22c55e);
    }
    #${TOAST_ID}.is-good {
      border-color: rgba(74, 222, 128, 0.36);
      background: #ffffff;
      box-shadow: 0 16px 42px rgba(15, 23, 42, 0.12);
    }
    #${TOAST_ID}.is-out {
      animation: anjava-toast-out 0.22s ease forwards;
    }
    #${TOAST_ID} .toast-main {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px 10px 18px;
    }
    #${TOAST_ID} .toast-icon {
      display: flex;
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: #fef2f2;
      color: #dc2626;
      font-size: 18px;
      font-weight: 900;
      box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.18);
    }
    #${TOAST_ID}.is-good .toast-icon {
      background: #eff6ff;
      color: #2563eb;
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16);
    }
    #${TOAST_ID} .toast-copy {
      min-width: 0;
      flex: 1;
    }
    #${TOAST_ID} .toast-kicker {
      margin-bottom: 1px;
      height: 16px;
    }
    #${TOAST_ID} .toast-logo {
      display: block;
      width: 60px;
      height: 16px;
      object-fit: contain;
      object-position: left center;
    }
    #${TOAST_ID} .toast-title {
      color: #111827;
      font-size: 14px;
      font-weight: 850;
      letter-spacing: -0.01em;
    }
    #${TOAST_ID} .toast-body {
      margin-top: 2px;
      color: #52525b;
      font-size: 13px;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${TOAST_ID} .toast-avatar {
      width: 76px;
      height: 70px;
      flex-shrink: 0;
      overflow: hidden;
      border-radius: 0;
    }
    #${TOAST_ID} .toast-avatar img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center bottom;
    }
    #${TOAST_ID} .toast-close {
      position: absolute;
      right: 10px;
      top: 10px;
      display: flex;
      width: 24px;
      height: 24px;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 999px;
      background: rgba(244, 244, 245, 0.9);
      color: #71717a;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0;
    }
    #${TOAST_ID} .toast-close:hover {
      background: #e4e4e7;
      color: #27272a;
    }
    #${TOAST_ID} .toast-progress {
      height: 2px;
      background: #fb7185;
      transform-origin: left;
      animation: anjava-toast-progress 6s linear forwards;
    }
    #${TOAST_ID}.is-good .toast-progress {
      background: #22c55e;
    }
    @keyframes anjava-toast-in {
      from { opacity: 0; transform: translateX(28px) scale(0.98); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
    @keyframes anjava-toast-out {
      to { opacity: 0; transform: translateX(28px) scale(0.98); }
    }
    @keyframes anjava-toast-progress {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }
  `
  document.head.appendChild(style)
}

function playTone(isGood: boolean, soundEnabled: boolean) {
  if (!soundEnabled) return
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return

    const ctx = new AudioContextCtor()
    const playNote = (frequency: number, start: number, duration: number, peak = 0.18) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.018)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    }

    const now = ctx.currentTime
    if (isGood) {
      playNote(660, now, 0.16, 0.13)
      playNote(880, now + 0.14, 0.2, 0.12)
    } else {
      playNote(1046.5, now, 0.17)
      playNote(1318.5, now + 0.14, 0.24)
    }
    window.setTimeout(() => ctx.close().catch(() => {}), 650)
  } catch {}
}

function dismissToast(el: HTMLElement) {
  el.classList.add("is-out")
  window.setTimeout(() => el.remove(), 240)
}

function showToast(message: string, state: string | undefined, isGood: boolean, soundEnabled: boolean) {
  injectStyle()

  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }

  const old = document.getElementById(TOAST_ID)
  if (old) old.remove()

  const el = document.createElement("div")
  el.id = TOAST_ID
  if (isGood) el.classList.add("is-good")

  const main = document.createElement("div")
  main.className = "toast-main"

  const icon = document.createElement("div")
  icon.className = "toast-icon"
  icon.textContent = isGood ? "✓" : "!"

  const copy = document.createElement("div")
  copy.className = "toast-copy"

  const kicker = document.createElement("div")
  kicker.className = "toast-kicker"
  const logo = document.createElement("img")
  logo.className = "toast-logo"
  logo.src = chrome.runtime.getURL("assets/logo.png")
  logo.alt = "Anjava"
  kicker.append(logo)

  const title = document.createElement("div")
  title.className = "toast-title"
  title.textContent = isGood ? "좋은 자세를 유지하고 있어요" : "자세 교정 알림"

  const body = document.createElement("div")
  body.className = "toast-body"
  body.textContent = message

  const avatar = document.createElement("div")
  avatar.className = "toast-avatar"
  avatar.setAttribute("aria-hidden", "true")
  const avatarImage = document.createElement("img")
  avatarImage.src = chrome.runtime.getURL(getPostureImage(state))
  avatarImage.alt = ""
  avatar.append(avatarImage)

  const close = document.createElement("button")
  close.className = "toast-close"
  close.textContent = "×"
  close.setAttribute("aria-label", "닫기")
  close.onclick = () => dismissToast(el)

  const progress = document.createElement("div")
  progress.className = "toast-progress"

  copy.append(kicker, title, body)
  main.append(icon, copy, avatar, close)
  el.append(main, progress)
  document.body.appendChild(el)

  playTone(isGood, soundEnabled)
  dismissTimer = window.setTimeout(() => dismissToast(el), 6000)
}

if (!window[WEB_RELAY_KEY]) {
  window[WEB_RELAY_KEY] = true
  window.addEventListener("message", (event) => {
    if (event.source !== window) return

    if (event.data?.type === "ANJAVA_POSTURE_RELAY") {
      const relayId = typeof event.data.relayId === "string" ? event.data.relayId : ""
      chrome.runtime.sendMessage({
        type: "POSTURE_ALERT_FROM_WEB",
        state: event.data.state,
        message: event.data.message,
        soundEnabled: event.data.soundEnabled,
        suppressSystemNotification: event.data.suppressSystemNotification === true
      }).then(() => {
        if (!relayId) return
        window.postMessage({ type: "ANJAVA_POSTURE_RELAY_ACK", relayId }, "*")
      }).catch(() => {})
      return
    }

    if (event.data?.type === "ANJAVA_WEB_SESSION_STATE") {
      chrome.runtime.sendMessage({
        type: "SYNC_WEB_SESSION",
        state: event.data.state,
        sessionId: event.data.sessionId,
        startedAt: event.data.startedAt,
        pausedTotalMs: event.data.pausedTotalMs ?? 0,
      }).catch(() => {})
    }
  })
}

if (window[LISTENER_KEY]) {
  chrome.runtime.onMessage.removeListener(window[LISTENER_KEY])
}

const toastListener = (msg: PostureAlertMessage | { type: string }) => {
  if (msg.type === "TIMELINE_POSTED") {
    window.postMessage({ type: "ANJAVA_TIMELINE_POSTED" }, "*")
    return
  }
  if (msg.type === "SESSION_CHANGED") {
    window.postMessage({ type: "ANJAVA_SESSION_CHANGED" }, "*")
    return
  }
  if (msg.type !== "POSTURE_ALERT") return
  const m = msg as PostureAlertMessage
  const isGood = m.state === "GOOD_POSTURE"
  const text = (m.state && TOAST_MESSAGES[m.state]) || m.message || "자세를 확인해주세요."
  showToast(text, m.state, isGood, m.soundEnabled !== false)
}

window[LISTENER_KEY] = toastListener
chrome.runtime.onMessage.addListener(toastListener)
