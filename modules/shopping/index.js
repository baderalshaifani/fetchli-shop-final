// ===================================
// modules/shopping/index.js — راوتر التسوق
// ===================================

const express = require('express');
const fetch   = require('node-fetch');
const config  = require('../../config');

const { analyzeWithGoogleVision, analyzeWithClaude, buildFallbackFromVision, parseImageInput } = require('./analyze');
const { searchAmazon: searchAmazonRainforest } = require('./amazon');
const { searchAmazonDecodo } = require('./decodo');

// أمازون معطّل مؤقتاً (Decodo غير مستقر مع .sa + رصيد Rainforest منتهٍ)
// لإعادة تفعيله لاحقاً: ضع AMAZON_ENABLED=true في env
const AMAZON_ENABLED = process.env.AMAZON_ENABLED === 'true';

// مصدر أمازون الموحّد: Decodo أولاً، ثم Rainforest احتياطاً
async function searchAmazon(query, market, wantCheaper) {
  if (!AMAZON_ENABLED) return null;
  const viaDecodo = await searchAmazonDecodo(query, market, wantCheaper);
  if (viaDecodo?.length) return viaDecodo;
  return await searchAmazonRainforest(query, market, wantCheaper);
}
const {
  smartmatchAliExpress, searchAliExpress,
  filterAliResults, buildAliQuery, normalizeProductType,
} = require('./aliexpress');
const { sortProducts }   = require('./helpers');
const { syncProducts }   = require('./sync');
const { callClaude, extractJson } = require('../../shared/claude');
const { getConfigValue, setConfigValue, adminAuth } = require('../../shared/adminStore');

const router = express.Router();

// ────────────────────────────────────
// 1. تحليل المنتج — Vision + Claude
// ────────────────────────────────────
router.post('/api/analyze', async (req, res) => {
  try {
    const { message, imageBase64: rawImage, wantCheaper = false, history = [] } = req.body;
    const { mediaType, data: imageBase64 } = parseImageInput(rawImage);

    let visionData = null;
    if (imageBase64) {
      visionData = await analyzeWithGoogleVision(imageBase64);
      console.log('Vision data:', visionData?.bestGuess, visionData?.logos, 'mediaType:', mediaType);
    }

    let analyzed = null;
    try {
      analyzed = await analyzeWithClaude(message, imageBase64, mediaType, visionData, wantCheaper, history);
    } catch (claudeErr) {
      console.error('Claude failed, using Vision fallback:', claudeErr.message);
      analyzed = null;
    }

    if (!analyzed || !analyzed.searchQueries?.length) {
      analyzed = buildFallbackFromVision(visionData, message, wantCheaper);
    }

    if (visionData?.logos?.length > 0 && analyzed.brand) {
      analyzed.confidence = Math.min(98, (analyzed.confidence || 85) + 5);
    }

    res.json({ ...analyzed, visionData });
  } catch (err) {
    console.error('Analyze error:', err);
    res.json({
      searchQueries: [req.body.message || 'product'],
      reply: 'جاري البحث...',
      confidence: 60,
    });
  }
});

// ────────────────────────────────────
// 2A. Amazon — endpoint مستقل
// لا نتائج وهمية: لو Rainforest فشل نرجع قائمة فارغة
// ────────────────────────────────────
router.post('/api/search/amazon', async (req, res) => {
  try {
    const { queries, query, market = 'SA', wantCheaper = false } = req.body;
    const searchTerms = (queries || [query]).filter(q => q && q.trim());
    if (!searchTerms.length) return res.json({ products: [], mock: false });

    const primaryQuery   = searchTerms[0];
    const secondaryQuery = searchTerms[1] || primaryQuery;

    console.log(`[Amazon] market=${market} q="${primaryQuery}"`);

    const raw = await searchAmazon(primaryQuery, market, wantCheaper)
             || await searchAmazon(secondaryQuery, market, wantCheaper);

    const products = raw?.length ? sortProducts(raw, wantCheaper).slice(0, 3) : [];

    console.log(`[Amazon] ${products.length} results`);
    res.json({ products, mock: false });

  } catch (err) {
    console.error('[Amazon] error:', err.message);
    res.json({ products: [], mock: false, error: err.message });
  }
});

