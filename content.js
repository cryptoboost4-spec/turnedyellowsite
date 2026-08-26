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
//   hero          Header image at the top of the page (path or URL) — a
//                 real image, not a CSS background, so it scrolls normally
//                 and its own natural height decides how tall it is (no
//                 space-reservation field to tune). Renders full-bleed
//                 (edge to edge). Skips the token name/icon box entirely —
//                 the top of the image IS the heading, so put the token's
//                 name/branding there yourself.
//   bgColor       Solid color (hex) matching the flat color your image
//                 fades/settles to at the bottom — pick it to exactly match
//                 the image's own lowest pixels. Set as the whole screen's
//                 background-color, so there's no visible seam where the
//                 image ends and it stays that color (not the app's normal
//                 dark theme) for however far the page scrolls — this
//                 token's whole page is themed to its art. Only used when
//                 `hero` is set.
//   website       Overrides/fills in the auto-pulled site link (full URL).
//   telegram      Overrides/fills in the auto-pulled Telegram (handle only,
//                 no @ or t.me/ — e.g. "utyacoin").
//   twitter       Overrides/fills in the auto-pulled X/Twitter (handle
//                 only, no @). GeckoTerminal frequently has none of these
//                 three for TON tokens, same gap as the trust fields — set
//                 them here to get the link pills showing at all.
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
//     website: "https://example.com",
//     telegram: "examplecoin",
//     twitter: "examplecoin",
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
  },
};
