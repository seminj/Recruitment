/**
 * API 통신 모듈
 * 모든 데이터는 서버 API를 통해 저장/로드됩니다.
 */

const API_BASE_URL = '/api'; // 서버 API 기본 URL (필요에 따라 수정)

/**
 * API 요청 헬퍼 함수
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`API 요청 실패 [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * Rooms API
 */
const RoomsAPI = {
  async getAll() {
    return await apiRequest('/rooms');
  },

  async create(room) {
    return await apiRequest('/rooms', {
      method: 'POST',
      body: room,
    });
  },

  async update(id, room) {
    return await apiRequest(`/rooms/${id}`, {
      method: 'PUT',
      body: room,
    });
  },

  async delete(id) {
    return await apiRequest(`/rooms/${id}`, {
      method: 'DELETE',
    });
  },

  async deleteMultiple(ids) {
    return await apiRequest('/rooms/batch', {
      method: 'DELETE',
      body: { ids },
    });
  },

  async updateMultiple(rooms) {
    return await apiRequest('/rooms/batch', {
      method: 'PUT',
      body: { rooms },
    });
  },

  async createMultiple(rooms) {
    return await apiRequest('/rooms/batch', {
      method: 'POST',
      body: { rooms },
    });
  },
};

/**
 * Reservations API
 */
const ReservationsAPI = {
  async getAll() {
    return await apiRequest('/reservations');
  },

  async create(reservation) {
    return await apiRequest('/reservations', {
      method: 'POST',
      body: reservation,
    });
  },

  async createMultiple(reservations) {
    return await apiRequest('/reservations/batch', {
      method: 'POST',
      body: { reservations },
    });
  },

  async update(id, reservation) {
    return await apiRequest(`/reservations/${id}`, {
      method: 'PUT',
      body: reservation,
    });
  },

  async delete(id) {
    return await apiRequest(`/reservations/${id}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Holidays API
 */
const HolidaysAPI = {
  async getAll() {
    return await apiRequest('/holidays');
  },

  async create(date) {
    return await apiRequest('/holidays', {
      method: 'POST',
      body: { date },
    });
  },

  async delete(date) {
    return await apiRequest(`/holidays/${date}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Admin Credentials API
 */
const CredsAPI = {
  async get() {
    return await apiRequest('/admin/creds');
  },

  async update(creds) {
    return await apiRequest('/admin/creds', {
      method: 'PUT',
      body: creds,
    });
  },
};

/**
 * SSO Admins API
 */
const SsoAdminsAPI = {
  async getAll() {
    return await apiRequest('/admin/sso');
  },

  async create(admin) {
    return await apiRequest('/admin/sso', {
      method: 'POST',
      body: admin,
    });
  },

  async delete(id) {
    return await apiRequest(`/admin/sso/${id}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Export/Import API
 */
const BackupAPI = {
  async export() {
    return await apiRequest('/backup/export');
  },

  async import(data) {
    return await apiRequest('/backup/import', {
      method: 'POST',
      body: data,
    });
  },
};

