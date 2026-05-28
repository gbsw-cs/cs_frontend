import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Anjava",
  description: "Anjava and Anjava extend privacy policy",
};

const sections = [
  {
    title: "1. 수집하는 정보",
    body: [
      "Anjava는 서비스 제공을 위해 계정 식별 정보(이름, 이메일 또는 소셜 로그인 식별자), 인증 정보(로그인 토큰), 자세 교정에 필요한 기준 자세 및 자세 분석 데이터, 사용자 설정, 세션 상태와 알림 설정을 처리할 수 있습니다.",
      "웹캠 영상은 자세 분석을 위해 사용되며, 확장 프로그램은 웹페이지의 텍스트, 이미지, 키 입력, 마우스 이동, 방문 기록을 자세 교정 목적 외로 수집하지 않습니다.",
    ],
  },
  {
    title: "2. 사용 목적",
    body: [
      "수집된 정보는 기준 자세 설정, 실시간 자세 감지, 자세 교정 알림, 사용자 설정 저장, 로그인 상태 유지, 서비스 품질 개선을 위해 사용됩니다.",
      "Anjava extend의 단일 목적은 장시간 PC를 사용하는 사용자의 자세를 감지하고 자세 교정 알림을 제공하는 것입니다.",
    ],
  },
  {
    title: "3. 제3자 제공 및 판매",
    body: [
      "Anjava는 사용자 데이터를 제3자에게 판매하지 않습니다.",
      "사용자 데이터는 서비스 운영, 인증, 보안, 법적 의무 이행 등 승인된 목적을 제외하고 제3자에게 제공되지 않습니다.",
    ],
  },
  {
    title: "4. 보관 및 삭제",
    body: [
      "사용자 데이터는 서비스 제공에 필요한 기간 동안 보관됩니다.",
      "사용자는 계정 삭제 또는 데이터 삭제를 요청할 수 있으며, 요청이 접수되면 관련 법령 및 운영상 필요한 범위를 제외하고 데이터를 삭제합니다.",
    ],
  },
  {
    title: "5. 보안",
    body: [
      "Anjava는 사용자 데이터를 보호하기 위해 접근 제한, 인증 관리, 전송 구간 보호 등 합리적인 보안 조치를 적용합니다.",
      "브라우저에 저장되는 정보는 확장 프로그램의 기능 제공을 위해 로컬 저장소에 보관될 수 있습니다.",
    ],
  },
  {
    title: "6. 문의",
    body: [
      "개인정보 처리와 관련한 문의는 Chrome Web Store에 등록된 게시자 연락처 이메일로 연락할 수 있습니다.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-12 text-zinc-900 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-medium text-[#2563EB]">Anjava</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal">
          개인정보처리방침
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          시행일: 2026년 5월 28일
        </p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-700">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
