// ===================================
// modules/shopping/aliexpress.js
// AliExpress: smartmatch + keyword search + فلترة + بناء query
// قاعدة ذهبية: queries بحد أقصى 3 كلمات وإلا API يرجع خطأ 405
// ===================================

const fetch  = require('node-fetch');
const crypto = require('crypto');

// خريطة الدول → عملة + لغة + شحن
const MARKET_MAP = {
  SA: { currency: 'SAR', language: 'AR', ship_to: 'SA' },
  AE: { currency: 'AED', language: 'AR', ship_to: 'AE' },
  EG: { currency: 'USD', language: 'AR', ship_to: 'EG' },
  KW: { currency: 'KWD', language: 'AR', ship_to: 'KW' },
  QA: { currency: 'QAR', language: 'AR', ship_to: 'QA' },
  US: { currency: 'USD', language: 'EN', ship_to: 'US' },
  CA: { currency: 'CAD', language: 'EN', ship_to: 'CA' },
  GB: { currency: 'GBP', language: 'EN', ship_to: 'GB' },
  DE: { currency: 'EUR', language: 'DE', ship_to: 'DE' },
};

// ────────────────────────────────────
// توحيد نوع المنتج — يحوّل أي صيغة لقيمة موحدة
// ────────────────────────────────────
function normalizeProductType(raw) {
  if (!raw || raw === 'null') return null;
  const t = String(raw).trim();

  const MAP = [
    { keys: ['ساعة','ساعات','ساعة يد','ساعة رجالية','ساعة نسائية','ساعة ذكية','smartwatch','watch','watches'], val: 'ساعة' },
    { keys: ['حقيبة','حقائب','شنطة','شنطه','bag','bags','handbag','purse','tote','backpack'], val: 'حقيبة' },
    { keys: ['حذاء','أحذية','احذية','كوتشي','shoe','shoes','sneaker','boot','sandal'],       val: 'حذاء' },
    { keys: ['قميص','تيشيرت','تي شيرت','shirt','tee','top','blouse'],                        val: 'قميص' },
    { keys: ['فستان','فساتين','dress','gown'],                                                val: 'فستان' },
    { keys: ['جاكيت','جاكت','معطف','jacket','coat','hoodie','blazer'],                        val: 'جاكيت' },
    { keys: ['جوال','موبايل','هاتف','phone','mobile','smartphone','iphone','samsung'],         val: 'جوال' },
    { keys: ['لابتوب','حاسوب','كمبيوتر','laptop','notebook','computer'],                      val: 'لابتوب' },
    { keys: ['سماعة','سماعات','earphone','earbuds','headphone','headset','airpods'],           val: 'سماعة' },
    { keys: ['نظارة','نظارات','glasses','sunglasses','eyewear'],                              val: 'نظارة' },
    { keys: ['خاتم','خواتم','ring','rings'],                                                  val: 'خاتم' },
    { keys: ['عطر','عطور','perfume','fragrance','cologne'],                                   val: 'عطر' },
  ];

  const lower = t.toLowerCase();
  for (const { keys, val } of MAP) {
    if (keys.some(k => lower.includes(k.toLowerCase()))) return val;
  }
  return t;
}

// ────────────────────────────────────
// خريطة Category IDs — AliExpress
// ────────────────────────────────────
const ALI_CATEGORY_MAP = {
  'ساعة':   '200000828', // Watches
  'حقيبة':  '200003499', // Luggage & Bags
  'حذاء':   '200003501', // Shoes
  'قميص':   '200003500', // Tops & Tees
  'فستان':  '200003496', // Dresses
  'جاكيت':  '200003498', // Outerwear & Coats
  'جوال':   '509',       // Phones & Telecommunications
  'لابتوب': '200003791', // Computer & Office
  'سماعة':  '200003824', // Consumer Electronics
  'نظارة':  '200003827', // Sunglasses & Eyewear
  'خاتم':   '200003826', // Rings & Fine Jewelry
  'عطر':    '200003833', // Fragrances & Deodorants
};

