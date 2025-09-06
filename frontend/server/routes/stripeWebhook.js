const express = require('express');
const { User } = require('../models');

module.exports = function createStripeWebhook(stripe, webhookSecret) {
  const router = express.Router();

  // -------------------------------------------------------------------------
  // POST /stripe-webhook
  // Processes Stripe webhooks to update subscription status after checkout.
  // -------------------------------------------------------------------------
  router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    // 1️⃣ Verify the webhook signature to ensure it truly came from Stripe.
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Stripe webhook signature verification failed', err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 2️⃣ Handle successful checkout sessions to activate the user's premium plan.
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      if (userId) {
        try {
          const user = await User.findById(userId);
          if (user && user.pendingCheckoutSessionId === session.id) {
            const now = new Date();
            const base =
              user.subscriptionValidUntil && user.subscriptionValidUntil > now
                ? user.subscriptionValidUntil
                : now;
            const next = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
            await User.findByIdAndUpdate(
              userId,
              {
                subscriptionStatus: 'premium',
                subscriptionValidUntil: next,
                subscriptionCanceledAt: null,
                $unset: { pendingCheckoutSessionId: 1 },
              },
              { new: true },
            );
          } else {
            console.warn(
              `Checkout session mismatch for user ${userId}. Ignoring webhook.`,
            );
          }
        } catch (err) {
          console.error('Unable to update subscription status via webhook', err);
        }
      }
    }

    // 3️⃣ Tell Stripe we received the webhook so it doesn't retry.
    res.json({ received: true });
  });

  return router;
};
