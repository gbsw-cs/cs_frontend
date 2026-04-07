const POSTURE_TIPS = [
  "허리를 펴고 앉아주세요!",
  "모니터와 눈 높이를 맞춰주세요",
  "어깨를 뒤로 젖히고 긴장을 풀어주세요",
  "턱을 당기고 목을 바르게 세워주세요",
  "의자에 깊숙이 앉아 등받이에 기대주세요",
  "손목이 꺾이지 않게 키보드 위치를 확인하세요",
  "양 발을 바닥에 평평하게 놓아주세요",
  "화면과의 거리를 팔 길이 정도로 유지하세요"
]

const BREAK_TIPS = [
  "잠시 일어나서 스트레칭 해주세요!",
  "눈을 감고 10초간 쉬어주세요",
  "물 한 잔 마시면서 쉬어가세요",
  "목과 어깨를 돌려 긴장을 풀어주세요",
  "창밖을 보며 눈의 피로를 풀어주세요",
  "제자리에서 가볍게 기지개를 켜주세요"
]

const POSTURE_ALARM = "posture-reminder"
const BREAK_ALARM = "break-reminder"

function getRandomTip(tips: string[]): string {
  return tips[Math.floor(Math.random() * tips.length)]
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getStats(): Promise<Record<string, any>> {
  const key = getTodayKey()
  const result = await chrome.storage.local.get(key)
  return result[key] || { postureAlerts: 0, breaksAlerts: 0, startTime: null }
}

async function incrementStat(field: "postureAlerts" | "breaksAlerts") {
  const key = getTodayKey()
  const stats = await getStats()
  stats[field] = (stats[field] || 0) + 1
  await chrome.storage.local.set({ [key]: stats })
}

async function showNotification(type: "posture" | "break") {
  const isPosture = type === "posture"
  const tip = isPosture ? getRandomTip(POSTURE_TIPS) : getRandomTip(BREAK_TIPS)

  chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon.png",
    title: isPosture ? "자세 교정 알림" : "휴식 알림",
    message: tip,
    priority: 2
  })

  await incrementStat(isPosture ? "postureAlerts" : "breaksAlerts")
}

async function startAlarms() {
  const result = await chrome.storage.local.get("settings")
  const settings = result.settings || { postureInterval: 30, breakInterval: 60 }

  await chrome.alarms.clearAll()

  chrome.alarms.create(POSTURE_ALARM, {
    delayInMinutes: settings.postureInterval,
    periodInMinutes: settings.postureInterval
  })

  chrome.alarms.create(BREAK_ALARM, {
    delayInMinutes: settings.breakInterval,
    periodInMinutes: settings.breakInterval
  })
}

async function stopAlarms() {
  await chrome.alarms.clearAll()
}

// Alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POSTURE_ALARM) {
    showNotification("posture")
  } else if (alarm.name === BREAK_ALARM) {
    showNotification("break")
  }
})

// Message handler from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_MONITORING") {
    const now = Date.now()
    chrome.storage.local.get(getTodayKey(), (result) => {
      const stats = result[getTodayKey()] || { postureAlerts: 0, breaksAlerts: 0 }
      stats.startTime = now
      chrome.storage.local.set({
        [getTodayKey()]: stats,
        isMonitoring: true,
        monitoringStartTime: now
      }, () => {
        startAlarms().then(() => sendResponse({ success: true }))
      })
    })
    return true
  }

  if (message.type === "STOP_MONITORING") {
    chrome.storage.local.get(["monitoringStartTime", getTodayKey()], (result) => {
      const stats = result[getTodayKey()] || { postureAlerts: 0, breaksAlerts: 0 }
      const startTime = result.monitoringStartTime
      if (startTime) {
        stats.totalMs = (stats.totalMs || 0) + (Date.now() - startTime)
      }
      stats.startTime = null
      chrome.storage.local.set({
        [getTodayKey()]: stats,
        isMonitoring: false,
        monitoringStartTime: null
      }, () => {
        stopAlarms().then(() => sendResponse({ success: true }))
      })
    })
    return true
  }

  if (message.type === "UPDATE_SETTINGS") {
    chrome.storage.local.set({ settings: message.settings }, () => {
      chrome.storage.local.get("isMonitoring", (result) => {
        if (result.isMonitoring) {
          startAlarms().then(() => sendResponse({ success: true }))
        } else {
          sendResponse({ success: true })
        }
      })
    })
    return true
  }
})

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    settings: { postureInterval: 30, breakInterval: 60 },
    isMonitoring: false,
    monitoringStartTime: null
  })
})

export {}