function signParams(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const signStr    = secret + sortedKeys.map(k => k + params[k]).join('') + secret;
  return crypto.createHash('md5').update(Buffer.from(signStr, 'utf8')).digest('hex').toUpperCase();
}

// ────────────────────────────────────
// smartmatch — يطابق بعناوين إنجليزية من Claude
// ────────────────────────────────────
async function smartmatchAliExpress(englishTitles, wantCheaper = false, market = 'SA') {
  try {
    const APP_KEY      = process.env.ALIEXPRESS_APP_KEY;
    const APP_SECRET   = process.env.ALIEXPRESS_APP_SECRET;
    const ACCESS_TOKEN = process.env.ALIEXPRESS_ACCESS_TOKEN;
    const TRACKING     = process.env.ALIEXPRESS_TRACKING_ID || '';

    if (!APP_KEY || !APP_SECRET) return null;
    if (!englishTitles?.length) return null;

    const mkt = MARKET_MAP[market] || MARKET_MAP['SA'];

    // نستدعي smartmatch لكل عنوان إنجليزي بالتوازي (أول 3 فقط)
    const results = await Promise.allSettled(
      englishTitles.slice(0, 3).map(async (title, idx) => {
        const params = {
          app_key:          APP_KEY,
          method:           'aliexpress.affiliate.product.smartmatch',
          sign_method:      'md5',
          timestamp:        String(Date.now() + idx * 10),
          v:                '2.0',
          format:           'json',
          session:          ACCESS_TOKEN || '',
          product_title:    title.slice(0, 100),
          device_id:        'fetchli-web', // إجباري حسب رسالة خطأ الـ API (MissingParameter)
          tracking_id:      TRACKING,
          target_currency:  mkt.currency,
          target_language:  mkt.language,
          ship_to_country:  mkt.ship_to,
          page_no:          '1',
          page_size:        '3',
        };
        params.sign = signParams(params, APP_SECRET);

        const response = await fetch('https://api-sg.aliexpress.com/sync', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams(params),
        });
        const data = await response.json();
        console.log(`[Smartmatch] "${title.slice(0,40)}" →`, JSON.stringify(data).slice(0, 120));

        return data?.aliexpress_affiliate_product_smartmatch_response?.resp_result?.result?.products?.product || [];
      })
    );

    const allItems = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);

    if (!allItems.length) {
      console.log('[Smartmatch] no results');
      return null;
    }

    // إزالة التكرار حسب product_id
    const seen   = new Set();
    const unique = allItems.filter(item => {
      if (seen.has(item.product_id)) return false;
      seen.add(item.product_id);
      return true;
    });

    const currencyMap = { SAR:'ر.س', AED:'د.إ', USD:'$', GBP:'£', EUR:'€', CAD:'C$', KWD:'د.ك', QAR:'ر.ق' };

    return unique.slice(0, 6).map((item, i) => {
      const price    = parseFloat(item.target_sale_price) || 0;
      const currency = item.target_sale_price_currency || 'USD';
      const rating   = item.evaluate_rate
        ? (parseFloat(item.evaluate_rate) / 20).toFixed(1)
        : null;
      return {
        id:          `ali-sm-${item.product_id}`,
        name:        item.product_title?.slice(0, 70) || '',
        price:       price ? `${price} ${currencyMap[currency] || currency}` : 'تحقق من السعر',
        priceRaw:    price,
        store:       'AliExpress',
        storeKey:    'aliexpress',
        image:       item.product_main_image_url || '',
        url:         item.product_detail_url || 'https://aliexpress.com',
        badge:       i === 0 ? 'الأوفر' : i === 1 ? 'الأكثر مبيعاً' : 'صفقة مميزة',
        rating,
        reviewCount: item.lastest_volume || 0,
        source:      'aliexpress',
      };
    });

  } catch (err) {
    console.error('[Smartmatch] error:', err.message);
    return null;
  }
}

