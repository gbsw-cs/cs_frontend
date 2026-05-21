import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_idle"
}

const TOAST_ID = "anjava-posture-toast"
const STYLE_ID = "anjava-posture-style"
let dismissTimer: ReturnType<typeof setTimeout> | null = null

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement("style")
  s.id = STYLE_ID
  s.textContent = `
    #${TOAST_ID} {
      position: fixed;
      top: 24px;
      right: 24px;
      background: #ffffff;
      color: #18181b;
      padding: 0;
      border-radius: 18px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Pretendard, sans-serif;
      font-size: 15px;
      line-height: 1.5;
      z-index: 2147483647;
      box-shadow: 0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);
      width: 420px;
      overflow: hidden;
      border: 1px solid rgba(0,0,0,0.07);
      animation: anjava-in 0.32s cubic-bezier(0.16,1,0.3,1);
      pointer-events: auto;
    }
    #${TOAST_ID} .anjava-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 18px 13px;
      border-bottom: 1px solid #f4f4f5;
    }
    #${TOAST_ID} .anjava-icon {
      font-size: 22px;
      flex-shrink: 0;
    }
    #${TOAST_ID} .anjava-title {
      font-weight: 700;
      font-size: 15px;
      color: #2563eb;
      flex: 1;
    }
    #${TOAST_ID}.anjava-success .anjava-title { color: #16a34a; }
    #${TOAST_ID}.anjava-success .anjava-bar { background: #16a34a; }
    #${TOAST_ID} .anjava-close {
      background: none;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      line-height: 1;
      flex-shrink: 0;
    }
    #${TOAST_ID} .anjava-close:hover { color: #52525b; }
    #${TOAST_ID} .anjava-body {
      padding: 13px 18px 15px;
      font-size: 14px;
      color: #3f3f46;
      line-height: 1.6;
    }
    #${TOAST_ID} .anjava-bar {
      height: 4px;
      background: #2563eb;
      animation: anjava-progress 6s linear forwards;
      transform-origin: left;
    }
    #${TOAST_ID}.anjava-out {
      animation: anjava-out 0.24s ease forwards;
    }
    @keyframes anjava-in {
      from { opacity: 0; transform: translateX(60px) scale(0.95); }
      to   { opacity: 1; transform: translateX(0) scale(1); }
    }
    @keyframes anjava-out {
      to { opacity: 0; transform: translateX(60px) scale(0.95); }
    }
    @keyframes anjava-progress {
      from { transform: scaleX(1); }
      to   { transform: scaleX(0); }
    }
  `
  document.head.appendChild(s)
}

function showToast(message: string, icon = "⚠️", isSuccess = false) {
  injectStyle()

  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }

  const old = document.getElementById(TOAST_ID)
  if (old) old.remove()

  const el = document.createElement("div")
  el.id = TOAST_ID
  if (isSuccess) el.classList.add("anjava-success")

  // 헤더
  const header = document.createElement("div")
  header.className = "anjava-header"

  const iconEl = document.createElement("span")
  iconEl.className = "anjava-icon"
  iconEl.textContent = icon

  const titleEl = document.createElement("span")
  titleEl.className = "anjava-title"
  titleEl.textContent = "자세 교정 알림"

  const closeBtn = document.createElement("button")
  closeBtn.className = "anjava-close"
  closeBtn.textContent = "✕"
  closeBtn.onclick = () => {
    el.classList.add("anjava-out")
    setTimeout(() => el.remove(), 240)
  }

  header.appendChild(iconEl)
  header.appendChild(titleEl)
  header.appendChild(closeBtn)

  // 본문
  const body = document.createElement("div")
  body.className = "anjava-body"
  body.textContent = message

  // 진행 바
  const bar = document.createElement("div")
  bar.className = "anjava-bar"

  el.appendChild(header)
  el.appendChild(body)
  el.appendChild(bar)
  document.body.appendChild(el)

  dismissTimer = setTimeout(() => {
    el.classList.add("anjava-out")
    setTimeout(() => el.remove(), 240)
  }, 6000)
}

// 재주입 시 구버전 listener 제거 후 새 listener 등록
const LISTENER_KEY = "__anjava_toast_listener__"
if ((window as any)[LISTENER_KEY]) {
  chrome.runtime.onMessage.removeListener((window as any)[LISTENER_KEY])
}

const _toastListener = (msg: any) => {
  if (msg.type !== "POSTURE_ALERT") return
  const msgs: Record<string, string> = {
    TURTLE_NECK:        "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
    turtle_neck:        "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
    SHOULDER_ISSUE:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
    ROUND_SHOULDER:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
    round_shoulder:     "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
    SHOULDER_ASYMMETRY: "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
    shoulder_tilted:    "어깨 비대칭이 감지되었어요! 어깨 높이를 맞춰주세요.",
    DARK_ENV:           "어두운 환경이 감지되었어요! 밝기를 높여주세요.",
    dark_env:           "어두운 환경이 감지되었어요! 밝기를 높여주세요.",
    GOOD_POSTURE:       "자세가 교정되었어요! 바른 자세를 유지해보세요.",
  }
  const isGood = msg.state === "GOOD_POSTURE"
  const text = msgs[msg.state] ?? msg.message ?? "자세를 확인해주세요."
  showToast(text, isGood ? "✅" : "⚠️", isGood)
}
;(window as any)[LISTENER_KEY] = _toastListener
chrome.runtime.onMessage.addListener(_toastListener)
