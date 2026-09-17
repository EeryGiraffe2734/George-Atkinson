// POST /api/generate
// Body: { facts: string, sample: string }
// Returns: { text: string }
//
// Same idea as api/skills.js: the API key lives only here, on the server,
// read from an environment variable. The browser never sees it.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const facts = (req.body && req.body.facts) || "";
  const sample = (req.body && req.body.sample) || "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Server not configured. Add ANTHROPIC_API_KEY as an environment variable in your hosting dashboard."
    });
  }

  const sys = `You write first CVs for people aged roughly 16-19 in the UK applying for their first paid job, who usually have little or no formal work history.

Rules:
- UK format, UK spelling.
- Never invent anything. If a section has no material, leave the section out entirely. No made-up jobs, dates, employers or achievements.
- Some answers describe what the person would actually do in a short everyday situation (a group project, a frustrated customer, a task with no instructions, spotting someone else's mistake), rather than a direct self-description. Use these as evidence of character, don't quote the scenario or the choice back verbatim, weave the trait they reveal naturally into the Personal Statement instead.
- Write a Personal Statement of 3-4 sentences, grounded in the traits revealed by those situational answers plus anything else they've said about themselves. It should read like a natural paragraph, not a list of adjectives.
- Turn clubs, volunteering and responsibilities into honest transferable-skill lines. Do not oversell or inflate.
- Sections, in order, skipping any that are empty: name with contact placeholders, Personal Statement, Education, Experience, Volunteering, Skills, Interests and Achievements, Availability.
- Plain text only. No markdown, no asterisks, no hashes. Section headings in title case on their own line, blank line between sections.
- Roughly one page.
${sample.trim() ? `- A writing sample is included below purely as a STYLE reference. Match its sentence length, rhythm and vocabulary level in the Personal Statement so it sounds like this person wrote it. Never copy its sentences and never treat its content as CV facts.` : ""}`;

  const msg = sample.trim()
    ? `My answers:\n\n${facts}\n\n--- WRITING SAMPLE (style only, not CV content) ---\n${sample}`
    : `My answers:\n\n${facts}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1400,
        system: sys,
        messages: [{ role: "user", content: msg }]
      })
    });

    if (!r.ok) {
      const errBody = await r.text();
      console.error("[api/generate] Anthropic returned", r.status, errBody);
      return res.status(502).json({ error: `Generation failed, try again.`, _debug: `Anthropic ${r.status}: ${errBody.slice(0, 300)}` });
    }

    const d = await r.json();
    const text = (d.content || []).map(b => (b.type === "text" ? b.text : "")).join("\n").trim();

    if (!text) throw new Error("empty response from Anthropic");
    return res.status(200).json({ text });
  } catch (e) {
    console.error("[api/generate] unexpected error", e);
    return res.status(502).json({ error: "Generation failed, try again.", _debug: `unexpected: ${String(e && e.message || e)}` });
  }
}
