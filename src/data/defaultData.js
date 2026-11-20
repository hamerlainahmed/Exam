export const DEFAULT_SCHOOL_INFO = {
  directorate: "مديرية التربية لولاية غليزان",
  schoolName: "متوسطة الشهيد نذار قدور - زمورة",
  academicYear: "السنة الدراسية 2026 / 2027 — اختبارات الفصل الأول",
  signatureTitle: "مدير المؤسسة",
};

export const DEFAULT_SPACE_CONFIG = {
  regularCount: 27,
  regularCapacity: 22,
  groundFloorCount: 10,
  useLabs: true,
  labsCount: 2,
  labsCapacity: 20,
  useWorkshops: true,
  workshopsCount: 2,
  workshopsCapacity: 20,
};

export const DEFAULT_CLASSES = [
  { id: "c1", name: "أولى 1", level: "السنة الأولى", count: 45, group: 1, splitCount: 2 },
  { id: "c2", name: "أولى 2", level: "السنة الأولى", count: 43, group: 1, splitCount: 2 },
  { id: "c3", name: "أولى 3", level: "السنة الأولى", count: 44, group: 1, splitCount: 2 },
  { id: "c4", name: "أولى 4", level: "السنة الأولى", count: 46, group: 1, splitCount: 2 },
  { id: "c5", name: "أولى 5", level: "السنة الأولى", count: 45, group: 1, splitCount: 2 },
  { id: "c6", name: "أولى 6", level: "السنة الأولى", count: 44, group: 1, splitCount: 2 },
  { id: "c7", name: "أولى 7", level: "السنة الأولى", count: 44, group: 1, splitCount: 2 },
  { id: "c8", name: "أولى 8", level: "السنة الأولى", count: 43, group: 1, splitCount: 2 },
  { id: "c9", name: "أولى 9", level: "السنة الأولى", count: 37, group: 1, splitCount: 2 },
  { id: "c10", name: "ثانية 1", level: "السنة الثانية", count: 39, group: 2, splitCount: 2 },
  { id: "c11", name: "ثانية 2", level: "السنة الثانية", count: 37, group: 2, splitCount: 2 },
  { id: "c12", name: "ثانية 3", level: "السنة الثانية", count: 38, group: 2, splitCount: 2 },
  { id: "c13", name: "ثانية 4", level: "السنة الثانية", count: 40, group: 2, splitCount: 2 },
  { id: "c14", name: "ثانية 5", level: "السنة الثانية", count: 39, group: 2, splitCount: 2 },
  { id: "c15", name: "ثانية 6", level: "السنة الثانية", count: 35, group: 2, splitCount: 2 },
  { id: "c16", name: "ثانية 7", level: "السنة الثانية", count: 36, group: 2, splitCount: 2 },
  { id: "c17", name: "ثانية 8", level: "السنة الثانية", count: 34, group: 2, splitCount: 2 },
  { id: "c18", name: "ثالثة 1", level: "السنة الثالثة", count: 39, group: 1, splitCount: 2 },
  { id: "c19", name: "ثالثة 2", level: "السنة الثالثة", count: 38, group: 1, splitCount: 2 },
  { id: "c20", name: "ثالثة 3", level: "السنة الثالثة", count: 38, group: 1, splitCount: 2 },
  { id: "c21", name: "ثالثة 4", level: "السنة الثالثة", count: 40, group: 1, splitCount: 2 },
  { id: "c22", name: "ثالثة 5", level: "السنة الثالثة", count: 36, group: 1, splitCount: 2 },
  { id: "c23", name: "ثالثة 6", level: "السنة الثالثة", count: 35, group: 1, splitCount: 2 },
  { id: "c24", name: "رابعة 1", level: "السنة الرابعة", count: 40, group: 2, splitCount: 2 },
  { id: "c25", name: "رابعة 2", level: "السنة الرابعة", count: 43, group: 2, splitCount: 2 },
  { id: "c26", name: "رابعة 3", level: "السنة الرابعة", count: 38, group: 2, splitCount: 2 },
  { id: "c27", name: "رابعة 4", level: "السنة الرابعة", count: 42, group: 2, splitCount: 2 },
  { id: "c28", name: "رابعة 5", level: "السنة الرابعة", count: 40, group: 2, splitCount: 2 },
  { id: "c29", name: "رابعة 6", level: "السنة الرابعة", count: 42, group: 2, splitCount: 2 },
];

