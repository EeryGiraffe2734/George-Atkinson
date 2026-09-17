# First CV — deploy notes

This is your CV builder, with one fix: the AI calls now go through a
small server-side file instead of straight from the browser. That's
not optional, it's the difference between this working at all and
never working, so here's why and what's left to do.

## What was broken

The original version called Anthropic's API directly from the
browser's JavaScript. Two problems with that:

1. It needs an API key to work, and there was nowhere safe to put
   one. Any key placed in a browser-side file is visible to anyone
   who views the page source, which means anyone could copy it and
   run up your bill.
2. Even with a key added, browsers aren't allowed to call
   Anthropic's API directly like that (it blocks that kind of
   cross-site request), so it would have failed regardless.

## What's fixed

Two new files, `api/skills.js` and `api/generate.js`, do the actual
talking to Anthropic. They run on the server, not in the visitor's
browser, so the API key stays hidden. The page (`index.html`) now
calls those two files instead of Anthropic directly.

## What you still need to do (in this order)

1. **Get an Anthropic API key.** Go to console.anthropic.com, create
   an account if you don't have one, add a small amount of billing
   credit (a few pounds is plenty to start), and generate an API
   key from the API Keys page.

2. **Deploy this folder to Vercel** (free, and the easiest option
   for this setup). Go to vercel.com, sign up, and either:
   - drag this whole `first-cv` folder onto the Vercel dashboard, or
   - push it to a GitHub repo and import that repo in Vercel.

3. **Add your API key as an environment variable.** In the Vercel
   project settings, under Environment Variables, add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: the key you generated in step 1

   Redeploy after adding it (Vercel usually prompts you to).

4. **Test it end to end** before showing anyone. Go through the
   whole question flow on your live Vercel URL and check a CV
   actually comes out at the end. If it doesn't, check the Vercel
   project's "Functions" logs, they'll show you the actual error.

5. **Stripe (only once you're ready to charge).** Create a £2
   Payment Link in your Stripe dashboard, set its post-payment
   redirect URL to your live site's URL with `?paid=1` on the end
   (e.g. `https://yoursite.vercel.app/?paid=1`), then paste that
   Payment Link into `CONFIG.stripeLink` near the top of the
   `<script>` in `index.html`. Until you do this, the pay button
   just explains what's missing instead of taking anyone's money,
   so it's safe to launch without it and add it later.

## One thing worth knowing about the current setup

The "how many extra CVs you've paid for" count is stored in the
visitor's own browser (localStorage), not checked against anything
on a server. That's fine for testing and even fine for a small
early launch, but it means someone could clear their browser data
and get another free "paid" slot. Not worth fixing yet, worth
knowing before you scale up.
