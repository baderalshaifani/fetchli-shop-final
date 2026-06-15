// ===================================
// modules/travel/index.js — راوتر السفر
// ===================================

const express = require('express');
const { searchFlights } = require('./flights');
const { searchHotels }  = require('./hotels');
const { searchCars }    = require('./cars');

const router = express.Router();

// ────────────────────────────────────
// POST /api/travel/search
// body: { analysis: { type, origin, destination, checkIn, checkOut, adults, currency, reply }, market }
// رد: { cards: [{ id, name, price, platform, image, url, badge, rating, details }] }
// ────────────────────────────────────
router.post('/api/travel/search', async (req, res) => {
  try {
    const { analysis = {}, market = 'SA' } = req.body;
    const type = analysis.type || 'mixed';

    let cards = [];

    if (type === 'flight' || type === 'mixed') {
      const flightCards = await searchFlights(analysis, market);
      cards.push(...flightCards);
    }

    // الفنادق تظهر مع الطيران أيضاً (نفس الوجهة) — مفيدة تجارياً وتجربةً
    if (type === 'hotel' || type === 'mixed' || type === 'flight') {
      const hotelCards = searchHotels(analysis, market);
      cards.push(...hotelCards);
    }

    if (type === 'car') {
      const carCards = searchCars(analysis, market);
      cards.push(...carCards);
    }

    console.log(`[Travel] type=${type} dest="${analysis.destination}" → ${cards.length} cards`);
    res.json({ cards });

  } catch (err) {
    console.error('[Travel] search error:', err.message);
    res.json({ cards: [], error: err.message });
  }
});

module.exports = router;
