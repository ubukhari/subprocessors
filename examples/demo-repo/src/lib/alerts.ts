/** Post an operational alert; the message may name the user it is about. */
export async function alert(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, { method: "POST", body: JSON.stringify({ text }) });
}
