import * as XLSX from "xlsx";

/**
 * Build full list of available rooms from space configuration.
 */
export function buildRoomsList(spaceConfig) {
  const rooms = [];
  for (let i = 1; i <= (Number(spaceConfig.regularCount) || 0); i++) {
    rooms.push({
      id: `R${i}`,
      name: `قاعة ${String(i).padStart(2, "0")}`,
      type: "عادية",
      capacity: Number(spaceConfig.regularCapacity) || 22,
      isGroundFloor: i <= (Number(spaceConfig.groundFloorCount) || 0),
    });
  }
  if (spaceConfig.useLabs) {
    for (let i = 1; i <= (Number(spaceConfig.labsCount) || 0); i++) {
      rooms.push({
        id: `L${i}`,
        name: `مخبر ${i}`,
        type: "مخبر",
        capacity: Number(spaceConfig.labsCapacity) || 20,
        isGroundFloor: true,
      });
    }
  }
  if (spaceConfig.useWorkshops) {
    for (let i = 1; i <= (Number(spaceConfig.workshopsCount) || 0); i++) {
      rooms.push({
        id: `W${i}`,
        name: `ورشة ${i}`,
        type: "ورشة",
        capacity: Number(spaceConfig.workshopsCapacity) || 20,
        isGroundFloor: true,
      });
    }
  }
  return rooms;
}

/**
 * Allocate rooms automatically per exam group.
 * Smallest sub-groups are assigned to Labs/Workshops when needed so they stay within capacity.
 */
export function allocateRoomsForGroups(classes, rooms) {
  const groupIds = [...new Set(classes.map((c) => Number(c.group)))].sort((a, b) => a - b);
  const regularRooms = rooms.filter((r) => r.type === "عادية");
  const specialRooms = rooms.filter((r) => r.type !== "عادية");

  const allocations = {}; // groupId -> array of { subId, classId, className, level, subLabel, studentCount, roomName, roomType, roomCapacity, isGroundFloor, overCapacity }

  for (const gId of groupIds) {
    const gClasses = classes.filter((c) => Number(c.group) === gId);
    const subGroups = [];

    for (const cls of gClasses) {
      const k = Math.max(1, Number(cls.splitCount) || 1);
      const base = Math.floor(cls.count / k);
      const rem = cls.count % k;
      const labels = ["أ", "ب", "ج", "د"];
      for (let i = 0; i < k; i++) {
        subGroups.push({
          subId: `${cls.id}_${i}`,
          classId: cls.id,
          className: cls.name,
          level: cls.level,
          subLabel: k === 1 ? "كامل" : `فوج (${labels[i] || i + 1})`,
          studentCount: base + (i < rem ? 1 : 0),
        });
      }
    }

    // Determine how many special rooms are needed (if subGroups > regularRooms)
    const neededSpecial = Math.max(0, subGroups.length - regularRooms.length);

    // Sort by studentCount ascending to pick smallest classes for special rooms (Labs/Workshops)
    const sortedIndices = subGroups
      .map((sg, idx) => ({ idx, count: sg.studentCount }))
      .sort((a, b) => a.count - b.count);

    const specialSet = new Set(sortedIndices.slice(0, neededSpecial).map((x) => x.idx));

    let regPtr = 0;
    let spPtr = 0;

    allocations[gId] = subGroups.map((sg, idx) => {
      let chosenRoom = null;
      if (specialSet.has(idx) && spPtr < specialRooms.length) {
        chosenRoom = specialRooms[spPtr++];
      } else if (regPtr < regularRooms.length) {
        chosenRoom = regularRooms[regPtr++];
      } else if (spPtr < specialRooms.length) {
        chosenRoom = specialRooms[spPtr++];
      }

      return {
        ...sg,
        roomName: chosenRoom ? chosenRoom.name : "عجز قاعة!",
        roomType: chosenRoom ? chosenRoom.type : "غير متوفرة",
        roomCapacity: chosenRoom ? chosenRoom.capacity : 0,
        isGroundFloor: chosenRoom ? chosenRoom.isGroundFloor : false,
        overCapacity: chosenRoom ? sg.studentCount > chosenRoom.capacity : true,
      };
    });
  }

  return allocations;
}

