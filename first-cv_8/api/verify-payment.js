// POST /api/verify-payment
// Body: { session_id: string }
// Returns: { paid: boolean }
//
// Why this exists: the old version unlocked a paid CV whenever the URL
// had "?paid=1" on it. Anyone could type that into the address bar and
// get the paid feature for nothing, and every real customer saw it sitting
// in their address bar after paying.
//
// Now Stripe sends back a Checkout Session ID, and this file asks Stripe
// directly whether that session was actually paid. A made-up id fails,
// because only Stripe can produce a real one.
//
// Needs STRIPE_SECRET_KEY set as an environment variable in Vercel.
// That key is secret. It must never appear in index.html.

// Real session ids look like cs_test_a1B2... or cs_live_a1B2...
const SESSION_RE = /^cs_[A-Za-z0-9_]{10,}$/;

// A session older than this won't unlock anything, so a link that gets
// shared around or reused later stops working.
const MAX_AGE_MINUTES = 180;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sid = ((req.body && req.body.session_id) || "").trim();
  if (!SESSION_RE.test(sid)) {
    return res.status(400).json({ paid: false, _debug: "malformed session id" });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[api/verify-payment] STRIPE_SECRET_KEY is not set");
    return res.status(500).json({
      paid: false,
      error: "Payments aren't fully set up yet. If you've just paid, contact us and we'll sort it.",
      _debug: "no STRIPE_SECRET_KEY set"
    });
  }

  try {
    const r = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );

    if (!r.ok) {
      const errBody = await r.text();
      console.error("[api/verify-payment] Stripe returned", r.status, errBody);
      return res.status(200).json({
        paid: false,
        _debug: `Stripe ${r.status}: ${errBody.slice(0, 200)}`
      });
    }

    const s = await r.json();
    const isPaid = s.payment_status === "paid";
    const ageMinutes = s.created ? (Date.now() / 1000 - s.created) / 60 : Infinity;

    if (isPaid && ageMinutes <= MAX_AGE_MINUTES) {
      return res.status(200).json({ paid: true });
    }

    return res.status(200).json({
      paid: false,
      _debug: isPaid
        ? `session too old (${Math.round(ageMinutes)} min)`
        : `payment_status=${s.payment_status}`
    });
  } catch (e) {
    console.error("[api/verify-payment] unexpected error", e);
    return res.status(200).json({
      paid: false,
      _debug: `unexpected: ${String((e && e.message) || e)}`
    });
  }
}
