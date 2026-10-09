import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

/** Summarise a user's note: the note's text goes to the model provider. */
export async function summarise(note: string): Promise<string> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    messages: [{ role: "user", content: `Summarise in two lines:\n\n${note}` }],
  });
  const first = msg.content[0];
  return first && first.type === "text" ? first.text : "";
}
