
import Stripe from "stripe";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function createSetupIntent(req, res) {
  const { email, firebaseDbUrl, uid } = req.body;

  try {
    const firebasePath = `${firebaseDbUrl}/users/${uid}/stripe/user.json`;
    // Try to get existing Stripe customerId from Firebase
    let stripeId;

    const userRes = await fetch(firebasePath);

    if (userRes.ok) {
      const userData = await userRes.json();

      if (userData && userData.stripeId) {
        stripeId = userData.stripeId;
      }
    }
    // If not found, create new Stripe customer

    if (!stripeId) {
      const customer = await stripe.customers.create({ email });
      stripeId = customer.id;

      // Save new customerId to Firebase
      await fetch(firebasePath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeId: stripeId,
        }),
      });
    }

    // Create SetupIntent for the customer, explicitly for off-session usage
    const si = await stripe.setupIntents.create({
      customer: stripeId,
      payment_method_types: ["card"],
      usage: "off_session", // Ensures card can be used for off-session payments
    });
    res.json({ clientSecret: si.client_secret, stripeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function storeCardMetadata(req, res) {
  const { uid, paymentMethodId, firebaseDbUrl } = req.body;

  try {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const { brand, last4, exp_month, exp_year } = pm.card;

    const firebasePath = `${firebaseDbUrl}/users/${uid}/stripe/cards/${paymentMethodId}.json`;

    await fetch(firebasePath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand,
        last4,
        expMonth: exp_month,
        expYear: exp_year,
      }),
    });

    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function payWithSavedCard(req, res) {
  const { customerId, paymentMethodId, amount } = req.body;
  console.g("🚀 ~ payWithSavedCard ~ req.body:", req.body);

  try {
    // Attach payment method to customer only if not already attached to any customer
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!pm.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    } else if (pm.customer !== customerId) {
      // Payment method is attached to a different customer, throw error
      throw new Error("Payment method is attached to a different customer.");
    }
    // Optionally, set as default payment method for invoices (not required for one-off payments)
    // await stripe.customers.update(customerId, {
    //   invoice_settings: { default_payment_method: paymentMethodId },
    // });
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: "eur",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
    });
    res.json({ status: pi.status });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: err.message, details: err });
  }
}

export async function deleteCard(req, res) {
  const { uid, paymentMethodId, firebaseDbUrl } = req.body;
  try {
    // Detach card from Stripe customer
    await stripe.paymentMethods.detach(paymentMethodId);

    // Delete from Firebase
    const firebasePath = `${firebaseDbUrl}/users/${uid}/stripe/cards/${paymentMethodId}.json`;
    await fetch(firebasePath, {
      method: "DELETE",
    });

    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