/**
 * Generalized Fair Invigilation Scheduler
 * Respects:
 * - Equal duty distribution (exact equality when auto-reserve enabled, or max diff <= 1)
 * - Reserves ("اح") optional & capped
 * - Prevent teacher from invigilating their own subject
 * - Prevent teacher from invigilating the same pedagogical class twice
 * - Ground floor only preference
 */
export function generateInvigilationSchedule({
  teachers,
  examDays,
  allocations,
  options,
}) {
  const {
    useReserves = true,
    autoBalanceReserves = true,
    maxReservesPerSession = 3,
    avoidOwnSubject = true,
    avoidRepeatedClass = true,
    respectGroundFloor = true,
  } = options;

  // Flatten sessions
  const sessions = [];
  examDays.forEach((day, dIdx) => {
    (day.sessions || []).forEach((sess, sIdx) => {
      const activeAlloc = (allocations[Number(day.group)] || []).filter(
        (a) => a.roomName && a.roomName !== "عجز قاعة!"
      );
      sessions.push({
        key: `${day.id}__${sess.id}`,
        dayId: day.id,
        dayIdx: dIdx,
        dayName: day.dayName,
        date: day.date,
        group: Number(day.group),
        sessionId: sess.id,
        sessionIdx: sIdx,
        time: sess.time,
        subject: sess.subject || "",
        rooms: activeAlloc,
        reserveCount: 0,
      });
    });
  });

  const numTeachers = teachers.length;
  if (numTeachers === 0 || sessions.length === 0) {
    return { sessions, assignments: {}, stats: null };
  }

  const totalRoomSlots = sessions.reduce((acc, s) => acc + s.rooms.length, 0);

  // Calculate reserves per session
  if (useReserves && maxReservesPerSession > 0) {
    if (autoBalanceReserves) {
      // Find smallest total reserve slots so (totalRoomSlots + totalRes) % numTeachers === 0
      // while keeping reserves per session <= maxReservesPerSession
      const maxTotalRes = sessions.reduce(
        (acc, s) => acc + Math.max(0, Math.min(maxReservesPerSession, numTeachers - s.rooms.length)),
        0
      );
      let targetRes = 0;
      const rem = totalRoomSlots % numTeachers;
      if (rem !== 0) {
        targetRes = numTeachers - rem;
      } else {
        targetRes = Math.min(numTeachers, maxTotalRes);
      }
      // If we can add another full multiple of numTeachers and still stay within maxReservesPerSession (around 2-3/session)
      while (targetRes + numTeachers <= maxTotalRes && (targetRes + numTeachers) / sessions.length <= maxReservesPerSession) {
        // Prefer having at least ~2 reserves per session if possible
        if (targetRes / sessions.length < 1.5) {
          targetRes += numTeachers;
        } else {
          break;
        }
      }
      targetRes = Math.min(targetRes, maxTotalRes);

      // Distribute targetRes across sessions, prioritizing morning (sessionIdx === 0) and larger sessions
      const sessionOrder = sessions
        .map((s, idx) => ({ idx, priority: (s.sessionIdx === 0 ? 10 : 0) + s.rooms.length }))
        .sort((a, b) => b.priority - a.priority);

      let remaining = targetRes;
      let safety = 0;
      while (remaining > 0 && safety < 1000) {
        safety++;
        let addedAny = false;
        for (const item of sessionOrder) {
          if (remaining <= 0) break;
          const s = sessions[item.idx];
          const cap = Math.min(maxReservesPerSession, numTeachers - s.rooms.length);
          if (s.reserveCount < cap) {
            s.reserveCount++;
            remaining--;
            addedAny = true;
          }
        }
        if (!addedAny) break;
      }
    } else {
      sessions.forEach((s) => {
        s.reserveCount = Math.max(0, Math.min(maxReservesPerSession, numTeachers - s.rooms.length));
      });
    }
  }

  // Track teacher state
  const teacherStats = {};
  teachers.forEach((t) => {
    teacherStats[t.id] = {
      total: 0,
      rooms: 0,
      reserves: 0,
      classesSeen: new Set(),
      roomsSeen: new Set(),
      daysWorked: new Map(), // dayId -> count
    };
  });

  // assignments[teacherId][sessionKey] = { type: 'room'|'reserve', roomName, className, subLabel }
  const assignments = {};
  teachers.forEach((t) => {
    assignments[t.id] = {};
  });

  // Shuffle helper
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Assign session by session using greedy min-cost scoring
  for (const sess of sessions) {
    const neededTotal = Math.min(numTeachers, sess.rooms.length + sess.reserveCount);
    const available = shuffle(teachers);

    // Step 1: Select teachers for this session (lowest total duties first, slight preference for continuity on same day)
    available.sort((a, b) => {
      const sa = teacherStats[a.id];
      const sb = teacherStats[b.id];
      if (sa.total !== sb.total) return sa.total - sb.total;
      // Slight preference to group duties on days they already work (to maximize full rest days)
      const da = sa.daysWorked.get(sess.dayId) || 0;
      const db = sb.daysWorked.get(sess.dayId) || 0;
      return db - da;
    });

    const selected = available.slice(0, neededTotal);

    // Step 2: Pick reserve teachers ("اح") from selected:
    // Prefer teachers whose subject matches sess.subject (so they don't guard their own subject!), and lowest reserves so far
    const reserveCount = Math.max(0, selected.length - sess.rooms.length);
    const reserveCandidates = [...selected].sort((a, b) => {
      const aOwn = avoidOwnSubject && sess.subject && a.subject === sess.subject ? 1 : 0;
      const bOwn = avoidOwnSubject && sess.subject && b.subject === sess.subject ? 1 : 0;
      if (aOwn !== bOwn) return bOwn - aOwn;
      return teacherStats[a.id].reserves - teacherStats[b.id].reserves;
    });

    const reserveTeachers = new Set(reserveCandidates.slice(0, reserveCount).map((t) => t.id));
    for (const tId of reserveTeachers) {
      assignments[tId][sess.key] = { type: "reserve", roomName: "اح", className: "احتياط", subLabel: "" };
      teacherStats[tId].total++;
      teacherStats[tId].reserves++;
      teacherStats[tId].daysWorked.set(sess.dayId, (teacherStats[tId].daysWorked.get(sess.dayId) || 0) + 1);
    }

    // Step 3: Assign remaining selected teachers to rooms minimizing constraint violations
    const roomTeachers = selected.filter((t) => !reserveTeachers.has(t.id));
    const roomsToFill = shuffle(sess.rooms);

    // Assign groundFloorOnly teachers first!
    const orderedTeachers = [...roomTeachers].sort((a, b) => {
      const ag = respectGroundFloor && a.groundFloorOnly ? 1 : 0;
      const bg = respectGroundFloor && b.groundFloorOnly ? 1 : 0;
      return bg - ag;
    });

    const usedRooms = new Set();
    for (const teacher of orderedTeachers) {
      const st = teacherStats[teacher.id];
      let bestRoom = null;
      let bestPenalty = Infinity;

      for (let i = 0; i < roomsToFill.length; i++) {
        if (usedRooms.has(i)) continue;
        const rm = roomsToFill[i];
        let penalty = 0;
        if (avoidRepeatedClass && st.classesSeen.has(rm.className)) penalty += 1000;
        if (st.roomsSeen.has(rm.roomName)) penalty += 50;
        if (respectGroundFloor && teacher.groundFloorOnly && !rm.isGroundFloor) penalty += 500;
        if (avoidOwnSubject && sess.subject && teacher.subject === sess.subject) penalty += 300;
        penalty += Math.random() * 5; // tie breaker

        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestRoom = { idx: i, rm };
        }
      }

      if (bestRoom) {
        usedRooms.add(bestRoom.idx);
        const rm = bestRoom.rm;
        assignments[teacher.id][sess.key] = {
          type: "room",
          roomName: rm.roomName,
          className: rm.className,
          subLabel: rm.subLabel,
          studentCount: rm.studentCount,
        };
        st.total++;
        st.rooms++;
        st.classesSeen.add(rm.className);
        st.roomsSeen.add(rm.roomName);
        st.daysWorked.set(sess.dayId, (st.daysWorked.get(sess.dayId) || 0) + 1);
      }
    }
  }

  // Compute verification stats
  const totals = teachers.map((t) => teacherStats[t.id].total);
  let repeatedClasses = 0;
  let ownSubjectConflicts = 0;
  let groundFloorViolations = 0;

  for (const t of teachers) {
    const seen = new Set();
    for (const s of sessions) {
      const cell = assignments[t.id][s.key];
      if (cell && cell.type === "room") {
        if (seen.has(cell.className)) repeatedClasses++;
        seen.add(cell.className);
        if (s.subject && t.subject === s.subject) ownSubjectConflicts++;
        if (t.groundFloorOnly) {
          const rmObj = s.rooms.find((r) => r.roomName === cell.roomName);
          if (rmObj && !rmObj.isGroundFloor) groundFloorViolations++;
        }
      }
    }
  }

  const totalReserves = sessions.reduce((acc, s) => acc + s.reserveCount, 0);

  return {
    sessions,
    assignments,
    stats: {
      totalTeachers: numTeachers,
      totalSessions: sessions.length,
      totalRoomSlots,
      totalReserves,
      totalSlots: totalRoomSlots + totalReserves,
      minDuties: Math.min(...totals),
      maxDuties: Math.max(...totals),
      repeatedClasses,
      ownSubjectConflicts,
      groundFloorViolations,
    },
  };
}

