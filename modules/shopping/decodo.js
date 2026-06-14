// ===================================
// modules/shopping/decodo.js
// بحث Amazon عبر Decodo Web Scraping API (JSON parsed)
// يستخرج ASIN ويبني رابط الأفلييت وقت العرض
// ⚠️ مستقل تماماً — لا يلمس AliExpress
// ===================================

const fetch  = require('node-fetch');
const config = require('../../config');

// خريطة السوق → نطاق أمازون
// ملاحظة: amazon.sa قد يفشل أحياناً في الكشط، fallback إلى .com
const DOMAIN_MAP = {
  SA: 'amazon.sa', AE: 'amazon.ae', EG: 'amazon.eg',
  US: 'amazon.com', CA: 'amazon.ca',
};

const CURRENCY_SYMBOL = {
  USD: '$', SAR: 'ر.س', AED: 'د.إ', EGP: 'ج.م', CAD: 'C$', GBP: '£', EUR: '€',
};

// ────────────────────────────────────
// بناء رابط الأفلييت من ASIN
// الصيغة: https://www.amazon.sa/dp/ASIN/?tag=PARTNER_TAG
// ────────────────────────────────────
function buildAffiliateUrl(asin, market) {
  // نكشط من amazon.com، فالمنتج (ASIN) مضمون وجوده هناك.
  // نبني الرابط على .com بنفس tag السوق (أو US كافتراضي).
  const partnerTag = config.AMAZON[market]?.PARTNER_TAG
                  || config.AMAZON.US?.PARTNER_TAG
                  || '';
  const base = `https://www.amazon.com/dp/${asin}/`;
  return partnerTag ? `${base}?tag=${partnerTag}` : base;
}

// ────────────────────────────────────
// البحث عبر Decodo
// ────────────────────────────────────
async function searchAmazonDecodo(query, market = 'SA', wantCheaper = false) {
  try {
    const TOKEN = process.env.DECODO_TOKEN;
    if (!TOKEN) { console.error('[Decodo] DECODO_TOKEN غير موجود في env!'); return null; }
    if (!query || !query.trim()) return null;

    // Decodo يفشل في كشط amazon.sa — نكشط من amazon.com دائماً،
    // ثم نبني رابط الأفلييت على نطاق سوق المستخدم (.sa/.ae) في buildAffiliateUrl
    const scrapeUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query.trim())}`;

    console.log(`[Decodo] → بحث: "${query}" (amazon.com → رابط ${market})`);
    const t0 = Date.now();

    const response = await fetch('https://scraper-api.decodo.com/v2/scrape', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${TOKEN}`,
      },
      body: JSON.stringify({
        target:   'amazon',
        url:      scrapeUrl,
        headless: 'html',
        parse:    true,
      }),
      timeout: 30000,
    });

    const data = await response.json();
    console.log(`[Decodo] ← رد خلال ${((Date.now() - t0) / 1000).toFixed(1)} ثانية | status:${data.status_code || response.status}`);

    // البنية: data.results.results.organic[]
    const block = Array.isArray(data.results) ? data.results[0] : data.results;
    const organic = block?.results?.organic || block?.content?.results?.organic || [];

    if (!organic.length) {
      console.log('[Decodo] لا نتائج لـ:', query);
      console.log('[Decodo] raw:', JSON.stringify(data).slice(0, 300));
      return null;
    }

    // أحياناً Decodo يرجّع amazon.com حتى لو طلبنا .sa → نستخدم عملة المنتج الفعلية
    const products = organic
      .filter(p => p.asin && p.title && p.price && p.url_image)
      .slice(0, 8)
      .map((p, i) => {
        const currency = p.currency || 'USD';
        const sym      = CURRENCY_SYMBOL[currency] || currency;
        return {
          id:          `amz-${p.asin}`,
          name:        p.title.slice(0, 70),
          price:       `${p.price} ${sym}`,
          priceRaw:    parseFloat(p.price) || 99999,
          store:       `Amazon`,
          storeKey:    'amazon',
          image:       p.url_image,
          url:         buildAffiliateUrl(p.asin, market),
          badge:       p.is_amazons_choice ? "Amazon's Choice" : (p.best_seller ? 'الأكثر مبيعاً' : ''),
          rating:      p.rating ? String(p.rating) : null,
          reviewCount: p.reviews_count || 0,
          source:      'amazon',
        };
      });

    if (!products.length) { console.log('[Decodo] نتائج بلا حقول كافية'); return null; }

    // ترتيب بالسعر لو أراد الأرخص
    if (wantCheaper) products.sort((a, b) => a.priceRaw - b.priceRaw);

    console.log(`[Decodo] ${products.length} منتج`);
    return products;

  } catch (err) {
    console.error('[Decodo] error:', err.message);
    return null;
  }
}

module.exports = { searchAmazonDecodo, buildAffiliateUrl };
