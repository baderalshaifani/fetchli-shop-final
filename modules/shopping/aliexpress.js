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
function filterAliResults(items, productType, color = null) {
  if (!productType || !items?.length) return items;

  // كلمات يجب أن تظهر في اسم المنتج (إنجليزي + عربي — النتائج ترجع بالعربي لأسواق الخليج)
  const TYPE_KEYWORDS = {
    'ساعة':    ['watch', 'clock', 'timepiece', 'smartwatch', 'wrist', 'ساعة', 'ساعه', 'ساعات'],
    'حقيبة':   ['bag', 'handbag', 'purse', 'tote', 'backpack', 'clutch', 'wallet', 'حقيبة', 'حقيبه', 'شنطة', 'شنطه', 'حقائب', 'محفظة'],
    'حذاء':    ['shoe', 'sneaker', 'boot', 'heel', 'sandal', 'loafer', 'slipper', 'حذاء', 'جزمة', 'جزمه', 'أحذية', 'احذية', 'صندل', 'كوتشي', 'كعب'],
    'قميص':    ['shirt', 'blouse', 'top', 'tee', 't-shirt', 'قميص', 'بلوزة', 'بلوزه', 'تيشيرت', 'توب'],
    'فستان':   ['dress', 'gown', 'skirt', 'فستان', 'فساتين', 'تنورة'],
    'جاكيت':   ['jacket', 'coat', 'blazer', 'hoodie', 'sweater', 'جاكيت', 'معطف', 'سترة', 'هودي'],
    'جوال':    ['phone', 'mobile', 'smartphone', 'iphone', 'samsung', 'هاتف', 'جوال', 'موبايل', 'ايفون', 'آيفون', 'سامسونج'],
    'لابتوب':  ['laptop', 'notebook', 'computer', 'لابتوب', 'حاسوب', 'كمبيوتر'],
    'سماعة':   ['headphone', 'earphone', 'earbuds', 'headset', 'airpods', 'سماعة', 'سماعه', 'سماعات', 'ايربودز'],
    'نظارة':   ['glasses', 'sunglasses', 'eyewear', 'spectacles', 'نظارة', 'نظاره', 'نظارات'],
    'خاتم':    ['ring', 'band', 'خاتم', 'خواتم'],
    'عطر':     ['perfume', 'fragrance', 'cologne', 'eau de', 'عطر', 'عطور', 'برفيوم'],
  };

  // كلمات سوداء — لو موجودة في الاسم يُحذف المنتج حتى لو فيه كلمة النوع
  const TYPE_BLACKLIST = {
    'ساعة':  ['strap', 'band', 'case', 'charger', 'screen protector', 'bracelet', 'bezel', 'watchband', 'watch strap', 'watch case', 'watch band', 'repair', 'tool kit', 'crown', 'watch box', 'watch stand', 'سوار', 'حزام', 'شاحن', 'حماية', 'علبة'],
    'حقيبة': ['strap', 'charm', 'keychain', 'organizer', 'insert', 'hanger', 'حزام', 'ميدالية', 'منظم', 'علاقة'],
    'حذاء':  ['lace', 'insole', 'sole', 'cleaner', 'brush', 'stretcher', 'rack', 'bag', 'رباط', 'نعل', 'فرشاة', 'منظف'],
    'جوال':  ['case', 'cover', 'charger', 'cable', 'holder', 'stand', 'screen', 'protector', 'film', 'غطاء', 'جراب', 'كفر', 'شاحن', 'كيبل', 'كابل', 'حامل', 'لاصقة', 'حماية'],
    'سماعة': ['case', 'tip', 'cushion', 'pad', 'cable', 'adapter', 'hook', 'علبة', 'غطاء', 'كيبل', 'وسادة'],
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
  if (items.length > 0 && filtered.length === 0) {
    console.log('[AliFilter] عينة عناوين مرفوضة:', items.slice(0, 3).map(p => (p.name || '').slice(0, 50)));
  }

  // طبقة اللون (اختيارية وناعمة): لو طُلب لون، نفضّل المنتجات المطابقة له،
  // لكن إن لم يطابق أي منتج اللون لا نرفض الكل (نُبقي نتائج النوع)
  if (color && filtered.length > 0) {
    const COLOR_WORDS = {
      red:['red','حمراء','أحمر','احمر'], blue:['blue','زرقاء','أزرق','ازرق'],
      green:['green','خضراء','أخضر'], black:['black','سوداء','أسود','اسود'],
      white:['white','بيضاء','أبيض','ابيض'], yellow:['yellow','صفراء','أصفر'],
      pink:['pink','وردي','زهري'], brown:['brown','بني'], gray:['gray','grey','رمادي'],
      gold:['gold','ذهبي'], silver:['silver','فضي'], purple:['purple','بنفسجي'],
      orange:['orange','برتقالي'], beige:['beige','بيج'],
    };
    const cw = COLOR_WORDS[color] || [color];
    const colorMatch = filtered.filter(item => {
      const name = (item.name || '').toLowerCase();
      return cw.some(c => name.includes(c.toLowerCase()));
    });
    if (colorMatch.length > 0) {
      console.log(`[AliFilter] لون="${color}" مطابق:${colorMatch.length}/${filtered.length}`);
      return colorMatch;
    }
    console.log(`[AliFilter] لون="${color}" لا مطابقة — أبقينا نتائج النوع`);
  }

  // لا نعرض نتائج غير مطابقة أبداً — الفارغ أصدق من الخطأ
  return filtered;
}

// ────────────────────────────────────
// بناء query مناسب لـ AliExpress (≤ 3 كلمات)
// ────────────────────────────────────
// بناء query لـ AliExpress (≤ 3 كلمات)
// الأولوية: النوع + اللون + وصف واحد — اللون لا يضيع أبداً
// ────────────────────────────────────
function buildAliQuery(query, productType) {
  const TYPE_EN = {
    'ساعة':'watch','حقيبة':'bag','حذاء':'shoes','قميص':'shirt','فستان':'dress',
    'جاكيت':'jacket','جوال':'phone','لابتوب':'laptop','سماعة':'earbuds',
    'نظارة':'sunglasses','خاتم':'ring','عطر':'perfume',
  };

  // قاموس ألوان (عربي + إنجليزي) → الكلمة الإنجليزية الموحّدة
  const COLOR_MAP = {
    'أحمر':'red','حمراء':'red','احمر':'red','red':'red',
    'أزرق':'blue','زرقاء':'blue','ازرق':'blue','blue':'blue',
    'أخضر':'green','خضراء':'green','اخضر':'green','green':'green',
    'أسود':'black','سوداء':'black','اسود':'black','black':'black',
    'أبيض':'white','بيضاء':'white','ابيض':'white','white':'white',
    'أصفر':'yellow','صفراء':'yellow','yellow':'yellow',
    'وردي':'pink','زهري':'pink','pink':'pink',
    'بني':'brown','brown':'brown',
    'رمادي':'gray','gray':'gray','grey':'gray',
    'ذهبي':'gold','gold':'gold',
    'فضي':'silver','silver':'silver',
    'بنفسجي':'purple','purple':'purple',
    'برتقالي':'orange','orange':'orange',
    'بيج':'beige','beige':'beige',
  };

  // كلمات حشو نتجاهلها (تربك محرك البحث)
  const STOP = ['budget','affordable','cheap','luxury','women','men','ladies',
    'female','male','نسائية','نسائي','رجالية','رجالي','حريمي','للنساء','للرجال','ماركة','جديد','new'];

  const rawWords = query.trim().split(/\s+/);

  // ١) استخرج اللون (أول لون نجده)
  let color = null;
  for (const w of rawWords) {
    const c = COLOR_MAP[w.toLowerCase()];
    if (c) { color = c; break; }
  }

  // ٢) النوع بالإنجليزي
  const typeWord = (productType && TYPE_EN[productType]) ? TYPE_EN[productType] : null;

  // مرادفات النوع بالعربي — نتجاهلها كوصف لأن typeWord الإنجليزي يغطيها
  const TYPE_AR_SYNONYMS = ['شنطة','شنطه','حقيبة','حقيبه','حقائب','جزمة','جزمه','حذاء','أحذية','احذية',
    'ساعة','ساعه','ساعات','قميص','فستان','فساتين','جاكيت','جوال','هاتف','لابتوب','سماعة','سماعات',
    'نظارة','نظارات','خاتم','خواتم','عطر','عطور'];

  // ٣) وصف إضافي واحد (كلمة ليست نوعاً ولا لوناً ولا حشواً ولا مرادف نوع عربي)
  const extra = rawWords.find(w => {
    const lw = w.toLowerCase();
    return lw !== typeWord && !COLOR_MAP[lw] && !STOP.includes(lw)
        && !TYPE_AR_SYNONYMS.includes(w) && lw.length > 2 && !/^[a-z]$/.test(lw);
  });

  // ٤) ركّب: النوع + اللون + وصف (نتخطى الفارغ)
  if (typeWord) {
    return [typeWord, color, extra].filter(Boolean).slice(0, 3).join(' ');
  }

  // بدون نوع معروف → نظّف الحشو وخذ أول 3
  const cleaned = rawWords.filter(w => !STOP.includes(w.toLowerCase()));
  return (cleaned.length ? cleaned : rawWords).slice(0, 3).join(' ');
}

module.exports = {
  smartmatchAliExpress,
  searchAliExpress,
  filterAliResults,
  buildAliQuery,
  normalizeProductType,
  ALI_CATEGORY_MAP,
};
