"""
SSO 인증 모듈 (OAuth 2.0 / OpenID Connect)
Google, Microsoft Azure AD, Keycloak 등 다양한 SSO 제공자와 연동 가능
"""

import os
import json
import requests
from urllib.parse import urlencode, parse_qs, urlparse
from datetime import datetime, timedelta
import secrets
from pathlib import Path

class SSOAuth:
    """SSO 인증 처리 클래스"""
    
    def __init__(self, config_file='sso_config.json'):
        """
        SSO 인증 초기화
        
        Args:
            config_file: SSO 설정 파일 경로
        """
        self.config_file = config_file
        self.config = self._load_config()
        self.sessions = {}  # 메모리 세션 저장소 (실제 운영시 Redis 등 사용 권장)
        
    def _load_config(self):
        """SSO 설정 파일 로드"""
        if not os.path.exists(self.config_file):
            # 기본 설정 파일 생성
            default_config = {
                "provider": "generic",  # generic, google, microsoft, keycloak
                "client_id": "",
                "client_secret": "",
                "authorization_endpoint": "",
                "token_endpoint": "",
                "userinfo_endpoint": "",
                "redirect_uri": "http://localhost:5000/api/auth/callback",
                "scope": "openid profile email",
                "session_timeout_minutes": 480,  # 8시간
            }
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(default_config, f, ensure_ascii=False, indent=2)
            print(f"기본 SSO 설정 파일 생성됨: {self.config_file}")
            return default_config
        
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            return config
        except Exception as e:
            print(f"SSO 설정 파일 로드 실패: {e}")
            return {}
    
    def get_authorization_url(self, state=None):
        """
        SSO 인증 URL 생성
        
        Args:
            state: CSRF 방지를 위한 상태값 (선택사항)
            
        Returns:
            tuple: (authorization_url, state)
        """
        if not state:
            state = secrets.token_urlsafe(32)
        
        params = {
            'client_id': self.config.get('client_id'),
            'redirect_uri': self.config.get('redirect_uri'),
            'response_type': 'code',
            'scope': self.config.get('scope'),
            'state': state,
        }
        
        # Provider별 추가 파라미터
        provider = self.config.get('provider', 'generic')
        if provider == 'microsoft':
            params['response_mode'] = 'query'
            params['prompt'] = 'select_account'
        elif provider == 'google':
            params['access_type'] = 'online'
            params['prompt'] = 'consent'
        
        auth_url = self.config.get('authorization_endpoint')
        if not auth_url:
            raise ValueError("authorization_endpoint가 설정되지 않았습니다.")
        
        authorization_url = f"{auth_url}?{urlencode(params)}"
        return authorization_url, state
    
    def exchange_code_for_token(self, code):
        """
        인증 코드를 액세스 토큰으로 교환
        
        Args:
            code: 인증 코드
            
        Returns:
            dict: 토큰 정보 (access_token, id_token, expires_in 등)
        """
        token_url = self.config.get('token_endpoint')
        if not token_url:
            raise ValueError("token_endpoint가 설정되지 않았습니다.")
        
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': self.config.get('redirect_uri'),
            'client_id': self.config.get('client_id'),
            'client_secret': self.config.get('client_secret'),
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        }
        
        try:
            response = requests.post(token_url, data=data, headers=headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            print(f"토큰 교환 실패: {e}")
            raise ValueError(f"토큰 교환 실패: {str(e)}")
    
    def get_user_info(self, access_token):
        """
        액세스 토큰으로 사용자 정보 조회
        
        Args:
            access_token: 액세스 토큰
            
        Returns:
            dict: 사용자 정보 (sub, name, email 등)
        """
        userinfo_url = self.config.get('userinfo_endpoint')
        if not userinfo_url:
            raise ValueError("userinfo_endpoint가 설정되지 않았습니다.")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
        }
        
        try:
            response = requests.get(userinfo_url, headers=headers, timeout=10)
            response.raise_for_status()
            user_info = response.json()
            
            # Provider별 사용자 정보 정규화
            return self._normalize_user_info(user_info)
        except requests.RequestException as e:
            print(f"사용자 정보 조회 실패: {e}")
            raise ValueError(f"사용자 정보 조회 실패: {str(e)}")
    
    def _normalize_user_info(self, user_info):
        """
        Provider별로 다른 사용자 정보를 표준 형식으로 변환
        
        Args:
            user_info: Provider로부터 받은 원본 사용자 정보
            
        Returns:
            dict: 정규화된 사용자 정보
        """
        provider = self.config.get('provider', 'generic')
        
        normalized = {
            'user_id': user_info.get('sub') or user_info.get('id') or user_info.get('oid'),
            'email': user_info.get('email') or user_info.get('userPrincipalName'),
            'name': user_info.get('name'),
            'given_name': user_info.get('given_name') or user_info.get('givenName'),
            'family_name': user_info.get('family_name') or user_info.get('surname'),
            'raw': user_info,  # 원본 정보도 보관
        }
        
        # Microsoft의 경우 추가 필드
        if provider == 'microsoft':
            normalized['department'] = user_info.get('department')
            normalized['job_title'] = user_info.get('jobTitle')
        
        return normalized
    
    def create_session(self, user_info):
        """
        사용자 세션 생성
        
        Args:
            user_info: 사용자 정보
            
        Returns:
            str: 세션 토큰
        """
        session_token = secrets.token_urlsafe(64)
        timeout_minutes = self.config.get('session_timeout_minutes', 480)
        expires_at = datetime.now() + timedelta(minutes=timeout_minutes)
        
        self.sessions[session_token] = {
            'user_info': user_info,
            'created_at': datetime.now().isoformat(),
            'expires_at': expires_at.isoformat(),
        }
        
        return session_token
    
    def validate_session(self, session_token):
        """
        세션 유효성 검증
        
        Args:
            session_token: 세션 토큰
            
        Returns:
            dict: 사용자 정보 (유효한 경우), None (무효한 경우)
        """
        if not session_token or session_token not in self.sessions:
            return None
        
        session = self.sessions[session_token]
        expires_at = datetime.fromisoformat(session['expires_at'])
        
        # 세션 만료 확인
        if datetime.now() > expires_at:
            del self.sessions[session_token]
            return None
        
        return session['user_info']
    
    def logout(self, session_token):
        """
        세션 종료
        
        Args:
            session_token: 세션 토큰
            
        Returns:
            bool: 성공 여부
        """
        if session_token in self.sessions:
            del self.sessions[session_token]
            return True
        return False
    
    def check_admin_permission(self, user_id, sso_admins_list):
        """
        사용자가 관리자 권한이 있는지 확인
        
        Args:
            user_id: 사용자 ID
            sso_admins_list: SSO 관리자 목록
            
        Returns:
            bool: 관리자 여부
        """
        for admin in sso_admins_list:
            if admin.get('userId') == user_id:
                return True
        return False


