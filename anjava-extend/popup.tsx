import { useEffect, useState } from "react"

import "./popup.css"

interface Settings {
  postureInterval: number
  breakInterval: number
}

interface Stats {
  postureAlerts: number
  breaksAlerts: number
  totalMs: number
  startTime: number | null
}

const INTERVAL_OPTIONS = [
  { value: 15, label: "15분" },
  { value: 30, label: "30분" },
  { value: 45, label: "45분" },
  { value: 60, label: "1시간" },
  { value: 90, label: "1시간 30분" },
  { value: 120, label: "2시간" }
]

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hours > 0) return `${hours}시간 ${mins}분`
  return `${mins}분`
}

function IndexPopup() {
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    postureInterval: 30,
    breakInterval: 60
  })
  const [stats, setStats] = useState<Stats>({
    postureAlerts: 0,
    breaksAlerts: 0,
    totalMs: 0,
    startTime: null
  })
  const [elapsed, setElapsed] = useState(0)
  const [activeTab, setActiveTab] = useState<"home" | "settings">("home")

  const todayKey = new Date().toISOString().slice(0, 10)

  // Load state from storage
  useEffect(() => {
    chrome.storage.local.get(
      ["isMonitoring", "monitoringStartTime", "settings", todayKey],
      (result) => {
        setIsMonitoring(result.isMonitoring || false)
        if (result.settings) setSettings(result.settings)
        const dayStats = result[todayKey] || {}
        setStats({
          postureAlerts: dayStats.postureAlerts || 0,
          breaksAlerts: dayStats.breaksAlerts || 0,
          totalMs: dayStats.totalMs || 0,
          startTime: dayStats.startTime || null
        })
      }
    )
  }, [])

  // Elapsed time ticker
  useEffect(() => {
    if (!isMonitoring || !stats.startTime) {
      setElapsed(0)
      return
    }
    const tick = () => setElapsed(Date.now() - stats.startTime!)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isMonitoring, stats.startTime])

  const toggleMonitoring = () => {
    const type = isMonitoring ? "STOP_MONITORING" : "START_MONITORING"
    chrome.runtime.sendMessage({ type }, () => {
      setIsMonitoring(!isMonitoring)
      if (!isMonitoring) {
        setStats((s) => ({ ...s, startTime: Date.now() }))
      } else {
        setStats((s) => ({
          ...s,
          totalMs: s.totalMs + elapsed,
          startTime: null
        }))
        setElapsed(0)
      }
    })
  }

  const updateSetting = (key: keyof Settings, value: number) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    chrome.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      settings: newSettings
    })
  }

  const totalMonitoringMs = stats.totalMs + (isMonitoring ? elapsed : 0)

  return (
    <div className="popup">
      {/* Header */}
      <header className="header">
        <div className="header-icon">🪑</div>
        <div>
          <h1 className="header-title">Anjava</h1>
          <p className="header-subtitle">자세 교정 도우미</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "home" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("home")}>
          홈
        </button>
        <button
          className={`tab ${activeTab === "settings" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("settings")}>
          설정
        </button>
      </div>

      {activeTab === "home" ? (
        <div className="content">
          {/* Status Card */}
          <div className={`status-card ${isMonitoring ? "status-active" : "status-inactive"}`}>
            <div className="status-indicator">
              <span className={`status-dot ${isMonitoring ? "dot-active" : "dot-inactive"}`} />
              <span className="status-text">
                {isMonitoring ? "모니터링 중" : "모니터링 꺼짐"}
              </span>
            </div>
            {isMonitoring && elapsed > 0 && (
              <p className="elapsed-time">
                ⏱ {formatDuration(elapsed)}
              </p>
            )}
            <button
              className={`toggle-btn ${isMonitoring ? "btn-stop" : "btn-start"}`}
              onClick={toggleMonitoring}>
              {isMonitoring ? "중지하기" : "시작하기"}
            </button>
          </div>

          {/* Today Stats */}
          <div className="stats-section">
            <h2 className="section-title">오늘의 통계</h2>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-icon">🔔</span>
                <div>
                  <p className="stat-value">{stats.postureAlerts}회</p>
                  <p className="stat-label">자세 알림</p>
                </div>
              </div>
              <div className="stat-item">
                <span className="stat-icon">☕</span>
                <div>
                  <p className="stat-value">{stats.breaksAlerts}회</p>
                  <p className="stat-label">휴식 알림</p>
                </div>
              </div>
              <div className="stat-item stat-item-wide">
                <span className="stat-icon">⏰</span>
                <div>
                  <p className="stat-value">{formatDuration(totalMonitoringMs)}</p>
                  <p className="stat-label">총 모니터링 시간</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="content">
          {/* Settings */}
          <div className="settings-section">
            <div className="setting-item">
              <label className="setting-label">
                <span className="setting-icon">🔔</span>
                자세 알림 간격
              </label>
              <select
                className="setting-select"
                value={settings.postureInterval}
                onChange={(e) =>
                  updateSetting("postureInterval", Number(e.target.value))
                }>
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="setting-item">
              <label className="setting-label">
                <span className="setting-icon">☕</span>
                휴식 알림 간격
              </label>
              <select
                className="setting-select"
                value={settings.breakInterval}
                onChange={(e) =>
                  updateSetting("breakInterval", Number(e.target.value))
                }>
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="info-card">
            <p className="info-title">사용법</p>
            <ul className="info-list">
              <li>시작하기를 눌러 모니터링을 시작하세요</li>
              <li>설정한 간격마다 자세 교정 알림을 보내드려요</li>
              <li>휴식 알림으로 스트레칭 타이밍도 챙겨드려요</li>
              <li>알림이 오면 잠시 자세를 바르게 고쳐주세요</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default IndexPopup
