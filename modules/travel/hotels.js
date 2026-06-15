// ===================================
// modules/travel/hotels.js
// رابط فنادق Trip.com — مولّد بحث (cityName + تواريخ) + تتبع Trip.com Affiliate
// Allianceid/SID خاصة بحساب Fetchli على trip.com/partners
// ⚠️ يفتح صفحة بحث Trip.com مع المدينة/التواريخ مُعبّأة في مربع البحث —
//    المستخدم يضغط "بحث" مرة واحدة لإظهار النتائج (city= الرقمي يفعّلها
//    تلقائياً لكن نحتاج قاعدة city IDs لذلك — تحسين لاحق)
// ===================================

const HOTEL_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=300&fit=crop';

const TRIP_ALLIANCE_ID = '8462490';
const TRIP_SID         = '316319123';

// تاريخ افتراضي: تشيك إن بعد 30 يوم لمدة 3 ليالٍ
function defaultDates() {
  const inDate = new Date();
  inDate.setDate(inDate.getDate() + 30);
  const outDate = new Date(inDate);
  outDate.setDate(outDate.getDate() + 3);
  const fmt = d => d.toISOString().split('T')[0];
  return { checkIn: fmt(inDate), checkOut: fmt(outDate) };
}

function buildHotelUrl(destination, checkIn, checkOut, adults) {
  const params = new URLSearchParams({
    cityName:   destination,
    searchWord: destination,
    searchType: 'CT',
    checkIn,
    checkOut,
    adult:      String(adults || 2),
    children:   '0',
    Allianceid: TRIP_ALLIANCE_ID,
    SID:        TRIP_SID,
  });
  return `https://www.trip.com/hotels/list?${params}`;
}

/**
 * بحث الفنادق — يرجع مصفوفة بطاقات بالشكل الذي تتوقعه الواجهة:
 * { id, name, price, platform, image, url, badge, rating, details }
 */
function searchHotels(analysis, market) {
  const { destination, adults = 2 } = analysis || {};
  if (!destination) return [];

  const defaults  = defaultDates();
  const checkIn   = analysis.checkIn  || defaults.checkIn;
  const checkOut  = analysis.checkOut || defaults.checkOut;

  const url = buildHotelUrl(destination, checkIn, checkOut, adults);

  return [{
    id:       `hotel-${destination}-${checkIn}`,
    name:     `فنادق في ${destination}`,
    price:    'اعرض الأسعار',
    platform: 'Trip.com',
    image:    HOTEL_IMAGE,
    url,
    badge:    'فنادق',
    rating:   null,
    details:  `${checkIn} → ${checkOut} • ${adults} ${Number(adults) > 1 ? 'ضيوف' : 'ضيف'}`,
  }];
}

module.exports = { searchHotels };