const SUBJECT_DISTRIBUTION = [
  ["اللغة العربية", 11],
  ["الرياضيات", 9],
  ["اللغة الفرنسية", 8],
  ["اللغة الإنجليزية", 6],
  ["العلوم الفيزيائية والتكنولوجيا", 5],
  ["العلوم الطبيعية", 5],
  ["التاريخ والجغرافيا", 5],
  ["التربية البدنية والرياضية", 3],
  ["الموسيقى", 2],
  ["الإعلام الآلي", 2],
  ["التربية الإسلامية", 1],
];

export const DEFAULT_TEACHERS = (() => {
  const list = [];
  let idx = 1;
  for (const [subject, count] of SUBJECT_DISTRIBUTION) {
    for (let i = 0; i < count; i++) {
      list.push({
        id: `t${idx}`,
        name: `الأستاذ ${String(idx).padStart(2, "0")}`,
        subject,
        groundFloorOnly: false,
      });
      idx++;
    }
  }
  return list;
})();

export const DEFAULT_EXAM_DAYS = [
  {
    id: "d1",
    dayName: "الأحد",
    date: "2026/12/06",
    group: 1,
    sessions: [
      { id: "d1s1", time: "08:30 - 10:00", subject: "اللغة العربية" },
      { id: "d1s2", time: "10:30 - 12:00", subject: "التربية الإسلامية" },
      { id: "d1s3", time: "14:00 - 15:30", subject: "العلوم الطبيعية" },
    ],
  },
  {
    id: "d2",
    dayName: "الاثنين",
    date: "2026/12/07",
    group: 2,
    sessions: [
      { id: "d2s1", time: "08:30 - 10:00", subject: "اللغة العربية" },
      { id: "d2s2", time: "10:30 - 12:00", subject: "التربية الإسلامية" },
      { id: "d2s3", time: "14:00 - 15:30", subject: "العلوم الطبيعية" },
    ],
  },
  {
    id: "d3",
    dayName: "الثلاثاء",
    date: "2026/12/08",
    group: 1,
    sessions: [
      { id: "d3s1", time: "08:30 - 10:00", subject: "الرياضيات" },
      { id: "d3s2", time: "10:30 - 12:00", subject: "التاريخ والجغرافيا" },
      { id: "d3s3", time: "14:00 - 15:30", subject: "اللغة الإنجليزية" },
    ],
  },
  {
    id: "d4",
    dayName: "الأربعاء",
    date: "2026/12/09",
    group: 2,
    sessions: [
      { id: "d4s1", time: "08:30 - 10:00", subject: "الرياضيات" },
      { id: "d4s2", time: "10:30 - 12:00", subject: "التاريخ والجغرافيا" },
      { id: "d4s3", time: "14:00 - 15:30", subject: "اللغة الإنجليزية" },
    ],
  },
  {
    id: "d5",
    dayName: "الخميس",
    date: "2026/12/10",
    group: 1,
    sessions: [
      { id: "d5s1", time: "08:30 - 10:00", subject: "اللغة الفرنسية" },
      { id: "d5s2", time: "10:30 - 12:00", subject: "العلوم الفيزيائية والتكنولوجيا" },
      { id: "d5s3", time: "14:00 - 15:30", subject: "الإعلام الآلي" },
    ],
  },
  {
    id: "d6",
    dayName: "الأحد",
    date: "2026/12/13",
    group: 2,
    sessions: [
      { id: "d6s1", time: "08:30 - 10:00", subject: "اللغة الفرنسية" },
      { id: "d6s2", time: "10:30 - 12:00", subject: "العلوم الفيزيائية والتكنولوجيا" },
      { id: "d6s3", time: "14:00 - 15:30", subject: "الإعلام الآلي" },
    ],
  },
];
