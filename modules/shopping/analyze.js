// ===================================
// modules/shopping/analyze.js
// Google Vision + Claude — تحليل المنتج وتوليد كلمات البحث
// ===================================

const fetch  = require('node-fetch');
const config = require('../../config');

// ────────────────────────────────────
// Google Vision — تحليل بصري أولي
// ────────────────────────────────────
async function analyzeWithGoogleVision(imageBase64) {
  try {
    const GOOGLE_KEY = process.env.GOOGLE_VISION_KEY;
    if (!GOOGLE_KEY) return null;

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [
              { type: 'LABEL_DETECTION',     maxResults: 15 },
              { type: 'LOGO_DETECTION',      maxResults: 5  },
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
              { type: 'IMAGE_PROPERTIES',    maxResults: 5  },
              { type: 'WEB_DETECTION',       maxResults: 10 },
            ],
          }],
        }),
      }
    );

    const data   = await response.json();
    const result = data.responses?.[0];
    if (!result) return null;

    const labels  = result.labelAnnotations?.map(l => l.description) || [];
    const logos   = result.logoAnnotations?.map(l => l.description)  || [];
    const objects = result.localizedObjectAnnotations?.map(o => o.name) || [];
    const webEntities = result.webDetection?.webEntities
      ?.filter(e => e.score > 0.5)
      ?.map(e => e.description) || [];
    const bestGuess = result.webDetection?.bestGuessLabels?.[0]?.label || '';

    const colors = result.imagePropertiesAnnotation?.dominantColors?.colors
      ?.slice(0, 3)
      ?.map(c => {
        const r = Math.round(c.color.red   || 0);
        const g = Math.round(c.color.green || 0);
        const b = Math.round(c.color.blue  || 0);
        return rgbToColorName(r, g, b);
      }) || [];

    return { labels, logos, objects, webEntities, bestGuess, colors };
  } catch (err) {
    console.error('Google Vision error:', err);
    return null;
  }
}

function rgbToColorName(r, g, b) {
  if (r > 200 && g > 200 && b > 200) return 'white';
  if (r < 50  && g < 50  && b < 50 ) return 'black';
  if (r > 150 && g < 100 && b < 100) return 'red';
  if (r < 100 && g < 100 && b > 150) return 'blue';
  if (r < 100 && g > 150 && b < 100) return 'green';
  if (r > 150 && g > 150 && b < 100) return 'yellow';
  if (r > 150 && g > 100 && b < 80 ) return 'orange';
  if (r > 120 && g < 80  && b > 120) return 'purple';
  if (r > 150 && g > 100 && b > 150) return 'pink';
  if (r > 100 && g > 80  && b < 60 ) return 'brown';
  if (r > 150 && g > 150 && b > 150) return 'gray';
  if (r < 30  && g < 50  && b > 80 ) return 'navy';
  return `rgb(${r},${g},${b})`;
}

// ────────────────────────────────────
// parseImageInput — يشيل data:URL prefix (لو موجود) ويحدد media_type الصحيح
// يدعم: Data URL كامل (data:image/png;base64,...) أو base64 خام بدون prefix
// ────────────────────────────────────
function parseImageInput(imageBase64) {
  if (!imageBase64) return { mediaType: null, data: null };

  // الحالة 1: Data URL كامل — نستخرج النوع الحقيقي ونشيل الـ prefix
  const dataUrlMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    let mediaType = dataUrlMatch[1].toLowerCase();
    // image/jpg ليست MIME صحيح — Claude يتوقع image/jpeg
    if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
    return { mediaType, data: dataUrlMatch[2] };
  }

  // الحالة 2: base64 خام بدون prefix — نكتشف النوع من أول بايتات الترميز
  const head = imageBase64.slice(0, 16);
  let mediaType = 'image/jpeg'; // افتراضي
  if (head.startsWith('iVBORw0KGgo'))       mediaType = 'image/png';
  else if (head.startsWith('/9j'))          mediaType = 'image/jpeg';
  else if (head.startsWith('UklGR'))        mediaType = 'image/webp';
  else if (head.startsWith('R0lGOD'))       mediaType = 'image/gif';

  return { mediaType, data: imageBase64 };
}

