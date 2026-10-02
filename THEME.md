# Pool Party theme

Flat, dark, one accent. No gradients (text, buttons, avatar rings, backgrounds), no glows, no coloured shadows.

**One surface, few boxes.** Don't use cards, panels or boxed surfaces unless a region is a repeated object or must be acted on independently. Group related content with type, spacing and alignment instead: section headings, whitespace (`space-y-10`/`12` between sections) and, rarely, a hairline. A page reads as one surface, not a grid of boxes; if a box doesn't separate a distinct item, remove it. Boxes that stay: modals, floating menus and previews, the phone tab bar, alert banners, one-off prompts you act on (Poolside sharing ask), form fields, and calendar day cells. Lists are rows separated by spacing, not tiles and not hairlines (the leaderboard keeps its dividers); clickable rows get a rounded `hover:bg-accent-tint` fill. Use hairlines sparingly.
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
| `accent-tint` | `#2b1713` | Hover fill on list rows (pools, open positions, LPs): 12% accent over `bg`, solid so avatar rings can match it |
| `accent-fg` | `#170b05` | Text on a solid accent background (white on this orange fails contrast) |
| `up` / `dn` | `#22c98a` / `#f2546b` | PnL positive/negative only (fees count as earnings, so fees are `up`). Not for win rate, badges or buttons. `dn` also marks errors and destructive actions (Sign out, Delete). |
| `gold` / `silver` / `bronze` | `#e8b84a` / `#b9c2cf` / `#cf8a57` | Leaderboard ranks 1-3 only. See "Medals" below. |

No secondary accent. X/Twitter, badges and chips are neutral (`surface-raised` + `border` + `mute`/`fg`).

## Type

One typeface: **Inter** (`--font-sans`; `font-numeric` and `font-mono` are aliases of it). Figures are tabular via `.num` (`font-variant-numeric: tabular-nums`) on every number element, so number columns line up like the calendar. It isn't set on `body` because Inter's tabular set also widens hyphens in prose and pair names.

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
| `card` | Boxed panel: `surface` + `border` + `rounded-card`. Rarely right; see "One surface, few boxes". |
| `tile` | Something on a card: `surface-raised` + `border` + `rounded-tile`. |
| `field` | Text input / textarea / select: h-10, `surface-raised`, border, hover `border-strong`, accent focus ring. Use `h-9` in toolbars, `h-11` in forms, `h-auto py-2.5` for textareas. |
| `chip` | 20px neutral pill (bin step, "You", status). |
| `seg` + `seg-item` | Segmented toggle for compact in-card switches. Not for page-level nav or leaderboard controls (use `tgl`). Active item via `aria-pressed` / `aria-selected` / `aria-current`. |
| `tgl` + `tgl-item` | Plain text toggle (e.g. Members/Countries): 13px semibold `mute`, active item `fg` with a 2px accent underline. Active via `aria-pressed` / `aria-selected`. Separate groups with a 1px `h-4 w-px bg-border` rule. |
| `tab` | Underline tab with an accent bar when `aria-selected` / `aria-pressed`. Sits on a `border-b` row (Poolside feed scope). |
| `link` | Inline link in body copy: `fg`, semibold, quiet underline that brightens on hover. |
| `skeleton` | Loading block (`surface-raised`, gentle pulse, off under reduced motion). Give it the final element's size so nothing jumps. |

Components: `BoardHeading`, `WordMenu` and `LiveStatus` (`components/BoardHeading.tsx`, see "Leaderboard heading" below); `CountrySelect` (`plain` renders a borderless text control for filter rows), `PageHeader` and `EmptyState` (`components/EmptyState.tsx`) for page titles and empty/error/signed-out states; `Tag`, `binLabel()` ("Bin 80"), `Pills` (`components/ui.tsx`); `Modal` + `ModalClose` (`components/Modal.tsx`) for every modal.

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

