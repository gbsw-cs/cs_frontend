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
      bottom: 24px;
      right: 24px;
      background: #18181b;
      color: #fff;
      padding: 12px 16px 12px 14px;
      border-radius: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.4;
      z-index: 2147483647;
      box-shadow: 0 8px 32px rgba(0,0,0,0.35);
      display: flex;
      align-items: flex-start;
      gap: 10px;
      max-width: 300px;
      min-width: 220px;
      border-left: 4px solid #f59e0b;
      animation: anjava-in 0.28s cubic-bezier(0.16,1,0.3,1);
      pointer-events: auto;
    }
    #${TOAST_ID}.anjava-out {
      animation: anjava-out 0.22s ease forwards;
    }
    @keyframes anjava-in {
      from { opacity: 0; transform: translateY(16px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes anjava-out {
      to { opacity: 0; transform: translateY(12px) scale(0.95); }
    }
  `
  document.head.appendChild(s)
}

function showToast(message: string, icon = "⚠️") {
  injectStyle()

  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }

  let el = document.getElementById(TOAST_ID)
  if (el) el.remove()

  el = document.createElement("div")
  el.id = TOAST_ID
  el.innerHTML = `
    <span style="font-size:20px;flex-shrink:0;margin-top:1px">${icon}</span>
    <div>
      <div style="font-weight:700;margin-bottom:2px;color:#fbbf24">자세 교정 알림</div>
      <div style="opacity:0.85;font-size:12px">${message}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="
      margin-left:auto;background:none;border:none;color:#71717a;
      cursor:pointer;font-size:16px;padding:0 2px;flex-shrink:0
    ">✕</button>
  `
  document.body.appendChild(el)

  dismissTimer = setTimeout(() => {
    el?.classList.add("anjava-out")
    setTimeout(() => el?.remove(), 220)
  }, 6000)
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "POSTURE_ALERT") return
  const msgs: Record<string, string> = {
    TURTLE_NECK:    "거북목 자세가 감지되었어요! 목을 바르게 펴주세요.",
    SHOULDER_ISSUE: "라운드숄더가 감지되었어요! 어깨를 뒤로 젖혀주세요.",
    DARK_ENV:       "어두운 환경이 감지되었어요! 밝기를 높여주세요."
  }
  const text = msgs[msg.state] ?? msg.message ?? "자세를 확인해주세요."
  showToast(text)
})