/**
 * Parse Algerian Digitization Staff file (.xls HTML table or .xlsx)
 * Filters strictly rows where الرتبة contains "أستاذ"
 */
export async function parseDigitizationStaffFile(file) {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buffer);

  // Case 1: HTML-based .xls exported from الرقمية
  if (text.includes("<table") || text.includes("<html") || text.includes("<TR") || text.includes("<tr")) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const rows = Array.from(doc.querySelectorAll("tr"));

    let headerIdx = -1;
    let colLast = -1, colFirst = -1, colRank = -1, colSubject = -1;

    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const cells = Array.from(rows[i].querySelectorAll("td, th")).map((c) => c.textContent.trim());
      if (cells.some((c) => c.includes("الرتبة")) && cells.some((c) => c.includes("اللقب"))) {
        headerIdx = i;
        colLast = cells.findIndex((c) => c.includes("اللقب"));
        colFirst = cells.findIndex((c) => c.includes("الاسم"));
        colRank = cells.findIndex((c) => c.includes("الرتبة"));
        colSubject = cells.findIndex((c) => c.includes("المادة"));
        break;
      }
    }

    if (headerIdx === -1) {
      throw new Error("تعذر العثور على أعمدة (اللقب، الاسم، الرتبة، المادة) في الملف.");
    }

    const teachers = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll("td, th")).map((c) => c.textContent.trim());
      const rank = cells[colRank] || "";
      if (rank.includes("أستاذ")) {
        const fullName = `${cells[colLast] || ""} ${cells[colFirst] || ""}`.trim();
        if (fullName) {
          teachers.push({
            id: `imp_t_${i}_${Date.now()}`,
            name: fullName,
            subject: (cells[colSubject] || "غير محددة").trim(),
            groundFloorOnly: false,
          });
        }
      }
    }
    return teachers;
  }

  // Case 2: Standard Excel (.xlsx / binary .xls)
  const wb = XLSX.read(buffer, { type: "array", cellStyles: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  let headerIdx = data.findIndex(
    (row) => row.some((c) => String(c).includes("الرتبة")) || row.some((c) => String(c).includes("اللقب"))
  );
  if (headerIdx === -1) headerIdx = 0;

  const hdr = data[headerIdx].map((c) => String(c).trim());
  const colLast = hdr.findIndex((c) => c.includes("اللقب") || c.includes("الاسم"));
  const colFirst = hdr.findIndex((c, idx) => idx !== colLast && c.includes("الاسم"));
  const colRank = hdr.findIndex((c) => c.includes("الرتبة"));
  const colSubject = hdr.findIndex((c) => c.includes("المادة"));

  const teachers = [];
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    const rank = colRank >= 0 ? String(row[colRank] || "") : "أستاذ";
    if (colRank === -1 || rank.includes("أستاذ")) {
      const name = colFirst >= 0
        ? `${row[colLast] || ""} ${row[colFirst] || ""}`.trim()
        : String(row[colLast >= 0 ? colLast : 0] || "").trim();
      if (name) {
        teachers.push({
          id: `imp_t_${i}_${Date.now()}`,
          name,
          subject: colSubject >= 0 ? String(row[colSubject] || "غير محددة").trim() : "غير محددة",
          groundFloorOnly: false,
        });
      }
    }
  }
  return teachers;
}