- Header: flush, `sticky top-0 border-b border-border bg-bg`, 60px. Wordmark left, plain text nav links (`text-mute hover:text-fg`; active `text-fg` with a 2px accent bar sitting on the hairline), account avatar + chevron right (name from lg). No pill containers. Phones keep the bottom tab bar.
- Leaderboard heading (`BoardHeading`): the playful headline first, then the controls on a fixed line. The control line (`text-md font-semibold`) reads "30 days ▾ · ranked by PnL ▾". Both words are `WordMenu`s: `accent` text with a small chevron, no resting underline (a dotted one read like a spellcheck mark), and a thin solid `accent/50` underline on hover or keyboard focus only. Each opens a small radio menu (`role="menu"` + `menuitemradio`; arrows, Home/End, Enter/Space, Esc/Tab return focus to the word, with no focus ring after a mouse pick). The range word reserves the width of its longest option (`reserve`) and the metric ends the line, so neither word, nor its menu, ever moves. The headline above is a playful line per metric, `text-2xl font-bold` (a page title, so the #1 podium figure stays the biggest thing on screen): "Biggest splashes", "Who's farming the most fees", "Making the most waves", "Sharpest swimmers" (Countries view: "Countries making the biggest splashes", etc.). On phones it reserves two lines so nothing below jumps. Under it: `LiveStatus` (6px dot + "Fresh from Meteora · 2m ago", `text-sm text-mute`; the dot is `up` only while the data is under an hour old, `mute` otherwise, and the text reads "Updating…" during a refetch) on the left, and the quiet country / Following controls with Members / Countries anchored at the right end (first, on its own row, on phones). Copy stays sentence case, pool-themed but not cheesy, no emoji.
- Leaderboard list (members, countries): open list with hairline dividers (`LIST_ROW` in `components/RankMedal.tsx`: `border-b border-border hover:bg-surface`), no per-row boxes. Rank `text-sm text-mute`, name `font-medium text-fg`, metric `font-bold num` flush right. Own row: `bg-surface` + 2px accent left bar.
- Other list rows (pools, open positions, LPs): no dividers; `rounded-tile` rows with `hover:bg-accent-tint`, whole row clickable via an overlay link.
- Section header: `text-lg font-semibold`, optional count in `num font-medium text-mute` after the title.
- Stat: label `text-sm text-mute` above value `text-md`-`text-lg font-semibold`, in an open row with thin dividers (profile `StatStrip`), never boxed tiles.
- Small text (11-12px): `text-mute` or brighter, never `text-white/40`, `opacity-50` etc.
- Icons: inline SVG at `h-4 w-4` (stroke 1.75), no emoji as icons.
- Poolside events: one custom 16px line glyph per kind, no chip or background (`components/poolside/EventRows.tsx`): drop into water (opened, `accent`), stepping out (closed), splash (big win, `gold`), pool float (joined), person plus (followed), badge glyph in its tier metal. Everything else `mute`; the PnL figure carries gain or loss.
- Shadows: none, or a neutral `shadow-black/40` for floating menus only.

## Medals (leaderboard top 3)

The one place colour is used for celebration. Ranks 1, 2 and 3 get `gold`, `silver` and `bronze`; everyone else stays neutral.

- Rank mark: `components/RankMedal.tsx` (inline SVG medal, solid metal, number in `text-bg`). Use it wherever a top-3 rank is shown, and nowhere else.
- Avatar ring: a solid 2px metal border around the avatar (`border-2 border-gold p-[3px] rounded-full`).
- Podium: open columns, no cards or tints (`PODIUM_SLOT` / `PODIUM_LIFT`). Presence comes from size: 112px avatar for #1, 84px for #2/#3, metric `text-3xl` / `text-2xl` bold. Metal appears only on the avatar ring and the pinned medal (`MedalPin`); the stat keeps its semantic colour (`up`/`dn`/`fg`). On phones the podium becomes divided rows.
- Badge tiers (`components/Badges.tsx`): tier 1 / 2 / 3 = `bronze` / `silver` / `gold` glyph on a `/[.08]` tint with a `/40` border. Podium's tier is the best finish (1st = gold). Untiered badges stay neutral.
- Flat only: no metallic gradients, sheen, glow or animation.
- Contrast on the dark theme: metal on `bg` is 10.5:1 (gold), 10.8:1 (silver) and 6.8:1 (bronze), and `bg` text on a solid metal gives the same ratios. A `/50` border is 3:1 or more against `surface`. `fg`, `mute` and `up` keep 14:1, 5.6:1 and 7.3:1 on a `/[.07]` tint.
