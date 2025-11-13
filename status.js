(function () {
  const SESSION_KEY = "room_admin_logged";
  const CATEGORY_IDS = new Set(["all", "cat1", "cat2", "cat3"]);

  const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

  const dom = {};
  let activeCategory = "all";

  const ROOM_FIELD_DEFAULTS = Object.freeze({
    seats: null,
    computers: null,
    equipment: "",
    note: "",
  });

  const state = Object.seal({
    rooms: null,
    reservations: null,
    holidays: null,
  });

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

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await ensureDefaults();
      cacheDom();
      initRange();
      bindEvents();
      updateCategoryButtons();
      await renderTable();
      scrollToToday(true);
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
        : entry.note.trim() !== normalized.note);

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
    const seen = new Set();
    const normalized = [];
    rawHolidays.forEach((item) => {
      if (typeof item !== "string") return;
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      normalized.push(trimmed);
    });
    normalized.sort();
    const changed =
      normalized.length !== rawHolidays.length ||
      normalized.some((value, index) => value !== rawHolidays[index]);
    return { holidays: normalized, changed };
  }


  function isAdminLoggedIn() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (error) {
      console.warn("세션 정보 확인 중 오류:", error);
      return false;
    }
  }


  function filterRoomsByCategory(rooms, categoryId) {
    if (!Array.isArray(rooms)) return [];
    if (categoryId === "all") {
      return rooms;
    }
    // room.category 필드를 사용하여 필터링
    return rooms.filter((room) => room.category === categoryId);
  }

  async function setActiveCategory(categoryId) {
    if (!categoryId || !CATEGORY_IDS.has(categoryId)) {
      return;
    }
    if (categoryId === activeCategory) {
      scrollToToday(true);
      return;
    }
    activeCategory = categoryId;
    updateCategoryButtons();
    await renderTable();
    scrollToToday(true);
  }

  function updateCategoryButtons() {
    if (!dom.categoryButtons || dom.categoryButtons.length === 0) return;
    dom.categoryButtons.forEach((button) => {
      const isActive = button.dataset.category === activeCategory;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function cacheDom() {
    dom.rangeStart = document.getElementById("rangeStart");
    dom.rangeEnd = document.getElementById("rangeEnd");
    dom.rangeApplyBtn = document.getElementById("rangeApplyBtn");
    dom.scrollTodayBtn = document.getElementById("scrollTodayBtn");
    dom.exportExcelBtn = document.getElementById("exportExcelBtn");
    dom.categoryToggle = document.getElementById("categoryToggle");
    dom.categoryButtons = dom.categoryToggle
      ? [...dom.categoryToggle.querySelectorAll("button")]
      : [];
    const defaultActiveButton = dom.categoryButtons.find((button) =>
      button.classList.contains("active")
    );
    if (
      defaultActiveButton &&
      defaultActiveButton.dataset.category &&
      defaultActiveButton.dataset.category !== activeCategory
    ) {
      activeCategory = defaultActiveButton.dataset.category;
    }
    dom.table = document.getElementById("statusTable");
    dom.thead = dom.table.querySelector("thead");
    dom.tbody = dom.table.querySelector("tbody");
    dom.editModal = document.getElementById("edit-modal");
    dom.editReservationForm = document.getElementById("editReservationForm");
    dom.editTitle = document.getElementById("editTitle");
    dom.editInstructor = document.getElementById("editInstructor");
    dom.editSeats = document.getElementById("editSeats");
    dom.editHeadcount = document.getElementById("editHeadcount");
    dom.modalCloseBtn = document.getElementById("modalCloseBtn");
    dom.modalCancelBtn = document.getElementById("modalCancelBtn");
    dom.modalSaveBtn = document.getElementById("modalSaveBtn");
  }

  let editingReservationId = null;
  let modalFocusTrap = null;

  function bindEvents() {
    dom.rangeApplyBtn.addEventListener("click", async () => {
      const start = dom.rangeStart.value;
      const end = dom.rangeEnd.value;
      if (!start || !end) {
        alert("시작일과 종료일을 모두 선택하세요.");
        return;
      }
      if (start > end) {
        alert("종료일은 시작일 이후여야 합니다.");
        return;
      }
      await renderTable();
      scrollToToday(true);
    });

    dom.scrollTodayBtn.addEventListener("click", () => {
      scrollToToday(true);
    });

    dom.exportExcelBtn.addEventListener("click", exportExcel);

    // Quick date buttons
    document.querySelectorAll(".btn-quick-date").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const days = parseInt(btn.dataset.days, 10);
        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + days - 1);
        dom.rangeStart.value = toInputDate(today);
        dom.rangeEnd.value = toInputDate(endDate);
        await renderTable();
        scrollToToday(true);
      });
    });

    if (dom.categoryButtons.length > 0) {
      dom.categoryButtons.forEach((button) => {
        button.addEventListener("click", async () =>
          await setActiveCategory(button.dataset.category)
        );
      });
    }

    dom.modalCloseBtn.addEventListener("click", closeModal);
    dom.modalCancelBtn.addEventListener("click", closeModal);
    dom.editReservationForm.addEventListener("submit", handleEditSubmit);
    dom.editModal.addEventListener("click", (e) => {
      if (e.target === dom.editModal) {
        closeModal();
      }
    });
    document.addEventListener("keydown", handleModalKeydown);
  }

  function initRange() {
    const today = new Date();
    dom.rangeStart.value = toInputDate(today);
    dom.rangeEnd.value = toInputDate(addMonths(today, 6));
  }

  async function ensureDefaults() {
    // DB에서 데이터 로드
    try {
      // Rooms 로드
      const roomsData = await RoomsAPI.getAll();
      const { rooms: normalized, changed } = normalizeRooms(Array.isArray(roomsData) ? roomsData : []);
      state.rooms = freezeRooms(normalized);

      // Reservations 로드
      const reservationsData = await ReservationsAPI.getAll();
      const normalizedReservations = Array.isArray(reservationsData) ? reservationsData : [];
      state.reservations = freezeReservations(normalizedReservations);

      // Holidays 로드
      const holidaysData = await HolidaysAPI.getAll();
      const holidaysArray = Array.isArray(holidaysData) ? holidaysData : [];
      const { holidays } = normalizeHolidays(holidaysArray);
      state.holidays = freezeHolidays(holidays);
    } catch (error) {
      console.error("데이터 로드 실패:", error);
      // 기본값으로 초기화
      state.rooms = freezeRooms([]);
      state.reservations = freezeReservations([]);
      state.holidays = freezeHolidays([]);
    }
  }

  async function getRooms() {
    if (state.rooms) {
      return state.rooms;
    }
    try {
      const roomsData = await RoomsAPI.getAll();
      const { rooms } = normalizeRooms(Array.isArray(roomsData) ? roomsData : []);
      state.rooms = freezeRooms(rooms);
      return state.rooms;
    } catch (error) {
      console.error("회의실 목록 로드 실패:", error);
      return [];
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

  async function getHolidays() {
    if (state.holidays) {
      return state.holidays;
    }
    try {
      const holidaysData = await HolidaysAPI.getAll();
      const holidaysArray = Array.isArray(holidaysData) ? holidaysData : [];
      const { holidays } = normalizeHolidays(holidaysArray);
      state.holidays = freezeHolidays(holidays);
      return state.holidays;
    } catch (error) {
      console.error("공휴일 목록 로드 실패:", error);
      return [];
    }
  }

  async function renderTable() {
    const allRooms = await getRooms();
    const filteredRooms = filterRoomsByCategory(allRooms, activeCategory);
    const holidays = new Set(await getHolidays());
    const reservations = await getReservations();
    const startDate = parseISODate(dom.rangeStart.value);
    const endDate = parseISODate(dom.rangeEnd.value);
    const adminMode = isAdminLoggedIn();

    if (!startDate || !endDate) {
      return;
    }

    renderHeader(filteredRooms);
    dom.tbody.innerHTML = "";

    const messageColSpan = filteredRooms.length + 2;

    if (allRooms.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = filteredRooms.length + 1;
      cell.className = "empty";
      cell.textContent = "등록된 회의실이 없습니다. 회의실을 먼저 추가하세요.";
      row.appendChild(cell);
      dom.tbody.appendChild(row);
      return;
    }

    if (filteredRooms.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = allRooms.length + 1;
      cell.className = "empty";
      cell.textContent = "선택한 카테고리에 해당하는 회의실이 없습니다.";
      row.appendChild(cell);
      dom.tbody.appendChild(row);
      return;
    }

    const filteredReservations = filterReservationsInRange(
      reservations,
      startDate,
      endDate
    );
    const reservationIndex = buildReservationIndex(filteredReservations);
    const dateList = eachDay(startDate, endDate);
    const todayKey = dateKey(new Date());
    const fragment = document.createDocumentFragment();

    dateList.forEach((date) => {
      const row = document.createElement("tr");
      const key = dateKey(date);
      const dayIdx = date.getDay();
      const isWeekend = dayIdx === 0 || dayIdx === 6;
      const isHoliday = holidays.has(key);
      const isToday = key === todayKey;

      row.dataset.date = key;
      if (isHoliday) row.classList.add("row-holiday");
      if (!isHoliday && isWeekend) row.classList.add("row-weekend");
      if (isToday) row.classList.add("row-today");

      const dateCell = document.createElement("td");
      dateCell.textContent = `${key} (${DAY_LABELS[dayIdx]})`;

      row.appendChild(dateCell);

      filteredRooms.forEach((room) => {
        const cell = document.createElement("td");
        cell.classList.add("resv-cell");
        const items = getReservationsForDayRoom(
          reservationIndex,
          key,
          room.name
        );

        if (items.length > 0) {
          const wrapper = document.createElement("div");
          wrapper.className = "resv-stack";
          items.forEach((item) => {
            wrapper.appendChild(renderReservationChip(item, adminMode));
          });
          cell.appendChild(wrapper);
        }
        row.appendChild(cell);
      });

      fragment.appendChild(row);
    });

    dom.tbody.appendChild(fragment);
  }

  function renderHeader(rooms) {
    const tr = document.createElement("tr");
    const dateTh = document.createElement("th");
    dateTh.textContent = "날짜";
    tr.appendChild(dateTh);
    rooms.forEach((room) => {
      const th = document.createElement("th");
      th.textContent = room.name;
      tr.appendChild(th);
    });
    dom.thead.innerHTML = "";
    dom.thead.appendChild(tr);
  }

  function renderReservationChip(reservation, adminMode) {
    const container = document.createElement("article");
    container.className = "resv";
    if (reservation.id) {
      container.dataset.reservationId = reservation.id;
    }

    // 색상 적용
    const color = reservation.color || "#2f54eb";
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    container.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.05)`;
    container.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.18)`;

    // 빗금 패턴 적용
    const pattern = reservation.pattern || "none";
    if (pattern !== "none") {
      container.classList.add(`resv-pattern-${pattern}`);
    }

    const title = document.createElement("div");
    title.className = "resv-title";
    title.textContent = reservation.title || "(제목 없음)";

    const meta = document.createElement("div");
    meta.className = "resv-meta";
    const startTime = getReservationStartTime(reservation);
    const endTime = getReservationEndTime(reservation);
    const start = Number.isFinite(startTime)
      ? new Date(startTime)
      : new Date(reservation.start);
    const end = Number.isFinite(endTime)
      ? new Date(endTime)
      : new Date(reservation.end);

    const timeLabel = `${formatTime(start)} - ${formatTime(end)}`;
    const instructor = reservation.instructor
      ? `｜강사 ${reservation.instructor}`
      : "";
    const headcount = reservation.headcount
      ? `｜${reservation.headcount}명`
      : "";
    meta.textContent = `${timeLabel}${instructor}${headcount}`;

    container.append(title, meta);

    if (reservation.note) {
      const note = document.createElement("div");
      note.className = "resv-meta";
      note.textContent = reservation.note;
      container.appendChild(note);
    }

    if (reservation.id) {
      container.setAttribute("data-id", reservation.id);
      if (adminMode) {
        container.classList.add("resv--clickable");
        container.setAttribute("role", "button");
        container.tabIndex = 0;
        container.title = "관리자: 예약을 수정하려면 클릭하세요.";
        container.addEventListener("click", () =>
          handleReservationClick(reservation.id)
        );
        container.addEventListener("keydown", (event) => {
          if (
            event.key === "Enter" ||
            event.key === " " ||
            event.key === "Spacebar"
          ) {
            event.preventDefault();
            handleReservationClick(reservation.id);
          }
        });
      }
    }

    return container;
  }

  function handleReservationClick(reservationId) {
    if (!isAdminLoggedIn()) {
      alert("관리자 로그인이 필요합니다. 관리자 페이지에서 로그인 후 다시 시도하세요.");
      return;
    }
    openEditModal(reservationId);
  }

  async function openEditModal(reservationId) {
    const reservations = await getReservations();
    const reservation = reservations.find((r) => r.id === reservationId);
    if (!reservation) {
      alert("예약을 찾을 수 없습니다.");
      return;
    }

    editingReservationId = reservationId;
    dom.editTitle.value = reservation.title || "";
    dom.editInstructor.value = reservation.instructor || "";
    dom.editSeats.value = typeof reservation.seats === "number" ? String(reservation.seats) : "";
    dom.editHeadcount.value = typeof reservation.headcount === "number" ? String(reservation.headcount) : "";

    dom.editModal.hidden = false;
    setupModalFocusTrap();
    dom.editTitle.focus();
  }

  function closeModal() {
    dom.editModal.hidden = true;
    editingReservationId = null;
    removeModalFocusTrap();
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editingReservationId) return;

    const title = dom.editTitle.value.trim();
    const instructor = dom.editInstructor.value.trim();
    const seats = Number(dom.editSeats.value);
    const headcount = Number(dom.editHeadcount.value);

    if (!title) {
      alert("강의명을 입력하세요.");
      return;
    }
    if (!Number.isFinite(seats) || seats <= 0) {
      alert("좌석 수는 1 이상의 숫자로 입력하세요.");
      return;
    }
    if (!Number.isFinite(headcount) || headcount <= 0) {
      alert("인원 수는 1 이상의 숫자로 입력하세요.");
      return;
    }

    try {
      const reservations = await getReservations();
      const index = reservations.findIndex((r) => r.id === editingReservationId);
      if (index === -1) {
        alert("예약을 찾을 수 없습니다.");
        closeModal();
        return;
      }

      const updatedReservation = {
        ...reservations[index],
        title,
        instructor,
        seats,
        headcount,
      };

      // 서버에 업데이트
      await ReservationsAPI.update(editingReservationId, updatedReservation);
      
      // 상태 업데이트
      const updated = reservations.map((r, idx) => 
        idx === index ? updatedReservation : r
      );
      state.reservations = freezeReservations(updated);
      
      // 모달 닫기와 렌더링 병렬 처리
      closeModal();
      await renderTable();
      
      alert("예약이 수정되었습니다.");
    } catch (error) {
      console.error("예약 수정 실패:", error);
      alert("예약 수정 중 오류가 발생했습니다.");
    }
  }

  function handleModalKeydown(event) {
    if (dom.editModal.hidden) return;
    if (event.key === "Escape") {
      closeModal();
    }
  }

  function setupModalFocusTrap() {
    const focusableElements = dom.editModal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    modalFocusTrap = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    dom.editModal.addEventListener("keydown", modalFocusTrap);
  }

  function removeModalFocusTrap() {
    if (modalFocusTrap) {
      dom.editModal.removeEventListener("keydown", modalFocusTrap);
      modalFocusTrap = null;
    }
  }

  function scrollToToday(force = false) {
    const today = dateKey(new Date());
    const row = dom.tbody.querySelector(`tr[data-date="${today}"]`);
    if (row) {
      row.scrollIntoView({
        block: "center",
        behavior: force ? "smooth" : "auto",
      });
    }
  }

  function filterReservationsInRange(reservations, startDate, endDate) {
    if (!Array.isArray(reservations)) return [];
    const rangeStart = startOfDay(startDate).getTime();
    const rangeEnd = endOfDay(endDate).getTime();
    return reservations.filter((reservation) => {
      const startTime = getReservationStartTime(reservation);
      const endTime = getReservationEndTime(reservation);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
        return false;
      }
      return endTime >= rangeStart && startTime <= rangeEnd;
    });
  }

  function buildReservationIndex(reservations) {
    const index = new Map();
    reservations.forEach((reservation) => {
      if (!reservation || typeof reservation !== "object") return;
      const room = reservation.room;
      if (!room) return;
      const startTime = getReservationStartTime(reservation);
      const endTime = getReservationEndTime(reservation);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return;
      const startDate = startOfDay(new Date(startTime));
      const endDate = startOfDay(new Date(endTime));
      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
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

  function getReservationsForDayRoom(reservationIndex, dateKeyValue, roomName) {
    if (!reservationIndex || !roomName) return [];
    const key =
      typeof dateKeyValue === "string" ? dateKeyValue : dateKey(dateKeyValue);
    const roomMap = reservationIndex.get(key);
    if (!roomMap) return [];
    return roomMap.get(roomName) || [];
  }

  async function exportExcel() {
    if (typeof ExcelJS === "undefined") {
      alert("엑셀 라이브러리를 불러오지 못했습니다.");
      return;
    }

    try {
      const allRooms = await getRooms();
      const filteredRooms = filterRoomsByCategory(allRooms, activeCategory);
      const reservations = await getReservations();
      const holidays = new Set(await getHolidays());
      const startDate = parseISODate(dom.rangeStart.value);
      const endDate = parseISODate(dom.rangeEnd.value);

      if (!startDate || !endDate) {
        alert("엑셀로 내보낼 기간이 올바르지 않습니다.");
        return;
      }

      if (filteredRooms.length === 0) {
        alert("선택한 카테고리에 해당하는 회의실이 없습니다.");
        return;
      }

      const dates = eachDay(startDate, endDate);
      const reservationsInRange = filterReservationsInRange(
        reservations,
        startDate,
        endDate
      );
      const reservationIndex = buildReservationIndex(reservationsInRange);
      const todayKey = dateKey(new Date());

      // ExcelJS 워크북 생성
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("예약 현황");

      // 헤더 행 추가
      const headerRow = worksheet.addRow([
        "날짜",
        ...filteredRooms.map((room) => room.name),
      ]);

      // 헤더 스타일
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F6FB' }
        };
        cell.font = { bold: true, color: { argb: 'FF656A80' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E6F2' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E6F2' } },
          left: { style: 'thin', color: { argb: 'FFE2E6F2' } },
          right: { style: 'thin', color: { argb: 'FFE2E6F2' } }
        };
      });

      // 컬럼 너비 설정
      worksheet.columns = [
        { width: 18 },
        ...filteredRooms.map(() => ({ width: 36 })),
      ];

      // 데이터 행 추가
      dates.forEach((date) => {
        const key = dateKey(date);
        const dayIdx = date.getDay();
        const isWeekend = dayIdx === 0 || dayIdx === 6;
        const isHoliday = holidays.has(key);
        const isToday = key === todayKey;

        const rowData = [
          `${key} (${DAY_LABELS[dayIdx]})`,
          ...filteredRooms.map((room) => {
            const items = getReservationsForDayRoom(
              reservationIndex,
              key,
              room.name
            );
            return items
              .map((item) => formatReservationForExcel(item))
              .join("\n");
          }),
        ];

        const row = worksheet.addRow(rowData);
        
        // 행 높이 자동 조정
        row.height = 20;

        row.eachCell((cell, colNumber) => {
          // 기본 격자 스타일
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E6F2' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E6F2' } },
            left: { style: 'thin', color: { argb: 'FFE2E6F2' } },
            right: { style: 'thin', color: { argb: 'FFE2E6F2' } }
          };
          cell.alignment = { vertical: 'top', wrapText: true };

          // 날짜 컬럼 중앙 정렬
          if (colNumber === 1) {
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          }

          // 배경색 우선순위: 예약 색상 > 오늘 > 공휴일 > 주말
          if (colNumber >= 2) {
            const roomIndex = colNumber - 2;
            const room = filteredRooms[roomIndex];
            const items = getReservationsForDayRoom(
              reservationIndex,
              key,
              room.name
            );
            
            if (items.length > 0) {
              // 예약이 있으면 첫 번째 예약의 색상과 패턴 사용
              const firstReservation = items[0];
              const color = firstReservation.color || "#2f54eb";
              const pattern = firstReservation.pattern || "none";
              const argb = 'FF' + color.substring(1).toUpperCase();
              
              // 패턴에 따라 다른 스타일 적용
              if (pattern === "none") {
                // 단색 배경
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: argb }
                };
              } else if (pattern === "diagonal") {
                // 대각선 패턴 (lightGray 기본, darkGray 선택 색상 혼합)
                cell.fill = {
                  type: 'pattern',
                  pattern: 'lightUp',
                  fgColor: { argb: argb },
                  bgColor: { argb: 'FFFFFFFF' }
                };
              } else if (pattern === "vertical") {
                // 세로선 패턴
                cell.fill = {
                  type: 'pattern',
                  pattern: 'lightVertical',
                  fgColor: { argb: argb },
                  bgColor: { argb: 'FFFFFFFF' }
                };
              } else if (pattern === "horizontal") {
                // 가로선 패턴
                cell.fill = {
                  type: 'pattern',
                  pattern: 'lightHorizontal',
                  fgColor: { argb: argb },
                  bgColor: { argb: 'FFFFFFFF' }
                };
              } else if (pattern === "grid") {
                // 격자 패턴
                cell.fill = {
                  type: 'pattern',
                  pattern: 'lightGrid',
                  fgColor: { argb: argb },
                  bgColor: { argb: 'FFFFFFFF' }
                };
              } else {
                // 기본값
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: argb }
                };
              }
              
              cell.font = { color: { argb: 'FF000000' }, bold: true }; // 검은색 굵은 글자
            } else if (isToday) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE8ECFA' }
              };
            } else if (isHoliday) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9D9D9' }
              };
            } else if (isWeekend) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF0F1F5' }
              };
            }
          } else {
            // 날짜 컬럼 배경색
            if (isToday) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE8ECFA' }
              };
            } else if (isHoliday) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9D9D9' }
              };
            } else if (isWeekend) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF0F1F5' }
              };
            }
          }
        });
      });

      // 엑셀 파일 생성 및 다운로드
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const now = new Date();
      const filename = `room-status-${now.getFullYear()}${String(
        now.getMonth() + 1
      ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.xlsx`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("엑셀 내보내기 실패:", error);
      alert("엑셀 내보내기 중 오류가 발생했습니다.");
    }
  }

  function formatReservationForExcel(reservation) {
    const startTime = getReservationStartTime(reservation);
    const endTime = getReservationEndTime(reservation);
    const start = Number.isFinite(startTime)
      ? new Date(startTime)
      : new Date(reservation.start);
    const end = Number.isFinite(endTime)
      ? new Date(endTime)
      : new Date(reservation.end);
    const timeRange = `${formatTime(start)}~${formatTime(end)}`;
    const title = reservation.title || "(제목 없음)";
    const instructor = reservation.instructor
      ? ` (${reservation.instructor})`
      : "";
    let headcount = "";
    if (
      typeof reservation.headcount === "number" &&
      typeof reservation.seats === "number" &&
      reservation.headcount > 0 &&
      reservation.seats > 0
    ) {
      headcount = ` [${reservation.headcount}/${reservation.seats}]`;
    }
    return `${timeRange} ${title}${instructor}${headcount}`;
  }

  function toInputDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseISODate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  function endOfDay(date) {
    const value = new Date(date);
    value.setHours(23, 59, 59, 999);
    return value;
  }

  function eachDay(start, end) {
    const current = new Date(start);
    const dates = [];
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
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

  function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
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
})();

