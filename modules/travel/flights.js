// ===================================
// modules/travel/flights.js
// أسعار تقريبية عبر Travelpayouts Data API + رابط حجز Aviasales
// ===================================

const fetch  = require('node-fetch');
const config = require('../../config');
const { resolveCity, defaultOriginForMarket } = require('./cities');

const PLANE_IMAGE = 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=300&fit=crop';

// عملات يدعمها Travelpayouts Data API بشكل موثوق — غيرها نرجع USD
const SUPPORTED_CURRENCIES = ['usd', 'eur', 'rub', 'uah', 'gbp', 'aed', 'try', 'kzt'];

function currencyForApi(currency) {
  const c = String(currency || '').toLowerCase();
  return SUPPORTED_CURRENCIES.includes(c) ? c : 'usd';
}

// تنسيق DDMM المطلوب لروابط Aviasales
function toDDMM(dateStr) {
  const d = dateStr ? new Date(dateStr) : null;
  if (!d || isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}${mm}`;
}

// تاريخ افتراضي: بعد ٣٠ يوماً من اليوم (لو المستخدم لم يحدد تاريخاً)
function defaultDepartureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

// رابط بحث/حجز Aviasales — يفتح صفحة نتائج جاهزة بالماركر الخاص بنا
function buildAviasalesLink(originCode, destCode, departDate, adults) {
  const marker = config.TRAVEL.MARKER;
  const o = originCode || '';
  const d = destCode   || '';
  const ddmm = toDDMM(departDate) || toDDMM(defaultDepartureDate());
  const pax  = Math.max(1, Number(adults) || 1);

  if (o && d) {
    return `https://www.aviasales.com/search/${o}${ddmm}${d}${pax}?marker=${marker}`;
  }
  // لو لم نتعرف على المدن بدقة — رابط بحث عام بالاسم
  return `https://www.aviasales.com/?marker=${marker}`;
}

// أرخص سعر مرصود عبر Travelpayouts (تقريبي — ليس سعراً لحظياً مضموناً)
// المحاولة ١: /v2/prices/latest (كاش أسعار حديثة)
// المحاولة ٢: /v1/prices/cheap (كاش أوسع تاريخياً، مُصنّف حسب الوجهة)
async function fetchCheapestPrice(originCode, destCode, currency) {
  const token = config.TRAVEL.TOKEN;
  if (!token) {
    console.log('[Travel/Flights] لا يوجد TRAVEL.TOKEN — تخطّي جلب السعر');
    return null;
  }

  const curr = currencyForApi(currency);

  // ── المحاولة ١: /v2/prices/latest ──
  try {
    const params = new URLSearchParams({
      origin: originCode, destination: destCode,
      currency: curr, token, limit: '1', sorting: 'price', one_way: 'false',
    });
    const res  = await fetch(`https://api.travelpayouts.com/v2/prices/latest?${params}`);
    const data = await res.json();
    console.log(`[Travel/Flights] v2/latest ${originCode}->${destCode} status=${res.status}:`, JSON.stringify(data).slice(0, 300));

    const item = data?.data?.[0];
    if (item?.price) return { price: item.price, currency: curr.toUpperCase() };
  } catch (err) {
    console.error('[Travel/Flights] v2/latest error:', err.message);
  }

  // ── المحاولة ٢: /v1/prices/cheap ──
  try {
    const params = new URLSearchParams({
      origin: originCode, destination: destCode, currency: curr, token,
    });
    const res  = await fetch(`https://api.travelpayouts.com/v1/prices/cheap?${params}`);
    const data = await res.json();
    console.log(`[Travel/Flights] v1/cheap ${originCode}->${destCode} status=${res.status}:`, JSON.stringify(data).slice(0, 300));

    const destData = data?.data?.[originCode]?.[destCode] || data?.data?.[destCode];
    if (destData) {
      const flights = Object.values(destData);
      const cheapest = flights.sort((a, b) => (a.price || 9e9) - (b.price || 9e9))[0];
      if (cheapest?.price) return { price: cheapest.price, currency: curr.toUpperCase() };
    }
  } catch (err) {
    console.error('[Travel/Flights] v1/cheap error:', err.message);
  }

  return null;
}

/**
 * بحث الطيران — يرجع مصفوفة بطاقات بالشكل الذي تتوقعه الواجهة:
 * { id, name, price, platform, image, url, badge, rating, details }
 */
async function searchFlights(analysis, market) {
  const { origin, destination, checkIn, checkOut, adults = 1, currency } = analysis || {};

  if (!destination) return [];

  const originCode = resolveCity(origin) || defaultOriginForMarket(market);
  const destCode    = resolveCity(destination);

  const departDate = checkIn || defaultDepartureDate();
  const bookingUrl = buildAviasalesLink(originCode, destCode, departDate, adults);

  let priceInfo = null;
  if (originCode && destCode) {
    priceInfo = await fetchCheapestPrice(originCode, destCode, currency);
  }

  const originLabel = origin || originCode || 'مدينتك';
  const destLabel    = destination;

  const detailsParts = [
    `${adults || 1} ${Number(adults) > 1 ? 'ركاب' : 'راكب'}`,
    checkIn ? `ذهاب: ${checkIn}` : null,
    checkOut ? `عودة: ${checkOut}` : null,
  ].filter(Boolean);

  return [{
    id:       `flight-${originCode || 'na'}-${destCode || 'na'}-${departDate}`,
    name:     `رحلة: ${originLabel} → ${destLabel}`,
    price:    priceInfo ? `من ${priceInfo.price} ${priceInfo.currency}` : 'اعرض الأسعار',
    platform: 'Aviasales',
    image:    PLANE_IMAGE,
    url:      bookingUrl,
    badge:    priceInfo ? 'أرخص سعر مرصود' : 'بحث مباشر',
    rating:   null,
    details:  detailsParts.join(' • '),
  }];
}

module.exports = { searchFlights };