// ────────────────────────────────────
// 2B. AliExpress — endpoint مستقل
// ترتيب المصادر: Keyword (مباشر) → Smartmatch (احتياط)
// ────────────────────────────────────
router.post('/api/search/aliexpress', async (req, res) => {
  try {
    const { queries, query, market = 'SA', wantCheaper = false, productType: rawType = null, color = null } = req.body;
    const productType = normalizeProductType(rawType);
    const searchTerms = (queries || [query]).filter(q => q && q.trim());
    if (!searchTerms.length) return res.json({ products: [], mock: false });

    const primaryQuery   = searchTerms[0];
    const secondaryQuery = searchTerms[1] || primaryQuery;

    const aliPrimary   = buildAliQuery(primaryQuery,   productType);
    const aliSecondary = buildAliQuery(secondaryQuery, productType);

    console.log(`[AliExpress] type="${productType}" kw="${aliPrimary}" color="${color}"`);

    let raw = await searchAliExpress(aliPrimary, wantCheaper, market, productType)
           || await searchAliExpress(aliSecondary, wantCheaper, market, productType);
    let src = 'keyword';

    if (!raw?.length) {
      console.log('[AliExpress] Keyword فارغ — Smartmatch...');
      raw = await smartmatchAliExpress([aliPrimary, aliSecondary], wantCheaper, market);
      src = 'smartmatch';
    }

    if (raw?.length) raw = filterAliResults(raw, productType, color);

    const products = raw?.length ? sortProducts(raw, wantCheaper).slice(0, 3) : [];

    console.log(`[AliExpress] ${products.length} results (src:${src})`);
    res.json({ products, mock: false, src });

  } catch (err) {
    console.error('[AliExpress] error:', err.message);
    res.json({ products: [], mock: false, error: err.message });
  }
});

// ────────────────────────────────────
// 2C. البحث الموحد — Amazon + AliExpress بالتوازي
// ملاحظة: نستدعي دوال المتاجر مباشرة (HTTP داخلي يفشل على Render)
// ────────────────────────────────────
router.post('/api/search', async (req, res) => {
  try {
    const { queries, query, market = 'SA', wantCheaper = false, productType: rawType = null, color = null } = req.body;
    const productType = normalizeProductType(rawType);
    const searchTerms = (queries || [query]).filter(q => q && q.trim());
    if (!searchTerms.length) return res.json({ amazon: [], aliexpress: [], amazonMock: false, aliMock: false });

    const primaryQuery   = searchTerms[0];
    const secondaryQuery = searchTerms[1] || primaryQuery;
    const aliPrimary     = buildAliQuery(primaryQuery, productType);
    const aliSecondary   = buildAliQuery(secondaryQuery, productType);

    // Amazon معطّل مؤقتاً، فهذا الاستدعاء يرجع null سريعاً (AMAZON_ENABLED=false)
    const amazonRaw = await Promise.race([
      searchAmazon(primaryQuery, market, wantCheaper)
        .then(r => r || searchAmazon(secondaryQuery, market, wantCheaper)),
      new Promise(resolve => setTimeout(() => resolve(null), 25000)),
    ]);

    // Amazon — بدون نتائج وهمية
    const amazonProducts = amazonRaw?.length
      ? sortProducts(amazonRaw, wantCheaper).slice(0, 3)
      : [];

    // AliExpress — بحث حي مباشر (لا نعتمد على Supabase الناقص)
    // الترتيب: keyword+category (الأدق) ← smartmatch (احتياط)
    let aliRaw = await searchAliExpress(aliPrimary, wantCheaper, market, productType)
              || await searchAliExpress(aliSecondary, wantCheaper, market, productType);
    let aliSrc = 'keyword';

    if (!aliRaw?.length) {
      aliRaw = await smartmatchAliExpress([aliPrimary, aliSecondary], wantCheaper, market);
      aliSrc = 'smartmatch';
    }
    if (aliRaw?.length) aliRaw = filterAliResults(aliRaw, productType, color);

    const aliProducts = aliRaw?.length
      ? sortProducts(aliRaw, wantCheaper).slice(0, 3)
      : [];

    console.log(`[Search] Amazon:${amazonProducts.length} | Ali:${aliProducts.length}(src:${aliSrc})`);
    res.json({
      amazon:     amazonProducts,
      aliexpress: aliProducts,
      amazonMock: false,
      aliMock:    false,
      aliSrc,
    });

  } catch (err) {
    res.json({ amazon: [], aliexpress: [], amazonMock: false, aliMock: false, error: err.message });
  }
});

