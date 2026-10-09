import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function checkout(customerEmail: string, price: string) {
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: customerEmail,
    line_items: [{ price, quantity: 1 }],
    success_url: "https://notes.example/billing?ok=1",
  });
}
