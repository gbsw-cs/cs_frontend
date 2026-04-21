📌 Auth API 문서
🔐 회원가입

POST /api/auth/signup

Request
{
  "email": "user@example.com",
  "password": "password123",
  "name": "홍길동",
  "profileImg": "https://example.com/profile.jpg"
}
Response (201)
{
  "success": true,
  "statusCode": 200,
  "message": "요청이 성공적으로 처리되었습니다.",
  "data": {
    "accessToken": "string",
    "refreshToken": "string"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
🔑 로그인

POST /api/auth/login

Request
{
  "email": "user@example.com",
  "password": "password123"
}
Response (200)
{
  "success": true,
  "statusCode": 200,
  "data": {
    "accessToken": "string",
    "refreshToken": "string"
  }
}
🌐 Google 로그인
🔹 로그인 시작

GET /api/auth/google

🔹 콜백

GET /api/auth/google/callback

🔄 토큰 갱신

POST /api/auth/refresh

Request
{
  "refreshToken": "string"
}
Response (200)
{
  "success": true,
  "statusCode": 200,
  "data": {
    "accessToken": "string",
    "refreshToken": "string"
  }
}
🚪 로그아웃

POST /api/auth/logout

Response (200)
{
  "success": true,
  "statusCode": 200,
  "data": null
}
❌ 회원 탈퇴

DELETE /api/auth/withdraw

Response (200)
{
  "success": true,
  "statusCode": 200,
  "data": null
}
👤 User API
🙋 내 정보 조회

GET /api/users/me

Response (200)
{
  "success": true,
  "statusCode": 200,
  "data": {
    "id": "string",
    "email": "string",
    "name": "string",
    "createdAt": "2026-04-08T06:57:06.844Z"
  }
}
⚠️ 공통 에러 응답
❌ 400 Bad Request
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": ["name must be a string"]
}
🔒 401 Unauthorized
{
  "success": false,
  "statusCode": 401,
  "message": "인증에 실패했습니다."
}
⛔ 403 Forbidden
{
  "success": false,
  "statusCode": 403,
  "message": "권한이 없습니다."
}
🔍 404 Not Found
{
  "success": false,
  "statusCode": 404,
  "message": "리소스를 찾을 수 없습니다."
}
💥 500 Internal Server Error
{
  "success": false,
  "statusCode": 500,
  "message": "서버 오류가 발생했습니다."
}