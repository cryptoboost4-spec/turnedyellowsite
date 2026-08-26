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
//                 or URL) — fixed in place while the page scrolls. Drawn at
//                 its natural width-scaled aspect ratio (not cropped to
//                 cover), so design it knowing the token name/icon box is
//                 skipped entirely for hero tokens — the top of the image
//                 IS the heading, so put the token's name/branding there
//                 yourself. Portrait images (~700x1400+) work well since
//                 they need to fill the whole screen height, not just a
//                 banner strip.
//   bgColor       Solid color (hex) matching the flat color your image
//                 fades/settles to at the bottom — pick it to exactly match
//                 the image's own lowest pixels. That color becomes the
//                 background for the rest of the page below the image, so
//                 there's no visible seam and no fade back to the app's
//                 normal dark theme — this token's whole page is themed to
//                 its art. Only used when `hero` is set.
//   heroSpace     Height in px of the image's own "header zone" (the part
//                 with the logo/tagline/artwork) — the page's cards start
//                 below this instead of covering it. Defaults to 380 if
//                 omitted; tune it to match where your image's header
//                 content actually ends. Only used when `hero` is set.
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
//     bgColor: "#7ec8f2",
//     heroSpace: 380,
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

const TOKEN_CONTENT = {
  "EQBaCgUwOoc6gHCNln_oJzb0mVs79YG7wYoavh-o1ItaneLA": {
    hero: "content/heroes/utya.jpg",
    bgColor: "#b8e6f6",
    heroSpace: 380,
  },
};
