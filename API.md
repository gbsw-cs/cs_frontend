Auth


POST
/api/auth/signup
회원가입

Parameters
Try it out
No parameters

Request body

application/json
Example Value
Schema
{
  "email": "user@example.com",
  "password": "password123",
  "name": "홍길동",
  "profileImg": "https://example.com/profile.jpg"
}
Responses
Code	Description	Links
201	
생성 성공

Media type

application/json
Controls Accept header.
Example Value
Schema
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
No links
400	
잘못된 요청

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
401	
인증 실패

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
403	
권한 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
404	
리소스 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
500	
서버 오류

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links

POST
/api/auth/login
로그인

Parameters
Try it out
No parameters

Request body

application/json
Example Value
Schema
{
  "email": "user@example.com",
  "password": "password123"
}
Responses
Code	Description	Links
200	
요청 성공

Media type

application/json
Controls Accept header.
Example Value
Schema
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
No links
400	
잘못된 요청

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
401	
인증 실패

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
403	
권한 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
404	
리소스 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
500	
서버 오류

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links

GET
/api/auth/google
Google 로그인 시작

Parameters
Try it out
No parameters

Responses
Code	Description	Links
200	
No links

GET
/api/auth/google/callback
Google 로그인 콜백

Parameters
Try it out
No parameters

Responses
Code	Description	Links
200	
No links

POST
/api/auth/refresh
토큰 갱신

Parameters
Try it out
No parameters

Request body

application/json
Example Value
Schema
{
  "refreshToken": "string"
}
Responses
Code	Description	Links
200	
요청 성공

Media type

application/json
Controls Accept header.
Example Value
Schema
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
No links
400	
잘못된 요청

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
401	
인증 실패

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
403	
권한 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
404	
리소스 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
500	
서버 오류

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links

POST
/api/auth/logout
로그아웃


Parameters
Try it out
No parameters

Responses
Code	Description	Links
200	
요청 성공

Media type

application/json
Controls Accept header.
Example Value
Schema
{
  "success": true,
  "statusCode": 200,
  "message": "요청이 성공적으로 처리되었습니다.",
  "data": null,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
No links
400	
잘못된 요청

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
401	
인증 실패

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
403	
권한 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
404	
리소스 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
500	
서버 오류

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links

DELETE
/api/auth/withdraw
회원탈퇴


Parameters
Try it out
No parameters

Responses
Code	Description	Links
200	
요청 성공

Media type

application/json
Controls Accept header.
Example Value
Schema
{
  "success": true,
  "statusCode": 200,
  "message": "요청이 성공적으로 처리되었습니다.",
  "data": null,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
No links
400	
잘못된 요청

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
401	
인증 실패

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
403	
권한 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
404	
리소스 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
500	
서버 오류

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
User


GET
/api/users/me
내 정보 조회


Parameters
Try it out
No parameters

Responses
Code	Description	Links
200	
요청 성공

Media type

application/json
Controls Accept header.
Example Value
Schema
{
  "success": true,
  "statusCode": 200,
  "message": "요청이 성공적으로 처리되었습니다.",
  "data": {
    "id": "string",
    "email": "string",
    "name": "string",
    "createdAt": "2026-04-08T06:57:06.844Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
No links
400	
잘못된 요청

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
401	
인증 실패

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
403	
권한 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
404	
리소스 없음

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
No links
500	
서버 오류

Media type

application/json
Example Value
Schema
{
  "success": false,
  "statusCode": 400,
  "message": "요청이 올바르지 않습니다.",
  "error": "Bad Request",
  "validationErrors": [
    "name must be a string"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}