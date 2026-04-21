export const PASSWORD_MIN_LENGTH = 8;
export const FORBIDDEN_PASSWORD_CHARS = [
  "<",
  ">",
  '"',
  "'",
  ";",
  " ",
  "`",
  "&",
  "|",
  "$",
  "/",
  "~",
];

export function validatePassword(pw: string): string | null {
  if (pw.length === 0) return null;
  if (pw.length < PASSWORD_MIN_LENGTH) {
    return `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  }
  const bad = [...pw].find((c) => FORBIDDEN_PASSWORD_CHARS.includes(c));
  if (bad) {
    const display = bad === " " ? "공백" : `"${bad}"`;
    return `${display} 문자는 비밀번호에 사용할 수 없습니다.`;
  }
  return null;
}

export function validatePasswordConfirm(
  pw: string,
  confirm: string,
): string | null {
  if (confirm.length === 0) return null;
  if (pw !== confirm) return "비밀번호가 일치하지 않습니다.";
  return null;
}
