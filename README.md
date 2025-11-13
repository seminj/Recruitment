# 강의실 예약 시스템

SQL 데이터베이스 없이 JSON 파일로 동작하는 회의실/강의실 예약 시스템입니다.

## 특징

- ✅ SQL 불필요 (JSON 파일 기반)
- ✅ 개인 PC 호스팅 가능
- ✅ 회의실/강의실 관리
- ✅ 예약 현황 조회
- ✅ 백업/복원 기능
- ✅ **SSO 인증 지원** (Google, Microsoft, Keycloak 등)

## 설치 및 실행

### 1. 패키지 설치

```bash
pip install -r requirements.txt
```

### 2. 서버 시작

```bash
python app.py
```

### 3. 접속

- **예약 현황**: http://localhost:5000
- **관리자 페이지**: http://localhost:5000/admin.html
- **기본 계정**: admin / 1234

## 데이터 저장

`data` 폴더에 JSON 파일로 저장됩니다:
- `rooms.json` - 회의실
- `reservations.json` - 예약
- `holidays.json` - 공휴일
- `admin_creds.json` - 관리자 계정
- `sso_admins.json` - SSO 관리자

## 백업/복원

관리자 페이지 → 백업 탭에서 가능

## SSO 인증

### 지원하는 SSO 제공자
- Google OAuth 2.0
- Microsoft Azure AD (Office 365)
- Keycloak
- 기타 OAuth 2.0 / OpenID Connect 호환 제공자

### 설정 방법

1. SSO 제공자에서 OAuth 애플리케이션 등록
2. `sso_config.json` 파일 생성 (예시: `sso_config.example.json` 참고)
3. SSO 관리자 등록 (`data/sso_admins.json`)
4. 서버 재시작

자세한 설정 방법은 [SSO_SETUP_GUIDE.md](./SSO_SETUP_GUIDE.md) 참고

### 로그인 방법

- 기본 로그인: 아이디/비밀번호 (admin / 1234)
- SSO 로그인: http://localhost:5000/api/auth/login

## 다른 기기에서 접속

1. 서버 PC의 IP 확인: `ipconfig` (Windows) 또는 `ifconfig` (Mac/Linux)
2. 다른 기기에서 접속: `http://[서버IP]:5000`

## 포트 변경

`app.py` 마지막 줄에서 포트 번호 수정:

```python
app.run(host='0.0.0.0', port=8000, debug=True)
```

## 주의사항

- 종료: `Ctrl+C`
- 정기적으로 `data` 폴더 백업 권장
