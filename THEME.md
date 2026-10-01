# Pool Party theme

Flat, dark, one accent. No gradients (text, buttons, avatar rings, backgrounds), no glows, no coloured shadows.
Tokens live in `app/globals.css` (`@theme`, Tailwind v4), so each one is both a CSS variable (`var(--color-surface)`) and a utility (`bg-surface`, `text-mute`, `border-border`). `lib/theme.ts` mirrors them as hex for places without CSS (share card image, `themeColor`); keep both in sync.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0e0d12` | Page background (there is deliberately no `base` colour: it would collide with the `text-base` font size) |
| `surface` | `#16151c` | Cards, panels, header, modals (`.glass` = surface + border) |
| `surface-raised` | `#1f1e27` | Things on a card: tiles, inputs, menus, secondary buttons, chips |
| `border` | `#2c2b36` | Default 1px borders and dividers |
| `border-strong` | `#3d3c4a` | Hover/focus borders, avatar ring |
| `fg` | `#f5f4f8` | Primary text |
| `fg-secondary` | `#c9c7d3` | Body copy that should sit back a little |
| `mute` | `#9b99ab` | Labels, captions, metadata. 4.5:1+ on every surface, so it is the floor for 9-11px text. Don't add opacity to it. |
| `accent` | `#ff5c1a` | The only brand colour: primary actions and the active state (selected tab/pill, focus ring, "you" row). Not for badges or decoration. |
| `accent-hover` | `#ff7a3d` | Hover on accent |
| `accent-fg` | `#170b05` | Text on a solid accent background (white on this orange fails contrast) |
| `up` / `dn` | `#22c98a` / `#f2546b` | PnL positive/negative only (fees count as earnings, so fees are `up`). Not for win rate, badges or buttons. `dn` also marks errors and destructive actions (Sign out, Delete). |
| `gold` / `silver` / `bronze` | `#e8b84a` / `#b9c2cf` / `#cf8a57` | Leaderboard ranks 1-3 only. See "Medals" below. |

No secondary accent. X/Twitter, badges and chips are neutral (`surface-raised` + `border` + `mute`/`fg`).

## Buttons

- `btn-primary` - solid accent, `accent-fg` text. One per view where possible (Sign in, Post, Save, Join).
- `btn-secondary` - `surface-raised` + `border`, `fg` text (Follow in lists, Share, Cancel, Dip in).
- `btn-ghost` - no background until hover, `mute` text (menu items, minor actions).

Size them at the call site: `btn-primary h-9 px-4 text-[13px]`.

## Patterns

- Card: `glass rounded-[28px]` (or `bg-surface border border-border`).
- Tile/input inside a card: `bg-surface-raised border border-border`.
- Active pill/tab: `bg-surface-raised text-fg` with `text-accent` (or an accent underline) for the active marker.
- Chip/badge: `rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-mute`.
- Small text (9-11px): `text-mute` or brighter, never `text-white/40`, `opacity-50` etc.
- Shadows: none, or a neutral `shadow-black/40` for floating menus only.

## Medals (leaderboard top 3)

The one place colour is used for celebration. Ranks 1, 2 and 3 get `gold`, `silver` and `bronze`; everyone else stays neutral.

- Rank mark: `components/RankMedal.tsx` (inline SVG medal, solid metal, number in `text-bg`). Use it wherever a top-3 rank is shown, and nowhere else.
- Avatar ring: a solid 2px metal border around the avatar (`border-2 border-gold p-[3px] rounded-full`).
- Card: a light tint and border, e.g. `bg-gold/[.07] border-gold/50`. Keep the stat in its own semantic colour (`up`/`dn`/`fg`), not the metal.
- Badge tiers (`components/Badges.tsx`): tier 1 / 2 / 3 = `bronze` / `silver` / `gold` glyph on a `/[.08]` tint with a `/40` border. Podium's tier is the best finish (1st = gold). Untiered badges stay neutral.
- Flat only: no metallic gradients, sheen, glow or animation.
- Contrast on the dark theme: metal on `bg` is 10.5:1 (gold), 10.8:1 (silver) and 6.8:1 (bronze), and `bg` text on a solid metal gives the same ratios. A `/50` border is 3:1 or more against `surface`. `fg`, `mute` and `up` keep 14:1, 5.6:1 and 7.3:1 on a `/[.07]` tint.

## Deprecated (render flat now, migrate when touching the file)

`brand-grad`, `brand-text`, `ring-brand`, `podium-1`, `you-row` and the colour aliases `orange`, `orange-soft`, `purp`, `purp-soft`, `pink` (they map onto the tokens above).
