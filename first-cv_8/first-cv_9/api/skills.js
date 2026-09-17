// POST /api/skills
// Body: { target: string }
// Returns: { skills: string[] }
//
// This is the one file that's allowed to know your Anthropic API key.
// It reads it from an environment variable (set in your Vercel project
// settings, never written in this file), calls Anthropic on the server,
// and only ever sends a plain list of skill strings back to the browser.

const GENERIC_SKILLS = [
  "Reliable and punctual", "Good with people", "Calm under pressure", "Team player",
  "Quick learner", "Organised", "Good communicator", "Hard-working", "Adaptable",
  "Problem solver", "Good attention to detail", "Comfortable multitasking",
  "Customer service mindset", "Takes initiative", "Works well independently",
  "Honest and trustworthy", "Good time management", "Positive attitude"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const target = (req.body && req.body.target) || "";
  const t = target.trim();
  const generic = !t || /^(any|anything|any job|not sure|dont know|don't know|unsure)$/i.test(t);

  if (generic) {
    return res.status(200).json({ skills: GENERIC_SKILLS });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Server isn't configured yet — fail soft rather than breaking the flow.
    console.error("[api/skills] ANTHROPIC_API_KEY is not set");
    return res.status(200).json({ skills: GENERIC_SKILLS, _debug: "no ANTHROPIC_API_KEY set" });
  }

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
        max_tokens: 500,
        system: `Output ONLY a JSON array of strings. No preamble, no code fences.
Give 14-16 short CV skill phrases (2-5 words, UK spelling) for a first-time job applicant with little or no work history, aimed at this job: "${t}".
Mix skills that specifically matter for that job with strong general employability ones. Plain CV wording, e.g. "Good with people", "Comfortable handling cash".`,
        messages: [{ role: "user", content: `Job: ${t}` }]
      })
    });

    if (!r.ok) {
      const errBody = await r.text();
      console.error("[api/skills] Anthropic returned", r.status, errBody);
      return res.status(200).json({ skills: GENERIC_SKILLS, _debug: `Anthropic ${r.status}: ${errBody.slice(0, 300)}` });
    }

    const d = await r.json();
    const txt = (d.content || []).map(b => (b.type === "text" ? b.text : "")).join("").trim()
      .replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const arr = JSON.parse(txt);
    const skills = Array.isArray(arr) && arr.length
      ? arr.filter(s => typeof s === "string" && s.trim())
      : GENERIC_SKILLS;

    return res.status(200).json({ skills });
  } catch (e) {
    console.error("[api/skills] unexpected error", e);
    return res.status(200).json({ skills: GENERIC_SKILLS, _debug: `unexpected: ${String(e && e.message || e)}` });
  }
}