// ────────────────────────────────────
// keyword search — fallback فقط
// ────────────────────────────────────
async function searchAliExpress(query, wantCheaper = false, market = 'SA', productType = null) {
  try {
    const APP_KEY      = process.env.ALIEXPRESS_APP_KEY;
    const APP_SECRET   = process.env.ALIEXPRESS_APP_SECRET;
    const ACCESS_TOKEN = process.env.ALIEXPRESS_ACCESS_TOKEN;
    const TRACKING     = process.env.ALIEXPRESS_TRACKING_ID || '';

    if (!APP_KEY || !APP_SECRET) return null;
    if (!query || !query.trim()) return null;

    const mkt = MARKET_MAP[market] || MARKET_MAP['SA'];

    const categoryId = ALI_CATEGORY_MAP[normalizeProductType(productType)] || null;
    console.log(`[AliExpress] query="${query}" productType="${productType}" categoryId="${categoryId}"`);

    const params = {
      app_key:      APP_KEY,
      method:       'aliexpress.affiliate.product.query',
      sign_method:  'md5',
      timestamp:    String(Date.now()),
      v:            '2.0',
      format:       'json',
      session:      ACCESS_TOKEN || '',
      keywords:     query,
      sort:         wantCheaper ? 'SALE_PRICE_ASC' : 'LAST_VOLUME_DESC',
      page_no:      '1',
      page_size:    '6',  // نجلب 6 عشان بعد الفلترة يتبقى 3
      fields:       'product_id,product_title,target_sale_price,target_sale_price_currency,product_main_image_url,product_detail_url,evaluate_rate,lastest_volume',
      tracking_id:        TRACKING,
      target_currency:    mkt.currency,
      target_language:    mkt.language,
      ship_to_country:    mkt.ship_to,
      ...(categoryId ? { category_ids: categoryId } : {}),
    };
    params.sign = signParams(params, APP_SECRET);

    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(params),
    });
    const data = await response.json();

    console.log('AliExpress raw:', JSON.stringify(data).slice(0, 200));

    const items = data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];
    if (!items.length) {
      console.log('AliExpress: no results for:', query);
      return null;
    }

    return items.slice(0, 3).map((item, i) => {
      const price    = parseFloat(item.target_sale_price) || 0;
      const currency = item.target_sale_price_currency || 'USD';
      const rating   = item.evaluate_rate
        ? (parseFloat(item.evaluate_rate) / 20).toFixed(1)
        : null;

      return {
        id:          `ali-${item.product_id}`,
        name:        item.product_title?.slice(0, 70) || query,
        price:       price ? `${price} ${currency}` : 'تحقق من السعر',
        priceRaw:    price,
        store:       'AliExpress',
        storeKey:    'aliexpress',
        image:       item.product_main_image_url || '',
        url:         item.product_detail_url || 'https://aliexpress.com',
        badge:       i === 0 ? 'الأوفر' : i === 1 ? 'الأكثر مبيعاً' : 'صفقة مميزة',
        rating:      rating,
        reviewCount: item.lastest_volume || 0,
        source:      'aliexpress',
      };
    });
  } catch (err) {
    console.error('AliExpress search error:', err.message);
    return null;
  }
}