// ────────────────────────────────────
// 3. تصفية النتائج بـ Claude (اختياري)
// ────────────────────────────────────
router.post('/api/filter', async (req, res) => {
  try {
    const { products, originalAnalysis, wantCheaper } = req.body;
    if (!products?.length) return res.json({ products: [] });

    const raw = await callClaude({
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `خبير تسوق. العميل يبحث عن:
النوع: ${originalAnalysis.productType}
الماركة: ${originalAnalysis.brand || 'أي ماركة'}
اللون: ${originalAnalysis.color}
${wantCheaper ? 'يريد: الأرخص مع التشابه' : ''}

النتائج:
${products.map((p, i) => `${i}: ${p.name} - ${p.price} - ${p.store}`).join('\n')}

رتّب أفضل 4 حسب ${wantCheaper ? 'السعر الأرخص' : 'الدقة والتقييم'}.
JSON فقط: { "rankedIndices": [0,1,2,3] }`,
      }],
    });

    const parsed = extractJson(raw);
    const ranked = parsed.rankedIndices?.map(i => products[i]).filter(Boolean);
    res.json({ products: ranked || products });
  } catch (err) {
    res.json({ products: req.body.products });
  }
});

// ────────────────────────────────────
// 4. Smart Chat — Claude يفهم النية ويسأل أو يقرر البحث
// ────────────────────────────────────
router.post('/api/smart-chat', async (req, res) => {
  try {
    const { history = [] } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const systemPrompt = `أنت مساعد ذكي لمنصة Fetchli للتسوق والسفر. اليوم: ${today}.
مهمتك: فهم ما يريده المستخدم بدقة، ثم إما أن تسأله سؤالاً واحداً لتوضيح المعلومات الناقصة، أو تقرر البحث إذا عندك كل المعلومات.
قواعد:
- اسأل سؤالاً واحداً فقط في كل مرة، قصير وواضح
- لا تسأل أكثر من 3 أسئلة إجمالاً قبل البحث
- للسفر تحتاج: مدينة المغادرة + الوجهة + التاريخ التقريبي
- للتسوق تحتاج: اسم/وصف المنتج (الميزانية اختيارية)
- مهم جداً للتسوق: في context.product اكتب دائماً وصفاً كاملاً مستقلاً للمنتج المطلوب الآن.
  إذا أشار المستخدم لطلب سابق ("نفس اللون"، "نفس الماركة"، "بس رجالي")، ادمج المعلومة من المحادثة:
  مثال: سبق طلب "شنطة نسائية حمراء" ثم قال "اريد جزمة نفس اللون" → product: "جزمة نسائية حمراء"
  لا تكتب أبداً عبارات نسبية مثل "نفس اللون" داخل product — حوّلها لقيمتها الفعلية.
- إذا عندك معلومات كافية → action: search فوراً
أجب بـ JSON فقط بدون أي نص خارجه:
{
  "mode": "travel" | "shop" | null,
  "action": "ask" | "search",
  "question": "السؤال (فقط لو action=ask)",
  "context": {
    "origin": null,
    "destination": null,
    "checkIn": null,
    "checkOut": null,
    "adults": 2,
    "tripType": "flight" | "hotel" | "mixed" | "car",
    "product": null,
    "budget": null,
    "wantCheaper": false
  }
}`;

    const raw    = await callClaude({ system: systemPrompt, messages: history, max_tokens: 500 });
    const result = extractJson(raw);
    res.json(result);
  } catch (err) {
    console.error('smart-chat error:', err.message);
    res.json({ mode: 'shop', action: 'search', context: {} });
  }
});

// ────────────────────────────────────
// 5. مزامنة المنتجات (محمي بـ SYNC_SECRET)
// ────────────────────────────────────
router.get('/api/sync', async (req, res) => {
  // فشل آمن: لو SYNC_SECRET غير مضبوط نرفض الطلب دائماً
  if (!process.env.SYNC_SECRET || req.query.secret !== process.env.SYNC_SECRET)
    return res.status(401).json({ error: 'unauthorized' });
  res.json({ message: '🚀 بدأت المزامنة في الخلفية' });
  syncProducts().catch(err => console.error('Sync error:', err.message));
});

