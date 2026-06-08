import { useEffect, useState } from "react"

type ApprovalData = {
  requestId: string
  title: string
  message: string
  allowLabel: string
  denyLabel: string
}

export default function ApprovalPage() {
  const [data, setData] = useState<ApprovalData | null>(null)
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setData({
      requestId: p.get("requestId") ?? "",
      title:     p.get("title")     ?? "작업 승인 요청",
      message:   p.get("message")   ?? "이 작업을 실행할까요?",
      allowLabel: p.get("allowLabel") ?? "허용",
      denyLabel:  p.get("denyLabel")  ?? "거부",
    })
  }, [])

  const respond = (approved: boolean) => {
    if (!data || answered) return
    setAnswered(true)
    chrome.runtime.sendMessage(
      { type: "APPROVAL_RESULT", requestId: data.requestId, approved },
      () => { window.close() },
    )
  }

  if (!data) return null

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 style={styles.title}>{data.title}</h1>
        <p style={styles.message}>{data.message}</p>
        <div style={styles.btnRow}>
          <button
            style={{ ...styles.btn, ...styles.btnAllow }}
            onClick={() => respond(true)}
            disabled={answered}
          >
            {data.allowLabel}
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnDeny }}
            onClick={() => respond(false)}
            disabled={answered}
          >
            {data.denyLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    margin: 0,
    padding: 0,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f4f4f5",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  },
  card: {
    background: "#ffffff",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
    padding: "28px 32px",
    width: 340,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: "#eff6ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#18181b",
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    color: "#52525b",
    textAlign: "center",
    lineHeight: 1.6,
  },
  btnRow: {
    display: "flex",
    gap: 10,
    marginTop: 8,
    width: "100%",
  },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    border: "none",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  btnAllow: {
    background: "#2563EB",
    color: "#ffffff",
  },
  btnDeny: {
    background: "#f4f4f5",
    color: "#3f3f46",
  },
}