/**
 * Parse Student Stats file (.xlsx from الرقمية)
 */
export async function parseStudentStatsFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellStyles: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const detectLevel = (name) => {
    const s = String(name);
    if (s.includes("أولى") || s.includes("اولى") || s.startsWith("1")) return { level: "السنة الأولى", group: 1 };
    if (s.includes("ثانية") || s.startsWith("2")) return { level: "السنة الثانية", group: 2 };
    if (s.includes("ثالثة") || s.startsWith("3")) return { level: "السنة الثالثة", group: 1 };
    if (s.includes("رابعة") || s.startsWith("4")) return { level: "السنة الرابعة", group: 2 };
    return { level: "مستوى عام", group: 1 };
  };

  const classes = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[0] || "").replace(/\s+/g, " ").trim();
    const count = parseInt(row[1], 10);
    if (name && !isNaN(count) && count > 0 && !name.includes("الفوج") && !name.includes("المجموع")) {
      const { level, group } = detectLevel(name);
      classes.push({
        id: `imp_c_${i}_${Date.now()}`,
        name,
        level,
        count,
        group,
        splitCount: 2,
      });
    }
  }
  return classes;
}

/**
 * Export full schedule to multi-sheet Excel (.xlsx)
 */
export function exportScheduleToExcel({ schoolInfo, teachers, sessions, assignments, allocations }) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: General Invigilation Matrix
  const header1 = [
    "الرقم",
    "الأستاذ(ة)",
    "المادة",
    ...sessions.map((s) => `${s.dayName} ${s.date} (${s.time})`),
    "المجموع",
    "قاعات",
    "احتياط",
  ];
  const rows1 = [header1];
  teachers.forEach((t, idx) => {
    let total = 0, res = 0;
    const cells = sessions.map((s) => {
      const a = assignments[t.id]?.[s.key];
      if (!a) return "";
      total++;
      if (a.type === "reserve") {
        res++;
        return "اح";
      }
      return a.roomName;
    });
    rows1.push([idx + 1, t.name, t.subject, ...cells, total, total - res, res]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(rows1);
  ws1["!views"] = [{ RTL: true }];
  XLSX.utils.book_append_sheet(wb, ws1, "جدول الحراسة العام");

  // Sheet 2: Room Allocations
  const rows2 = [["المجموعة", "القسم", "الفوج الفرعي", "عدد التلاميذ", "القاعة المقترحة", "النوع", "السعة"]];
  Object.entries(allocations).forEach(([gId, list]) => {
    list.forEach((item) => {
      rows2.push([`المجموعة ${gId}`, item.className, item.subLabel, item.studentCount, item.roomName, item.roomType, item.roomCapacity]);
    });
  });
  const ws2 = XLSX.utils.aoa_to_sheet(rows2);
  ws2["!views"] = [{ RTL: true }];
  XLSX.utils.book_append_sheet(wb, ws2, "توزيع القاعات");

  // Sheet 3: Exam Timetable
  const rows3 = [["اليوم", "التاريخ", "المجموعة", "التوقيت", "المادة", "القاعات المستغلة", "الاحتياط"]];
  sessions.forEach((s) => {
    rows3.push([s.dayName, s.date, `المجموعة ${s.group}`, s.time, s.subject || "—", s.rooms.length, s.reserveCount]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(rows3);
  ws3["!views"] = [{ RTL: true }];
  XLSX.utils.book_append_sheet(wb, ws3, "جدول سير الاختبارات");

  const fileName = `جدول_الحراسة_${(schoolInfo.schoolName || "المؤسسة").replace(/\s+/g, "_")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
