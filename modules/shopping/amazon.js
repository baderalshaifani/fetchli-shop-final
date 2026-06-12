// ===================================
// modules/shopping/amazon.js
// Amazon (Rainforest API)
// ⚠️ هذا الملف مستقل تماماً — أي إصلاح لـ AliExpress لا يلمسه أبداً
// ===================================

const fetch = require('node-fetch');

async function searchAmazon(query, market = 'SA', wantCheaper = false) {
  try {
    const API_KEY = process.env.RAINFOREST_API_KEY;
    if (!API_KEY) { console.error('[Amazon] RAINFOREST_API_KEY غير موجود في env!'); return null; }
    if (!query || !query.trim()) return null;

    const domainMap = {
      SA: 'amazon.sa', AE: 'amazon.ae',
      EG: 'amazon.eg', US: 'amazon.com',
      CA: 'amazon.ca',
    };
    const amazonDomain = domainMap[market] || 'amazon.sa';

    const params = new URLSearchParams({
      api_key:       API_KEY,
      type:          'search',
      amazon_domain: amazonDomain,
      search_term:   query,
      sort_by:       wantCheaper ? 'price_low_to_high' : 'featured',
      page:          '1',
    });

    console.log(`[Amazon] → Rainforest: "${query}" (${amazonDomain})`);
    const t0 = Date.now();
    const response = await fetch(`https://api.rainforestapi.com/request?${params}`);
    const data     = await response.json();
    console.log(`[Amazon] ← رد خلال ${((Date.now() - t0) / 1000).toFixed(1)} ثانية`);

    if (data.error) {
      console.error('Rainforest API error:', data.error);
      return null;
    }

    const results = data.search_results || [];
    if (!results.length) {
      // Rainforest يضع الرفض (رصيد منتهي/مفتاح) في request_info وليس في error
      const info = data.request_info;
      if (info && info.success === false) {
        console.error('[Amazon] ⛔ Rainforest رفض الطلب:', info.message || JSON.stringify(info).slice(0, 200));
      } else {
        console.log('[Amazon] لا نتائج من Rainforest لـ:', query);
        console.log('[Amazon] raw:', JSON.stringify(data).slice(0, 300));
      }
      return null;
    }

    const currencyMap = { SA: 'ر.س', AE: 'د.إ', EG: 'ج.م', US: '$', CA: 'C$' };
    const currency    = currencyMap[market] || 'ر.س';

    return results
      .filter(item => item.price?.value && item.image)
      .slice(0, 6)
      .map((item, i) => ({
        id:     `amz-${market}-${i}-${Date.now()}`,
        name:   item.title?.slice(0, 70) || query,
        price:  item.price?.value ? `${item.price.value} ${currency}` : 'تحقق من السعر',
        priceRaw: item.price?.value || 99999,
        store:  `Amazon ${market}`,
        storeKey: 'amazon',
        image:  item.image,
        url:    item.link || `https://www.${amazonDomain}/s?k=${encodeURIComponent(query)}`,
        badge:  i === 0 ? 'الأعلى تقييماً' : i === 1 ? 'الأكثر مبيعاً' : '',
        rating: item.rating ? String(item.rating) : null,
        reviewCount: item.ratings_total || 0,
        source: 'amazon',
      }));
  } catch (err) {
    console.error('Amazon search error:', err.message);
    return null;
  }
}

module.exports = { searchAmazon };
