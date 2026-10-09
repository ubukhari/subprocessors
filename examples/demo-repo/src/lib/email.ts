// Transactional email through Resend's HTTP API, without its SDK.
export async function sendDigest(to: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: "Notes <digest@notes.example>", to, subject: "Your week", html }),
  });
  if (!res.ok) throw new Error(`email failed: ${res.status}`);
}
