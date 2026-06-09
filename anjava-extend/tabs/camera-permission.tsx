import { useEffect, useRef, useState } from "react"

import logoUrl from "url:../assets/logo.png"

import "./camera-permission.css"

type PermissionState = "idle" | "requesting" | "granted" | "denied" | "unavailable" | "busy"

export default function CameraPermissionPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<PermissionState>("idle")

  const stopPreview = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const requestCamera = async () => {
    stopPreview()
    setState("requesting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setState("granted")
      await chrome.runtime.sendMessage({ type: "CAMERA_PERMISSION_GRANTED" }).catch(() => null)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ""
      if (name === "NotFoundError" || name === "DevicesNotFoundError") setState("unavailable")
      else if (name === "NotReadableError" || name === "TrackStartError") setState("busy")
      else setState("denied")
    }
  }

  useEffect(() => () => stopPreview(), [])

  const copy = {
    idle: ["카메라 권한이 필요합니다", "아래 버튼을 눌러 Anjava 확장 프로그램의 카메라 사용을 허용해주세요."],
    requesting: ["권한을 확인하고 있습니다", "Chrome의 카메라 권한 창에서 허용을 선택해주세요."],
    granted: ["카메라 연결 완료", "백그라운드 자세 감지를 다시 시작했습니다. 이 탭을 닫아도 됩니다."],
    denied: ["카메라 권한이 차단되었습니다", "주소창 왼쪽의 카메라 아이콘에서 허용으로 변경한 뒤 다시 시도해주세요."],
    unavailable: ["카메라를 찾을 수 없습니다", "카메라가 연결되어 있고 macOS 또는 Windows에서 Chrome 카메라 권한이 켜져 있는지 확인해주세요."],
    busy: ["카메라를 사용할 수 없습니다", "다른 앱에서 카메라를 사용 중이라면 종료한 뒤 다시 시도해주세요."],
  } satisfies Record<PermissionState, [string, string]>

  return (
    <main className="permission-page">
      <section className="permission-panel">
        <img className="permission-logo" src={logoUrl} alt="앉자봐" />
        <div className={`permission-status permission-status-${state}`}>
          <span className="permission-dot" />
          {state === "granted" ? "연결됨" : state === "requesting" ? "확인 중" : "카메라 설정"}
        </div>
        <h1>{copy[state][0]}</h1>
        <p>{copy[state][1]}</p>

        <div className="permission-preview">
          <video ref={videoRef} muted playsInline />
          {state !== "granted" && <span>카메라 미리보기</span>}
        </div>

        {state === "granted" ? (
          <button className="permission-primary" onClick={() => window.close()}>완료</button>
        ) : (
          <button className="permission-primary" disabled={state === "requesting"} onClick={requestCamera}>
            {state === "requesting" ? "권한 확인 중..." : "카메라 권한 허용"}
          </button>
        )}
        <button
          className="permission-secondary"
          onClick={() => chrome.tabs.create({ url: "chrome://settings/content/camera" })}
        >
          Chrome 카메라 설정 열기
        </button>
      </section>
    </main>
  )
}
