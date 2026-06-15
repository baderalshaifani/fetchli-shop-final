// ===================================
// modules/travel/hotels.js
// رابط فنادق عبر HOTEL_DEEPLINK_TEMPLATE (Trip.com افتراضياً)
// ⚠️ ملاحظة: بعض المزودات تحتاج city ID لا اسم المدينة —
// إذا لم تظهر نتائج دقيقة من القالب الحالي، يلزم خريطة city→ID لاحقاً
// ===================================

const config = require('../../config');

const HOTEL_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=300&fit=crop';

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
  const template = config.TRAVEL.HOTEL_DEEPLINK_TEMPLATE;
  return template
    .replace('{destination}', encodeURIComponent(destination))
    .replace('{checkIn}',  checkIn)
    .replace('{checkOut}', checkOut)
    .replace('{adults}',   String(adults || 2));
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