// ────────────────────────────────────
// 6. AliExpress OAuth Callback (محمي بـ SYNC_SECRET)
// الاستخدام: /api/aliexpress/callback?code=...&secret=SYNC_SECRET
// ────────────────────────────────────
router.get('/api/aliexpress/callback', async (req, res) => {
  // فشل آمن: لو SYNC_SECRET غير مضبوط نرفض الطلب دائماً
  if (!process.env.SYNC_SECRET || req.query.secret !== process.env.SYNC_SECRET)
    return res.status(401).send('unauthorized — أضف ?secret=SYNC_SECRET للرابط');

  const { code } = req.query;
  if (!code) return res.send('No code received');
  try {
    const crypto     = require('crypto');
    const APP_KEY    = process.env.ALIEXPRESS_APP_KEY;
    const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET;
    const params = {
      app_key:     APP_KEY,
      method:      '/auth/token/create',
      sign_method: 'md5',
      timestamp:   String(Date.now()),
      v:           '2.0',
      format:      'json',
      code,
    };
    const sortedKeys = Object.keys(params).sort();
    const signStr = APP_SECRET + sortedKeys.map(k => k + params[k]).join('') + APP_SECRET;
    params.sign = crypto.createHash('md5').update(Buffer.from(signStr, 'utf8')).digest('hex').toUpperCase();
    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(params),
    });
    const data = await response.json();
    res.send(`<h2>Access Token Generated Successfully!</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
  } catch (e) {
    res.send('Error: ' + e.message);
  }
});

// ────────────────────────────────────
// 7. إعدادات المتاجر — لوحة التحكم → Supabase
// ────────────────────────────────────
router.get('/api/stores', async (req, res) => {
  try {
    const stores = await getConfigValue('stores', []);
    res.json({ ok: true, stores });
  } catch (err) {
    res.json({ ok: false, error: err.message, stores: [] });
  }
});

router.post('/api/stores', adminAuth, async (req, res) => {
  try {
    const { stores } = req.body;
    if (!Array.isArray(stores)) return res.status(400).json({ ok: false, error: 'stores يجب أن تكون مصفوفة' });
    await setConfigValue('stores', stores);
    res.json({ ok: true, count: stores.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ────────────────────────────────────
// 8. محتوى الموقع (نصائح/مدونة/عروض) — لوحة التحكم → Supabase
// GET عام (الواجهة تقرأه) / POST محمي
// ────────────────────────────────────
const CONTENT_KEYS = { tips: 'content_tips', blog: 'content_blog', deals: 'content_deals' };

router.get('/api/admin/content', async (req, res) => {
  try {
    const [tips, blog, deals] = await Promise.all([
      getConfigValue(CONTENT_KEYS.tips,  { ar: [], en: [], de: [] }),
      getConfigValue(CONTENT_KEYS.blog,  { ar: { travel: [], shop: [] }, en: { travel: [], shop: [] }, de: { travel: [], shop: [] } }),
      getConfigValue(CONTENT_KEYS.deals, { travel: [], shop: [] }),
    ]);
    res.json({ tips, blog, manual_deals: deals });
  } catch (err) {
    res.json({ tips: { ar: [], en: [], de: [] }, blog: {}, manual_deals: { travel: [], shop: [] } });
  }
});

router.post('/api/admin/content', adminAuth, async (req, res) => {
  try {
    const { type, data } = req.body;
    const key = CONTENT_KEYS[type];
    if (!key) return res.status(400).json({ ok: false, error: 'type غير صالح (tips|blog|deals)' });
    await setConfigValue(key, data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
router.get('/admin', (req, res) => {
  const token = req.query.token;
  const expectedToken = process.env.ADMIN_TOKEN;

  if (expectedToken && token === expectedToken) {
    res.sendFile(path.join(__dirname, '../../admin.html'));
  } else {
    res.status(401).send('<h1>401 Unauthorized</h1>');
  }
});
module.exports = router;
