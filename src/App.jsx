import React, { useState, useMemo, useEffect } from "react";
import {
  Building2, Users, GraduationCap, Calendar, ShieldCheck, Printer,
  Sparkles, Upload, Plus, Trash2, RefreshCw, Download, CheckCircle2,
  AlertTriangle, Send, X, KeyRound, Settings2, FileSpreadsheet
} from "lucide-react";
import {
  DEFAULT_SCHOOL_INFO,
  DEFAULT_SPACE_CONFIG,
  DEFAULT_CLASSES,
  DEFAULT_TEACHERS,
  DEFAULT_EXAM_DAYS,
} from "./data/defaultData";
import {
  buildRoomsList,
  allocateRoomsForGroups,
  generateInvigilationSchedule,
  parseDigitizationStaffFile,
  parseStudentStatsFile,
  exportScheduleToExcel,
} from "./utils/scheduler";

const STORAGE_KEY = "algerian_exam_platform_v1";

function loadSaved(key, fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed[key] !== undefined ? parsed[key] : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [step, setStep] = useState(1);
  const [schoolInfo, setSchoolInfo] = useState(() => loadSaved("schoolInfo", DEFAULT_SCHOOL_INFO));
  const [spaceConfig, setSpaceConfig] = useState(() => loadSaved("spaceConfig", DEFAULT_SPACE_CONFIG));
  const [teachers, setTeachers] = useState(() => loadSaved("teachers", DEFAULT_TEACHERS));
  const [classes, setClasses] = useState(() => loadSaved("classes", DEFAULT_CLASSES));
  const [examDays, setExamDays] = useState(() => loadSaved("examDays", DEFAULT_EXAM_DAYS));
  const [schedOptions, setSchedOptions] = useState(() =>
    loadSaved("schedOptions", {
      useReserves: true,
      autoBalanceReserves: true,
      maxReservesPerSession: 3,
      avoidOwnSubject: true,
      avoidRepeatedClass: true,
      respectGroundFloor: true,
    })
  );

  // Invigilation result state
  const [scheduleResult, setScheduleResult] = useState(null);
  const [importMsg, setImportMsg] = useState("");

  // Print states
  const [printMode, setPrintMode] = useState("cards4"); // cards4 | cards2 | secretariat | daily
  const [selectedSessionKey, setSelectedSessionKey] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("");

  // Gemini AI Drawer
  const [aiOpen, setAiOpen] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("gemini_api_key_local") || "");
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState([
    {
      role: "assistant",
      text: "مرحباً بك في المستشار الذكي. يمكنني تحليل معطيات مؤسستك واقتراح أفضل توزيع للقاعات، إيجاد بديل فوري لأستاذ غائب، أو صياغة إعلان رسمي للأساتذة.",
    },
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  // Manual add forms
  const [newTeacher, setNewTeacher] = useState({ name: "", subject: "اللغة العربية" });
  const [newClass, setNewClass] = useState({ name: "", level: "السنة الأولى", count: 38, group: 1, splitCount: 2 });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ schoolInfo, spaceConfig, teachers, classes, examDays, schedOptions })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [schoolInfo, spaceConfig, teachers, classes, examDays, schedOptions]);

  // Derived values
  const rooms = useMemo(() => buildRoomsList(spaceConfig), [spaceConfig]);
  const allocations = useMemo(() => allocateRoomsForGroups(classes, rooms), [classes, rooms]);
  const availableSubjects = useMemo(() => {
    const set = new Set(teachers.map((t) => t.subject).filter(Boolean));
    return [...set];
  }, [teachers]);

  // Auto-generate initial schedule when entering step 5 or 6 if empty
  const runScheduler = () => {
    const res = generateInvigilationSchedule({
      teachers,
      examDays,
      allocations,
      options: schedOptions,
    });
    setScheduleResult(res);
    if (res.sessions.length > 0 && !selectedSessionKey) {
      setSelectedSessionKey(res.sessions[0].key);
    }
    if (examDays.length > 0 && !selectedDayId) {
      setSelectedDayId(examDays[0].id);
    }
  };

  useEffect(() => {
    if ((step === 5 || step === 6) && !scheduleResult) {
      runScheduler();
    }
  }, [step]);

  // File Import Handlers
  const handleStaffUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await parseDigitizationStaffFile(file);
      if (imported.length === 0) {
        setImportMsg("لم يتم العثور على أساتذة في الملف. تأكد من وجود عمود الرتبة واللقب.");
      } else {
        setTeachers(imported);
        setScheduleResult(null);
        setImportMsg(`تم استيراد ${imported.length} أستاذاً بنجاح مع فرز المواد تلقائياً.`);
      }
    } catch (err) {
      setImportMsg(`خطأ في قراءة ملف المستخدمين: ${err.message}`);
    }
    e.target.value = "";
  };

  const handleStatsUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await parseStudentStatsFile(file);
      if (imported.length === 0) {
        setImportMsg("لم يتم العثور على أفواج تربوية في ملف الإحصائيات.");
      } else {
        setClasses(imported);
        setScheduleResult(null);
        setImportMsg(`تم استيراد ${imported.length} فوجاً تربوياً بنجاح.`);
      }
    } catch (err) {
      setImportMsg(`خطأ في قراءة ملف التلاميذ: ${err.message}`);
    }
    e.target.value = "";
  };

  // Manual cell edit in invigilation table
  const handleCellToggle = (teacherId, sessionKey) => {
    if (!scheduleResult) return;
    const current = scheduleResult.assignments[teacherId]?.[sessionKey];
    const nextAssignments = {
      ...scheduleResult.assignments,
      [teacherId]: { ...scheduleResult.assignments[teacherId] },
    };
    if (!current) {
      nextAssignments[teacherId][sessionKey] = { type: "reserve", roomName: "اح", className: "احتياط", subLabel: "" };
    } else if (current.type === "reserve") {
      delete nextAssignments[teacherId][sessionKey];
    } else {
      const custom = window.prompt("أدخل اسم القاعة الجديدة (أو 'اح' للاحتياط، أو اتركه فارغاً للراحة):", current.roomName);
      if (custom === null) return;
      const trimmed = custom.trim();
      if (trimmed === "") {
        delete nextAssignments[teacherId][sessionKey];
      } else if (trimmed === "اح") {
        nextAssignments[teacherId][sessionKey] = { type: "reserve", roomName: "اح", className: "احتياط", subLabel: "" };
      } else {
        nextAssignments[teacherId][sessionKey] = { ...current, roomName: trimmed };
      }
    }
    setScheduleResult({ ...scheduleResult, assignments: nextAssignments });
  };

  // Gemini API call
  const askGemini = async (customPrompt) => {
    const promptText = customPrompt || aiInput.trim();
    if (!promptText) return;
    if (!geminiKey.trim()) {
      setAiMessages((prev) => [
        ...prev,
        { role: "user", text: promptText },
        { role: "assistant", text: "يرجى إدخال مفتاح Gemini API Key في الخانة أعلاه أولاً لتفعيل المستشار الذكي." },
      ]);
      setAiInput("");
      return;
    }

    localStorage.setItem("gemini_api_key_local", geminiKey.trim());
    setAiMessages((prev) => [...prev, { role: "user", text: promptText }]);
    setAiInput("");
    setAiLoading(true);

    const contextSummary = {
      school: schoolInfo.schoolName,
      totalRoomsAvailable: rooms.length,
      regularRooms: spaceConfig.regularCount,
      labsEnabled: spaceConfig.useLabs ? spaceConfig.labsCount : 0,
      workshopsEnabled: spaceConfig.useWorkshops ? spaceConfig.workshopsCount : 0,
      totalTeachers: teachers.length,
      totalClasses: classes.length,
      examDaysCount: examDays.length,
      roomsPerGroup: Object.fromEntries(
        Object.entries(allocations).map(([g, list]) => [g, list.length])
      ),
      scheduleStats: scheduleResult?.stats || "لم يُولّد بعد",
    };

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey.trim())}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `أنت مستشار إداري وتربوي خبير في تسيير الاختبارات في المتوسطات والثانويات الجزائرية. أجب بالعربية الفصحى الواضحة والمختصرة بدون رموز Markdown معقدة.
معطيات المؤسسة الحالية:
${JSON.stringify(contextSummary, null, 2)}

طلب المدير:
${promptText}`,
                  },
                ],
              },
            ],
          }),
        }
      );
      const data = await res.json();
      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        data?.error?.message ||
        "تعذر الحصول على رد من Gemini API. تحقق من صحة المفتاح.";
      setAiMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      setAiMessages((prev) => [...prev, { role: "assistant", text: `خطأ في الاتصال: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  const steps = [
    { id: 1, label: "1. المؤسسة والقاعات", icon: Building2 },
    { id: 2, label: "2. الأساتذة والمواد", icon: Users },
    { id: 3, label: "3. التلاميذ وتوزيع القاعات", icon: GraduationCap },
    { id: 4, label: "4. جدول الاختبارات", icon: Calendar },
    { id: 5, label: "5. جدول الحراسة الآلي", icon: ShieldCheck },
    { id: 6, label: "6. مركز الطباعة A4", icon: Printer },
  ];

  // Chunk teachers into pages of 4 or 2 for printing
  const chunkedTeachers = useMemo(() => {
    const size = printMode === "cards2" ? 2 : 4;
    const chunks = [];
    for (let i = 0; i < teachers.length; i += size) {
      chunks.push(teachers.slice(i, i + size));
    }
    return chunks;
  }, [teachers, printMode]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" dir="rtl">
      {/* Top Bar */}
      <header className="no-print bg-slate-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-sky-500/20 p-2 rounded-lg border border-sky-400/30">
              <ShieldCheck className="w-6 h-6 text-sky-300" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight">منصة تسيير وحراسة الاختبارات المدرسية</h1>
              <p className="text-xs text-slate-300">{schoolInfo.schoolName} — {rooms.length} قاعة | {teachers.length} أستاذاً | {classes.length} فوجاً</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-l from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white px-3.5 py-2 rounded-lg text-sm font-bold shadow transition"
            >
              <Sparkles className="w-4 h-4" />
              المستشار الذكي (Gemini)
            </button>
          </div>
        </div>

        {/* Stepper Nav */}
        <nav className="bg-slate-800 border-t border-slate-700 overflow-x-auto">
          <div className="max-w-7xl mx-auto px-4 flex gap-1 py-1.5 min-w-max">
            {steps.map((s) => {
              const Icon = s.icon;
              const active = step === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStep(s.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-bold transition ${
                    active
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Alert banner */}
      {importMsg && (
        <div className="no-print max-w-7xl mx-auto w-full px-4 mt-3">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg flex items-center justify-between text-sm font-semibold">
            <span>{importMsg}</span>
            <button onClick={() => setImportMsg("")}><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {/* ================= STEP 1: SCHOOL & SPACES ================= */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
              <h2 className="text-base font-extrabold text-slate-800 border-b pb-2 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-700" />
                بيانات المؤسسة (تظهر تلقائياً في المطبوعات)
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">مديرية التربية</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={schoolInfo.directorate}
                    onChange={(e) => setSchoolInfo({ ...schoolInfo, directorate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">اسم المؤسسة</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={schoolInfo.schoolName}
                    onChange={(e) => setSchoolInfo({ ...schoolInfo, schoolName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">السنة الدراسية والفصل</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={schoolInfo.academicYear}
                    onChange={(e) => setSchoolInfo({ ...schoolInfo, academicYear: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">صفة الإمضاء الرسمي</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={schoolInfo.signatureTitle}
                    onChange={(e) => setSchoolInfo({ ...schoolInfo, signatureTitle: e.target.value })}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
              <h2 className="text-base font-extrabold text-slate-800 border-b pb-2 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-sky-700" />
                تخصيص القاعات والمخابر والورشات ({rooms.length} فضاء متاح)
              </h2>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">القاعات العادية</label>
                  <input
                    type="number" min="1" max="80"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-center"
                    value={spaceConfig.regularCount}
                    onChange={(e) => setSpaceConfig({ ...spaceConfig, regularCount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">السعة القصوى للقاعة</label>
                  <input
                    type="number" min="10" max="45"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-center"
                    value={spaceConfig.regularCapacity}
                    onChange={(e) => setSpaceConfig({ ...spaceConfig, regularCapacity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">قاعات الطابق الأرضي</label>
                  <input
                    type="number" min="0" max={spaceConfig.regularCount}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-center"
                    value={spaceConfig.groundFloorCount}
                    onChange={(e) => setSpaceConfig({ ...spaceConfig, groundFloorCount: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* Labs toggle */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 font-bold text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={spaceConfig.useLabs}
                    onChange={(e) => setSpaceConfig({ ...spaceConfig, useLabs: e.target.checked })}
                    className="w-4 h-4 accent-sky-700"
                  />
                  استغلال المخابر كقاعات اختبار
                </label>
                {spaceConfig.useLabs && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">عدد المخابر</label>
                      <input
                        type="number" min="1" max="10"
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-center"
                        value={spaceConfig.labsCount}
                        onChange={(e) => setSpaceConfig({ ...spaceConfig, labsCount: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">سعة المخبر</label>
                      <input
                        type="number" min="10" max="35"
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-center"
                        value={spaceConfig.labsCapacity}
                        onChange={(e) => setSpaceConfig({ ...spaceConfig, labsCapacity: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Workshops toggle */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 font-bold text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={spaceConfig.useWorkshops}
                    onChange={(e) => setSpaceConfig({ ...spaceConfig, useWorkshops: e.target.checked })}
                    className="w-4 h-4 accent-sky-700"
                  />
                  استغلال الورشات كقاعات اختبار
                </label>
                {spaceConfig.useWorkshops && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">عدد الورشات</label>
                      <input
                        type="number" min="1" max="10"
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-center"
                        value={spaceConfig.workshopsCount}
                        onChange={(e) => setSpaceConfig({ ...spaceConfig, workshopsCount: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">سعة الورشة</label>
                      <input
                        type="number" min="10" max="35"
                        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-center"
                        value={spaceConfig.workshopsCapacity}
                        onChange={(e) => setSpaceConfig({ ...spaceConfig, workshopsCapacity: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg text-sm font-bold"
                >
                  التالي: الأساتذة والمواد ←
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ================= STEP 2: TEACHERS & SUBJECTS ================= */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-800">استيراد الأساتذة من ملف الرقمنة (.xls / .xlsx)</h2>
                <p className="text-xs text-slate-500 mt-0.5">يتم فرز الرتب تلقائياً لسحب الأساتذة فقط مع موادهم لتغذية جدول الاختبارات.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  رفع ملف المستخدمين (الرقمنة)
                  <input type="file" accept=".xls,.xlsx,.html" onChange={handleStaffUpload} className="hidden" />
                </label>
                <button
                  onClick={() => { setTeachers(DEFAULT_TEACHERS); setScheduleResult(null); }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold"
                >
                  تحميل 57 أستاذاً تجريبياً
                </button>
              </div>
            </div>

            {/* Add single teacher */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-bold text-slate-600 mb-1">إضافة أستاذ يدوياً (مثلاً مستخلف أو متعاقد)</label>
                <input
                  placeholder="اللقب والاسم"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={newTeacher.name}
                  onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                />
              </div>
              <div className="w-56">
                <label className="block text-xs font-bold text-slate-600 mb-1">المادة</label>
                <input
                  placeholder="المادة"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={newTeacher.subject}
                  onChange={(e) => setNewTeacher({ ...newTeacher, subject: e.target.value })}
                />
              </div>
              <button
                onClick={() => {
                  if (!newTeacher.name.trim()) return;
                  setTeachers([...teachers, { id: `t_${Date.now()}`, name: newTeacher.name.trim(), subject: newTeacher.subject.trim() || "غير محددة", groundFloorOnly: false }]);
                  setNewTeacher({ name: "", subject: newTeacher.subject });
                  setScheduleResult(null);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> إضافة
              </button>
            </div>

            {/* Teachers Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-3 bg-slate-50 border-b flex items-center justify-between text-sm font-bold text-slate-700">
                <span>قائمة الأساتذة المعتمدة: {teachers.length} أستاذاً ({availableSubjects.length} مادة)</span>
                <button onClick={() => setStep(3)} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-xs">
                  التالي: التلاميذ والقاعات ←
                </button>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-800 text-white sticky top-0">
                    <tr>
                      <th className="p-2.5 w-14 text-center">#</th>
                      <th className="p-2.5">اللقب والاسم</th>
                      <th className="p-2.5">المادة</th>
                      <th className="p-2.5 text-center">طابق أرضي فقط؟</th>
                      <th className="p-2.5 w-16 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teachers.map((t, i) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-2 text-center font-bold text-slate-500">{i + 1}</td>
                        <td className="p-2">
                          <input
                            className="w-full bg-transparent border-b border-transparent focus:border-sky-500 outline-none font-semibold"
                            value={t.name}
                            onChange={(e) => {
                              const next = [...teachers];
                              next[i] = { ...t, name: e.target.value };
                              setTeachers(next);
                            }}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="w-full bg-transparent border-b border-transparent focus:border-sky-500 outline-none text-slate-700"
                            value={t.subject}
                            onChange={(e) => {
                              const next = [...teachers];
                              next[i] = { ...t, subject: e.target.value };
                              setTeachers(next);
                            }}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={t.groundFloorOnly}
                            onChange={(e) => {
                              const next = [...teachers];
                              next[i] = { ...t, groundFloorOnly: e.target.checked };
                              setTeachers(next);
                              setScheduleResult(null);
                            }}
                            className="w-4 h-4 accent-amber-600"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => { setTeachers(teachers.filter((x) => x.id !== t.id)); setScheduleResult(null); }}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 3: CLASSES & ROOM ALLOCATION ================= */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-800">إحصائيات التلاميذ وتشكيل المجموعات وتوزيع القاعات</h2>
                <p className="text-xs text-slate-500 mt-0.5">يمكنك تحديد المجموعة (1، 2، أو 3) وعدد القاعات لكل فوج (1، 2، أو 3) بحرية تامة.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  رفع ملف إحصائيات التلاميذ (.xlsx)
                  <input type="file" accept=".xlsx,.xls" onChange={handleStatsUpload} className="hidden" />
                </label>
                <button
                  onClick={() => { setClasses(DEFAULT_CLASSES); setScheduleResult(null); }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold"
                >
                  تحميل 29 فوجاً تجريبياً
                </button>
              </div>
            </div>

            {/* Group summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(allocations).map(([gId, list]) => {
                const deficit = list.length > rooms.length;
                const spare = rooms.length - list.length;
                return (
                  <div key={gId} className={`p-4 rounded-xl border ${deficit ? "bg-rose-50 border-rose-300" : "bg-white border-slate-200"} shadow-sm`}>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-800">المجموعة {gId}</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${deficit ? "bg-rose-600 text-white" : "bg-emerald-100 text-emerald-800"}`}>
                        {list.length} / {rooms.length} قاعة
                      </span>
                    </div>
                    <p className="text-xs mt-2 text-slate-600">
                      {deficit
                        ? `عجز بـ ${Math.abs(spare)} قاعة — قلل التقسيم أو فعّل المخابر والورشات.`
                        : `فائض مريح بـ ${spare} قاعة متاحة.`}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Add class manually */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
              <div className="w-36">
                <label className="block text-xs font-bold text-slate-600 mb-1">اسم الفوج</label>
                <input
                  placeholder="مثلاً: أولى 10"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  value={newClass.name}
                  onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                />
              </div>
              <div className="w-28">
                <label className="block text-xs font-bold text-slate-600 mb-1">التعداد</label>
                <input
                  type="number"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-center"
                  value={newClass.count}
                  onChange={(e) => setNewClass({ ...newClass, count: Number(e.target.value) })}
                />
              </div>
              <div className="w-28">
                <label className="block text-xs font-bold text-slate-600 mb-1">المجموعة</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  value={newClass.group}
                  onChange={(e) => setNewClass({ ...newClass, group: Number(e.target.value) })}
                >
                  <option value={1}>المجموعة 1</option>
                  <option value={2}>المجموعة 2</option>
                  <option value={3}>المجموعة 3</option>
                </select>
              </div>
              <button
                onClick={() => {
                  if (!newClass.name.trim()) return;
                  setClasses([...classes, { ...newClass, id: `c_${Date.now()}` }]);
                  setNewClass({ ...newClass, name: "" });
                  setScheduleResult(null);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> إضافة فوج
              </button>
            </div>

            {/* Classes & Live Room Assignment Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-3 bg-slate-50 border-b flex items-center justify-between text-sm font-bold text-slate-700">
                <span>الأفواج التربوية وتوزيع القاعات المقترح</span>
                <button onClick={() => setStep(4)} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-xs">
                  التالي: جدول سير الاختبارات ←
                </button>
              </div>
              <div className="max-h-[450px] overflow-y-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-800 text-white sticky top-0">
                    <tr>
                      <th className="p-2.5">الفوج</th>
                      <th className="p-2.5 text-center">التعداد</th>
                      <th className="p-2.5 text-center">المجموعة</th>
                      <th className="p-2.5 text-center">عدد القاعات (التقسيم)</th>
                      <th className="p-2.5">القاعات المخصصة تلقائياً</th>
                      <th className="p-2.5 w-14 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classes.map((c, idx) => {
                      const assigned = (allocations[Number(c.group)] || []).filter((a) => a.classId === c.id);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="p-2 font-bold">{c.name}</td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              className="w-16 border border-slate-300 rounded px-1.5 py-1 text-center text-sm"
                              value={c.count}
                              onChange={(e) => {
                                const next = [...classes];
                                next[idx] = { ...c, count: Number(e.target.value) };
                                setClasses(next);
                                setScheduleResult(null);
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <select
                              className="border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                              value={c.group}
                              onChange={(e) => {
                                const next = [...classes];
                                next[idx] = { ...c, group: Number(e.target.value) };
                                setClasses(next);
                                setScheduleResult(null);
                              }}
                            >
                              <option value={1}>المجموعة 1</option>
                              <option value={2}>المجموعة 2</option>
                              <option value={3}>المجموعة 3</option>
                            </select>
                          </td>
                          <td className="p-2 text-center">
                            <select
                              className="border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                              value={c.splitCount}
                              onChange={(e) => {
                                const next = [...classes];
                                next[idx] = { ...c, splitCount: Number(e.target.value) };
                                setClasses(next);
                                setScheduleResult(null);
                              }}
                            >
                              <option value={1}>1 قاعة (كامل)</option>
                              <option value={2}>2 قاعتان (نصفين)</option>
                              <option value={3}>3 قاعات (أثلاث)</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1.5">
                              {assigned.map((a) => (
                                <span
                                  key={a.subId}
                                  className={`text-xs px-2 py-0.5 rounded font-bold border ${
                                    a.roomName === "عجز قاعة!"
                                      ? "bg-rose-100 text-rose-800 border-rose-300"
                                      : a.overCapacity
                                      ? "bg-amber-100 text-amber-800 border-amber-300"
                                      : a.roomType !== "عادية"
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                      : "bg-slate-100 text-slate-800 border-slate-200"
                                  }`}
                                >
                                  {a.roomName} ({a.studentCount})
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => { setClasses(classes.filter((x) => x.id !== c.id)); setScheduleResult(null); }}
                              className="text-rose-500 hover:text-rose-700"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 4: EXAM TIMETABLE ================= */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-800">حجز جدول سير الاختبارات (الأيام، الحصص، والمواد)</h2>
                <p className="text-xs text-slate-500 mt-0.5">اختر المادة لكل حصة من مواد الأساتذة المستوردة لتفعيل خاصية منع حراسة الأستاذ لمادته.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const nextNum = examDays.length + 1;
                    setExamDays([
                      ...examDays,
                      {
                        id: `d_${Date.now()}`,
                        dayName: `اليوم ${nextNum}`,
                        date: "",
                        group: nextNum % 2 === 1 ? 1 : 2,
                        sessions: [
                          { id: `s1_${Date.now()}`, time: "08:30 - 10:00", subject: availableSubjects[0] || "" },
                          { id: `s2_${Date.now()}`, time: "10:30 - 12:00", subject: availableSubjects[1] || "" },
                        ],
                      },
                    ]);
                    setScheduleResult(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> إضافة يوم اختبار
                </button>
                <button
                  onClick={() => { setStep(5); runScheduler(); }}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold"
                >
                  حساب وتوليد جدول الحراسة ←
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {examDays.map((day, dIdx) => (
                <div key={day.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 border-b pb-2.5">
                    <input
                      className="w-24 border border-slate-300 rounded px-2 py-1 text-sm font-bold"
                      value={day.dayName}
                      onChange={(e) => {
                        const next = [...examDays];
                        next[dIdx] = { ...day, dayName: e.target.value };
                        setExamDays(next);
                      }}
                    />
                    <input
                      placeholder="التاريخ"
                      className="w-28 border border-slate-300 rounded px-2 py-1 text-xs text-center"
                      value={day.date}
                      onChange={(e) => {
                        const next = [...examDays];
                        next[dIdx] = { ...day, date: e.target.value };
                        setExamDays(next);
                      }}
                    />
                    <select
                      className="border border-slate-300 rounded px-2 py-1 text-xs font-bold bg-sky-50 text-sky-900"
                      value={day.group}
                      onChange={(e) => {
                        const next = [...examDays];
                        next[dIdx] = { ...day, group: Number(e.target.value) };
                        setExamDays(next);
                        setScheduleResult(null);
                      }}
                    >
                      <option value={1}>المجموعة 1 ({(allocations[1] || []).length} قاعة)</option>
                      <option value={2}>المجموعة 2 ({(allocations[2] || []).length} قاعة)</option>
                      <option value={3}>المجموعة 3 ({(allocations[3] || []).length} قاعة)</option>
                    </select>
                    <button
                      onClick={() => { setExamDays(examDays.filter((x) => x.id !== day.id)); setScheduleResult(null); }}
                      className="mr-auto text-rose-500 hover:text-rose-700"
                      title="حذف اليوم"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {day.sessions.map((sess, sIdx) => (
                      <div key={sess.id} className="flex items-center gap-2">
                        <input
                          className="w-28 border border-slate-300 rounded px-2 py-1.5 text-xs text-center font-semibold"
                          value={sess.time}
                          onChange={(e) => {
                            const next = [...examDays];
                            const ss = [...day.sessions];
                            ss[sIdx] = { ...sess, time: e.target.value };
                            next[dIdx] = { ...day, sessions: ss };
                            setExamDays(next);
                          }}
                        />
                        <select
                          className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-xs font-semibold"
                          value={sess.subject}
                          onChange={(e) => {
                            const next = [...examDays];
                            const ss = [...day.sessions];
                            ss[sIdx] = { ...sess, subject: e.target.value };
                            next[dIdx] = { ...day, sessions: ss };
                            setExamDays(next);
                            setScheduleResult(null);
                          }}
                        >
                          <option value="">— مادة عامة / غير محددة —</option>
                          {availableSubjects.map((sub) => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const next = [...examDays];
                            next[dIdx] = { ...day, sessions: day.sessions.filter((x) => x.id !== sess.id) };
                            setExamDays(next);
                            setScheduleResult(null);
                          }}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      const next = [...examDays];
                      next[dIdx] = {
                        ...day,
                        sessions: [...day.sessions, { id: `s_${Date.now()}`, time: "14:00 - 15:30", subject: "" }],
                      };
                      setExamDays(next);
                      setScheduleResult(null);
                    }}
                    className="text-xs font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> إضافة حصة لهذا اليوم
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= STEP 5: AUTOMATED INVIGILATION SCHEDULE ================= */}
        {step === 5 && (
          <div className="space-y-5">
            {/* Options Bar */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-extrabold text-slate-800">خيارات وقواعد محرك الحراسة الآلي</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={runScheduler}
                    className="bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow"
                  >
                    <RefreshCw className="w-4 h-4" />
                    توليد / إعادة خلط القاعات
                  </button>
                  {scheduleResult && (
                    <button
                      onClick={() =>
                        exportScheduleToExcel({
                          schoolInfo,
                          teachers,
                          sessions: scheduleResult.sessions,
                          assignments: scheduleResult.assignments,
                          allocations,
                        })
                      }
                      className="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      تصدير Excel (.xlsx)
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs font-bold">
                <label className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedOptions.useReserves}
                    onChange={(e) => setSchedOptions({ ...schedOptions, useReserves: e.target.checked })}
                    className="w-4 h-4 accent-sky-700"
                  />
                  تفعيل الاحتياط (اح)
                </label>

                {schedOptions.useReserves && (
                  <label className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={schedOptions.autoBalanceReserves}
                      onChange={(e) => setSchedOptions({ ...schedOptions, autoBalanceReserves: e.target.checked })}
                      className="w-4 h-4 accent-sky-700"
                    />
                    ضبط الاحتياط للتساوي التام
                  </label>
                )}

                {schedOptions.useReserves && (
                  <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border">
                    <span>أقصى احتياط/حصة:</span>
                    <input
                      type="number" min="1" max="10"
                      className="w-14 border rounded px-1.5 py-0.5 text-center"
                      value={schedOptions.maxReservesPerSession}
                      onChange={(e) => setSchedOptions({ ...schedOptions, maxReservesPerSession: Number(e.target.value) })}
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedOptions.avoidOwnSubject}
                    onChange={(e) => setSchedOptions({ ...schedOptions, avoidOwnSubject: e.target.checked })}
                    className="w-4 h-4 accent-sky-700"
                  />
                  منع حراسة الأستاذ لمادته
                </label>

                <label className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedOptions.avoidRepeatedClass}
                    onChange={(e) => setSchedOptions({ ...schedOptions, avoidRepeatedClass: e.target.checked })}
                    className="w-4 h-4 accent-sky-700"
                  />
                  منع تكرار نفس القسم
                </label>
              </div>
            </div>

            {/* KPI Stats */}
            {scheduleResult?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-bold">نصيب كل أستاذ</div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">
                    {scheduleResult.stats.minDuties === scheduleResult.stats.maxDuties
                      ? `${scheduleResult.stats.minDuties} حراسات (تساوٍ تام)`
                      : `${scheduleResult.stats.minDuties} إلى ${scheduleResult.stats.maxDuties}`}
                  </div>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-bold">إجمالي الحصص</div>
                  <div className="text-xl font-extrabold text-sky-700 mt-1">
                    {scheduleResult.stats.totalSlots} <span className="text-xs font-normal text-slate-500">({scheduleResult.stats.totalRoomSlots} قاعة + {scheduleResult.stats.totalReserves} اح)</span>
                  </div>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-bold">تكرار نفس القسم</div>
                  <div className={`text-xl font-extrabold mt-1 flex items-center gap-1 ${scheduleResult.stats.repeatedClasses === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {scheduleResult.stats.repeatedClasses === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    {scheduleResult.stats.repeatedClasses}
                  </div>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs text-slate-500 font-bold">حراسة نفس المادة</div>
                  <div className={`text-xl font-extrabold mt-1 ${scheduleResult.stats.ownSubjectConflicts === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {scheduleResult.stats.ownSubjectConflicts}
                  </div>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center">
                  <button
                    onClick={() => setStep(6)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    الانتقال للطباعة A4
                  </button>
                </div>
              </div>
            )}

            {/* Interactive General Matrix */}
            {scheduleResult && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-3 bg-slate-50 border-b text-xs text-slate-600 font-semibold">
                  اضغط على أي خلية في الجدول لتعديلها يدوياً (قاعة / احتياط / راحة).
                </div>
                <div className="overflow-x-auto max-h-[520px]">
                  <table className="w-full text-xs text-center border-collapse">
                    <thead className="bg-slate-800 text-white sticky top-0 z-10">
                      <tr>
                        <th className="p-2 border border-slate-700 sticky right-0 bg-slate-800 min-w-[150px] text-right">الأستاذ(ة)</th>
                        <th className="p-2 border border-slate-700 min-w-[100px]">المادة</th>
                        {scheduleResult.sessions.map((s) => (
                          <th key={s.key} className="p-1.5 border border-slate-700 min-w-[78px]">
                            <div className="font-bold">{s.dayName}</div>
                            <div className="text-[10px] text-sky-200">{s.time}</div>
                            <div className="text-[10px] text-amber-200 truncate max-w-[75px]">{s.subject || "—"}</div>
                          </th>
                        ))}
                        <th className="p-2 border border-slate-700 bg-slate-900 min-w-[55px]">المجموع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map((t, idx) => {
                        let count = 0;
                        return (
                          <tr key={t.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                            <td className="p-2 border border-slate-200 font-bold text-right sticky right-0 bg-inherit">{t.name}</td>
                            <td className="p-1.5 border border-slate-200 text-slate-600">{t.subject}</td>
                            {scheduleResult.sessions.map((s) => {
                              const cell = scheduleResult.assignments[t.id]?.[s.key];
                              if (cell) count++;
                              return (
                                <td
                                  key={s.key}
                                  onClick={() => handleCellToggle(t.id, s.key)}
                                  title={cell ? `${cell.roomName} — ${cell.className}` : "راحة (اضغط للتعديل)"}
                                  className={`p-1.5 border border-slate-200 cursor-pointer hover:ring-2 hover:ring-sky-400 transition ${
                                    !cell
                                      ? "text-slate-300"
                                      : cell.type === "reserve"
                                      ? "bg-amber-100 text-amber-900 font-extrabold"
                                      : "text-slate-800 font-semibold"
                                  }`}
                                >
                                  {cell ? cell.roomName : "—"}
                                </td>
                              );
                            })}
                            <td className="p-2 border border-slate-200 font-extrabold bg-sky-50 text-sky-900">{count}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 6: PRINT CENTER ================= */}
        {step === 6 && scheduleResult && (
          <div className="space-y-5">
            {/* Print Controls (hidden when printing) */}
            <div className="no-print bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "cards4", label: "جداول فردية (4 في الورقة A4 أفقية)" },
                  { id: "cards2", label: "جداول فردية (2 في الورقة A4)" },
                  { id: "secretariat", label: "كشف الأمانة (تسليم واستلام الأوراق)" },
                  { id: "daily", label: "كشف الإلصاق اليومي" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPrintMode(m.id)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                      printMode === m.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {printMode === "secretariat" && (
                  <select
                    className="border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-bold"
                    value={selectedSessionKey}
                    onChange={(e) => setSelectedSessionKey(e.target.value)}
                  >
                    {scheduleResult.sessions.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.dayName} ({s.date}) — {s.time} — {s.subject || "اختبار"}
                      </option>
                    ))}
                  </select>
                )}

                {printMode === "daily" && (
                  <select
                    className="border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-bold"
                    value={selectedDayId}
                    onChange={(e) => setSelectedDayId(e.target.value)}
                  >
                    {examDays.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.dayName} ({d.date}) — المجموعة {d.group}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => window.print()}
                  className="bg-sky-700 hover:bg-sky-600 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow"
                >
                  <Printer className="w-4 h-4" />
                  طباعة / حفظ كـ PDF واحد
                </button>
              </div>
            </div>

            {/* PRINT VIEW A & B: INDIVIDUAL CARDS (4 or 2 per page) */}
            {(printMode === "cards4" || printMode === "cards2") && (
              <div className="space-y-6">
                {chunkedTeachers.map((group4, pageIdx) => (
                  <div
                    key={pageIdx}
                    className={`print-page-break bg-white p-3 rounded-xl border border-slate-200 shadow-sm print:shadow-none print:border-none print:p-0 grid gap-3 ${
                      printMode === "cards4" ? "grid-cols-1 md:grid-cols-2 print:grid-cols-2" : "grid-cols-1"
                    }`}
                  >
                    {group4.map((teacher) => {
                      const tAssign = scheduleResult.assignments[teacher.id] || {};
                      const totalD = Object.keys(tAssign).length;
                      const resD = Object.values(tAssign).filter((x) => x.type === "reserve").length;
                      return (
                        <div key={teacher.id} className="avoid-break border-2 border-dashed border-slate-400 rounded-lg p-2.5 flex flex-col justify-between bg-white">
                          <div>
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-700 border-b pb-1">
                              <span>{schoolInfo.schoolName}</span>
                              <span>{schoolInfo.academicYear}</span>
                            </div>
                            <div className="bg-slate-900 text-white text-center py-1 my-1.5 rounded text-xs font-extrabold">
                              جدول الحراسة الفردي للاختبارات
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[11px] bg-slate-50 p-1.5 rounded border mb-1.5">
                              <div><span className="text-slate-500">الأستاذ(ة): </span><strong>{teacher.name}</strong></div>
                              <div><span className="text-slate-500">المادة: </span><strong>{teacher.subject}</strong></div>
                              <div className="col-span-2 text-emerald-800 font-bold">
                                مجموع الحراسات: {totalD} (منها {resD} احتياط)
                              </div>
                            </div>

                            <table className="w-full text-[10px] text-center border-collapse">
                              <thead>
                                <tr className="bg-slate-700 text-white">
                                  <th className="p-1 border border-slate-600">اليوم / التاريخ</th>
                                  {[0, 1, 2].map((sI) => (
                                    <th key={sI} className="p-1 border border-slate-600">الحصة {sI + 1}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {examDays.map((d) => (
                                  <tr key={d.id}>
                                    <td className="p-1 border border-slate-300 font-bold bg-slate-50">
                                      {d.dayName} <span className="text-[9px] font-normal text-slate-500">{d.date}</span>
                                    </td>
                                    {[0, 1, 2].map((sI) => {
                                      const sObj = d.sessions[sI];
                                      if (!sObj) return <td key={sI} className="p-1 border border-slate-300 text-slate-300">—</td>;
                                      const cell = tAssign[`${d.id}__${sObj.id}`];
                                      return (
                                        <td
                                          key={sI}
                                          className={`p-1 border border-slate-300 font-bold ${
                                            !cell
                                              ? "text-slate-300"
                                              : cell.type === "reserve"
                                              ? "bg-amber-100 text-amber-900"
                                              : "text-slate-900"
                                          }`}
                                        >
                                          {cell ? (cell.type === "reserve" ? "احتياط (اح)" : cell.roomName) : "—"}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-600 mt-2 pt-1 border-t">
                            <span>الحضور قبل 15 د | (اح) احتياط | (—) راحة</span>
                            <span className="font-extrabold text-slate-900">{schoolInfo.signatureTitle}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* PRINT VIEW C: SECRETARIAT HANDOVER SHEET */}
            {printMode === "secretariat" && (() => {
              const sess = scheduleResult.sessions.find((s) => s.key === selectedSessionKey) || scheduleResult.sessions[0];
              if (!sess) return null;
              const roomToTeacher = {};
              const reservesList = [];
              teachers.forEach((t) => {
                const a = scheduleResult.assignments[t.id]?.[sess.key];
                if (a?.type === "room") roomToTeacher[a.roomName] = t.name;
                if (a?.type === "reserve") reservesList.push(t.name);
              });
              return (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:border-none print:shadow-none print:p-0">
                  <div className="text-center space-y-1 mb-4">
                    <div className="text-xs font-bold">{schoolInfo.directorate} — {schoolInfo.schoolName}</div>
                    <h3 className="text-lg font-extrabold text-slate-900">كشف استلام وإرجاع أوراق الإجابة (أمانة الاختبارات)</h3>
                    <div className="text-xs font-bold text-slate-600">
                      اليوم: {sess.dayName} ({sess.date}) | التوقيت: {sess.time} | المادة: {sess.subject || "—"} | المجموعة {sess.group}
                    </div>
                  </div>
                  <table className="w-full text-xs text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="p-2 border border-slate-600">القاعة</th>
                        <th className="p-2 border border-slate-600">الفوج التربوي</th>
                        <th className="p-2 border border-slate-600">التعداد</th>
                        <th className="p-2 border border-slate-600">الأستاذ الحارس</th>
                        <th className="p-2 border border-slate-600">إمضاء الاستلام</th>
                        <th className="p-2 border border-slate-600">عدد الغائبين</th>
                        <th className="p-2 border border-slate-600">إمضاء الإرجاع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sess.rooms.map((rm) => (
                        <tr key={rm.subId}>
                          <td className="p-1.5 border border-slate-300 font-bold">{rm.roomName}</td>
                          <td className="p-1.5 border border-slate-300">{rm.className} {rm.subLabel}</td>
                          <td className="p-1.5 border border-slate-300">{rm.studentCount}</td>
                          <td className="p-1.5 border border-slate-300 font-bold">{roomToTeacher[rm.roomName] || "—"}</td>
                          <td className="p-1.5 border border-slate-300 w-24"></td>
                          <td className="p-1.5 border border-slate-300 w-20"></td>
                          <td className="p-1.5 border border-slate-300 w-24"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 flex justify-between items-center text-xs font-bold">
                    <div>أساتذة الاحتياط (اح): {reservesList.join(" ، ") || "لا يوجد"}</div>
                    <div>{schoolInfo.signatureTitle}</div>
                  </div>
                </div>
              );
            })()}

            {/* PRINT VIEW D: DAILY TEACHERS LOUNGE POSTING */}
            {printMode === "daily" && (() => {
              const day = examDays.find((d) => d.id === selectedDayId) || examDays[0];
              if (!day) return null;
              const daySessions = scheduleResult.sessions.filter((s) => s.dayId === day.id);
              const activeTeachers = teachers.filter((t) =>
                daySessions.some((s) => scheduleResult.assignments[t.id]?.[s.key])
              );
              return (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm print:border-none print:shadow-none print:p-0">
                  <div className="text-center space-y-1 mb-4">
                    <div className="text-xs font-bold">{schoolInfo.schoolName} — {schoolInfo.academicYear}</div>
                    <h3 className="text-lg font-extrabold text-slate-900">جدول الحراسة اليومي — {day.dayName} ({day.date})</h3>
                  </div>
                  <table className="w-full text-xs text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="p-2 border border-slate-600 w-10">#</th>
                        <th className="p-2 border border-slate-600 text-right">الأستاذ(ة)</th>
                        {daySessions.map((s) => (
                          <th key={s.key} className="p-2 border border-slate-600">
                            {s.time} ({s.subject || "اختبار"})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeTeachers.map((t, i) => (
                        <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="p-1.5 border border-slate-300">{i + 1}</td>
                          <td className="p-1.5 border border-slate-300 font-bold text-right">{t.name}</td>
                          {daySessions.map((s) => {
                            const c = scheduleResult.assignments[t.id]?.[s.key];
                            return (
                              <td key={s.key} className={`p-1.5 border border-slate-300 font-bold ${c?.type === "reserve" ? "bg-amber-100" : ""}`}>
                                {c ? (c.type === "reserve" ? "احتياط (اح)" : c.roomName) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 text-left text-xs font-extrabold">{schoolInfo.signatureTitle}</div>
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* ================= GEMINI AI ASSISTANT DRAWER ================= */}
      {aiOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold">
                <Sparkles className="w-5 h-5 text-sky-400" />
                المستشار الذكي (Gemini API)
              </div>
              <button onClick={() => setAiOpen(false)} className="text-slate-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border-b space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <KeyRound className="w-3.5 h-3.5 text-sky-700" />
                مفتاح Gemini API Key (يُحفظ محلياً في متصفحك فقط)
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
            </div>

            {/* Quick actions */}
            <div className="p-2.5 border-b flex flex-wrap gap-1.5 bg-white">
              <button
                onClick={() => askGemini("حلّل معطيات مؤسستي الحالية واقترح أفضل آلية لتوزيع القاعات والاحتياط بأعلى عدالة ممكنة.")}
                className="text-[11px] bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold px-2.5 py-1.5 rounded-lg border border-sky-200"
              >
                تحليل التوزيع واقتراح تحسينات
              </button>
              <button
                onClick={() => askGemini("صُغ إعلاناً رسمياً مختصراً للأساتذة حول موعد تسلم جداول الحراسة وتنظيم الاختبارات (نص عادي بدون تنسيق ماركداون).")}
                className="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1.5 rounded-lg border border-emerald-200"
              >
                صياغة إعلان للأساتذة
              </button>
            </div>

            {/* Chat history */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {aiMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === "user"
                      ? "bg-sky-700 text-white mr-8"
                      : "bg-white border border-slate-200 text-slate-800 ml-6 shadow-sm"
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {aiLoading && <div className="text-xs text-slate-500 font-bold animate-pulse">جاري التحليل عبر Gemini...</div>}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); askGemini(); }}
              className="p-3 bg-white border-t flex gap-2"
            >
              <input
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder="اسأل المستشار الذكي (مثلاً: غاب أستاذ يوم الثلاثاء...)"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={aiLoading}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-1 text-sm font-bold disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
