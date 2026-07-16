// ===================================
// modules/shopping/supabaseSearch.js
// بحث دلالي في منتجات Supabase عبر pgvector + match_products
// ===================================

const fetch = require('node-fetch');

async function searchSupabase(queryText, productType = null, wantCheaper = false) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    const OPENAI_KEY   = process.env.OPENAI_API_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) return null;

    const embRes = await fetch('https://api.openai.com/v1/embeddings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: queryText.slice(0, 500) }),
    });
    const embData   = await embRes.json();
    const embedding = embData.data?.[0]?.embedding;
    if (!embedding) return null;

    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_products`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey':        SUPABASE_KEY,
      },
      body: JSON.stringify({ query_embedding: embedding, match_threshold: 0.5, match_count: 10 }),
    });

    const results = await rpcRes.json();
    if (!Array.isArray(results) || !results.length) return null;
    console.log(`[Supabase] ${results.length} نتيجة`);

    let filtered = results;
    if (productType) {
      const TYPE_KEYWORDS = {
        'ساعة':   ['watch','clock','smartwatch'],
        'حقيبة':  ['bag','handbag','purse','tote','backpack'],
        'حذاء':   ['shoe','sneaker','boot','sandal'],
        'قميص':   ['shirt','blouse','top','tee'],
        'فستان':  ['dress','gown'],
        'جاكيت':  ['jacket','coat','hoodie'],
        'جوال':   ['phone','mobile','smartphone'],
        'لابتوب': ['laptop','notebook'],
        'سماعة':  ['headphone','earphone','earbuds'],
      };
      const kws = TYPE_KEYWORDS[productType];
      if (kws) {
        const f = results.filter(p => kws.some(kw => (p.name||'').toLowerCase().includes(kw)));
        if (f.length > 0) filtered = f;
      }
    }

    if (wantCheaper) filtered = filtered.sort((a,b) => (a.price||0) - (b.price||0));

    return filtered.slice(0, 3).map((p, i) => ({
      id:       `sb-${p.external_id || i}`,
      name:     (p.name||'').slice(0, 70),
      price:    p.price ? `${p.price} ${p.currency||'SAR'}` : 'تحقق من السعر',
      priceRaw: p.price || 0,
      store:    'AliExpress',
      storeKey: 'aliexpress',
      image:    p.image_url || '',
      url:      p.product_url || 'https://aliexpress.com',
      badge:    i === 0 ? 'الأوفر' : i === 1 ? 'الأكثر مبيعاً' : 'صفقة مميزة',
      rating:   p.rating ? String(p.rating) : null,
      source:   'supabase',
    }));

  } catch (err) {
    console.error('[Supabase search]:', err.message);
    return null;
  }
}

module.exports = { searchSupabase };
