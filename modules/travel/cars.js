// ===================================
// modules/travel/cars.js
// placeholder — لم يُحدَّد مزود تأجير السيارات بعد
// عند تحديد المزود (Rentalcars/DiscoverCars/غيره) نستبدل هذه الدالة فقط
// ===================================

const CAR_IMAGE = 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=400&h=300&fit=crop';

/**
 * بحث تأجير السيارات — placeholder يرجع بطاقة "قريباً"
 * { id, name, price, platform, image, url, badge, rating, details }
 */
function searchCars(analysis, market) {
  const { destination } = analysis || {};

  return [{
    id:       'car-coming-soon',
    name:     destination ? `تأجير سيارات في ${destination}` : 'تأجير السيارات',
    price:    'قريباً',
    platform: 'Fetchli',
    image:    CAR_IMAGE,
    url:      '#',
    badge:    'قريباً',
    rating:   null,
    details:  'نعمل على إضافة شركاء تأجير السيارات قريباً',
  }];
}

module.exports = { searchCars };