// ────────────────────────────────────
// فلترة نتائج AliExpress حسب نوع المنتج
// ────────────────────────────────────
function filterAliResults(items, productType) {
  if (!productType || !items?.length) return items;

  // كلمات يجب أن تظهر في اسم المنتج
  const TYPE_KEYWORDS = {
    'ساعة':    ['watch', 'clock', 'timepiece', 'smartwatch', 'wrist'],
    'حقيبة':   ['bag', 'handbag', 'purse', 'tote', 'backpack', 'clutch', 'wallet'],
    'حذاء':    ['shoe', 'sneaker', 'boot', 'heel', 'sandal', 'loafer', 'slipper'],
    'قميص':    ['shirt', 'blouse', 'top', 'tee', 't-shirt'],
    'فستان':   ['dress', 'gown', 'skirt'],
    'جاكيت':   ['jacket', 'coat', 'blazer', 'hoodie', 'sweater'],
    'جوال':    ['phone', 'mobile', 'smartphone', 'iphone', 'samsung'],
    'لابتوب':  ['laptop', 'notebook', 'computer'],
    'سماعة':   ['headphone', 'earphone', 'earbuds', 'headset', 'airpods'],
    'نظارة':   ['glasses', 'sunglasses', 'eyewear', 'spectacles'],
    'خاتم':    ['ring', 'band'],
    'عطر':     ['perfume', 'fragrance', 'cologne', 'eau de'],
  };

  // كلمات سوداء — لو موجودة في الاسم يُحذف المنتج حتى لو فيه كلمة النوع
  const TYPE_BLACKLIST = {
    'ساعة':  ['strap', 'band', 'case', 'charger', 'screen protector', 'bracelet', 'bezel', 'watchband', 'watch strap', 'watch case', 'watch band', 'repair', 'tool kit', 'crown', 'watch box', 'watch stand'],
    'حقيبة': ['strap', 'charm', 'keychain', 'organizer', 'insert', 'hanger'],
    'حذاء':  ['lace', 'insole', 'sole', 'cleaner', 'brush', 'stretcher', 'rack', 'bag'],
    'جوال':  ['case', 'cover', 'charger', 'cable', 'holder', 'stand', 'screen', 'protector', 'film'],
    'سماعة': ['case', 'tip', 'cushion', 'pad', 'cable', 'adapter', 'hook'],
  };

  const keywords  = TYPE_KEYWORDS[productType];
  const blacklist = TYPE_BLACKLIST[productType] || [];
  if (!keywords) return items;

  const filtered = items.filter(item => {
    const name = (item.name || '').toLowerCase();
    const hasKeyword = keywords.some(kw => name.includes(kw));
    if (!hasKeyword) return false;
    const hasBlacklisted = blacklist.some(bl => name.includes(bl));
    return !hasBlacklisted;
  });

  console.log(`[AliFilter] type="${productType}" before:${items.length} after:${filtered.length}`);
  return filtered.length > 0 ? filtered : items;
}

// ────────────────────────────────────
// بناء query مناسب لـ AliExpress (≤ 3 كلمات)
// ────────────────────────────────────
function buildAliQuery(query, productType) {
  const TYPE_EN = {
    'ساعة':   'watch',
    'حقيبة':  'bag',
    'حذاء':   'shoes',
    'قميص':   'shirt',
    'فستان':  'dress',
    'جاكيت':  'jacket',
    'جوال':   'phone',
    'لابتوب': 'laptop',
    'سماعة':  'earbuds',
    'نظارة':  'sunglasses',
    'خاتم':   'ring',
    'عطر':    'perfume',
  };

  const words = query.trim().split(/\s+/);

  if (productType && TYPE_EN[productType]) {
    const typeWord = TYPE_EN[productType];
    const hasTypeWord = words.some(w => w.toLowerCase() === typeWord);
    if (!hasTypeWord) {
      const descriptors = words.filter(w => !['budget','affordable','cheap','women','men','ladies','female','male'].includes(w.toLowerCase())).slice(0, 2);
      return [typeWord, ...descriptors].join(' ');
    }
  }

  // بدون productType أو الكلمة موجودة → أول 3 كلمات
  return words.slice(0, 3).join(' ');
}

module.exports = {
  smartmatchAliExpress,
  searchAliExpress,
  filterAliResults,
  buildAliQuery,
  normalizeProductType,
  ALI_CATEGORY_MAP,
};
