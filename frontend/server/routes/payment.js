const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { User } = require('../models');
module.exports = function createPaymentRoutes(stripe, priceId) {
  const router = express.Router();

  // -------------------------------------------------------------------------
  // POST /create-checkout-session
  // Kicks off the Stripe Checkout flow for upgrading to a paid plan.
  // -------------------------------------------------------------------------
  router.post('/create-checkout-session', requireAuth, async (req, res) => {
    try {
      if (req.log) req.log.info('Checkout session creation requested');

      // 1️⃣ Build success/cancel URLs for after the user completes checkout.
      const successUrl = `${req.protocol}://${req.get('host')}/payment-success`;
      const cancelUrl = `${req.protocol}://${req.get('host')}/`;
      if (req.log) req.log.debug({ successUrl, cancelUrl }, 'Checkout URLs built');

      // 2️⃣ Create the Stripe Checkout session referencing the logged in user.
      if (req.log) req.log.info({ userId: req.session.userId }, 'Creating Stripe checkout session');
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        client_reference_id: req.session.userId || undefined,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (req.log) req.log.info({ sessionId: session.id }, 'Stripe checkout session created');

      // 3️⃣ Store the session id so the webhook can verify completion later.
      await User.findByIdAndUpdate(req.session.userId, {
        pendingCheckoutSessionId: session.id,
      });
      if (req.log) req.log.debug({ sessionId: session.id, userId: req.session.userId }, 'Stored pending checkout session');

      // 4️⃣ Return the Stripe hosted payment page URL to redirect the browser.
      res.json({ url: session.url, id: session.id });
    } catch (err) {
      if (req.log) req.log.error({ err }, 'Stripe checkout error');
      else console.error('Stripe checkout error:', err);
      res.status(500).json({ error: 'Unable to create checkout session' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /cancel-subscription
  // Marks the user's subscription as cancelled at period end.
  // -------------------------------------------------------------------------
  router.post('/cancel-subscription', requireAuth, async (req, res) => {
    try {
      if (req.log) req.log.info('Subscription cancellation requested');
      const userId = req.session.userId;
      if (!userId) throw new Error('No session');
      await User.findByIdAndUpdate(userId, {
        subscriptionCanceledAt: new Date(),
      });
      if (req.log) req.log.info({ userId }, 'Subscription cancellation recorded');
      res.json({ success: true });
    } catch (err) {
      if (req.log) req.log.error({ err }, 'Cancel subscription error');
      else console.error('Cancel subscription error:', err);
      res.status(500).json({ error: 'Unable to cancel subscription' });
    }
  });

  return router;
};
