// POST /api/generate
// Body: { facts: string, sample?: string, jobAd?: string }
// Returns: { cv: { headline, statement, education[], experience[], ... } }
//
// The API key lives only here, on the server, read from an environment
// variable. The browser never sees it.
//
// This returns STRUCTURED data, not a block of text, so the page can lay
// it out in any template and print it properly. Contact details are
// deliberately NOT generated here: the page renders those straight from
// what the user typed, so they can never be mangled or invented.

function baseSystem(hasSample, hasJobAd) {
  return `You write first CVs for people aged roughly 16-19 in the UK applying for their first paid job, who usually have little or no formal work history.

Your entire reply is ONE JSON object and nothing else. Start your reply with { and end it with }. No preamble, no explanation, no code fences.

Shape, exactly these keys:
{
  "headline": "short role label, 2-4 words, based on the job they're going for",
  "statement": "3-4 sentences, one natural paragraph",
  "education": [ { "title": "", "org": "", "dates": "", "bullets": [] } ],
  "experience": [ { "title": "", "org": "", "dates": "", "bullets": [] } ],
  "volunteering": [ { "title": "", "org": "", "dates": "", "bullets": [] } ],
  "skills": [],
  "achievements": [],
  "interests": [],
  "languages": [],
  "certificates": [],
  "availability": ""
}

Rules:
- UK format, UK spelling.
- NEVER invent anything. No made-up jobs, employers, dates, grades or achievements. If you have no material for a section, return an empty array, or "" for a string. Empty sections get dropped by the page, which is correct and expected.
- Do NOT output the person's name, email, phone or town anywhere. Those are added separately by the page.
- "org" and "dates" may be "" when the person didn't say. Never guess a date.
- "bullets" holds 1-3 short honest lines, only where there is real material. Otherwise an empty array.
- Some answers describe what the person would actually do in a short everyday situation: a group project, a frustrated customer, a task with no instructions, spotting someone else's mistake. Treat these as evidence of character. Never quote the scenario or their choice back at them. Weave the trait it reveals into the statement naturally.
- The statement must read like a paragraph a real person wrote about themselves, not a list of adjectives.
- Turn clubs, volunteering and responsibilities into honest transferable-skill lines. Do not oversell or inflate.
- "skills" should be 8-14 short phrases, strongest and most relevant first. Every single one must be traceable to something they actually told you. If you cannot point to the answer it came from, leave it out.
- Keep the whole thing to roughly one A4 page.${
    hasSample
      ? `
- A writing sample is included below purely as a STYLE reference. Match its sentence length, rhythm and vocabulary level in the statement so it sounds like this person wrote it. Never copy its sentences, and never treat its content as CV facts.`
      : ""
  }${
    hasJobAd
      ? `
- A job advert is included below. Tailor the CV to it: bring the things they DO have that the advert cares about to the front, angle the statement at that specific role and employer, and set "headline" to match the advertised role.
- Tailoring means reordering, emphasising and rewording what they gave you. Nothing else.
- Do NOT mine the advert's requirements list for content. This is the most common way these go wrong. If the advert asks for something they never mentioned, it goes nowhere in the CV: not in "skills", not in a bullet, not hinted at in the statement. For example, if the advert wants "comfortable handling cash" and they never mentioned cash, tills, money or payments, that phrase and anything like it must not appear.
- Before you output "skills", check each phrase against their actual answers. Anything you cannot trace back to something they said, delete. A shorter honest list is the correct result. Never pad the CV to close a gap between them and the advert.
- The statement MAY say they are keen to learn something the role involves, as long as it is clearly framed as wanting to learn it and not as experience they already have.`
      : ""
  }`;
}

// Models sometimes wrap JSON in prose or fences despite instructions.
// Pull the outermost object out and parse that. Exported so it can be
// tested directly; Vercel only ever calls the default export below.
export function extractJSON(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) throw new Error("no JSON object in response");
  return JSON.parse(s.slice(a, b + 1));
}

const asArray = v => (Array.isArray(v) ? v : []);
const asString = v => (typeof v === "string" ? v.trim() : "");

function cleanEntries(v) {
  return asArray(v)
    .map(e => ({
      title: asString(e && e.title),
      org: asString(e && e.org),
      dates: asString(e && e.dates),
      bullets: asArray(e && e.bullets).map(asString).filter(Boolean)
    }))
    .filter(e => e.title || e.org || e.bullets.length);
}

function cleanList(v) {
  return asArray(v).map(asString).filter(Boolean);
}

// Guarantees every key exists and is the right type, so the page never
// has to defend against a missing field.
export function normalise(o) {
  return {
    headline: asString(o.headline),
    statement: asString(o.statement),
    education: cleanEntries(o.education),
    experience: cleanEntries(o.experience),
    volunteering: cleanEntries(o.volunteering),
    skills: cleanList(o.skills),
    achievements: cleanList(o.achievements),
    interests: cleanList(o.interests),
    languages: cleanList(o.languages),
    certificates: cleanList(o.certificates),
    availability: asString(o.availability)
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const facts = (req.body && req.body.facts) || "";
  const sample = ((req.body && req.body.sample) || "").trim();
  const jobAd = ((req.body && req.body.jobAd) || "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[api/generate] ANTHROPIC_API_KEY is not set");
    return res.status(500).json({
      error: "Server not configured. Add ANTHROPIC_API_KEY as an environment variable in your hosting dashboard."
    });
  }

  let msg = `My answers:\n\n${facts}`;
  if (jobAd) {
    msg += `\n\n--- JOB ADVERT I'M APPLYING TO (tailor to this, invent nothing) ---\n${jobAd.slice(0, 6000)}`;
  }
  if (sample) {
    msg += `\n\n--- WRITING SAMPLE (style only, not CV content) ---\n${sample.slice(0, 4000)}`;
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
        max_tokens: 2000,
        system: baseSystem(!!sample, !!jobAd),
        messages: [{ role: "user", content: msg }]
      })
    });

    if (!r.ok) {
      const errBody = await r.text();
      console.error("[api/generate] Anthropic returned", r.status, errBody);
      return res.status(502).json({
        error: "Generation failed, try again.",
        _debug: `Anthropic ${r.status}: ${errBody.slice(0, 300)}`
      });
    }

    const d = await r.json();
    const text = (d.content || []).map(b => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) throw new Error("empty response from Anthropic");

    const cv = normalise(extractJSON(text));

    if (!cv.statement && !cv.education.length && !cv.skills.length) {
      throw new Error("model returned an empty CV");
    }

    return res.status(200).json({ cv });
  } catch (e) {
    console.error("[api/generate] unexpected error", e);
    return res.status(502).json({
      error: "Generation failed, try again.",
      _debug: `unexpected: ${String((e && e.message) || e)}`
    });
  }
}
