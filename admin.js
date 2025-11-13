(function () {
  const ACTIVE_TAB_KEY = "room_admin_active_tab";

  const DAY_LABELS = [
    { label: "월", value: 1 },
    { label: "화", value: 2 },
    { label: "수", value: 3 },
    { label: "목", value: 4 },
    { label: "금", value: 5 },
    { label: "토", value: 6 },
    { label: "일", value: 0 },
  ];
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  const CATEGORY_IDS = new Set(["all", "cat1", "cat2", "cat3"]);

  const dom = {};
  let editingRoomId = null;
  let editingReservationId = null;
  let activeReservationChip = null;
  let activeReservationCategory = "all";

  const state = Object.seal({
    rooms: null,
    reservations: null,
    holidays: null,
    creds: null,
    colorLabels: null,
  });

  const DEFAULT_COLOR_LABELS = [
    { color: "#2f54eb", label: "파란색" },
    { color: "#52c41a", label: "녹색" },
    { color: "#faad14", label: "노란색" },
    { color: "#f5222d", label: "빨간색" },
    { color: "#eb2f96", label: "분홍색" },
    { color: "#722ed1", label: "보라색" },
    { color: "#fa8c16", label: "주황색" },
    { color: "#13c2c2", label: "청록색" },
    { color: "#1890ff", label: "하늘색" },
    { color: "#a0d911", label: "연두색" },
    { color: "#ff4d4f", label: "진홍색" },
    { color: "#fadb14", label: "레몬색" },
    { color: "#2fc25b", label: "민트색" },
    { color: "#b37feb", label: "연보라색" },
    { color: "#ffa940", label: "밝은 주황" },
    { color: "#36cfc9", label: "아쿠아색" },
    { color: "#ff85c0", label: "핑크색" },
    { color: "#9254de", label: "진보라색" },
    { color: "#40a9ff", label: "밝은 청색" },
    { color: "#73d13d", label: "라임색" },
    { color: "#597ef7", label: "인디고색" },
    { color: "#95de64", label: "연한 녹색" },
    { color: "#ff9c6e", label: "코랄색" },
    { color: "#d3adf7", label: "라벤더색" }
  ];

  function freezeRooms(rooms) {
    return Object.freeze(
      rooms.map((room) =>
        Object.freeze({
          ...room,
        })
      )
    );
  }

  function freezeReservations(reservations) {
    return Object.freeze(
      reservations.map((reservation) =>
        Object.freeze({
          ...reservation,
          repeatWeeklyDays: Array.isArray(reservation.repeatWeeklyDays)
            ? Object.freeze([...reservation.repeatWeeklyDays])
            : reservation.repeatWeeklyDays ?? [],
        })
      )
    );
  }

  function freezeHolidays(holidays) {
    return Object.freeze([...holidays]);
  }

  function freezeCreds(creds) {
    return Object.freeze({
      ...creds,
    });
  }

  const reservationTimeCache = {
    start: new WeakMap(),
    end: new WeakMap(),
  };

  function getReservationStartTime(reservation) {
    if (!reservation || typeof reservation !== "object") return Number.NaN;
    if (reservationTimeCache.start.has(reservation)) {
      return reservationTimeCache.start.get(reservation);
    }
    const value = new Date(reservation.start).getTime();
    reservationTimeCache.start.set(reservation, value);
    return value;
  }

  function getReservationEndTime(reservation) {
    if (!reservation || typeof reservation !== "object") return Number.NaN;
    if (reservationTimeCache.end.has(reservation)) {
      return reservationTimeCache.end.get(reservation);
    }
    const value = new Date(reservation.end).getTime();
    reservationTimeCache.end.set(reservation, value);
    return value;
  }

  function clearReservationTimeCache() {
    reservationTimeCache.start = new WeakMap();
    reservationTimeCache.end = new WeakMap();
  }

  const ROOM_FIELD_DEFAULTS = Object.freeze({
    seats: null,
    computers: null,
    equipment: "",
    note: "",
    category: "",
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureDefaults();
      cacheDom();
      setupRepeatControls();
      bindEvents();
      await showAdmin();
      restoreActiveTab();
    } catch (error) {
      console.error("초기화 실패:", error);
      alert("데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.");
    }
  });

  function createDefaultRoom(name) {
    return {
      id: generateUid(),
      name,
      seats: ROOM_FIELD_DEFAULTS.seats,
      computers: ROOM_FIELD_DEFAULTS.computers,
      equipment: ROOM_FIELD_DEFAULTS.equipment,
      note: ROOM_FIELD_DEFAULTS.note,
      category: ROOM_FIELD_DEFAULTS.category,
    };
  }

  function sanitizeRoomNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) return null;
      return Math.round(value);
    }
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed);
  }

  function roomNumbersEqual(original, normalized) {
    if (normalized === null) {
      return (
        original === null ||
        original === undefined ||
        (typeof original === "string" && original.trim() === "")
      );
    }
    if (typeof original === "number") {
      return Number.isFinite(original) && Math.round(original) === normalized;
    }
    const parsed = Number(original);
    if (!Number.isFinite(parsed)) return false;
    return Math.round(parsed) === normalized;
  }

  function normalizeRoomEntry(entry, index) {
    if (!entry) return null;
    if (typeof entry === "string") {
      return { value: createDefaultRoom(entry), changed: true };
    }
    if (typeof entry !== "object") {
      return null;
    }
    const normalized = {
      id:
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : generateUid(),
      name:
        typeof entry.name === "string" && entry.name.trim()
          ? entry.name.trim()
          : typeof entry.title === "string" && entry.title.trim()
          ? entry.title.trim()
          : `회의실${index + 1}`,
      seats: sanitizeRoomNumber(entry.seats),
      computers: sanitizeRoomNumber(entry.computers),
      equipment:
        typeof entry.equipment === "string"
          ? entry.equipment.trim()
          : ROOM_FIELD_DEFAULTS.equipment,
      note:
        typeof entry.note === "string"
          ? entry.note.trim()
          : ROOM_FIELD_DEFAULTS.note,
      category:
        typeof entry.category === "string"
          ? entry.category.trim()
          : ROOM_FIELD_DEFAULTS.category,
    };

    const changed =
      entry.id !== normalized.id ||
      entry.name !== normalized.name ||
      !roomNumbersEqual(entry.seats, normalized.seats) ||
      !roomNumbersEqual(entry.computers, normalized.computers) ||
      (typeof entry.equipment !== "string"
        ? normalized.equipment !== ROOM_FIELD_DEFAULTS.equipment
        : entry.equipment.trim() !== normalized.equipment) ||
      (typeof entry.note !== "string"
        ? normalized.note !== ROOM_FIELD_DEFAULTS.note
        : entry.note.trim() !== normalized.note) ||
      (typeof entry.category !== "string"
        ? normalized.category !== ROOM_FIELD_DEFAULTS.category
        : entry.category.trim() !== normalized.category);

    return { value: normalized, changed };
  }

  function normalizeRooms(rawRooms) {
    if (!Array.isArray(rawRooms)) {
      return { rooms: [], changed: true };
    }
    const normalized = [];
    let changed = false;
    rawRooms.forEach((entry, index) => {
      const result = normalizeRoomEntry(entry, index);
      if (!result) {
        changed = true;
        return;
      }
      normalized.push(result.value);
      if (result.changed) {
        changed = true;
      }
    });
    return { rooms: normalized, changed };
  }

  function normalizeHolidays(rawHolidays) {
    if (!Array.isArray(rawHolidays)) {
      return { holidays: [], changed: true };
    }
    const unique = [];
    const seen = new Set();
    rawHolidays.forEach((item) => {
      if (typeof item !== "string") return;
      const trimmed = item.trim();
      if (!trimmed) return;
      if (seen.has(trimmed)) return;
      seen.add(trimmed);
      unique.push(trimmed);
    });
    unique.sort();
    const changed =
      unique.length !== rawHolidays.length ||
      unique.some((value, index) => value !== rawHolidays[index]);
    return { holidays: unique, changed };
  }

  function normalizeCreds(rawCreds) {
    const fallback = { id: "admin", pw: "1234" };
    if (!rawCreds || typeof rawCreds !== "object") {
      return { creds: fallback, changed: true };
    }
    const id =
      typeof rawCreds.id === "string" && rawCreds.id.trim()
        ? rawCreds.id.trim()
        : fallback.id;
    const pw =
      typeof rawCreds.pw === "string" && rawCreds.pw.length > 0
        ? rawCreds.pw
        : fallback.pw;
    const normalized = { id, pw };
    const changed =
      rawCreds.id !== normalized.id || rawCreds.pw !== normalized.pw;
    return { creds: normalized, changed };
  }

  function parseRoomNumberInput(raw, label) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
      return { value: null };
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert(`${label}은 0 이상의 숫자로 입력하세요.`);
      return { error: true };
    }
    return { value: Math.round(parsed) };
  }

  function cacheDom() {
    dom.tabsContainer = document.getElementById("tabs-wrap");
    dom.tabNavButtons = [
      ...dom.tabsContainer.querySelectorAll(".tab-nav button"),
    ];
    dom.tabPanels = [
      ...dom.tabsContainer.querySelectorAll(".tab-panel"),
    ];

    dom.reservationModal = document.getElementById("reservationModal");
    dom.modalTitle = document.getElementById("modalTitle");
    dom.modalCloseBtn = document.getElementById("modalCloseBtn");
    dom.modalCancelBtn = document.getElementById("modalCancelBtn");
    dom.newReservationBtn = document.getElementById("newReservationBtn");
    dom.reservationForm = document.getElementById("reservationForm");
    dom.roomChipContainer = document.getElementById("roomChipContainer");
    dom.reservationHeadcount = document.getElementById("reservationHeadcount");
    dom.reservationStartDate = document.getElementById("reservationStartDate");
    dom.reservationStartTime = document.getElementById("reservationStartTime");
    dom.reservationStart = document.getElementById("reservationStart");
    dom.reservationEndDate = document.getElementById("reservationEndDate");
    dom.reservationEndTime = document.getElementById("reservationEndTime");
    dom.reservationEnd = document.getElementById("reservationEnd");
    dom.reservationRepeat = document.getElementById("reservationRepeat");
    dom.repeatWeeklyWrap = document.getElementById("repeatWeeklyDays");
    dom.repeatMonthlyDay = document.getElementById("repeatMonthlyDay");
    dom.repeatUntilDate = document.getElementById("repeatUntilDate");
    dom.reservationTitle = document.getElementById("reservationTitle");
    dom.reservationInstructor = document.getElementById("reservationInstructor");
    dom.reservationNote = document.getElementById("reservationNote");
    dom.reservationColor = document.getElementById("reservationColor");
    dom.colorPickerContainer = document.getElementById("colorPickerContainer");
    dom.reservationPattern = document.getElementById("reservationPattern");
    dom.reservationRangeStart = document.getElementById("reservationRangeStart");
    dom.reservationRangeEnd = document.getElementById("reservationRangeEnd");
    dom.reservationRangeApply = document.getElementById("reservationRangeApply");
    dom.reservationRangeWeek = document.getElementById("reservationRangeWeek");
    dom.reservationRangeMonth = document.getElementById("reservationRangeMonth");
    dom.reservationRange3Months = document.getElementById("reservationRange3Months");
    dom.reservationRange6Months = document.getElementById("reservationRange6Months");
    dom.reservationRangeToday = document.getElementById("reservationRangeToday");
    dom.reservationTable = document.getElementById("reservationTable");
    dom.reservationTableHead = dom.reservationTable.querySelector("thead");
    dom.reservationTableBody = dom.reservationTable.querySelector("tbody");
    dom.reservationSubmitBtn = document.getElementById("reservationSubmitBtn");

    dom.holidayForm = document.getElementById("holidayForm");
    dom.holidayDate = document.getElementById("holidayDate");
    dom.holidayList = document.getElementById("holidayList");

    dom.roomTable = document.getElementById("roomTable");
    dom.roomTableBody = document.getElementById("roomTableBody");
    dom.selectAllRooms = document.getElementById("selectAllRooms");
    dom.deleteSelectedRoomsBtn = document.getElementById("deleteSelectedRoomsBtn");
    dom.addNewRoomRowBtn = document.getElementById("addNewRoomRowBtn");
    dom.saveAllRoomsBtn = document.getElementById("saveAllRoomsBtn");

    dom.exportJsonBtn = document.getElementById("exportJsonBtn");
    dom.importJsonInput = document.getElementById("importJsonInput");
    dom.colorLabelList = document.getElementById("colorLabelList");

    dom.adminCategoryToggle = document.getElementById("adminCategoryToggle");
    dom.adminCategoryButtons = dom.adminCategoryToggle
      ? [...dom.adminCategoryToggle.querySelectorAll("button")]
      : [];

    dom.ssoForm = document.getElementById("ssoForm");
    dom.ssoUserId = document.getElementById("ssoUserId");
    dom.ssoUserName = document.getElementById("ssoUserName");
    dom.ssoUserDept = document.getElementById("ssoUserDept");
    dom.ssoUserNote = document.getElementById("ssoUserNote");
    dom.ssoAdminList = document.getElementById("ssoAdminList");
  }

  function bindEvents() {
    dom.tabNavButtons.forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    if (dom.newReservationBtn) {
      dom.newReservationBtn.addEventListener("click", () => openReservationModal());
    }
    if (dom.modalCloseBtn) {
      dom.modalCloseBtn.addEventListener("click", () => closeReservationModal());
    }
    if (dom.modalCancelBtn) {
      dom.modalCancelBtn.addEventListener("click", () => closeReservationModal());
    }
    if (dom.reservationModal) {
      const overlay = dom.reservationModal.querySelector(".modal-overlay");
      if (overlay) {
        overlay.addEventListener("click", (e) => {
          e.stopPropagation();
          closeReservationModal();
        });
      }
    }

    if (dom.reservationForm) {
      dom.reservationForm.addEventListener("submit", onReservationSubmit);
    }
    if (dom.reservationRepeat) {
      dom.reservationRepeat.addEventListener("change", handleRepeatMode);
    }
    if (dom.reservationStartDate) {
      dom.reservationStartDate.addEventListener("change", handleRepeatMode);
    }
    if (dom.reservationStartTime) {
      dom.reservationStartTime.addEventListener("change", handleRepeatMode);
    }
    if (dom.reservationRangeApply) {
      dom.reservationRangeApply.addEventListener(
        "click",
        handleReservationRangeApply
      );
    }
    if (dom.reservationRangeWeek) {
      dom.reservationRangeWeek.addEventListener(
        "click",
        () => handleReservationRangePeriod(7)
      );
    }
    if (dom.reservationRangeMonth) {
      dom.reservationRangeMonth.addEventListener(
        "click",
        () => handleReservationRangePeriodMonth(1)
      );
    }
    if (dom.reservationRange3Months) {
      dom.reservationRange3Months.addEventListener(
        "click",
        () => handleReservationRangePeriodMonth(3)
      );
    }
    if (dom.reservationRange6Months) {
      dom.reservationRange6Months.addEventListener(
        "click",
        () => handleReservationRangePeriodMonth(6)
      );
    }
    if (dom.reservationRangeToday) {
      dom.reservationRangeToday.addEventListener(
        "click",
        handleReservationRangeToday
      );
    }

    dom.holidayForm.addEventListener("submit", onHolidaySubmit);
    
    if (dom.selectAllRooms) {
      dom.selectAllRooms.addEventListener("change", handleSelectAllRooms);
    }
    if (dom.deleteSelectedRoomsBtn) {
      dom.deleteSelectedRoomsBtn.addEventListener("click", handleDeleteSelectedRooms);
    }
    if (dom.addNewRoomRowBtn) {
      dom.addNewRoomRowBtn.addEventListener("click", handleAddNewRoomRow);
    }
    if (dom.saveAllRoomsBtn) {
      dom.saveAllRoomsBtn.addEventListener("click", handleSaveAllRooms);
    }

    if (dom.ssoForm) {
      dom.ssoForm.addEventListener("submit", onSsoSubmit);
    }

    dom.exportJsonBtn.addEventListener("click", exportJson);
    dom.importJsonInput.addEventListener("change", importJson);

    if (dom.adminCategoryButtons.length > 0) {
      dom.adminCategoryButtons.forEach((button) => {
        button.addEventListener("click", async () => {
          await setActiveReservationCategory(button.dataset.category);
        });
      });
    }
  }

  function setupRepeatControls() {
    const fragment = document.createDocumentFragment();
    DAY_LABELS.forEach(({ label, value }) => {
      const id = `repeat-day-${value}`;
      const wrapper = document.createElement("label");
      wrapper.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = String(value);
      wrapper.append(checkbox, document.createTextNode(label));
      fragment.appendChild(wrapper);
    });
    dom.repeatWeeklyWrap.appendChild(fragment);

    // 매월 반복 일자 드롭다운 초기화
    if (dom.repeatMonthlyDay) {
      const select = dom.repeatMonthlyDay;
      select.innerHTML = '<option value="">선택하세요</option>';
      for (let i = 1; i <= 31; i++) {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = String(i);
        select.appendChild(option);
      }
    }

    // 시작 시간 드롭다운 초기화 (07:00-22:00, 30분 단위)
    if (dom.reservationStartTime) {
      const select = dom.reservationStartTime;
      select.innerHTML = '<option value="">시간 선택</option>';
      for (let hour = 7; hour <= 22; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const option = document.createElement("option");
          const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          option.value = timeStr;
          option.textContent = timeStr;
          select.appendChild(option);
        }
      }
    }

    // 종료 시간 드롭다운 초기화 (07:00-22:00, 30분 단위)
    if (dom.reservationEndTime) {
      const select = dom.reservationEndTime;
      select.innerHTML = '<option value="">시간 선택</option>';
      for (let hour = 7; hour <= 22; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const option = document.createElement("option");
          const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          option.value = timeStr;
          option.textContent = timeStr;
          select.appendChild(option);
        }
      }
    }

    // 시작일시 업데이트 함수
    function updateStartDateTime() {
      if (!dom.reservationStartDate || !dom.reservationStartTime || !dom.reservationStart) return;
      const date = dom.reservationStartDate.value;
      const time = dom.reservationStartTime.value;
      if (date && time) {
        dom.reservationStart.value = `${date}T${time}`;
      } else {
        dom.reservationStart.value = "";
      }

      // 시작일시 날짜가 변경되면 종료일시도 동일한 날짜로 설정
      if (date && dom.reservationEndDate) {
        dom.reservationEndDate.value = date;
        if (dom.reservationEndTime && dom.reservationEndTime.value) {
          // 종료일시 시간이 이미 설정되어 있으면 업데이트
          updateEndDateTime();
        }
      }

      // 시작일시 시간이 변경되면 종료일시 시간을 +1시간으로 설정
      if (time) {
        // 종료일시 날짜가 없으면 시작일시 날짜 사용
        if (dom.reservationEndDate && !dom.reservationEndDate.value && date) {
          dom.reservationEndDate.value = date;
        }
        
        if (dom.reservationEndDate && dom.reservationEndDate.value) {
          const [hours, minutes] = time.split(":").map(Number);
          let endHour = hours + 1;
          let endMinute = minutes;
          
          // 22시를 넘으면 22:00으로 제한
          if (endHour > 22) {
            endHour = 22;
            endMinute = 0;
          }
          
          const endTimeStr = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
          
          // 종료 시간 드롭다운에 해당 시간이 있는지 확인
          if (dom.reservationEndTime) {
            const optionExists = Array.from(dom.reservationEndTime.options).some(
              opt => opt.value === endTimeStr
            );
            if (optionExists) {
              dom.reservationEndTime.value = endTimeStr;
              updateEndDateTime();
            }
          }
        }
      }
    }

    // 종료일시 업데이트 함수
    function updateEndDateTime() {
      if (!dom.reservationEndDate || !dom.reservationEndTime || !dom.reservationEnd) return;
      const date = dom.reservationEndDate.value;
      const time = dom.reservationEndTime.value;
      if (date && time) {
        dom.reservationEnd.value = `${date}T${time}`;
      } else {
        dom.reservationEnd.value = "";
      }
    }

    if (dom.reservationStartDate) {
      dom.reservationStartDate.addEventListener("change", updateStartDateTime);
    }
    if (dom.reservationStartTime) {
      dom.reservationStartTime.addEventListener("change", updateStartDateTime);
    }
    if (dom.reservationEndDate) {
      dom.reservationEndDate.addEventListener("change", updateEndDateTime);
    }
    if (dom.reservationEndTime) {
      dom.reservationEndTime.addEventListener("change", updateEndDateTime);
    }

    // 색상 선택기 초기화는 모달 열 때 수행
  }

  async function openReservationModal() {
    if (!dom.reservationModal) {
      console.error("reservationModal not found");
      return;
    }
    editingReservationId = null;
    dom.reservationForm.reset();
    clearRoomSelection();
    populateRoomSelect([]);
    if (dom.reservationRepeat) dom.reservationRepeat.value = "none";
    if (dom.repeatMonthlyDay) dom.repeatMonthlyDay.value = "";
    if (dom.repeatUntilDate) dom.repeatUntilDate.value = "";
    if (dom.reservationStartDate) dom.reservationStartDate.value = "";
    if (dom.reservationStartTime) dom.reservationStartTime.value = "";
    if (dom.reservationStart) dom.reservationStart.value = "";
    if (dom.reservationEndDate) dom.reservationEndDate.value = "";
    if (dom.reservationEndTime) dom.reservationEndTime.value = "";
    if (dom.reservationEnd) dom.reservationEnd.value = "";
    if (dom.reservationColor) dom.reservationColor.value = "#2f54eb";
    if (dom.reservationPattern) dom.reservationPattern.value = "none";
    if (dom.repeatWeeklyWrap) {
      dom.repeatWeeklyWrap
        .querySelectorAll("input[type=checkbox]")
        .forEach((input) => {
          input.checked = false;
        });
    }
    
    // 색상 선택기 렌더링
    await renderColorPicker();
    
    handleRepeatMode();
    if (dom.modalTitle) dom.modalTitle.textContent = "새 예약 추가";
    if (dom.reservationSubmitBtn) dom.reservationSubmitBtn.textContent = "예약 저장";
    dom.reservationModal.removeAttribute("hidden");
  }

  function closeReservationModal() {
    if (!dom.reservationModal) return;
    dom.reservationModal.setAttribute("hidden", "");
    if (editingReservationId) {
      cancelReservationEdit();
    }
  }

  async function showAdmin() {
    dom.tabsContainer.hidden = false;
    await hydrateAdminData();
  }

  function restoreActiveTab() {
    const savedTab = loadJson(ACTIVE_TAB_KEY, null);
    const validTabs = ["reservations", "holidays", "rooms", "sso", "account"];
    if (savedTab && validTabs.includes(savedTab)) {
      switchTab(savedTab);
    }
  }

  async function hydrateAdminData() {
    await populateRoomSelect();
    clearRoomSelection();
    ensureReservationRangeInitialized();
    updateReservationCategoryButtons();
    await renderReservationList();
    await renderHolidayList();
    await renderRoomList();
    await populateRoomSelect();
    handleRepeatMode();
  }

  async function ensureDefaults() {
    // DB에서 데이터 로드
    try {
      // Rooms 로드
      const roomsData = await RoomsAPI.getAll();
      const { rooms: normalized, changed } = normalizeRooms(Array.isArray(roomsData) ? roomsData : []);
      if (changed) {
        await setRooms(normalized);
      } else {
        state.rooms = freezeRooms(normalized);
      }

      // Reservations 로드
      const reservationsData = await ReservationsAPI.getAll();
      const normalizedReservations = Array.isArray(reservationsData) ? reservationsData : [];
      state.reservations = freezeReservations(normalizedReservations);

      // Holidays 로드
      const holidaysData = await HolidaysAPI.getAll();
      const holidaysArray = Array.isArray(holidaysData) ? holidaysData : [];
      const { holidays, changed: holidaysChanged } = normalizeHolidays(holidaysArray);
      if (holidaysChanged) {
        // 정규화된 형태로 저장
        for (const holiday of holidays) {
          try {
            await HolidaysAPI.create(holiday);
          } catch (err) {
            // 이미 존재하는 경우 무시
            console.warn(`공휴일 ${holiday} 저장 실패:`, err);
          }
        }
      }
      state.holidays = freezeHolidays(holidays);

      // Creds 로드
      try {
        const credsData = await CredsAPI.get();
        const { creds, changed: credsChanged } = normalizeCreds(credsData);
        if (credsChanged) {
          await setCreds(creds);
        } else {
          state.creds = freezeCreds(creds);
        }
      } catch (err) {
        // 기본값 설정
        const defaultCreds = { id: "admin", pw: "1234" };
        await setCreds(defaultCreds);
        state.creds = freezeCreds(defaultCreds);
      }
    } catch (error) {
      console.error("데이터 로드 실패:", error);
      // 기본값으로 초기화
      state.rooms = freezeRooms([]);
      state.reservations = freezeReservations([]);
      state.holidays = freezeHolidays([]);
      state.creds = freezeCreds({ id: "admin", pw: "1234" });
    }
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("localStorage 저장 실패:", error);
    }
  }

  async function getRooms() {
    if (state.rooms) {
      return state.rooms;
    }
    try {
      const roomsData = await RoomsAPI.getAll();
      const { rooms, changed } = normalizeRooms(Array.isArray(roomsData) ? roomsData : []);
      if (changed) {
        // 정규화된 데이터를 DB에 저장
        for (const room of rooms) {
          try {
            if (room.id) {
              await RoomsAPI.update(room.id, room);
            } else {
              await RoomsAPI.create(room);
            }
          } catch (err) {
            console.warn(`회의실 ${room.name} 저장 실패:`, err);
          }
        }
      }
      state.rooms = freezeRooms(rooms);
      return state.rooms;
    } catch (error) {
      console.error("회의실 목록 로드 실패:", error);
      return [];
    }
  }

  async function setRooms(rooms) {
    const source = Array.isArray(rooms) ? rooms : [];
    const { rooms: normalized } = normalizeRooms(source);
    
    try {
      // DB에 저장 (배치 업데이트 또는 개별 저장)
      for (const room of normalized) {
        try {
          if (room.id) {
            await RoomsAPI.update(room.id, room);
          } else {
            const created = await RoomsAPI.create(room);
            room.id = created.id || room.id;
          }
        } catch (err) {
          console.error(`회의실 저장 실패 [${room.name}]:`, err);
        }
      }
      state.rooms = freezeRooms(normalized);
    } catch (error) {
      console.error("회의실 목록 저장 실패:", error);
      throw error;
    }
  }

  async function getReservations() {
    if (state.reservations) {
      return state.reservations;
    }
    try {
      const reservationsData = await ReservationsAPI.getAll();
      const normalized = Array.isArray(reservationsData) ? reservationsData : [];
      state.reservations = freezeReservations(normalized);
      return state.reservations;
    } catch (error) {
      console.error("예약 목록 로드 실패:", error);
      return [];
    }
  }

  async function setReservations(reservations) {
    const normalized = Array.isArray(reservations)
      ? reservations.map((reservation) => ({
          ...reservation,
          repeatWeeklyDays: Array.isArray(reservation.repeatWeeklyDays)
            ? [...reservation.repeatWeeklyDays]
            : [],
        }))
      : [];
    
    clearReservationTimeCache();
    state.reservations = freezeReservations(normalized);
  }

  async function getHolidays() {
    if (state.holidays) {
      return state.holidays;
    }
    try {
      const holidaysData = await HolidaysAPI.getAll();
      const holidaysArray = Array.isArray(holidaysData) ? holidaysData : [];
      const { holidays, changed } = normalizeHolidays(holidaysArray);
      if (changed) {
        // 정규화된 형태로 저장
        for (const holiday of holidays) {
          try {
            await HolidaysAPI.create(holiday);
          } catch (err) {
            // 이미 존재하는 경우 무시
            console.warn(`공휴일 ${holiday} 저장 실패:`, err);
          }
        }
      }
      state.holidays = freezeHolidays(holidays);
      return state.holidays;
    } catch (error) {
      console.error("공휴일 목록 로드 실패:", error);
      return [];
    }
  }

  async function setHolidays(holidays) {
    const source = Array.isArray(holidays) ? holidays : [];
    const { holidays: normalized } = normalizeHolidays(source);
    
    try {
      // 기존 공휴일 삭제 후 새로 추가 (간단한 구현)
      // 실제로는 서버에서 전체 교체 API를 제공하는 것이 좋습니다
      const existing = await HolidaysAPI.getAll();
      for (const holiday of normalized) {
        try {
          await HolidaysAPI.create(holiday);
        } catch (err) {
          // 이미 존재하는 경우 무시
          console.warn(`공휴일 ${holiday} 저장 실패:`, err);
        }
      }
      state.holidays = freezeHolidays(normalized);
    } catch (error) {
      console.error("공휴일 목록 저장 실패:", error);
      throw error;
    }
  }

  async function getCreds() {
    if (state.creds) {
      return state.creds;
    }
    try {
      const credsData = await CredsAPI.get();
      const { creds, changed } = normalizeCreds(credsData);
      if (changed) {
        await setCreds(creds);
      } else {
        state.creds = freezeCreds(creds);
      }
      return state.creds;
    } catch (error) {
      console.error("인증 정보 로드 실패:", error);
      const defaultCreds = { id: "admin", pw: "1234" };
      state.creds = freezeCreds(defaultCreds);
      return state.creds;
    }
  }

  async function setCreds(creds) {
    const source = creds && typeof creds === "object" ? creds : {};
    const { creds: normalized } = normalizeCreds(source);
    
    try {
      await CredsAPI.update(normalized);
      state.creds = freezeCreds(normalized);
    } catch (error) {
      console.error("인증 정보 저장 실패:", error);
      throw error;
    }
  }

  async function getSsoAdmins() {
    try {
      const adminsData = await SsoAdminsAPI.getAll();
      return Array.isArray(adminsData) ? adminsData : [];
    } catch (error) {
      console.error("SSO 관리자 목록 로드 실패", error);
      return [];
    }
  }


  async function switchTab(target) {
    dom.tabNavButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === target);
    });
    dom.tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${target}`);
    });
    saveJson(ACTIVE_TAB_KEY, target);
    if (target === "sso") await renderSsoAdminList();
    if (target === "rooms") await renderRoomList();
    if (target === "account") await renderColorLabels();
  }

  let selectedRooms = [];

  async function populateRoomSelect(selectedRoomsList = null) {
    const rooms = await getRooms();
    if (selectedRoomsList !== null) {
      selectedRooms = [...selectedRoomsList];
    }
    if (!dom.roomChipContainer) return;
    dom.roomChipContainer.innerHTML = "";
    if (rooms.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "text-muted";
      emptyMsg.textContent = "회의실 없음";
      dom.roomChipContainer.appendChild(emptyMsg);
      return;
    }
    rooms.forEach((room) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "room-chip";
      chip.textContent = room.name;
      chip.dataset.roomName = room.name;
      if (selectedRooms.includes(room.name)) {
        chip.classList.add("selected");
      }
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleRoomSelection(room.name);
      });
      dom.roomChipContainer.appendChild(chip);
    });
  }

  function toggleRoomSelection(roomName) {
    const index = selectedRooms.indexOf(roomName);
    if (index === -1) {
      selectedRooms.push(roomName);
    } else {
      selectedRooms.splice(index, 1);
    }
    const chip = dom.roomChipContainer.querySelector(
      `[data-room-name="${roomName}"]`
    );
    if (chip) {
      chip.classList.toggle("selected", selectedRooms.includes(roomName));
    }
  }

  function getSelectedRooms() {
    return [...selectedRooms];
  }

  function clearRoomSelection() {
    selectedRooms = [];
    if (dom.roomChipContainer) {
      dom.roomChipContainer
        .querySelectorAll(".room-chip")
        .forEach((chip) => chip.classList.remove("selected"));
    }
  }

  async function onReservationSubmit(event) {
    event.preventDefault();
    const rooms = await getRooms();
    if (rooms.length === 0) {
      alert("등록된 회의실이 없습니다. 회의실을 먼저 추가하세요.");
      switchTab("rooms");
      return;
    }

    if (editingReservationId) {
      await handleReservationUpdate();
      return;
    }

    const formData = getReservationFormData();
    if (!formData) return;
    const selectedRooms = formData.rooms;

    const reservations = await getReservations();
    const holidays = new Set(await getHolidays());
    const occurrences = expandOccurrences(formData);

    if (occurrences.length === 0) {
      alert("생성된 예약이 없습니다. 반복 설정과 종료일을 확인하세요.");
      return;
    }

    const holidayHits = occurrences
      .map((occ) => ({
        date: dateKey(new Date(occ.start)),
        start: occ.start,
      }))
      .filter((occ) => holidays.has(occ.date));

    if (holidayHits.length > 0) {
      const uniqueDates = [
        ...new Set(holidayHits.map((occ) => occ.date)),
      ].join(", ");
      const confirmed = confirm(
        `다음 공휴일에 예약이 포함되어 있습니다: ${uniqueDates}\n계속 진행하시겠습니까?`
      );
      if (!confirmed) {
        return;
      }
    }

    for (const roomName of selectedRooms) {
      for (const occ of occurrences) {
        const conflict = reservations.find((resv) =>
          isConflict(resv, {
            room: roomName,
            start: occ.start,
            end: occ.end,
          })
        );
        if (conflict) {
          alert(
            `겹치는 예약이 존재합니다.\n회의실: ${conflict.room}\n시간: ${formatDateTime(
              conflict.start
            )} - ${formatDateTime(conflict.end)}`
          );
          return;
        }
      }
    }

    const seriesId = generateUid();
    const newReservations = [];
    selectedRooms.forEach((roomName) => {
      occurrences.forEach((occ) => {
        newReservations.push({
          id: generateUid(),
          seriesId,
          room: roomName,
          headcount: formData.headcount,
          start: occ.start,
          end: occ.end,
          repeat: formData.repeat,
          repeatWeeklyDays: formData.repeatWeeklyDays,
          repeatMonthlyDay: formData.repeatMonthlyDay,
          title: formData.title,
          instructor: formData.instructor,
          note: formData.note,
          color: formData.color || "#2f54eb",
          pattern: formData.pattern || "none",
          createdAt: new Date().toISOString(),
        });
      });
    });

    try {
      // 배치로 예약 생성
      await ReservationsAPI.createMultiple(newReservations);
      
      // 상태만 업데이트 (서버는 이미 저장됨)
      clearReservationTimeCache();
      state.reservations = freezeReservations([...reservations, ...newReservations]);
      
      // 날짜 범위 확장
      const newBounds = findReservationDateBounds(newReservations);
      if (newBounds) {
        expandReservationRangeToCover(newBounds.min, newBounds.max);
      }
      
      // 모달 닫기와 렌더링 병렬 처리
      closeReservationModal();
      await renderReservationList();
      
      alert(`${newReservations.length}건의 예약이 저장되었습니다.`);
    } catch (error) {
      console.error("예약 저장 실패:", error);
      alert("예약 저장 중 오류가 발생했습니다.");
    }
  }

  async function handleReservationUpdate() {
    const editData = getReservationEditData();
    if (!editData) return;

    const reservations = await getReservations();
    const targetIndex = reservations.findIndex(
      (resv) => resv.id === editingReservationId
    );
    if (targetIndex === -1) {
      alert("수정할 예약을 찾을 수 없습니다.");
      cancelReservationEdit();
      return;
    }

    const updatedReservation = {
      ...reservations[targetIndex],
      room: editData.room,
      headcount: editData.headcount,
      start: editData.start.toISOString(),
      end: editData.end.toISOString(),
      title: editData.title,
      instructor: editData.instructor,
      note: editData.note,
      color: editData.color || "#2f54eb",
      pattern: editData.pattern || "none",
    };

    const hasConflict = reservations.some(
      (resv) =>
        resv.id !== editingReservationId &&
        isConflict(resv, {
          room: updatedReservation.room,
          start: updatedReservation.start,
          end: updatedReservation.end,
        })
    );

    if (hasConflict) {
      alert("겹치는 예약이 존재합니다. 시간과 회의실을 다시 확인해주세요.");
      return;
    }

    try {
      // 서버에 업데이트
      await ReservationsAPI.update(editingReservationId, updatedReservation);
      
      // 상태 업데이트
      const updatedReservations = reservations.map((r, idx) => 
        idx === targetIndex ? updatedReservation : r
      );
      setReservations(updatedReservations);
      
      // 날짜 범위 확장
      expandReservationRangeToCover(editData.start, editData.end);
      
      // 모달 닫기와 렌더링 병렬 처리
      closeReservationModal();
      cancelReservationEdit();
      await renderReservationList();
      
      alert("예약이 수정되었습니다.");
    } catch (error) {
      console.error("예약 수정 실패:", error);
      alert("예약 수정 중 오류가 발생했습니다.");
    }
  }

  function getReservationFormData() {
    // 날짜/시간 입력값을 hidden 필드에 동기화
    if (dom.reservationStartDate && dom.reservationStartTime && dom.reservationStart) {
      const date = dom.reservationStartDate.value;
      const time = dom.reservationStartTime.value;
      if (date && time) {
        dom.reservationStart.value = `${date}T${time}`;
      }
    }
    if (dom.reservationEndDate && dom.reservationEndTime && dom.reservationEnd) {
      const date = dom.reservationEndDate.value;
      const time = dom.reservationEndTime.value;
      if (date && time) {
        dom.reservationEnd.value = `${date}T${time}`;
      }
    }

    const rooms = getSelectedRooms();
    const headcountValue = dom.reservationHeadcount.value.trim();
    const headcount = headcountValue ? Number(headcountValue) : null;
    const startValue = dom.reservationStart.value;
    const endValue = dom.reservationEnd.value;
    const repeat = dom.reservationRepeat.value;
    const title = dom.reservationTitle.value.trim();
    const instructor = dom.reservationInstructor.value.trim();
    const note = dom.reservationNote.value.trim();
    const color = dom.reservationColor ? dom.reservationColor.value : "#2f54eb";
    const pattern = dom.reservationPattern ? dom.reservationPattern.value : "none";

    if (rooms.length === 0) {
      alert("회의실을 한 개 이상 선택하세요.");
      return null;
    }
    if (!startValue || !endValue) {
      alert("시작/종료 일시를 모두 입력하세요.");
      return null;
    }

    const start = new Date(startValue);
    const end = new Date(endValue);
    if (!(start instanceof Date) || isNaN(start.getTime())) {
      alert("시작 일시가 올바르지 않습니다.");
      return null;
    }
    if (!(end instanceof Date) || isNaN(end.getTime())) {
      alert("종료 일시가 올바르지 않습니다.");
      return null;
    }
    if (start >= end) {
      alert("종료 일시는 시작 이후여야 합니다.");
      return null;
    }

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const MIN_ALLOWED = 7 * 60;
    const MAX_ALLOWED = 22 * 60;

    if (startMinutes < MIN_ALLOWED || startMinutes > MAX_ALLOWED) {
      alert("시작 시간은 07:00부터 22:00 사이여야 합니다.");
      return null;
    }
    if (endMinutes < MIN_ALLOWED || endMinutes > MAX_ALLOWED) {
      alert("종료 시간은 07:00부터 22:00 사이여야 합니다.");
      return null;
    }

    if (start.getMinutes() % 30 !== 0 || end.getMinutes() % 30 !== 0) {
      alert("시간은 30분 단위로 입력하세요.");
      return null;
    }

    if (headcount !== null && (!Number.isFinite(headcount) || headcount <= 0)) {
      alert("교육인원수는 1 이상의 숫자로 입력하세요.");
      return null;
    }

    if (!title) {
      alert("교육명을 입력하세요.");
      return null;
    }

    let repeatWeeklyDays = [];
    let repeatMonthlyDay = null;
    let repeatUntilDate = null;

    if (repeat !== "none") {
      if (!dom.repeatUntilDate || !dom.repeatUntilDate.value) {
        alert("반복 종료일을 입력하세요.");
        return null;
      }
      
      const untilDate = new Date(dom.repeatUntilDate.value);
      const startDateOnly = new Date(start);
      startDateOnly.setHours(0, 0, 0, 0);
      const untilDateOnly = new Date(untilDate);
      untilDateOnly.setHours(23, 59, 59, 999);
      
      if (untilDateOnly < startDateOnly) {
        alert("반복 종료일은 시작일과 같거나 이후여야 합니다.");
        return null;
      }
      
      repeatUntilDate = untilDateOnly;

      if (repeat === "weekly") {
        repeatWeeklyDays = [
          ...dom.repeatWeeklyWrap.querySelectorAll("input[type=checkbox]:checked"),
        ].map((input) => Number(input.value));
        if (repeatWeeklyDays.length === 0) {
          alert("반복 요일을 한 개 이상 선택하세요.");
          return null;
        }
      } else if (repeat === "monthly") {
        const monthlyDayValue = dom.repeatMonthlyDay.value;
        if (!monthlyDayValue) {
          alert("매월 반복 일자를 선택하세요.");
          return null;
        }
        repeatMonthlyDay = Number(monthlyDayValue);
        if (
          !Number.isInteger(repeatMonthlyDay) ||
          repeatMonthlyDay < 1 ||
          repeatMonthlyDay > 31
        ) {
          alert("매월 반복 일자를 1~31 사이로 선택하세요.");
          return null;
        }
      }
    }

    return {
      rooms,
      headcount,
      start,
      end,
      repeat,
      repeatUntil: repeatUntilDate,
      repeatWeeklyDays,
      repeatMonthlyDay,
      title,
      instructor,
      note,
      color,
      pattern,
    };
  }

  function getReservationEditData() {
    if (dom.reservationRepeat.value !== "none") {
      alert("기존 예약 수정에서는 반복 설정을 사용할 수 없습니다.");
      return null;
    }
    const formData = getReservationFormData();
    if (!formData) return null;
    if (formData.rooms.length !== 1) {
      alert("예약 수정 시에는 한 개의 회의실만 선택하세요.");
      return null;
    }
    return {
      room: formData.rooms[0],
      headcount: formData.headcount,
      start: formData.start,
      end: formData.end,
      title: formData.title,
      instructor: formData.instructor,
      note: formData.note,
      color: formData.color || "#2f54eb",
      pattern: formData.pattern || "none",
    };
  }

  function expandOccurrences(formData) {
    const { start, end, repeat, repeatUntil } = formData;
    const occurrences = [];
    const duration = end.getTime() - start.getTime();

    const pushOccurrence = (startDate) => {
      const startClone = new Date(startDate);
      const endClone = new Date(startDate.getTime() + duration);
      occurrences.push({
        start: startClone.toISOString(),
        end: endClone.toISOString(),
      });
    };

    if (repeat === "none") {
      pushOccurrence(start);
      return occurrences;
    }

    // 종료일시까지 반복
    const untilDate = new Date(repeatUntil);

    if (repeat === "daily") {
      const cursor = new Date(start);
      while (cursor <= untilDate) {
        pushOccurrence(cursor);
        cursor.setDate(cursor.getDate() + 1);
      }
      return occurrences;
    }

    if (repeat === "weekly") {
      const allowed = new Set(formData.repeatWeeklyDays);
      const startDateOnly = new Date(start);
      startDateOnly.setHours(0, 0, 0, 0);

      const totalDays =
        Math.ceil((untilDate.getTime() - startDateOnly.getTime()) / 86400000) +
        1;

      for (let i = 0; i < totalDays; i++) {
        const day = new Date(startDateOnly);
        day.setDate(day.getDate() + i);
        if (day > untilDate) break;
        if (!allowed.has(day.getDay())) continue;

        const occurrenceStart = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          start.getHours(),
          start.getMinutes(),
          0,
          0
        );
        if (occurrenceStart > untilDate) break;
        pushOccurrence(occurrenceStart);
      }
      return occurrences;
    }

    if (repeat === "monthly") {
      const startHour = start.getHours();
      const startMinute = start.getMinutes();
      const targetDay =
        formData.repeatMonthlyDay ?? start.getDate();

      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);

      while (cursor <= untilDate) {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const day = Math.min(targetDay, daysInMonth);

        const occurrenceStart = new Date(year, month, day, startHour, startMinute, 0, 0);
        if (occurrenceStart < start) {
          cursor.setMonth(cursor.getMonth() + 1);
          continue;
        }
        if (occurrenceStart > untilDate) break;
        pushOccurrence(occurrenceStart);
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return occurrences;
    }

    return occurrences;
  }

  function isConflict(existing, candidate) {
    if (existing.room !== candidate.room) return false;
    const existStart = getReservationStartTime(existing);
    const existEnd = getReservationEndTime(existing);
    const candStart = new Date(candidate.start).getTime();
    const candEnd = new Date(candidate.end).getTime();
    if (
      !Number.isFinite(existStart) ||
      !Number.isFinite(existEnd) ||
      !Number.isFinite(candStart) ||
      !Number.isFinite(candEnd)
    ) {
      return false;
    }
    return candStart < existEnd && candEnd > existStart;
  }

  async function setActiveReservationCategory(categoryId) {
    if (!categoryId || !CATEGORY_IDS.has(categoryId)) {
      return;
    }
    if (categoryId === activeReservationCategory) {
      return;
    }
    activeReservationCategory = categoryId;
    updateReservationCategoryButtons();
    await renderReservationList();
  }

  function updateReservationCategoryButtons() {
    if (!dom.adminCategoryButtons || dom.adminCategoryButtons.length === 0) return;
    dom.adminCategoryButtons.forEach((button) => {
      const isActive = button.dataset.category === activeReservationCategory;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function filterRoomsByCategory(rooms, categoryId) {
    if (!Array.isArray(rooms)) return [];
    if (categoryId === "all") {
      return rooms;
    }
    return rooms.filter((room) => room.category === categoryId);
  }

  async function renderReservationList() {
    ensureReservationRangeInitialized();
    const rangeStartValue = dom.reservationRangeStart
      ? dom.reservationRangeStart.value
      : "";
    const rangeEndValue = dom.reservationRangeEnd
      ? dom.reservationRangeEnd.value
      : "";
    const rangeStart = parseISODate(rangeStartValue);
    const rangeEnd = parseISODate(rangeEndValue);

    const allRooms = await getRooms();
    const rooms = filterRoomsByCategory(allRooms, activeReservationCategory);
    renderReservationTableHeader(rooms);

    if (!dom.reservationTableBody) return;
    dom.reservationTableBody.textContent = "";

    if (!rangeStart || !rangeEnd) {
      return;
    }

    const rangeStartDay = startOfDay(rangeStart);
    const rangeEndDay = startOfDay(rangeEnd);
    if (rangeEndDay < rangeStartDay) {
      return;
    }

    if (allRooms.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = Math.max(rooms.length + 1, 2);
      cell.className = "empty";
      cell.textContent = "등록된 회의실이 없습니다. 회의실을 먼저 추가하세요.";
      row.appendChild(cell);
      dom.reservationTableBody.appendChild(row);
      clearActiveReservationChip();
      return;
    }

    if (rooms.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = Math.max(allRooms.length + 1, 2);
      cell.className = "empty";
      cell.textContent = "선택한 카테고리에 해당하는 회의실이 없습니다.";
      row.appendChild(cell);
      dom.reservationTableBody.appendChild(row);
      clearActiveReservationChip();
      return;
    }

    const reservations = await getReservations();
    const holidays = new Set(await getHolidays());

    const rangeEndInclusive = endOfDay(rangeEndDay);
    const rangeStartTime = rangeStartDay.getTime();
    const rangeEndTime = rangeEndInclusive.getTime();
    const reservationsInRange = reservations.filter((resv) => {
      const startTime = getReservationStartTime(resv);
      const endTime = getReservationEndTime(resv);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
        return false;
      }
      return endTime >= rangeStartTime && startTime <= rangeEndTime;
    });

    const reservationIndex = buildReservationIndex(reservationsInRange);
    const dates = eachDayInclusive(rangeStartDay, rangeEndDay);
    const todayKey = dateKey(new Date());
    const fragment = document.createDocumentFragment();

    dates.forEach((date) => {
      const key = dateKey(date);
      const dayIndex = date.getDay();
      const row = document.createElement("tr");
      row.dataset.date = key;

      const isHoliday = holidays.has(key);
      const isWeekend = dayIndex === 0 || dayIndex === 6;
      if (isHoliday) {
        row.classList.add("row-holiday");
      } else if (isWeekend) {
        row.classList.add("row-weekend");
      }
      if (key === todayKey) {
        row.classList.add("row-today");
      }

      const dateCell = document.createElement("td");
      dateCell.textContent = `${key} (${DAY_NAMES[dayIndex]})`;
      row.appendChild(dateCell);

      rooms.forEach((room) => {
        const cell = document.createElement("td");
        cell.classList.add("resv-cell");
        const items = getReservationsForDayRoomAdmin(
          reservationIndex,
          key,
          room.name
        );
        if (items.length > 0) {
          const stack = document.createElement("div");
          stack.className = "resv-stack";
          items.forEach((item) => {
            const chip = createReservationChip(item);
            chip.addEventListener("click", () =>
              startEditReservation(item.id, chip)
            );
            chip.addEventListener("keydown", (event) => {
              if (
                event.key === "Enter" ||
                event.key === " " ||
                event.key === "Spacebar"
              ) {
                event.preventDefault();
                startEditReservation(item.id, chip);
              }
            });
            stack.appendChild(chip);
          });
          cell.appendChild(stack);
        }
        row.appendChild(cell);
      });

      fragment.appendChild(row);
    });

    dom.reservationTableBody.appendChild(fragment);

    highlightEditingReservation();
  }

  function buildReservationIndex(reservations) {
    const index = new Map();
    reservations.forEach((reservation) => {
      if (!reservation || typeof reservation !== "object") return;
      const room = reservation.room;
      if (!room) return;
      const startTime = getReservationStartTime(reservation);
      const endTime = getReservationEndTime(reservation);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
        return;
      }
      const startDate = startOfDay(new Date(startTime));
      const endDate = startOfDay(new Date(endTime));
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return;
      }
      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        const dayKey = dateKey(cursor);
        if (!index.has(dayKey)) {
          index.set(dayKey, new Map());
        }
        const roomMap = index.get(dayKey);
        if (!roomMap.has(room)) {
          roomMap.set(room, []);
        }
        roomMap.get(room).push(reservation);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    index.forEach((roomMap) => {
      roomMap.forEach((list, roomName) => {
        roomMap.set(
          roomName,
          list.sort(
            (a, b) => getReservationStartTime(a) - getReservationStartTime(b)
          )
        );
      });
    });

    return index;
  }

  function ensureReservationRangeInitialized() {
    if (!dom.reservationRangeStart || !dom.reservationRangeEnd) return;
    if (dom.reservationRangeStart.value && dom.reservationRangeEnd.value) {
      return;
    }
    setDefaultReservationRange();
  }

  function setDefaultReservationRange() {
    if (!dom.reservationRangeStart || !dom.reservationRangeEnd) return;
    const today = startOfDay(new Date());
    const defaultEnd = addMonths(today, 3);
    dom.reservationRangeStart.value = toInputDate(today);
    dom.reservationRangeEnd.value = toInputDate(defaultEnd);
  }

  async function applyReservationRange() {
    const startValue = dom.reservationRangeStart
      ? dom.reservationRangeStart.value
      : "";
    const endValue = dom.reservationRangeEnd
      ? dom.reservationRangeEnd.value
      : "";
    const rangeStart = parseISODate(startValue);
    const rangeEnd = parseISODate(endValue);
    if (!rangeStart || !rangeEnd) {
      alert("시작일과 종료일을 모두 선택하세요.");
      return false;
    }
    if (rangeEnd < rangeStart) {
      alert("종료일은 시작일 이후여야 합니다.");
      return false;
    }
    await renderReservationList();
    return true;
  }

  async function handleReservationRangeApply(event) {
    if (event) event.preventDefault();
    await applyReservationRange();
  }

  async function handleReservationRangePeriod(days) {
    if (!dom.reservationRangeStart || !dom.reservationRangeEnd) return;
    const today = startOfDay(new Date());
    dom.reservationRangeStart.value = toInputDate(today);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days - 1);
    dom.reservationRangeEnd.value = toInputDate(endDate);
    await applyReservationRange();
  }

  async function handleReservationRangePeriodMonth(months) {
    if (!dom.reservationRangeStart || !dom.reservationRangeEnd) return;
    const today = startOfDay(new Date());
    dom.reservationRangeStart.value = toInputDate(today);
    const endDate = addMonths(today, months);
    endDate.setDate(endDate.getDate() - 1);
    dom.reservationRangeEnd.value = toInputDate(endDate);
    await applyReservationRange();
  }

  async function handleReservationRangeToday(event) {
    if (event) event.preventDefault();
    if (!dom.reservationRangeStart || !dom.reservationRangeEnd) return;
    const today = startOfDay(new Date());
    dom.reservationRangeStart.value = toInputDate(today);
    dom.reservationRangeEnd.value = toInputDate(today);
    await applyReservationRange();
  }


  function expandReservationRangeToCover(startDate, endDate) {
    if (!dom.reservationRangeStart || !dom.reservationRangeEnd) return;
    if (!startDate || !endDate) return;
    const currentStart = parseISODate(dom.reservationRangeStart.value);
    const currentEnd = parseISODate(dom.reservationRangeEnd.value);
    const normalizedStart = startOfDay(startDate);
    const normalizedEnd = startOfDay(endDate);
    if (!currentStart || normalizedStart < startOfDay(currentStart)) {
      dom.reservationRangeStart.value = toInputDate(normalizedStart);
    }
    if (!currentEnd || normalizedEnd > startOfDay(currentEnd)) {
      dom.reservationRangeEnd.value = toInputDate(normalizedEnd);
    }
  }

  function findReservationDateBounds(reservations) {
    if (!reservations || reservations.length === 0) {
      return null;
    }
    let min = null;
    let max = null;
    reservations.forEach((resv) => {
      const startTime = getReservationStartTime(resv);
      const endTime = getReservationEndTime(resv);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
        return;
      }
      if (min === null || startTime < min) {
        min = startTime;
      }
      if (max === null || endTime > max) {
        max = endTime;
      }
    });
    if (min === null || max === null) {
      return null;
    }
    return {
      min: startOfDay(new Date(min)),
      max: startOfDay(new Date(max)),
    };
  }

  function renderReservationTableHeader(rooms) {
    const row = document.createElement("tr");
    const dateTh = document.createElement("th");
    dateTh.textContent = "날짜";
    row.appendChild(dateTh);
    rooms.forEach((room) => {
      const th = document.createElement("th");
      th.textContent = room.name;
      row.appendChild(th);
    });
    dom.reservationTableHead.innerHTML = "";
    dom.reservationTableHead.appendChild(row);
  }

  function createReservationChip(reservation) {
    const chip = document.createElement("article");
    chip.className = "resv";
    chip.dataset.reservationId = reservation.id;
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    chip.title = "예약을 수정하려면 클릭하세요.";

    // 색상 적용
    const color = reservation.color || "#2f54eb";
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    chip.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.05)`;
    chip.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.18)`;

    // 빗금 패턴 적용
    const pattern = reservation.pattern || "none";
    if (pattern !== "none") {
      chip.classList.add(`resv-pattern-${pattern}`);
    }

    const title = document.createElement("div");
    title.className = "resv-title";
    title.textContent = reservation.title || "(제목 없음)";

    const meta = document.createElement("div");
    meta.className = "resv-meta";
    const timeLabel = `${formatTimeOnly(reservation.start)} - ${formatTimeOnly(
      reservation.end
    )}`;
    const instructor = reservation.instructor
      ? `｜강사 ${reservation.instructor}`
      : "";
    const headcount = reservation.headcount
      ? `｜${reservation.headcount}명`
      : "";
    meta.textContent = `${timeLabel}${instructor}${headcount}`;

    chip.append(title, meta);

    if (reservation.note) {
      const note = document.createElement("div");
      note.className = "resv-meta";
      note.textContent = reservation.note;
      chip.appendChild(note);
    }

    const actions = document.createElement("div");
    actions.className = "resv-actions";

    const hint = document.createElement("span");
    hint.className = "resv-meta resv-hint";
    hint.textContent = "클릭하여 수정";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "resv-delete-btn";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      onDeleteReservation(reservation.id);
    });

    actions.append(hint, deleteBtn);
    chip.appendChild(actions);

    return chip;
  }

  function getReservationsForDayRoomAdmin(reservationIndex, date, room) {
    if (!reservationIndex || !room) return [];
    const key = typeof date === "string" ? date : dateKey(date);
    const roomMap = reservationIndex.get(key);
    if (!roomMap) return [];
    return roomMap.get(room) || [];
  }
  function parseISODate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function toInputDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function endOfDay(date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  function addMonths(date, count) {
    const base = new Date(date);
    const day = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + count);
    const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(day, monthEnd));
    return base;
  }

  function eachDayInclusive(startDate, endDate) {
    const result = [];
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const limit = new Date(endDate);
    limit.setHours(0, 0, 0, 0);
    while (cursor <= limit) {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  async function startEditReservation(reservationId, chipElement) {
    const reservations = await getReservations();
    const target = reservations.find((resv) => resv.id === reservationId);
    if (!target) {
      alert("예약을 찾을 수 없습니다.");
      return;
    }

    editingReservationId = reservationId;
    if (chipElement) {
      setActiveReservationChip(chipElement);
    } else {
      highlightEditingReservation();
    }

    await populateRoomSelect([target.room]);
    dom.reservationHeadcount.value =
      typeof target.headcount === "number" ? String(target.headcount) : "";
    
    const startDate = new Date(target.start);
    if (dom.reservationStartDate) {
      dom.reservationStartDate.value = toInputDate(startDate);
    }
    if (dom.reservationStartTime) {
      const hours = String(startDate.getHours()).padStart(2, "0");
      const minutes = String(startDate.getMinutes()).padStart(2, "0");
      dom.reservationStartTime.value = `${hours}:${minutes}`;
    }
    if (dom.reservationStart) {
      dom.reservationStart.value = toInputDateTime(target.start);
    }
    
    const endDate = new Date(target.end);
    if (dom.reservationEndDate) {
      dom.reservationEndDate.value = toInputDate(endDate);
    }
    if (dom.reservationEndTime) {
      const hours = String(endDate.getHours()).padStart(2, "0");
      const minutes = String(endDate.getMinutes()).padStart(2, "0");
      dom.reservationEndTime.value = `${hours}:${minutes}`;
    }
    if (dom.reservationEnd) {
      dom.reservationEnd.value = toInputDateTime(target.end);
    }
    dom.reservationRepeat.value = "none";
    dom.repeatMonthlyDay.value = "";
    if (dom.repeatUntilDate) dom.repeatUntilDate.value = "";
    dom.reservationTitle.value = target.title || "";
    dom.reservationInstructor.value = target.instructor || "";
    dom.reservationNote.value = target.note || "";
    
    if (dom.reservationColor) {
      dom.reservationColor.value = target.color || "#2f54eb";
    }
    if (dom.reservationPattern) {
      dom.reservationPattern.value = target.pattern || "none";
    }
    
    // 색상 선택기 렌더링
    await renderColorPicker();
    dom.repeatWeeklyWrap
      .querySelectorAll("input[type=checkbox]")
      .forEach((input) => {
        input.checked = false;
      });
    selectedRooms = [target.room];

    handleRepeatMode();

    if (dom.modalTitle) dom.modalTitle.textContent = "예약 수정";
    if (dom.reservationSubmitBtn) dom.reservationSubmitBtn.textContent = "예약 수정";
    if (dom.reservationModal) dom.reservationModal.removeAttribute("hidden");
  }

  async function cancelReservationEdit() {
    editingReservationId = null;
    clearActiveReservationChip();
    closeReservationModal();
  }

  function setActiveReservationChip(element) {
    if (activeReservationChip === element) return;
    clearActiveReservationChip();
    activeReservationChip = element;
    if (activeReservationChip) {
      activeReservationChip.classList.add("is-active");
    }
  }

  function clearActiveReservationChip() {
    if (activeReservationChip) {
      activeReservationChip.classList.remove("is-active");
      activeReservationChip = null;
    }
  }

  function highlightEditingReservation() {
    if (!editingReservationId) {
      clearActiveReservationChip();
      return;
    }
    const chip = dom.reservationTableBody.querySelector(
      `[data-reservation-id="${editingReservationId}"]`
    );
    if (chip) {
      setActiveReservationChip(chip);
    } else {
      clearActiveReservationChip();
    }
  }

  function toInputDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  async function onDeleteReservation(id) {
    if (!confirm("예약을 삭제하시겠습니까?")) return;
    try {
      // 서버에서 삭제
      await ReservationsAPI.delete(id);
      
      // 상태 업데이트
      const reservations = await getReservations();
      const filtered = reservations.filter((resv) => resv.id !== id);
      setReservations(filtered);
      
      if (editingReservationId === id) {
        cancelReservationEdit();
      }
      
      await renderReservationList();
      alert("예약이 삭제되었습니다.");
    } catch (error) {
      console.error("예약 삭제 실패:", error);
      alert("예약 삭제 중 오류가 발생했습니다.");
    }
  }

  async function renderHolidayList() {
    const holidays = [...(await getHolidays())].sort();
    dom.holidayList.innerHTML = "";

    if (holidays.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "등록된 공휴일이 없습니다.";
      dom.holidayList.appendChild(empty);
      return;
    }

    holidays.forEach((date) => {
      const item = document.createElement("article");
      item.className = "list-item";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = date;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-danger btn-icon";
      removeBtn.textContent = "삭제";
      removeBtn.addEventListener("click", () => removeHoliday(date));

      item.append(meta, removeBtn);
      dom.holidayList.appendChild(item);
    });
  }

  async function onHolidaySubmit(event) {
    event.preventDefault();
    const date = dom.holidayDate.value;
    if (!date) {
      alert("공휴일 날짜를 선택하세요.");
      return;
    }
    const holidays = new Set(await getHolidays());
    if (holidays.has(date)) {
      alert("이미 등록된 날짜입니다.");
      return;
    }
    try {
      await HolidaysAPI.create(date);
      holidays.add(date);
      state.holidays = freezeHolidays([...holidays].sort());
      dom.holidayDate.value = "";
      await renderHolidayList();
    } catch (error) {
      console.error("공휴일 추가 실패:", error);
      alert("공휴일 추가 중 오류가 발생했습니다.");
    }
  }

  async function removeHoliday(date) {
    if (!confirm(`${date} 공휴일을 삭제하시겠습니까?`)) return;
    try {
      await HolidaysAPI.delete(date);
      const holidays = (await getHolidays()).filter((item) => item !== date);
      state.holidays = freezeHolidays(holidays);
      await renderHolidayList();
    } catch (error) {
      console.error("공휴일 삭제 실패:", error);
      alert("공휴일 삭제 중 오류가 발생했습니다.");
    }
  }

  async function renderRoomList() {
    if (!dom.roomTableBody) return;
    
    const rooms = await getRooms();
    dom.roomTableBody.innerHTML = "";
    
    if (rooms.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.className = "empty";
      cell.textContent = "등록된 강의실이 없습니다.";
      row.appendChild(cell);
      dom.roomTableBody.appendChild(row);
      updateDeleteButtonState();
      updateSelectAllCheckbox();
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    rooms.forEach((room, index) => {
      const row = document.createElement("tr");
      row.dataset.roomId = room.id;
      row.dataset.roomIndex = index;
      
      // 체크박스 셀
      const checkboxCell = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "room-checkbox";
      checkbox.dataset.roomId = room.id;
      checkbox.addEventListener("change", handleRoomCheckboxChange);
      checkboxCell.appendChild(checkbox);
      row.appendChild(checkboxCell);
      
      // 순서 셀
      const orderCell = document.createElement("td");
      orderCell.style.textAlign = "center";
      orderCell.style.padding = "12px 8px"; // 다른 셀과 동일한 패딩
      
      const orderInput = document.createElement("input");
      orderInput.type = "number";
      orderInput.min = "1";
      orderInput.max = String(rooms.length);
      orderInput.value = String(index + 1);
      orderInput.dataset.field = "order";
      orderInput.dataset.currentOrder = String(index);
      orderInput.style.width = "100%";
      orderInput.style.maxWidth = "60px";
      orderInput.style.textAlign = "center";
      orderInput.style.padding = "8px";
      orderInput.style.border = "1px solid var(--border)";
      orderInput.style.borderRadius = "6px";
      orderInput.style.fontSize = "15px";
      orderInput.style.lineHeight = "1.5";
      orderInput.title = "순서를 입력하세요 (1-" + rooms.length + ")";
      orderInput.addEventListener("change", (e) => handleOrderChange(e.target));
      
      orderCell.appendChild(orderInput);
      row.appendChild(orderCell);
      
      // 강의실명 셀
      const nameCell = document.createElement("td");
      nameCell.style.padding = "12px 8px"; // 순서 셀과 동일한 패딩
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = room.name || "";
      nameInput.placeholder = "강의실명";
      nameInput.dataset.field = "name";
      nameInput.style.width = "100%";
      nameInput.style.padding = "8px";
      nameInput.style.border = "1px solid var(--border)";
      nameInput.style.borderRadius = "6px";
      nameInput.style.fontSize = "15px";
      nameInput.style.lineHeight = "1.5";
      nameCell.appendChild(nameInput);
      row.appendChild(nameCell);
      
      // 좌석 수 셀
      const seatsCell = document.createElement("td");
      seatsCell.style.padding = "12px 8px";
      const seatsInput = document.createElement("input");
      seatsInput.type = "number";
      seatsInput.min = "0";
      seatsInput.value = typeof room.seats === "number" ? String(room.seats) : "";
      seatsInput.placeholder = "좌석 수";
      seatsInput.dataset.field = "seats";
      seatsInput.style.width = "100%";
      seatsInput.style.padding = "8px";
      seatsInput.style.border = "1px solid var(--border)";
      seatsInput.style.borderRadius = "6px";
      seatsInput.style.fontSize = "15px";
      seatsInput.style.lineHeight = "1.5";
      seatsCell.appendChild(seatsInput);
      row.appendChild(seatsCell);
      
      // 컴퓨터 대수 셀
      const computersCell = document.createElement("td");
      computersCell.style.padding = "12px 8px";
      const computersInput = document.createElement("input");
      computersInput.type = "number";
      computersInput.min = "0";
      computersInput.value = typeof room.computers === "number" ? String(room.computers) : "";
      computersInput.placeholder = "컴퓨터 대수";
      computersInput.dataset.field = "computers";
      computersInput.style.width = "100%";
      computersInput.style.padding = "8px";
      computersInput.style.border = "1px solid var(--border)";
      computersInput.style.borderRadius = "6px";
      computersInput.style.fontSize = "15px";
      computersInput.style.lineHeight = "1.5";
      computersCell.appendChild(computersInput);
      row.appendChild(computersCell);
      
      // 비품/장비 셀
      const equipmentCell = document.createElement("td");
      equipmentCell.style.padding = "12px 8px";
      const equipmentInput = document.createElement("input");
      equipmentInput.type = "text";
      equipmentInput.value = room.equipment || "";
      equipmentInput.placeholder = "비품/장비";
      equipmentInput.dataset.field = "equipment";
      equipmentInput.style.width = "100%";
      equipmentInput.style.padding = "8px";
      equipmentInput.style.border = "1px solid var(--border)";
      equipmentInput.style.borderRadius = "6px";
      equipmentInput.style.fontSize = "15px";
      equipmentInput.style.lineHeight = "1.5";
      equipmentCell.appendChild(equipmentInput);
      row.appendChild(equipmentCell);
      
      // 회의실 분류 셀
      const categoryCell = document.createElement("td");
      categoryCell.style.padding = "12px 8px";
      const categorySelect = document.createElement("select");
      categorySelect.dataset.field = "category";
      categorySelect.style.width = "100%";
      categorySelect.style.padding = "8px";
      categorySelect.style.border = "1px solid var(--border)";
      categorySelect.style.borderRadius = "6px";
      categorySelect.style.background = "#fff";
      categorySelect.style.fontSize = "15px";
      categorySelect.style.lineHeight = "1.5";
      const categoryOptions = [
        { value: "", text: "분류 없음" },
        { value: "cat1", text: "1층" },
        { value: "cat2", text: "2층" },
        { value: "cat3", text: "3층" },
      ];
      categoryOptions.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        if (opt.value === (room.category || "")) {
          option.selected = true;
        }
        categorySelect.appendChild(option);
      });
      categoryCell.appendChild(categorySelect);
      row.appendChild(categoryCell);
      
      // 추가 정보 셀
      const noteCell = document.createElement("td");
      noteCell.style.padding = "12px 8px";
      const noteInput = document.createElement("input");
      noteInput.type = "text";
      noteInput.value = room.note || "";
      noteInput.placeholder = "추가 정보";
      noteInput.dataset.field = "note";
      noteInput.style.width = "100%";
      noteInput.style.padding = "8px";
      noteInput.style.border = "1px solid var(--border)";
      noteInput.style.borderRadius = "6px";
      noteInput.style.fontSize = "15px";
      noteInput.style.lineHeight = "1.5";
      noteCell.appendChild(noteInput);
      row.appendChild(noteCell);
      
      fragment.appendChild(row);
    });
    
    dom.roomTableBody.appendChild(fragment);
    updateDeleteButtonState();
    updateSelectAllCheckbox();
  }


  function handleSelectAllRooms() {
    if (!dom.selectAllRooms || !dom.roomTableBody) return;
    const checkboxes = dom.roomTableBody.querySelectorAll(".room-checkbox");
    checkboxes.forEach((checkbox) => {
      checkbox.checked = dom.selectAllRooms.checked;
    });
    updateDeleteButtonState();
  }

  function handleRoomCheckboxChange() {
    updateDeleteButtonState();
    updateSelectAllCheckbox();
  }

  function updateDeleteButtonState() {
    if (!dom.deleteSelectedRoomsBtn || !dom.roomTableBody) return;
    const checked = dom.roomTableBody.querySelectorAll(".room-checkbox:checked");
    dom.deleteSelectedRoomsBtn.disabled = checked.length === 0;
  }

  function updateSelectAllCheckbox() {
    if (!dom.selectAllRooms || !dom.roomTableBody) return;
    const checkboxes = dom.roomTableBody.querySelectorAll(".room-checkbox");
    const checked = dom.roomTableBody.querySelectorAll(".room-checkbox:checked");
    dom.selectAllRooms.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
    dom.selectAllRooms.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
  }

  async function handleAddNewRoomRow() {
    const newRoom = {
      id: generateUid(),
      name: "",
      seats: null,
      computers: null,
      equipment: "",
      category: "",
      note: "",
      isNew: true, // 새로 추가된 행 표시
    };
    
    const existingRooms = await getRooms();
    const rooms = [...existingRooms, newRoom]; // frozen 배열 복사 후 추가
    state.rooms = freezeRooms(rooms);
    await renderRoomList();
    
    // 새로 추가된 행의 강의실명 입력 필드에 포커스
    setTimeout(() => {
      const newRow = dom.roomTableBody.querySelector(`[data-room-id="${newRoom.id}"]`);
      if (newRow) {
        const nameInput = newRow.querySelector('input[data-field="name"]');
        if (nameInput) {
          nameInput.focus();
        }
      }
    }, 100);
  }

  async function handleOrderChange(input) {
    const newOrder = parseInt(input.value);
    const currentOrder = parseInt(input.dataset.currentOrder);
    const rooms = await getRooms();
    
    // 유효성 검사
    if (!Number.isInteger(newOrder) || newOrder < 1 || newOrder > rooms.length) {
      alert(`순서는 1부터 ${rooms.length} 사이의 숫자여야 합니다.`);
      input.value = String(currentOrder + 1);
      return;
    }
    
    // 같은 순서면 아무것도 안 함
    if (newOrder === currentOrder + 1) {
      return;
    }
    
    // 배열 재정렬
    const reordered = [...rooms];
    const item = reordered.splice(currentOrder, 1)[0];
    reordered.splice(newOrder - 1, 0, item);
    
    state.rooms = freezeRooms(reordered);
    await renderRoomList();
  }

  async function handleDeleteSelectedRooms() {
    if (!dom.roomTableBody) return;
    const checked = dom.roomTableBody.querySelectorAll(".room-checkbox:checked");
    if (checked.length === 0) return;
    
    const roomIds = Array.from(checked).map((cb) => cb.dataset.roomId);
    const rooms = await getRooms();
    const roomsToDelete = rooms.filter((r) => roomIds.includes(r.id));
    const roomNames = roomsToDelete.map((r) => r.name).join(", ");
    
    if (!confirm(`다음 강의실을 삭제하시겠습니까?\n${roomNames}\n\n기존 예약은 유지됩니다.`)) {
      return;
    }
    
    try {
      await RoomsAPI.deleteMultiple(roomIds);
      const remaining = rooms.filter((r) => !roomIds.includes(r.id));
      await setRooms(remaining);
      await populateRoomSelect();
      await renderRoomList();
      await renderReservationList();
      alert(`${checked.length}개의 강의실이 삭제되었습니다.`);
    } catch (error) {
      console.error("강의실 삭제 실패:", error);
      alert("강의실 삭제 중 오류가 발생했습니다.");
    }
  }

  async function handleSaveAllRooms() {
    if (!dom.roomTableBody) return;
    
    const rows = dom.roomTableBody.querySelectorAll("tr");
    if (rows.length === 0) {
      alert("저장할 강의실이 없습니다.");
      return;
    }
    
    const rooms = await getRooms();
    const updatedRooms = [];
    const errors = [];
    
    // 모든 행의 데이터 수집 및 유효성 검사
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const roomId = row.dataset.roomId;
      
      if (!roomId) continue;
      
      const roomIndex = rooms.findIndex((r) => r.id === roomId);
      if (roomIndex === -1) continue;
      
      const nameInput = row.querySelector('input[data-field="name"]');
      const seatsInput = row.querySelector('input[data-field="seats"]');
      const computersInput = row.querySelector('input[data-field="computers"]');
      const equipmentInput = row.querySelector('input[data-field="equipment"]');
      const categorySelect = row.querySelector('select[data-field="category"]');
      const noteInput = row.querySelector('input[data-field="note"]');
      
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) {
        errors.push(`${i + 1}번째 행: 강의실명을 입력하세요.`);
        continue;
      }
      
      // 이름 중복 확인 (자신 제외)
      if (updatedRooms.some(r => r.name === name) || 
          rooms.some((room, idx) => idx !== roomIndex && room.name === name)) {
        errors.push(`${i + 1}번째 행: 이미 존재하는 강의실명입니다. (${name})`);
        continue;
      }
      
      const seatsResult = parseRoomNumberInput(seatsInput ? seatsInput.value : "", "좌석 수");
      if (seatsResult.error) {
        errors.push(`${i + 1}번째 행: 좌석 수는 0 이상의 숫자로 입력하세요.`);
        continue;
      }
      
      const computersResult = parseRoomNumberInput(computersInput ? computersInput.value : "", "컴퓨터 대수");
      if (computersResult.error) {
        errors.push(`${i + 1}번째 행: 컴퓨터 대수는 0 이상의 숫자로 입력하세요.`);
        continue;
      }
      
      const isNewRoom = rooms[roomIndex].isNew;
      const originalRoom = rooms[roomIndex];
      
      const updatedRoom = {
        id: roomId,
        name,
        seats: seatsResult.value,
        computers: computersResult.value,
        equipment: equipmentInput ? equipmentInput.value.trim() : "",
        category: categorySelect ? categorySelect.value.trim() : "",
        note: noteInput ? noteInput.value.trim() : "",
        isNew: isNewRoom,
        oldName: originalRoom.name
      };
      
      // 변경 감지 (새 항목이 아닌 경우에만)
      if (!isNewRoom) {
        const hasChanges = 
          originalRoom.name !== updatedRoom.name ||
          originalRoom.seats !== updatedRoom.seats ||
          originalRoom.computers !== updatedRoom.computers ||
          originalRoom.equipment !== updatedRoom.equipment ||
          originalRoom.category !== updatedRoom.category ||
          originalRoom.note !== updatedRoom.note;
        
        if (!hasChanges) {
          updatedRoom.unchanged = true; // 변경사항 없음 표시
        }
      }
      
      updatedRooms.push(updatedRoom);
    }
    
    // 에러가 있으면 표시하고 중단
    if (errors.length > 0) {
      alert("다음 오류를 수정해주세요:\n\n" + errors.join("\n"));
      return;
    }
    
    if (updatedRooms.length === 0) {
      alert("저장할 강의실이 없습니다.");
      return;
    }
    
    // 실제 변경된 항목만 필터링
    const changedRooms = updatedRooms.filter(r => !r.unchanged);
    
    if (changedRooms.length === 0) {
      alert("변경된 항목이 없습니다.");
      return;
    }
    
    // 확인 메시지
    if (!confirm(`${changedRooms.length}개의 강의실을 저장하시겠습니까?`)) {
      return;
    }
    
    try {
      // 이름 변경 내역 수집
      const nameChanges = new Map();
      changedRooms.forEach(room => {
        if (room.oldName && room.oldName !== room.name) {
          nameChanges.set(room.oldName, room.name);
        }
      });
      
      // 새 강의실과 기존 강의실 분리 (변경된 항목만)
      const newRooms = [];
      const existingRooms = [];
      
      changedRooms.forEach(room => {
        const roomToSave = { ...room };
        delete roomToSave.isNew;
        delete roomToSave.oldName;
        delete roomToSave.unchanged;
        
        if (room.isNew) {
          newRooms.push(roomToSave);
        } else {
          existingRooms.push(roomToSave);
        }
      });
      
      // 새 강의실만 먼저 생성
      if (newRooms.length > 0) {
        await RoomsAPI.createMultiple(newRooms);
      }
      
      // 전체 강의실 목록을 순서대로 서버에 저장 (순서 유지)
      const finalRooms = updatedRooms.map(r => {
        const { isNew, oldName, unchanged, ...room } = r;
        return room;
      });
      
      // 기존 강의실이 있으면 전체 순서를 업데이트
      if (existingRooms.length > 0 || newRooms.length > 0) {
        await RoomsAPI.updateMultiple(finalRooms);
      }
      
      // 이름 변경이 있으면 예약 정보 업데이트 (한 번에)
      if (nameChanges.size > 0) {
        const reservations = await getReservations();
        const updatedReservations = reservations.map((resv) => {
          const newName = nameChanges.get(resv.room);
          return newName ? { ...resv, room: newName } : resv;
        });
        await setReservations(updatedReservations);
      }
      
      // 상태 업데이트 (이미 finalRooms 생성됨)
      state.rooms = freezeRooms(finalRooms);
      
      // UI 업데이트 (병렬 처리)
      await Promise.all([
        renderRoomList(),
        populateRoomSelect()
      ]);
      
      // 상세 메시지
      const newCount = newRooms.length;
      const modifiedCount = existingRooms.length;
      let message = "";
      
      if (newCount > 0 && modifiedCount > 0) {
        message = `${newCount}개 추가, ${modifiedCount}개 수정되었습니다.`;
      } else if (newCount > 0) {
        message = `${newCount}개가 추가되었습니다.`;
      } else if (modifiedCount > 0) {
        message = `${modifiedCount}개가 수정되었습니다.`;
      }
      
      alert(message);
    } catch (error) {
      console.error("전체 저장 실패:", error);
      alert("강의실 저장 중 오류가 발생했습니다.");
    }
  }


  async function onSsoSubmit(event) {
    event.preventDefault();
    const userId = dom.ssoUserId.value.trim();
    const userName = dom.ssoUserName.value.trim();

    if (!userId) {
      alert("사번을 입력하세요.");
      dom.ssoUserId.focus();
      return;
    }
    if (!userName) {
      alert("이름을 입력하세요.");
      dom.ssoUserName.focus();
      return;
    }

    const admins = await getSsoAdmins();
    if (admins.some((admin) => admin.userId === userId)) {
      alert("이미 등록된 사번입니다.");
      dom.ssoUserId.focus();
      return;
    }

    const newAdmin = {
      id: generateUid(),
      userId,
      userName,
      dept: dom.ssoUserDept.value.trim() || null,
      note: dom.ssoUserNote.value.trim() || null,
      registeredAt: new Date().toISOString(),
    };

    try {
      await SsoAdminsAPI.create(newAdmin);
      dom.ssoForm.reset();
      await renderSsoAdminList();
      alert(`${userName}(${userId}) 관리자가 등록되었습니다.`);
    } catch (error) {
      console.error("SSO 관리자 등록 실패:", error);
      alert("관리자 등록 중 오류가 발생했습니다.");
    }
  }

  async function renderSsoAdminList() {
    if (!dom.ssoAdminList) return;

    const admins = await getSsoAdmins();
    dom.ssoAdminList.innerHTML = "";

    if (admins.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "empty";
      cell.textContent = "등록된 SSO 관리자가 없습니다.";
      row.appendChild(cell);
      dom.ssoAdminList.appendChild(row);
      return;
    }

    const fragment = document.createDocumentFragment();
    admins.forEach((admin) => {
      const row = document.createElement("tr");
      row.dataset.adminId = admin.id;

      // 사번 셀
      const userIdCell = document.createElement("td");
      userIdCell.textContent = admin.userId || "";
      row.appendChild(userIdCell);

      // 이름 셀
      const userNameCell = document.createElement("td");
      userNameCell.textContent = admin.userName || "";
      row.appendChild(userNameCell);

      // 부서/팀 셀
      const deptCell = document.createElement("td");
      deptCell.textContent = admin.dept || "";
      row.appendChild(deptCell);

      // 비고 셀
      const noteCell = document.createElement("td");
      noteCell.textContent = admin.note || "";
      row.appendChild(noteCell);

      // 작업 셀
      const actionsCell = document.createElement("td");
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger btn-sm";
      deleteBtn.textContent = "삭제";
      deleteBtn.addEventListener("click", () => removeSsoAdmin(admin.id));
      actionsCell.appendChild(deleteBtn);
      row.appendChild(actionsCell);

      fragment.appendChild(row);
    });

    dom.ssoAdminList.appendChild(fragment);
  }

  async function removeSsoAdmin(adminId) {
    const admins = await getSsoAdmins();
    const target = admins.find((admin) => admin.id === adminId);
    if (!target) {
      alert("관리자를 찾을 수 없습니다.");
      return;
    }

    if (
      !confirm(
        `${target.userName}(${target.userId}) 관리자를 삭제하시겠습니까?`
      )
    ) {
      return;
    }

    try {
      await SsoAdminsAPI.delete(adminId);
      await renderSsoAdminList();
      alert("관리자가 삭제되었습니다.");
    } catch (error) {
      console.error("SSO 관리자 삭제 실패:", error);
      alert("관리자 삭제 중 오류가 발생했습니다.");
    }
  }

  async function exportJson() {
    try {
      const payload = await BackupAPI.export();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const now = new Date();
      const name = `room-backup-${now.getFullYear()}${String(
        now.getMonth() + 1
      ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.json`;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("백업 내보내기 실패:", error);
      alert("백업 내보내기 중 오류가 발생했습니다.");
    }
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (
          !data ||
          !Array.isArray(data.rooms) ||
          !Array.isArray(data.reservations) ||
          !Array.isArray(data.holidays) ||
          !data.creds
        ) {
          throw new Error("형식이 올바르지 않습니다.");
        }
        if (
          !confirm(
            "JSON 데이터를 복원하면 기존 데이터가 모두 덮어쓰기 됩니다. 진행할까요?"
          )
        ) {
          return;
        }
        await BackupAPI.import(data);
        await setRooms(data.rooms);
        await setReservations(data.reservations);
        await setHolidays(data.holidays);
        await setCreds(data.creds);
        if (Array.isArray(data.ssoAdmins)) {
          for (const admin of data.ssoAdmins) {
            try {
              await SsoAdminsAPI.create(admin);
            } catch (err) {
              console.warn(`SSO 관리자 ${admin.userId} 등록 실패:`, err);
            }
          }
        }
        alert("데이터가 복원되었습니다.");
        await showAdmin();
      } catch (error) {
        console.error(error);
        alert("JSON 파일을 읽는 중 오류가 발생했습니다.");
      } finally {
        dom.importJsonInput.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  async function getColorLabels() {
    if (state.colorLabels) {
      return state.colorLabels;
    }
    try {
      const stored = loadJson("color_labels", null);
      if (!stored || !Array.isArray(stored)) {
        state.colorLabels = [...DEFAULT_COLOR_LABELS];
        saveJson("color_labels", state.colorLabels);
        return state.colorLabels;
      }
      // 저장된 색상이 24개가 아니면 기본값 사용
      if (stored.length !== DEFAULT_COLOR_LABELS.length) {
        state.colorLabels = [...DEFAULT_COLOR_LABELS];
        saveJson("color_labels", state.colorLabels);
        return state.colorLabels;
      }
      state.colorLabels = stored;
      return state.colorLabels;
    } catch (error) {
      console.error("색상 레이블 로드 실패:", error);
      return [...DEFAULT_COLOR_LABELS];
    }
  }

  async function setColorLabels(colorLabels) {
    state.colorLabels = colorLabels;
    saveJson("color_labels", colorLabels);
  }

  async function renderColorLabels() {
    if (!dom.colorLabelList) return;
    
    const colorLabels = await getColorLabels();
    dom.colorLabelList.innerHTML = "";
    
    const fragment = document.createDocumentFragment();
    
    colorLabels.forEach((item, index) => {
      const itemDiv = document.createElement("div");
      itemDiv.style.display = "flex";
      itemDiv.style.alignItems = "center";
      itemDiv.style.gap = "12px";
      itemDiv.style.padding = "8px";
      itemDiv.style.borderRadius = "8px";
      itemDiv.style.border = "1px solid var(--border)";
      itemDiv.style.background = "#fff";
      
      // 색상 미리보기
      const colorBox = document.createElement("div");
      colorBox.style.width = "40px";
      colorBox.style.height = "40px";
      colorBox.style.borderRadius = "6px";
      colorBox.style.backgroundColor = item.color;
      colorBox.style.border = "1px solid var(--border)";
      colorBox.style.flexShrink = "0";
      
      // 색상 코드
      const colorCode = document.createElement("div");
      colorCode.style.width = "80px";
      colorCode.style.fontSize = "13px";
      colorCode.style.color = "var(--text-muted)";
      colorCode.style.fontFamily = "monospace";
      colorCode.textContent = item.color;
      
      // 레이블 입력
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = item.label || "";
      labelInput.placeholder = "색상 이름 (예: 정규수업)";
      labelInput.style.flex = "1";
      labelInput.style.padding = "8px 12px";
      labelInput.style.border = "1px solid var(--border)";
      labelInput.style.borderRadius = "6px";
      labelInput.style.fontSize = "15px";
      labelInput.dataset.index = index;
      labelInput.addEventListener("change", (e) => updateColorLabel(index, e.target.value));
      
      itemDiv.appendChild(colorBox);
      itemDiv.appendChild(colorCode);
      itemDiv.appendChild(labelInput);
      
      fragment.appendChild(itemDiv);
    });
    
    dom.colorLabelList.appendChild(fragment);
  }

  async function updateColorLabel(index, label) {
    const colorLabels = await getColorLabels();
    const updated = [...colorLabels];
    updated[index] = {
      ...updated[index],
      label: label.trim()
    };
    await setColorLabels(updated);
    
    // 색상 선택기 업데이트
    if (dom.colorPickerContainer) {
      await renderColorPicker();
    }
  }

  async function renderColorPicker() {
    if (!dom.colorPickerContainer || !dom.reservationColor) return;
    
    const colorLabels = await getColorLabels();
    const currentColor = dom.reservationColor.value || "#2f54eb";
    
    dom.colorPickerContainer.innerHTML = "";
    const fragment = document.createDocumentFragment();
    
    colorLabels.forEach((item) => {
      const colorBtn = document.createElement("button");
      colorBtn.type = "button";
      colorBtn.className = "color-picker-btn";
      colorBtn.style.backgroundColor = item.color;
      colorBtn.dataset.color = item.color;
      colorBtn.title = item.label || item.color;
      
      if (item.color === currentColor) {
        colorBtn.classList.add("selected");
      }
      
      colorBtn.addEventListener("click", () => {
        dom.reservationColor.value = item.color;
        dom.colorPickerContainer
          .querySelectorAll(".color-picker-btn")
          .forEach((btn) => btn.classList.remove("selected"));
        colorBtn.classList.add("selected");
      });
      fragment.appendChild(colorBtn);
    });
    
    dom.colorPickerContainer.appendChild(fragment);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const time = formatTimeOnly(value);
    return `${year}-${month}-${day} ${time}`;
  }

  function formatTimeOnly(value) {
    const date = new Date(value);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function generateUid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function handleRepeatMode() {
    const mode = dom.reservationRepeat.value;
    const containers = [
      ...dom.reservationForm.querySelectorAll(".repeat-only"),
    ];
    
    // repeatUntilDate 필드가 포함된 컨테이너 찾기
    let repeatUntilDateContainer = null;
    containers.forEach((container) => {
      const allow = (container.dataset.repeat || "")
        .split(" ")
        .filter(Boolean);
      const isVisible = mode !== "none" && allow.includes(mode);
      container.hidden = !isVisible;
      
      // repeatUntilDate 필드가 있는 컨테이너 찾기
      if (dom.repeatUntilDate && container.contains(dom.repeatUntilDate)) {
        repeatUntilDateContainer = container;
      }
    });
    
    // repeatUntilDate 필드의 required 속성을 가시성에 따라 설정
    if (dom.repeatUntilDate && repeatUntilDateContainer) {
      if (!repeatUntilDateContainer.hidden) {
        dom.repeatUntilDate.setAttribute("required", "");
      } else {
        dom.repeatUntilDate.removeAttribute("required");
      }
    }
    
    if (mode === "none") {
      dom.repeatMonthlyDay.value = "";
      if (dom.repeatUntilDate) {
        dom.repeatUntilDate.value = "";
        dom.repeatUntilDate.removeAttribute("required");
      }
      dom.repeatWeeklyWrap
        .querySelectorAll("input[type=checkbox]")
        .forEach((input) => {
          input.checked = false;
        });
      return;
    }

    if (mode === "weekly") {
      const checked = dom.repeatWeeklyWrap.querySelectorAll(
        "input[type=checkbox]:checked"
      );
      if (checked.length === 0) {
        const startValue = dom.reservationStart.value;
        if (startValue) {
          const startDate = new Date(startValue);
          if (!Number.isNaN(startDate.getTime())) {
            const targetDay = startDate.getDay();
            const targetCheckbox = dom.repeatWeeklyWrap.querySelector(
              `input[value="${targetDay}"]`
            );
            if (targetCheckbox) {
              targetCheckbox.checked = true;
            }
          }
        }
      }
    }

    if (mode === "monthly" && !dom.repeatMonthlyDay.value) {
      const startValue = dom.reservationStart.value;
      if (startValue) {
        const startDate = new Date(startValue);
        if (!Number.isNaN(startDate.getTime())) {
          dom.repeatMonthlyDay.value = String(startDate.getDate());
        }
      }
    }
  }
})();
 