// ────────────────────────────────────
// Claude — تحليل عميق + توليد كلمات بحث
// history: مصفوفة من التحليلات السابقة { productType, color, brand }
// تُستخدم لطلبات مثل "نفس اللون" / "نفس النوع"
// ────────────────────────────────────
async function analyzeWithClaude(message, imageBase64, mediaType, visionData, wantCheaper, history = []) {
  const content = [];

  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
    });
  }

  const visionContext = visionData ? `
بيانات من Google Vision API (استخدمها كمرجع إضافي):
- الماركات المكتشفة: ${visionData.logos.join(', ') || 'لا يوجد'}
- الكائنات: ${visionData.objects.join(', ') || 'لا يوجد'}
- التسميات: ${visionData.labels.slice(0, 8).join(', ') || 'لا يوجد'}
- الكيانات من الويب: ${visionData.webEntities.slice(0, 5).join(', ') || 'لا يوجد'}
- أفضل تخمين: ${visionData.bestGuess || 'لا يوجد'}
- الألوان السائدة: ${visionData.colors.join(', ') || 'لا يوجد'}
` : '';

  const cheaperNote = wantCheaper
    ? 'المستخدم يريد بدائل أرخص — ركز على كلمات: alternative, dupe, budget, affordable, similar'
    : '';

  const historyContext = history.length > 0
    ? 'Previous context (use for: نفس اللون/same color/same type):\n' +
      history.map(h => '- ' + [h.productType, h.color ? 'color:' + h.color : '', h.brand ? 'brand:' + h.brand : ''].filter(Boolean).join(' | ')).join('\n') + '\n'
    : '';

  content.push({
    type: 'text',
    text: `You are a professional shopping expert with deep knowledge of products, brands, and fashion.
${imageBase64 ? 'IMPORTANT: Carefully analyze the image. Identify EXACTLY what product is shown - watch, bag, shoe, etc.' : ''}
${visionContext}
${historyContext}
${message ? `User request: "${message}"` : ''}
${cheaperNote}

CRITICAL RULES:
- If user says نفس اللون/same color → use color from context above
- If user says نفس النوع/same type → use productType from context
- If the image shows a WATCH, productType must be "ساعة" and search for watches only
- If the image shows a BAG, productType must be "حقيبة" and search for bags only
- If the image shows SHOES, productType must be "حذاء" and search for shoes only
- Never confuse different product categories
- The Google Vision data above is a strong hint - use it

Extract precisely:
1. Product type (what exactly is shown)
2. Brand/Logo (from image or Vision data)
3. Main color and secondary colors
4. Material/texture
5. Distinctive features (style, closure, strap type, etc.)

Create 5 different English search queries:
- Query 1: Very specific (brand + type + color + material + key feature)
- Query 2: Without brand (type + color + material + style)
- Query 3: ${wantCheaper ? 'budget dupe alternative similar' : 'by category and use case'}
- Query 4: ${wantCheaper ? 'affordable similar style cheap' : 'by shape and design details'}
- Query 5: ${wantCheaper ? 'cheap similar product low price' : 'general category search'}

Respond ONLY with valid JSON, no extra text:
{
  "productType": "نوع المنتج بالعربي",
  "brand": "brand name or null",
  "color": "main color",
  "material": "material/texture",
  "details": "distinctive features",
  "searchQueries": ["specific query","no-brand query","q3","q4","q5"],
  "priceRange": "${wantCheaper ? 'budget' : 'any'}",
  "reply": "رد ودي قصير بالعربي يصف ما وجدته بالضبط",
  "confidence": 92
}`,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         config.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      config.CLAUDE_MODEL,
      max_tokens: 1000,
      system:     'You are a product analysis API. You MUST respond with valid JSON only. No markdown, no code blocks, no explanation. Just the raw JSON object starting with { and ending with }.',
      messages:   [
        { role: 'user',      content },
        { role: 'assistant', content: [{ type: 'text', text: '{' }] },
      ],
    }),
  });

  const data  = await response.json();
  const raw   = data.content?.[0]?.text || '""';
  // Claude ابتدأ بـ { لأننا prefilled — نضيف الـ { المفقود
  const text  = raw.startsWith('{') ? raw : '{' + raw;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Claude raw response:', raw.slice(0, 200));
    throw new Error('No JSON in response');
  }
  return JSON.parse(jsonMatch[0]);
}

// ────────────────────────────────────
// Fallback — يبني البحث من Vision مباشرة لو Claude فشل
// ────────────────────────────────────
function buildFallbackFromVision(visionData, message, wantCheaper) {
  if (!visionData) {
    return {
      productType: message || 'منتج',
      brand: null,
      color: '',
      searchQueries: [message || 'product'],
      reply: 'جاري البحث عن المنتج...',
      confidence: 60,
    };
  }

  const brand   = visionData.logos?.[0] || null;
  const guess   = visionData.bestGuess  || '';
  const objects = visionData.objects?.join(' ') || '';
  const labels  = visionData.labels?.slice(0, 5).join(' ') || '';
  const color   = visionData.colors?.[0] || '';

  const productMap = {
    'watch':  'ساعة', 'clock': 'ساعة', 'timepiece': 'ساعة',
    'bag':    'حقيبة', 'handbag': 'حقيبة', 'purse': 'حقيبة',
    'shoe':   'حذاء', 'sneaker': 'حذاء', 'boot': 'حذاء',
    'shirt':  'قميص', 'dress': 'فستان', 'jacket': 'جاكيت',
    'phone':  'جوال', 'laptop': 'لابتوب', 'headphone': 'سماعة',
  };

  let productType = 'منتج';
  const allText = (guess + ' ' + objects + ' ' + labels).toLowerCase();
  for (const [en, ar] of Object.entries(productMap)) {
    if (allText.includes(en)) { productType = ar; break; }
  }

  const cheaper = wantCheaper ? 'budget affordable' : '';
  const q1 = [brand, guess, color].filter(Boolean).join(' ').trim() || message || 'product';
  const q2 = [guess, color].filter(Boolean).join(' ').trim() || q1;
  const q3 = cheaper ? `${q1} ${cheaper}` : `${guess} buy online`;
  const q4 = [brand, productType === 'ساعة' ? 'watch' : productType === 'حقيبة' ? 'bag' : guess].filter(Boolean).join(' ');
  const q5 = message || brand || guess || 'product';

  const queries = [q1, q2, q3, q4, q5].filter(q => q && q.trim().length > 1);

  return {
    productType,
    brand,
    color,
    details: objects,
    searchQueries: queries.length > 0 ? queries : [message || brand || 'product'],
    reply: `وجدت ${productType}${brand ? ' من ' + brand : ''} — جاري البحث عن أفضل الأسعار`,
    confidence: 82,
  };
}

module.exports = { analyzeWithGoogleVision, analyzeWithClaude, buildFallbackFromVision, parseImageInput };
