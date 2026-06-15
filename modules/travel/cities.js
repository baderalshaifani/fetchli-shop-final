// ===================================
// modules/travel/cities.js
// خريطة أسماء المدن (عربي/إنجليزي) → أكواد IATA
// قابلة للتوسعة بسهولة — فقط أضف صفوف جديدة
// ===================================

// كل مدينة: قائمة أسماء (عربي + إنجليزي، بأشكال مختلفة) → كود IATA (مدينة، لا مطار محدد قدر الإمكان)
const CITY_MAP = [
  // ── السعودية ──
  { code: 'RUH', names: ['الرياض', 'رياض', 'riyadh'] },
  { code: 'JED', names: ['جدة', 'جده', 'jeddah', 'jedda'] },
  { code: 'DMM', names: ['الدمام', 'دمام', 'dammam'] },
  { code: 'MED', names: ['المدينة المنورة', 'المدينة', 'medina', 'madinah'] },
  { code: 'AHB', names: ['أبها', 'ابها', 'abha'] },
  { code: 'TUU', names: ['تبوك', 'tabuk'] },
  { code: 'ELQ', names: ['القصيم', 'بريدة', 'gassim', 'qassim'] },
  { code: 'AQI', names: ['القصيم', 'gassim'] },
  { code: 'GIZ', names: ['جازان', 'جيزان', 'jazan'] },
  { code: 'HAS', names: ['حائل', 'hail'] },
  { code: 'YNB', names: ['ينبع', 'yanbu'] },
  { code: 'AJF', names: ['الجوف', 'aljouf', 'al jouf'] },

  // ── الخليج ──
  { code: 'KWI', names: ['الكويت', 'kuwait'] },
  { code: 'DXB', names: ['دبي', 'dubai'] },
  { code: 'AUH', names: ['أبوظبي', 'ابو ظبي', 'abu dhabi', 'abudhabi'] },
  { code: 'SHJ', names: ['الشارقة', 'sharjah'] },
  { code: 'DOH', names: ['الدوحة', 'الدوحه', 'doha'] },
  { code: 'BAH', names: ['المنامة', 'المنامه', 'البحرين', 'manama', 'bahrain'] },
  { code: 'MCT', names: ['مسقط', 'muscat'] },

  // ── الشام ومصر ──
  { code: 'CAI', names: ['القاهرة', 'القاهره', 'مصر', 'cairo'] },
  { code: 'ALY', names: ['الإسكندرية', 'الاسكندرية', 'alexandria'] },
  { code: 'SSH', names: ['شرم الشيخ', 'sharm el sheikh', 'sharm'] },
  { code: 'HRG', names: ['الغردقة', 'hurghada'] },
  { code: 'AMM', names: ['عمان', 'الأردن', 'amman', 'jordan'] },
  { code: 'BEY', names: ['بيروت', 'لبنان', 'beirut', 'lebanon'] },
  { code: 'DAM', names: ['دمشق', 'damascus'] },

  // ── المغرب العربي ──
  { code: 'CMN', names: ['الدار البيضاء', 'كازابلانكا', 'casablanca'] },
  { code: 'RBA', names: ['الرباط', 'rabat'] },
  { code: 'TUN', names: ['تونس', 'tunis'] },

  // ── تركيا ──
  { code: 'IST', names: ['اسطنبول', 'إسطنبول', 'istanbul'] },
  { code: 'AYT', names: ['أنطاليا', 'انطاليا', 'antalya'] },
  { code: 'ESB', names: ['أنقرة', 'انقرة', 'ankara'] },
  { code: 'ADB', names: ['إزمير', 'ازمير', 'izmir'] },
  { code: 'TZX', names: ['طرابزون', 'trabzon'] },

  // ── أوروبا ──
  { code: 'LON', names: ['لندن', 'london'] },
  { code: 'PAR', names: ['باريس', 'paris'] },
  { code: 'ROM', names: ['روما', 'rome'] },
  { code: 'MIL', names: ['ميلانو', 'milan'] },
  { code: 'BCN', names: ['برشلونة', 'برشلونه', 'barcelona'] },
  { code: 'MAD', names: ['مدريد', 'madrid'] },
  { code: 'VIE', names: ['فيينا', 'vienna'] },
  { code: 'GVA', names: ['جنيف', 'geneva'] },
  { code: 'ZRH', names: ['زيورخ', 'zurich'] },
  { code: 'FRA', names: ['فرانكفورت', 'frankfurt'] },
  { code: 'MUC', names: ['ميونخ', 'munich'] },
  { code: 'AMS', names: ['أمستردام', 'امستردام', 'amsterdam'] },
  { code: 'PRG', names: ['براغ', 'prague'] },
  { code: 'ATH', names: ['أثينا', 'اثينا', 'athens'] },
  { code: 'SAW', names: ['اسطنبول صبيحة'] },

  // ── آسيا ──
  { code: 'BKK', names: ['بانكوك', 'bangkok'] },
  { code: 'KUL', names: ['كوالالمبور', 'kuala lumpur'] },
  { code: 'DPS', names: ['بالي', 'دينباسار', 'bali', 'denpasar'] },
  { code: 'MLE', names: ['المالديف', 'مالديف', 'maldives', 'male'] },
  { code: 'SIN', names: ['سنغافورة', 'سنغافوره', 'singapore'] },
  { code: 'TYO', names: ['طوكيو', 'tokyo'] },
  { code: 'DEL', names: ['دلهي', 'نيودلهي', 'delhi', 'new delhi'] },
  { code: 'BOM', names: ['بومباي', 'مومباي', 'mumbai'] },
  { code: 'CMB', names: ['كولومبو', 'colombo'] },
  { code: 'JKT', names: ['جاكرتا', 'jakarta'] },

  // ── أمريكا ──
  { code: 'NYC', names: ['نيويورك', 'new york'] },
  { code: 'LAX', names: ['لوس أنجلوس', 'لوس انجلوس', 'los angeles'] },
  { code: 'YTO', names: ['تورونتو', 'toronto'] },
];