class SSOProviderPresets:
    """주요 SSO 제공자 프리셋"""
    
    @staticmethod
    def google(client_id, client_secret, redirect_uri):
        """Google OAuth 2.0 설정"""
        return {
            "provider": "google",
            "client_id": client_id,
            "client_secret": client_secret,
            "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "userinfo_endpoint": "https://www.googleapis.com/oauth2/v3/userinfo",
            "redirect_uri": redirect_uri,
            "scope": "openid profile email",
            "session_timeout_minutes": 480,
        }
    
    @staticmethod
    def microsoft(client_id, client_secret, redirect_uri, tenant_id="common"):
        """Microsoft Azure AD OAuth 2.0 설정"""
        return {
            "provider": "microsoft",
            "client_id": client_id,
            "client_secret": client_secret,
            "authorization_endpoint": f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize",
            "token_endpoint": f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
            "userinfo_endpoint": "https://graph.microsoft.com/v1.0/me",
            "redirect_uri": redirect_uri,
            "scope": "openid profile email User.Read",
            "session_timeout_minutes": 480,
        }
    
    @staticmethod
    def keycloak(realm_url, client_id, client_secret, redirect_uri):
        """Keycloak OAuth 2.0 설정"""
        return {
            "provider": "keycloak",
            "client_id": client_id,
            "client_secret": client_secret,
            "authorization_endpoint": f"{realm_url}/protocol/openid-connect/auth",
            "token_endpoint": f"{realm_url}/protocol/openid-connect/token",
            "userinfo_endpoint": f"{realm_url}/protocol/openid-connect/userinfo",
            "redirect_uri": redirect_uri,
            "scope": "openid profile email",
            "session_timeout_minutes": 480,
        }


# 사용 예시
if __name__ == "__main__":
    print("=== SSO 인증 모듈 테스트 ===\n")
    
    # SSO 인증 객체 생성
    sso = SSOAuth()
    
    print("1. SSO 설정 로드됨")
    print(f"   Provider: {sso.config.get('provider')}")
    print(f"   Client ID: {sso.config.get('client_id')[:20]}..." if sso.config.get('client_id') else "   Client ID: (미설정)")
    
    # 프리셋 사용 예시
    print("\n2. 주요 SSO 제공자 프리셋 사용 예시:")
    print("\n   # Google")
    print("   config = SSOProviderPresets.google(")
    print("       client_id='YOUR_CLIENT_ID',")
    print("       client_secret='YOUR_CLIENT_SECRET',")
    print("       redirect_uri='http://localhost:5000/api/auth/callback'")
    print("   )")
    
    print("\n   # Microsoft Azure AD")
    print("   config = SSOProviderPresets.microsoft(")
    print("       client_id='YOUR_CLIENT_ID',")
    print("       client_secret='YOUR_CLIENT_SECRET',")
    print("       redirect_uri='http://localhost:5000/api/auth/callback',")
    print("       tenant_id='YOUR_TENANT_ID'  # 또는 'common'")
    print("   )")
    
    print("\n   # Keycloak")
    print("   config = SSOProviderPresets.keycloak(")
    print("       realm_url='https://your-keycloak.com/auth/realms/your-realm',")
    print("       client_id='YOUR_CLIENT_ID',")
    print("       client_secret='YOUR_CLIENT_SECRET',")
    print("       redirect_uri='http://localhost:5000/api/auth/callback'")
    print("   )")
    
    print("\n3. sso_config.json 파일을 수정하여 SSO 설정을 완료하세요.")

