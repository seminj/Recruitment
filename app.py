"""
강의실 예약 시스템 백엔드 서버
Flask + JSON 파일 기반 저장소
SQL 없이 개인 PC에서 호스팅 가능
"""

from flask import Flask, request, jsonify, send_from_directory, redirect, make_response
from flask_cors import CORS
import os
import json
from datetime import datetime
from pathlib import Path
import threading
from sso_auth import SSOAuth

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)  # CORS 허용

# 데이터 저장 디렉토리
DATA_DIR = Path('data')
DATA_DIR.mkdir(exist_ok=True)

# 데이터 파일 경로
DATA_FILES = {
    'rooms': DATA_DIR / 'rooms.json',
    'reservations': DATA_DIR / 'reservations.json',
    'holidays': DATA_DIR / 'holidays.json',
    'admin_creds': DATA_DIR / 'admin_creds.json',
    'sso_admins': DATA_DIR / 'sso_admins.json',
}

# 파일 액세스 동기화를 위한 락
file_locks = {key: threading.Lock() for key in DATA_FILES.keys()}

# SSO 인증 객체 초기화
sso_auth = SSOAuth('sso_config.json')

def read_json_file(file_key):
    """JSON 파일 읽기"""
    file_path = DATA_FILES[file_key]
    with file_locks[file_key]:
        if not file_path.exists():
            return get_default_data(file_key)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"JSON 파싱 실패 [{file_key}]: 기본값 사용")
            return get_default_data(file_key)
        except Exception as e:
            print(f"파일 읽기 실패 [{file_key}]: {e}")
            return get_default_data(file_key)