// خريطة بحث سريعة: اسم منظّف → كود
const LOOKUP = new Map();
for (const { code, names } of CITY_MAP) {
  for (const n of names) LOOKUP.set(normalize(n), code);
}

// ── أكواد المطارات الافتراضية حسب سوق المستخدم (لو لم يحدد المستخدم مدينة الانطلاق) ──
const MARKET_DEFAULT_ORIGIN = {
  SA: 'RUH',
  AE: 'DXB',
  KW: 'KWI',
  QA: 'DOH',
  BH: 'BAH',
  OM: 'MCT',
  EG: 'CAI',
  US: 'NYC',
  CA: 'YTO',
};

function normalize(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/^(مدينة|مدينه|city of)\s*/i, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

/**
 * يحاول تحويل اسم مدينة (عربي/إنجليزي) إلى كود IATA.
 * - لو النص نفسه كود IATA من 3 حروف (مثل "RUH") يرجعه كما هو
 * - يرجع null لو لم يجد تطابقاً
 */
function resolveCity(name) {
  if (!name) return null;
  const raw = String(name).trim();

  // كود IATA جاهز (3 حروف إنجليزية)
  if (/^[a-zA-Z]{3}$/.test(raw)) return raw.toUpperCase();

  const norm = normalize(raw);
  if (LOOKUP.has(norm)) return LOOKUP.get(norm);

  // تطابق جزئي (مثال: "مطار الرياض" يحتوي "الرياض")
  for (const [key, code] of LOOKUP) {
    if (key.length > 2 && norm.includes(key)) return code;
  }
  return null;
}

/** كود مطار الانطلاق الافتراضي حسب سوق المستخدم */
function defaultOriginForMarket(market) {
  return MARKET_DEFAULT_ORIGIN[market] || MARKET_DEFAULT_ORIGIN.SA;
}

module.exports = { resolveCity, defaultOriginForMarket };
