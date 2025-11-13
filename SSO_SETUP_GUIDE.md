# SSO 인증 설정 가이드

이 문서는 강의실 예약 시스템에 SSO(Single Sign-On) 인증을 설정하는 방법을 설명합니다.

## 목차
1. [지원하는 SSO 제공자](#지원하는-sso-제공자)
2. [Google OAuth 설정](#google-oauth-설정)
3. [Microsoft Azure AD 설정](#microsoft-azure-ad-설정)
4. [Keycloak 설정](#keycloak-설정)
5. [SSO 관리자 등록](#sso-관리자-등록)
6. [테스트](#테스트)

---

## 지원하는 SSO 제공자

- ✅ Google OAuth 2.0
- ✅ Microsoft Azure AD (Office 365)
- ✅ Keycloak
- ✅ 기타 OAuth 2.0 / OpenID Connect 호환 제공자

---

## Google OAuth 설정

### 1단계: Google Cloud Console에서 프로젝트 생성

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. 좌측 메뉴에서 "API 및 서비스" > "사용자 인증 정보" 클릭

### 2단계: OAuth 2.0 클라이언트 ID 생성

1. "사용자 인증 정보 만들기" > "OAuth 클라이언트 ID" 클릭
2. 애플리케이션 유형: "웹 애플리케이션" 선택
3. 이름 입력 (예: "강의실 예약 시스템")
4. 승인된 리디렉션 URI 추가:
   ```
   http://localhost:5000/api/auth/callback
   ```
   또는 서버 도메인이 있는 경우:
   ```
   https://your-domain.com/api/auth/callback
   ```
5. "만들기" 클릭

### 3단계: 클라이언트 ID와 Secret 복사

- 생성된 **클라이언트 ID**와 **클라이언트 보안 비밀번호** 복사

### 4단계: sso_config.json 파일 생성

프로젝트 루트에 `sso_config.json` 파일을 생성하고 다음 내용을 입력:

```json
{
  "provider": "google",
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
  "token_endpoint": "https://oauth2.googleapis.com/token",
  "userinfo_endpoint": "https://www.googleapis.com/oauth2/v3/userinfo",
  "redirect_uri": "http://localhost:5000/api/auth/callback",
  "scope": "openid profile email",
  "session_timeout_minutes": 480
}
```

**주의**: `YOUR_CLIENT_ID`와 `YOUR_CLIENT_SECRET`을 실제 값으로 교체하세요.

---

## Microsoft Azure AD 설정

### 1단계: Azure Portal에서 앱 등록

1. [Azure Portal](https://portal.azure.com/) 접속
2. "Azure Active Directory" > "앱 등록" > "새 등록" 클릭
3. 이름 입력 (예: "강의실 예약 시스템")
4. 지원되는 계정 유형 선택:
   - 단일 테넌트: 조직 내부만 사용
   - 다중 테넌트: 여러 조직 사용 가능
5. 리디렉션 URI:
   - 플랫폼: "웹"
   - URI: `http://localhost:5000/api/auth/callback`
6. "등록" 클릭

### 2단계: 클라이언트 Secret 생성

1. 앱 등록 페이지에서 "인증서 및 비밀" 클릭
2. "새 클라이언트 암호" 클릭
3. 설명 입력 및 만료 기간 선택
4. "추가" 클릭 후 **값(Value)** 복사 (나중에 다시 볼 수 없음!)

### 3단계: API 권한 설정

1. "API 권한" > "권한 추가" 클릭
2. "Microsoft Graph" 선택
3. "위임된 권한" 선택
4. 다음 권한 추가:
   - `User.Read`
   - `openid`
   - `profile`
   - `email`
5. "권한 추가" 클릭

### 4단계: sso_config.json 파일 생성

```json
{
  "provider": "microsoft",
  "client_id": "YOUR_APPLICATION_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "authorization_endpoint": "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/authorize",
  "token_endpoint": "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token",
  "userinfo_endpoint": "https://graph.microsoft.com/v1.0/me",
  "redirect_uri": "http://localhost:5000/api/auth/callback",
  "scope": "openid profile email User.Read",
  "session_timeout_minutes": 480
}
```

**주의**: 
- `YOUR_APPLICATION_CLIENT_ID`: 앱 등록 페이지의 "애플리케이션(클라이언트) ID"
- `YOUR_CLIENT_SECRET`: 생성한 클라이언트 암호
- `YOUR_TENANT_ID`: 앱 등록 페이지의 "디렉터리(테넌트) ID"
  - 또는 모든 조직 계정을 허용하려면 `common` 사용

---

## Keycloak 설정

### 1단계: Keycloak에서 클라이언트 생성

1. Keycloak Admin Console 접속
2. Realm 선택 (또는 새로 생성)
3. "Clients" > "Create" 클릭
4. 다음 정보 입력:
   - Client ID: `classroom-reservation`
   - Client Protocol: `openid-connect`
5. "Save" 클릭

### 2단계: 클라이언트 설정

1. "Settings" 탭에서:
   - Access Type: `confidential`
   - Standard Flow Enabled: `ON`
   - Valid Redirect URIs: `http://localhost:5000/api/auth/callback`
   - Web Origins: `http://localhost:5000`
2. "Save" 클릭

### 3단계: Client Secret 확인

1. "Credentials" 탭 클릭
2. "Secret" 값 복사

### 4단계: sso_config.json 파일 생성

```json
{
  "provider": "keycloak",
  "client_id": "classroom-reservation",
  "client_secret": "YOUR_CLIENT_SECRET",
  "authorization_endpoint": "https://your-keycloak.com/auth/realms/YOUR_REALM/protocol/openid-connect/auth",
  "token_endpoint": "https://your-keycloak.com/auth/realms/YOUR_REALM/protocol/openid-connect/token",
  "userinfo_endpoint": "https://your-keycloak.com/auth/realms/YOUR_REALM/protocol/openid-connect/userinfo",
  "redirect_uri": "http://localhost:5000/api/auth/callback",
  "scope": "openid profile email",
  "session_timeout_minutes": 480
}
```

**주의**: 
- `your-keycloak.com`: Keycloak 서버 주소
- `YOUR_REALM`: Realm 이름
- `YOUR_CLIENT_SECRET`: Credentials 탭의 Secret 값

---

## SSO 관리자 등록

SSO 인증을 사용하려면 먼저 관리자 목록에 사용자를 등록해야 합니다.

### 방법 1: API로 직접 등록

```bash
curl -X POST http://localhost:5000/api/admin/sso \
  -H "Content-Type: application/json" \
  -d '{
    "id": "unique-id-123",
    "userId": "user@example.com",
    "userName": "홍길동",
    "dept": "IT팀",
    "note": "시스템 관리자"
  }'
```

**주의**: `userId`는 SSO 제공자가 반환하는 사용자 고유 ID와 일치해야 합니다:
- Google: 이메일 주소
- Microsoft: Object ID (oid) 또는 UPN (userPrincipalName)
- Keycloak: sub 또는 preferred_username

### 방법 2: data/sso_admins.json 파일 직접 수정

`data/sso_admins.json` 파일을 열고 다음 형식으로 추가:

```json
[
  {
    "id": "unique-id-123",
    "userId": "user@example.com",
    "userName": "홍길동",
    "dept": "IT팀",
    "note": "시스템 관리자",
    "registered_at": "2025-01-01T00:00:00"
  }
]
```

---

## 테스트

### 1단계: 서버 시작

```bash
python app.py
```

### 2단계: SSO 로그인 테스트

1. 브라우저에서 접속:
   ```
   http://localhost:5000/api/auth/login
   ```

2. SSO 제공자 로그인 페이지로 리다이렉트됨
3. 로그인 후 `http://localhost:5000/admin.html?sso=success`로 리다이렉트됨

### 3단계: 세션 확인

```bash
curl http://localhost:5000/api/auth/session \
  -H "Cookie: session_token=YOUR_SESSION_TOKEN"
```

응답 예시:
```json
{
  "authenticated": true,
  "user": {
    "user_id": "user@example.com",
    "name": "홍길동",
    "email": "user@example.com",
    "department": "IT팀",
    "admin_note": "시스템 관리자"
  }
}
```

### 4단계: 로그아웃

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Cookie: session_token=YOUR_SESSION_TOKEN"
```

---

## API 엔드포인트

### SSO 인증

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/auth/login` | SSO 로그인 시작 (OAuth 인증 페이지로 리다이렉트) |
| GET | `/api/auth/callback` | OAuth 콜백 (자동으로 호출됨) |
| GET | `/api/auth/session` | 현재 세션 확인 |
| POST | `/api/auth/logout` | 로그아웃 |

### SSO 관리자 관리

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/admin/sso` | SSO 관리자 목록 조회 |
| POST | `/api/admin/sso` | SSO 관리자 추가 |
| DELETE | `/api/admin/sso/<id>` | SSO 관리자 삭제 |

---

## 문제 해결

### 오류: "Invalid state parameter"

- 원인: CSRF 보호를 위한 state 파라미터가 일치하지 않음
- 해결: 브라우저 쿠키를 삭제하고 다시 로그인

### 오류: "접근 권한이 없습니다"

- 원인: SSO 관리자 목록에 등록되지 않은 사용자
- 해결: `data/sso_admins.json`에 사용자 추가

### 오류: "토큰 교환 실패"

- 원인: client_id, client_secret, redirect_uri가 잘못됨
- 해결: `sso_config.json` 설정 확인 및 SSO 제공자 콘솔에서 설정 확인

### 오류: "사용자 정보 조회 실패"

- 원인: API 권한이 부족하거나 userinfo_endpoint가 잘못됨
- 해결: SSO 제공자에서 필요한 권한(scope) 확인

---

## 보안 권장사항

1. **HTTPS 사용**: 운영 환경에서는 반드시 HTTPS를 사용하세요.
   ```json
   "redirect_uri": "https://your-domain.com/api/auth/callback"
   ```

2. **세션 타임아웃 설정**: 적절한 세션 타임아웃을 설정하세요.
   ```json
   "session_timeout_minutes": 480
   ```

3. **Client Secret 보호**: `sso_config.json` 파일을 버전 관리에 포함하지 마세요.
   ```bash
   echo "sso_config.json" >> .gitignore
   ```

4. **정기적인 Secret 갱신**: Client Secret을 정기적으로 갱신하세요.

5. **로그 모니터링**: 인증 실패 로그를 모니터링하여 의심스러운 활동을 감지하세요.

---

## 참고 자료

- [Google OAuth 2.0 문서](https://developers.google.com/identity/protocols/oauth2)
- [Microsoft Identity Platform 문서](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Keycloak 문서](https://www.keycloak.org/documentation)
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [OpenID Connect Specification](https://openid.net/specs/openid-connect-core-1_0.html)

