import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildTriagePrompt, type TriageInput } from "./prompt.js";

const RankSchema = z.enum(["critical", "probably_relevant", "probably_not", "noise"]);

const ResponseSchema = z.object({
  rankings: z.array(
    z.object({
      finding_id: z.number().int(),
      rank: RankSchema,
      reason: z.string(),
    }),
  ),
});

export type Rank = z.infer<typeof RankSchema>;

export interface TriageResult {
  rank: Rank;
  reason: string;
}

interface Options {
  sdk: Pick<Anthropic, "messages">;
  findings: TriageInput[];
  model?: string;
}

export async function triageFindings({
  sdk,
  findings,
  model = "claude-haiku-4-5-20251001",
}: Options): Promise<Map<number, TriageResult>> {
  const out = new Map<number, TriageResult>();
  if (findings.length === 0) return out;

  const prompt = buildTriagePrompt(findings);
  const resp = await sdk.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text : "";
  let parsed: z.infer<typeof ResponseSchema>;
  try {
    const cleaned = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const json = JSON.parse(cleaned);
    parsed = ResponseSchema.parse(json);
  } catch {
    return out;
  }

  for (const r of parsed.rankings) {
    out.set(r.finding_id, { rank: r.rank, reason: r.reason });
  }
  return out;
}
