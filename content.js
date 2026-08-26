// Manually-curated per-token content — NOT pulled from GeckoTerminal, STON.fi,
// or any other API. This is the only place that data comes from, so nothing
// here shows up unless someone adds it by hand.
//
// To feature a token, add an entry keyed by its exact contract address (the
// same string shown by the copy-address chip on its page — tap it there to
// grab the exact value). Every field is optional; a token with no entry at
// all just renders the plain default page.
//
// Fields:
//   hero          Full-page background image behind the whole screen (path
//                 or URL) — fixed in place while the page scrolls, fading
//                 into the app's normal dark background about 2/3 of the
//                 way down so the stat/trust/buy cards stay legible.
//                 Portrait images (~700x1400+) work best since they need
//                 to fill the whole scrollable screen height, not just a
//                 banner strip. Only ever shown for tokens someone has
//                 actually designed one for — there is no auto-generated/
//                 stretched-logo fallback on purpose.
//   tagline       Short line shown under the token name when a hero is set.
//   description   Replaces the auto-pulled GeckoTerminal description in the
//                 About card. Unlike the auto one, this isn't truncated —
//                 write as much as you want.
//   theses        Array of long-form write-ups being published on the
//                 project's/author's behalf (e.g. copied from an X post),
//                 shown in their own "Theses" section. Each entry:
//                   author     display name or @handle
//                   avatarUrl  optional profile picture
//                   title      optional short headline for the write-up
//                   body       the full text (plain text — line breaks are
//                              preserved, no markdown/HTML)
//                   sourceUrl  optional link to the original post
//                   date       optional plain string, e.g. "Aug 2026"
//
// Example (copy this shape, then delete the example key):
//
// const TOKEN_CONTENT = {
//   "EQSomeRealTokenContractAddress...": {
//     hero: "content/heroes/example.jpg",
//     tagline: "The first coin to actually ship a product.",
//     description: "A longer, hand-written project description that " +
//       "replaces the short auto-pulled one — background, team, plans, " +
//       "whatever's worth telling people before they buy.",
//     theses: [
//       {
//         author: "@someone",
//         avatarUrl: "content/avatars/someone.jpg",
//         title: "Why I'm long this",
//         body: "Full write-up text here.\n\nSupports multiple paragraphs.",
//         sourceUrl: "https://x.com/someone/status/1234567890",
//         date: "Aug 2026",
//       },
//     ],
//   },
// };

const TOKEN_CONTENT = {};