def write_json_file(file_key, data):
    """JSON 파일 쓰기"""
    file_path = DATA_FILES[file_key]
    with file_locks[file_key]:
        try:
            # 임시 파일에 먼저 쓴 후 원자적으로 교체 (데이터 손실 방지)
            temp_path = file_path.with_suffix('.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            temp_path.replace(file_path)
            return True
        except Exception as e:
            print(f"파일 쓰기 실패 [{file_key}]: {e}")
            return False

def get_default_data(file_key):
    """기본 데이터 반환"""
    defaults = {
        'rooms': [],
        'reservations': [],
        'holidays': [],
        'admin_creds': {'id': 'admin', 'pw': '1234', 'updated_at': datetime.now().isoformat()},
        'sso_admins': [],
    }
    return defaults.get(file_key, [])

def init_data_files():
    """데이터 파일 초기화"""
    for file_key in DATA_FILES.keys():
        if not DATA_FILES[file_key].exists():
            write_json_file(file_key, get_default_data(file_key))
            print(f"초기화됨: {file_key}.json")
    print("데이터 파일 초기화 완료")

# ==================== Rooms API ====================

@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    """모든 회의실 조회"""
    try:
        rooms = read_json_file('rooms')
        return jsonify(rooms)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/rooms', methods=['POST'])
def create_room():
    """회의실 생성"""
    try:
        data = request.json
        rooms = read_json_file('rooms')
        
        new_room = {
            'id': data.get('id'),
            'name': data.get('name'),
            'seats': data.get('seats'),
            'computers': data.get('computers'),
            'equipment': data.get('equipment', ''),
            'note': data.get('note', ''),
            'category': data.get('category', ''),
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
        }
        
        rooms.append(new_room)
        
        if not write_json_file('rooms', rooms):
            return jsonify({'error': 'Failed to save'}), 500
        
        return jsonify({'id': new_room['id'], 'message': 'Created'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rooms/<id>', methods=['PUT'])
def update_room(id):
    """회의실 수정"""
    try:
        data = request.json
        rooms = read_json_file('rooms')
        
        room_index = next((i for i, r in enumerate(rooms) if r['id'] == id), None)
        if room_index is None:
            return jsonify({'error': 'Not found'}), 404
        
        rooms[room_index].update({
            'name': data.get('name'),
            'seats': data.get('seats'),
            'computers': data.get('computers'),
            'equipment': data.get('equipment', ''),
            'note': data.get('note', ''),
            'category': data.get('category', ''),
            'updated_at': datetime.now().isoformat(),
        })
        
        if not write_json_file('rooms', rooms):
            return jsonify({'error': 'Failed to save'}), 500
        
        return jsonify({'message': 'Updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rooms/<id>', methods=['DELETE'])
def delete_room(id):
    """회의실 삭제"""
    try:
        rooms = read_json_file('rooms')
        filtered = [r for r in rooms if r['id'] != id]
        
        if len(filtered) == len(rooms):
            return jsonify({'error': 'Not found'}), 404
        
        if not write_json_file('rooms', filtered):
            return jsonify({'error': 'Failed to save'}), 500
        
        return jsonify({'message': 'Deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rooms/batch', methods=['DELETE'])
def delete_rooms_batch():
    """회의실 일괄 삭제"""
    try:
        ids = request.json.get('ids', [])
        if not ids:
            return jsonify({'error': 'No IDs'}), 400
        
        rooms = read_json_file('rooms')
        filtered = [r for r in rooms if r['id'] not in ids]
        
        if not write_json_file('rooms', filtered):
            return jsonify({'error': 'Failed to save'}), 500
        
        return jsonify({'message': f'{len(rooms) - len(filtered)} deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rooms/batch', methods=['PUT'])
def update_rooms_batch():
    """회의실 일괄 수정 (순서 포함)"""
    try:
        updates = request.json.get('rooms', [])
        if not updates:
            return jsonify({'error': 'No rooms provided'}), 400
        
        # 전체 교체 방식 (순서 유지)
        rooms = []
        for update_data in updates:
            room = {
                'id': update_data.get('id'),
                'name': update_data.get('name'),
                'seats': update_data.get('seats'),
                'computers': update_data.get('computers'),
                'equipment': update_data.get('equipment', ''),
                'note': update_data.get('note', ''),
                'category': update_data.get('category', ''),
                'created_at': update_data.get('created_at', datetime.now().isoformat()),
                'updated_at': datetime.now().isoformat(),
            }
            rooms.append(room)
        
        if not write_json_file('rooms', rooms):
            return jsonify({'error': 'Failed to save'}), 500
        
        return jsonify({'message': f'{len(updates)} rooms updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rooms/batch', methods=['POST'])
def create_rooms_batch():
    """회의실 일괄 생성"""
    try:
        new_rooms = request.json.get('rooms', [])
        if not new_rooms:
            return jsonify({'error': 'No rooms provided'}), 400
        
        rooms = read_json_file('rooms')
        
        for room_data in new_rooms:
            new_room = {
                'id': room_data.get('id'),
                'name': room_data.get('name'),
                'seats': room_data.get('seats'),
                'computers': room_data.get('computers'),
                'equipment': room_data.get('equipment', ''),
                'note': room_data.get('note', ''),
                'category': room_data.get('category', ''),
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
            }
            rooms.append(new_room)
        
        if not write_json_file('rooms', rooms):
            return jsonify({'error': 'Failed to save'}), 500
        
        return jsonify({'message': f'{len(new_rooms)} rooms created'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== Reservations API ====================

@app.route('/api/reservations', methods=['GET'])
def get_reservations():
    """모든 예약 조회"""
    try:
        return jsonify(read_json_file('reservations'))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/reservations', methods=['POST'])
def create_reservation():
    """예약 생성"""
    try:
        data = request.json
        reservations = read_json_file('reservations')
        
        new_reservation = {
            'id': data.get('id'),
            'seriesId': data.get('seriesId'),
            'room': data.get('room'),
            'headcount': data.get('headcount'),
            'start': data.get('start'),
            'end': data.get('end'),
            'repeat': data.get('repeat'),
            'repeatWeeklyDays': data.get('repeatWeeklyDays', []),
            'repeatMonthlyDay': data.get('repeatMonthlyDay'),
            'title': data.get('title'),
            'instructor': data.get('instructor'),
            'note': data.get('note', ''),
            'color': data.get('color', '#2f54eb'),
            'pattern': data.get('pattern', 'none'),
            'seats': data.get('seats'),
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
        }
        
        reservations.append(new_reservation)
        
        if not write_json_file('reservations', reservations):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'id': data.get('id'), 'message': 'Reservation created'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reservations/batch', methods=['POST'])
def create_reservations_batch():
    """예약 일괄 생성"""
    try:
        data = request.json
        new_reservations = data.get('reservations', [])
        
        if not new_reservations:
            return jsonify({'error': 'No reservations provided'}), 400
        
        reservations = read_json_file('reservations')
        
        for resv_data in new_reservations:
            new_reservation = {
                'id': resv_data.get('id'),
                'seriesId': resv_data.get('seriesId'),
                'room': resv_data.get('room'),
                'headcount': resv_data.get('headcount'),
                'start': resv_data.get('start'),
                'end': resv_data.get('end'),
                'repeat': resv_data.get('repeat'),
                'repeatWeeklyDays': resv_data.get('repeatWeeklyDays', []),
                'repeatMonthlyDay': resv_data.get('repeatMonthlyDay'),
                'title': resv_data.get('title'),
                'instructor': resv_data.get('instructor'),
                'note': resv_data.get('note', ''),
                'color': resv_data.get('color', '#2f54eb'),
                'pattern': resv_data.get('pattern', 'none'),
                'seats': resv_data.get('seats'),
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
            }
            reservations.append(new_reservation)
        
        if not write_json_file('reservations', reservations):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'message': f'{len(new_reservations)} reservations created'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reservations/<id>', methods=['PUT'])
def update_reservation(id):
    """예약 수정"""
    try:
        data = request.json
        reservations = read_json_file('reservations')
        
        resv_index = next((i for i, r in enumerate(reservations) if r['id'] == id), None)
        
        if resv_index is None:
            return jsonify({'error': 'Reservation not found'}), 404
        
        # 예약 업데이트
        reservations[resv_index].update({
            'room': data.get('room'),
            'headcount': data.get('headcount'),
            'start': data.get('start'),
            'end': data.get('end'),
            'title': data.get('title'),
            'instructor': data.get('instructor'),
            'note': data.get('note', ''),
            'color': data.get('color', '#2f54eb'),
            'pattern': data.get('pattern', 'none'),
            'seats': data.get('seats'),
            'updated_at': datetime.now().isoformat(),
        })
        
        if not write_json_file('reservations', reservations):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'message': 'Reservation updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reservations/<id>', methods=['DELETE'])
def delete_reservation(id):
    """예약 삭제"""
    try:
        reservations = read_json_file('reservations')
        original_length = len(reservations)
        reservations = [r for r in reservations if r['id'] != id]
        
        if len(reservations) == original_length:
            return jsonify({'error': 'Reservation not found'}), 404
        
        if not write_json_file('reservations', reservations):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'message': 'Reservation deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== Holidays API ====================

@app.route('/api/holidays', methods=['GET'])
def get_holidays():
    """모든 공휴일 조회"""
    try:
        holidays = read_json_file('holidays')
        return jsonify(holidays)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/holidays', methods=['POST'])
def create_holiday():
    """공휴일 추가"""
    try:
        data = request.json
        date = data.get('date')
        
        if not date:
            return jsonify({'error': 'Date is required'}), 400
        
        holidays = read_json_file('holidays')
        
        if date in holidays:
            return jsonify({'error': 'Holiday already exists'}), 409
        
        holidays.append(date)
        holidays.sort()
        
        if not write_json_file('holidays', holidays):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'message': 'Holiday created'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/holidays/<date>', methods=['DELETE'])
def delete_holiday(date):
    """공휴일 삭제"""
    try:
        holidays = read_json_file('holidays')
        
        if date not in holidays:
            return jsonify({'error': 'Holiday not found'}), 404
        
        holidays.remove(date)
        
        if not write_json_file('holidays', holidays):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'message': 'Holiday deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== Admin Credentials API ====================

@app.route('/api/admin/creds', methods=['GET'])
def get_creds():
    """관리자 인증 정보 조회"""
    try:
        creds = read_json_file('admin_creds')
        return jsonify({'id': creds.get('id', 'admin'), 'pw': creds.get('pw', '1234')})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/creds', methods=['PUT'])
def update_creds():
    """관리자 인증 정보 수정"""
    try:
        data = request.json
        creds = {
            'id': data.get('id'),
            'pw': data.get('pw'),
            'updated_at': datetime.now().isoformat(),
        }
        
        if not write_json_file('admin_creds', creds):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'message': 'Credentials updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== SSO Authentication API ====================

@app.route('/api/auth/login', methods=['GET'])
def sso_login():
    """SSO 로그인 시작 (OAuth 인증 페이지로 리다이렉트)"""
    try:
        # CSRF 방지를 위한 state 생성
        authorization_url, state = sso_auth.get_authorization_url()
        
        # state를 세션이나 쿠키에 저장 (콜백에서 검증용)
        response = make_response(redirect(authorization_url))
        response.set_cookie('oauth_state', state, httponly=True, samesite='Lax')
        
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/callback', methods=['GET'])
def sso_callback():
    """SSO 콜백 (OAuth 인증 후 리다이렉트 URL)"""
    try:
        # 인증 코드와 state 가져오기
        code = request.args.get('code')
        state = request.args.get('state')
        stored_state = request.cookies.get('oauth_state')
        
        # 에러 처리
        error = request.args.get('error')
        if error:
            error_description = request.args.get('error_description', 'SSO 인증 실패')
            return jsonify({'error': error_description}), 400
        
        if not code:
            return jsonify({'error': '인증 코드가 없습니다'}), 400
        
        # CSRF 공격 방지: state 검증
        if state != stored_state:
            return jsonify({'error': 'Invalid state parameter'}), 400
        
        # 인증 코드를 액세스 토큰으로 교환
        token_data = sso_auth.exchange_code_for_token(code)
        access_token = token_data.get('access_token')
        
        if not access_token:
            return jsonify({'error': '액세스 토큰을 가져올 수 없습니다'}), 500
        
        # 사용자 정보 조회
        user_info = sso_auth.get_user_info(access_token)
        
        # SSO 관리자 목록 조회
        sso_admins = read_json_file('sso_admins')
        
        # 관리자 권한 확인
        is_admin = sso_auth.check_admin_permission(user_info['user_id'], sso_admins)
        
        if not is_admin:
            return jsonify({
                'error': '접근 권한이 없습니다',
                'message': '관리자 목록에 등록되지 않은 사용자입니다',
                'user_info': {
                    'name': user_info.get('name'),
                    'email': user_info.get('email'),
                }
            }), 403
        
        # 세션 생성
        session_token = sso_auth.create_session(user_info)
        
        # 세션 토큰을 쿠키에 저장하고 관리자 페이지로 리다이렉트
        response = make_response(redirect('/admin.html?sso=success'))
        response.set_cookie('session_token', session_token, httponly=True, samesite='Lax')
        response.delete_cookie('oauth_state')  # state 쿠키 삭제
        
        return response
    except Exception as e:
        print(f"SSO 콜백 오류: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/session', methods=['GET'])
def check_session():
    """현재 세션 확인"""
    try:
        session_token = request.cookies.get('session_token')
        
        if not session_token:
            return jsonify({'authenticated': False, 'message': '세션이 없습니다'}), 401
        
        user_info = sso_auth.validate_session(session_token)
        
        if not user_info:
            return jsonify({'authenticated': False, 'message': '세션이 만료되었습니다'}), 401
        
        # SSO 관리자 정보 조회
        sso_admins = read_json_file('sso_admins')
        admin_info = next((a for a in sso_admins if a['userId'] == user_info['user_id']), None)
        
        return jsonify({
            'authenticated': True,
            'user': {
                'user_id': user_info.get('user_id'),
                'name': user_info.get('name'),
                'email': user_info.get('email'),
                'department': user_info.get('department'),
                'admin_note': admin_info.get('note') if admin_info else None,
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/logout', methods=['POST'])
def sso_logout():
    """SSO 로그아웃"""
    try:
        session_token = request.cookies.get('session_token')
        
        if session_token:
            sso_auth.logout(session_token)
        
        response = make_response(jsonify({'message': '로그아웃 되었습니다'}))
        response.delete_cookie('session_token')
        
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== SSO Admins API ====================

@app.route('/api/admin/sso', methods=['GET'])
def get_sso_admins():
    """SSO 관리자 목록 조회"""
    try:
        sso_admins = read_json_file('sso_admins')
        return jsonify(sso_admins)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/sso', methods=['POST'])
def create_sso_admin():
    """SSO 관리자 추가"""
    try:
        data = request.json
        sso_admins = read_json_file('sso_admins')
        
        new_admin = {
            'id': data.get('id'),
            'userId': data.get('userId'),
            'userName': data.get('userName'),
            'dept': data.get('dept'),
            'note': data.get('note'),
            'registered_at': datetime.now().isoformat(),
        }
        
        sso_admins.append(new_admin)
        
        if not write_json_file('sso_admins', sso_admins):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'id': data.get('id'), 'message': 'SSO admin created'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/sso/<id>', methods=['DELETE'])
def delete_sso_admin(id):
    """SSO 관리자 삭제"""
    try:
        sso_admins = read_json_file('sso_admins')
        original_length = len(sso_admins)
        sso_admins = [a for a in sso_admins if a['id'] != id]
        
        if len(sso_admins) == original_length:
            return jsonify({'error': 'SSO admin not found'}), 404
        
        if not write_json_file('sso_admins', sso_admins):
            return jsonify({'error': 'Failed to save data'}), 500
        
        return jsonify({'message': 'SSO admin deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== Backup API ====================

@app.route('/api/backup/export', methods=['GET'])
def export_backup():
    """백업 데이터 내보내기"""
    try:
        backup_data = {
            'rooms': read_json_file('rooms'),
            'reservations': read_json_file('reservations'),
            'holidays': read_json_file('holidays'),
            'creds': read_json_file('admin_creds'),
            'ssoAdmins': read_json_file('sso_admins'),
            'exportedAt': datetime.now().isoformat(),
        }
        return jsonify(backup_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/backup/import', methods=['POST'])
def import_backup():
    """백업 데이터 가져오기"""
    try:
        data = request.json
        
        # Rooms 복원
        if 'rooms' in data:
            rooms = read_json_file('rooms')
            for room in data['rooms']:
                # 기존 항목 찾기
                existing_index = next((i for i, r in enumerate(rooms) if r['id'] == room['id']), None)
                if existing_index is not None:
                    # 업데이트
                    rooms[existing_index] = room
                    rooms[existing_index]['updated_at'] = datetime.now().isoformat()
                else:
                    # 새로 추가
                    rooms.append(room)
            write_json_file('rooms', rooms)
        
        # Reservations 복원
        if 'reservations' in data:
            reservations = read_json_file('reservations')
            for resv in data['reservations']:
                existing_index = next((i for i, r in enumerate(reservations) if r['id'] == resv['id']), None)
                if existing_index is not None:
                    reservations[existing_index] = resv
                    reservations[existing_index]['updated_at'] = datetime.now().isoformat()
                else:
                    reservations.append(resv)
            write_json_file('reservations', reservations)
        
        # Holidays 복원
        if 'holidays' in data:
            holidays = read_json_file('holidays')
            for date in data['holidays']:
                if date not in holidays:
                    holidays.append(date)
            holidays.sort()
            write_json_file('holidays', holidays)
        
        # Creds 복원
        if 'creds' in data:
            write_json_file('admin_creds', data['creds'])
        
        # SSO Admins 복원
        if 'ssoAdmins' in data:
            sso_admins = read_json_file('sso_admins')
            for admin in data['ssoAdmins']:
                existing_index = next((i for i, a in enumerate(sso_admins) if a['id'] == admin['id']), None)
                if existing_index is None:
                    sso_admins.append(admin)
            write_json_file('sso_admins', sso_admins)
        
        return jsonify({'message': 'Backup imported successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== Static Files ====================

@app.route('/')
def index():
    """메인 페이지"""
    return send_from_directory('.', 'status.html')

@app.route('/admin.html')
def admin():
    """관리자 페이지"""
    return send_from_directory('.', 'admin.html')

if __name__ == '__main__':
    # 데이터 파일 초기화
    print("=" * 50)
    print("강의실 예약 시스템 - JSON 기반 파일 저장소")
    print("=" * 50)
    init_data_files()
    
    # 서버 실행
    print("\n서버 시작...")
    print("주소: http://localhost:5000")
    print("관리자 페이지: http://localhost:5000/admin.html")
    print("\n종료하려면 Ctrl+C를 누르세요.\n")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
