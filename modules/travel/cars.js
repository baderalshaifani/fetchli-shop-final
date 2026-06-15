// ===================================
// modules/travel/cars.js
// تأجير السيارات — DiscoverCars عبر Admitad
// رابط الصفحة الرئيسية + admitad_uid (تتبع 365 يوم، عمولة 54%/23%)
// ⚠️ DiscoverCars/QEEQ/GetRentacar لا يدعمون رابط بحث جاهز بالكود
//    (يحتاج session id من سيرفرهم) — لذا الرابط حالياً للصفحة الرئيسية
//    والمستخدم يبحث عن مدينته. تحسين لاحق لو توفر API مواقع رسمي.
// ===================================

const CAR_IMAGE = 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=400&h=300&fit=crop';

const DISCOVERCARS_ADMITAD_UID = 'c90f9c3215b89157e7b1cc284584d514';
const DISCOVERCARS_URL = `https://www.discovercars.com/?admitad_uid=${DISCOVERCARS_ADMITAD_UID}`;

/**
 * بحث تأجير السيارات — يرجع بطاقة برابط DiscoverCars الفعّال
 * { id, name, price, platform, image, url, badge, rating, details }
 */
function searchCars(analysis, market) {
  const { destination } = analysis || {};

  return [{
    id:       'car-discovercars',
    name:     destination ? `تأجير سيارات في ${destination}` : 'تأجير السيارات',
    price:    'اعرض الأسعار',
    platform: 'DiscoverCars',
    image:    CAR_IMAGE,
    url:      DISCOVERCARS_URL,
    badge:    'ابحث الآن',
    rating:   null,
    details:  destination
      ? `ابحث عن "${destination}" في DiscoverCars — مقارنة فورية بين أكثر من 1000 شركة تأجير`
      : 'مقارنة فورية بين أكثر من 1000 شركة تأجير سيارات حول العالم',
  }];
}

module.exports = { searchCars };
