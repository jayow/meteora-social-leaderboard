# Pool Party theme

Flat, dark, one accent. No gradients (text, buttons, avatar rings, backgrounds), no glows, no coloured shadows.
Tokens live in `app/globals.css` (`@theme`, Tailwind v4), so each one is both a CSS variable (`var(--color-surface)`) and a utility (`bg-surface`, `text-mute`, `border-border`). `lib/theme.ts` mirrors them as hex for places without CSS (share card image, `themeColor`); keep both in sync.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0e0d12` | Page background (there is deliberately no `base` colour: it would collide with the `text-base` font size) |
| `surface` | `#16151c` | Cards, panels, list rows, header, modals (`card` = surface + border + card radius) |
| `surface-raised` | `#1f1e27` | Things on a card: tiles, inputs, menus, secondary buttons, chips, skeletons |
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

## Type

One typeface: **Inter** (`--font-sans`; `font-numeric` and `font-mono` are aliases of it). Figures are tabular app-wide (`font-variant-numeric: tabular-nums` on `body`), so every number column lines up like the calendar. `.num` is kept for explicitness on number elements.

Fixed scale. Tailwind's default `text-*` sizes are cleared, so only these exist (no `text-[Npx]`):

| Class | Size / line | Use |
| --- | --- | --- |
| `text-xs` | 11 / 16 | Chips, tags, calendar cell figures, footnotes |
| `text-sm` | 12 / 16 | Metadata, stat labels, captions, counts |
| `text-base` | 13 / 20 | Body copy, controls, buttons, menu items (body default) |
| `text-md` | 15 / 22 | Names in rows, row figures, emphasis, long-form legal copy |
| `text-lg` | 18 / 24 | Section titles (`font-semibold`) |
| `text-xl` | 22 / 28 | Modal titles, profile name, podium figures |
| `text-2xl` | 28 / 34 | Page titles (`font-bold tracking-tight`) |
| `text-3xl` | 40 / 44 | Hero figures (profile PnL, #1 on the podium) |

Weights: 400 body, 500 labels/meta emphasis, 600 names/titles/buttons, 700 page titles and hero figures only.
Sentence case everywhere. No `uppercase` or tracked-out labels (acronyms like DLMM are written as they are).

## Shape and spacing

- Radii: `rounded-card` 20px (cards, modals), `rounded-tile` 12px (rows, tiles, inputs, menus, calendar cells), `rounded-tag` 6px (tags, small hit areas), `rounded-full` (buttons, pills, chips, avatars). Nothing else (flags keep their 2-3px).
- Spacing rhythm: 4px base. Card padding `p-5` (`sm:p-6` on hero cards), tile padding `px-4 py-3`, row padding `px-3 py-2.5 sm:px-4`, list gaps `space-y-2`, section gaps `mt-8`. Pages: `pt-6 pb-10`, `max-w-[1320px] px-4 lg:px-6` (Poolside 680, pool detail 900, forms 480-640).
- Borders: 1px `border`; `border-strong` on hover. Dividers are `border-t border-border` or `divide-y divide-border`.

## Utilities (app/globals.css)

| Class | What |
| --- | --- |
| `card` | Page-level panel: `surface` + `border` + `rounded-card`. Add padding at the call site. |
| `tile` | Something on a card: `surface-raised` + `border` + `rounded-tile`. |
| `field` | Text input / textarea / select: h-10, `surface-raised`, border, hover `border-strong`, accent focus ring. Use `h-9` in toolbars, `h-11` in forms, `h-auto py-2.5` for textareas. |
| `chip` | 20px neutral pill (bin step, "You", status). |
| `seg` + `seg-item` | Segmented toggle (nav, Members/Countries, range). Active item via `aria-pressed` / `aria-selected` / `aria-current`. |
| `tab` | Underline tab with an accent bar when `aria-selected` / `aria-pressed`. Sits on a `border-b` row. |
| `link` | Inline link in body copy: `fg`, semibold, quiet underline that brightens on hover. |
| `skeleton` | Loading block (`surface-raised`, gentle pulse, off under reduced motion). Give it the final element's size so nothing jumps. |

Components: `PageHeader` and `EmptyState` (`components/EmptyState.tsx`) for page titles and empty/error/signed-out states; `Tag`, `binLabel()` ("Bin 80"), `Pills`, `StatTile` (`components/ui.tsx`); `Modal` + `ModalClose` (`components/Modal.tsx`) for every modal.

## Buttons

- `btn-primary` - solid accent, `accent-fg` text. One per view where possible (Sign in, Post, Save, Join).
- `btn-secondary` - `surface-raised` + `border`, `fg` text (Follow, Share, Refresh, Dip in, Try again).
- `btn-ghost` - no background until hover, `mute` text (Show more, Not now, Skip, Cancel, Delete with `text-dn hover:text-dn`).

All three share `btn-base`: pill, 1px border, 13px semibold, 150ms transitions, disabled at 45% opacity. Three sizes only:

- md (default): `h-9 px-4` - no extra classes.
- sm: `h-8 px-3` - inside rows, cards and headers.
- lg: `h-11` (often `w-full`) - modal and form CTAs.

Don't override font size, radius or colours with `!` classes.

## Focus, hover, motion

- Focus: one global `:focus-visible` ring, 2px `accent`, 2px offset. Don't add `outline-none` (the calendar cells use an inset accent ring instead).
- Hover: rows and tiles lift their border to `border-strong`; text links go `mute` to `fg`; buttons as above. No scale/translate effects.
- Motion: 150ms colour transitions only; skeleton pulse respects `prefers-reduced-motion`.

## Patterns

- List row (leaderboard, pools, LPs, countries): `rounded-tile border border-border bg-surface px-3 py-2.5 sm:px-4 hover:border-border-strong`, whole row clickable via an overlay link.
- Section header: `text-lg font-semibold`, optional count in `num font-medium text-mute` after the title.
- Stat: label `text-sm text-mute` above value `text-md`-`text-lg font-semibold` (`StatTile`).
- Small text (11-12px): `text-mute` or brighter, never `text-white/40`, `opacity-50` etc.
- Icons: inline SVG at `h-4 w-4` (stroke 1.75), no emoji as icons.
- Shadows: none, or a neutral `shadow-black/40` for floating menus only.

## Medals (leaderboard top 3)

The one place colour is used for celebration. Ranks 1, 2 and 3 get `gold`, `silver` and `bronze`; everyone else stays neutral.

- Rank mark: `components/RankMedal.tsx` (inline SVG medal, solid metal, number in `text-bg`). Use it wherever a top-3 rank is shown, and nowhere else.
- Avatar ring: a solid 2px metal border around the avatar (`border-2 border-gold p-[3px] rounded-full`).
- Card: a light tint and border, e.g. `bg-gold/[.07] border-gold/50`. Keep the stat in its own semantic colour (`up`/`dn`/`fg`), not the metal.
- Badge tiers (`components/Badges.tsx`): tier 1 / 2 / 3 = `bronze` / `silver` / `gold` glyph on a `/[.08]` tint with a `/40` border. Podium's tier is the best finish (1st = gold). Untiered badges stay neutral.
- Flat only: no metallic gradients, sheen, glow or animation.
- Contrast on the dark theme: metal on `bg` is 10.5:1 (gold), 10.8:1 (silver) and 6.8:1 (bronze), and `bg` text on a solid metal gives the same ratios. A `/50` border is 3:1 or more against `surface`. `fg`, `mute` and `up` keep 14:1, 5.6:1 and 7.3:1 on a `/[.07]` tint.
