# Design — Slipring Stok Eşleştirme

Internal operations tool. Priority is data density, scannability and zero-ambiguity states.
Not a marketing site: no hero, no decoration that costs vertical space.

## Brand (taken from slip-ring.com)

| Token | Value | Use |
| --- | --- | --- |
| `--brand` | `#fca135` | primary accent, active states, key CTA |
| `--brand-dark` | `#e08a1f` | hover/pressed on brand |
| `--navy` | `#1a2740` | sidebar, headers, dark surfaces |
| `--ink` | `#0f172a` | body text |
| `--surface` | `#f6f7f9` | app background |
| `--card` | `#ffffff` | panels, tables |
| `--line` | `#e2e6ec` | borders, table rules |

Semantic (match states — these carry the whole UX):

| State | Color | Meaning |
| --- | --- | --- |
| ok | `#0f9d58` | kesin eşleşme, otomatik uygulanır |
| review | `#f59e0b` | benzer bulundu, kullanıcı onayı gerekir |
| miss | `#dc2626` | Excel'de var, sitede yok |
| idle | `#64748b` | sitede var, Excel'de yok |

## Typography

- Display/UI: **Plus Jakarta Sans** (600/700 headings, 500 labels)
- Data/codes: **JetBrains Mono** — every SKU, ERP code and stock number renders in mono so
  character-level differences (O/0, I/1, tire/boşluk) are visible. Non-negotiable.
- Sizes: 12px table body, 13px labels, 15px section titles, 24px page title. Tight line height in
  tables (1.35), generous (1.6) in prose/help text.

## Layout

- Fixed left rail (`--navy`, 220px) with numbered workflow steps — the tool is a linear pipeline,
  the nav should show where you are: 1 Katalog · 2 Yükle · 3 Eşleştir · 4 Dışa Aktar · Kurallar.
- Content max-width 1400px, 24px gutters. Tables go full width, sticky header row.
- Stat strip at the top of the match screen: 4 counters (ok / review / miss / idle) as clickable
  filters, not passive badges.
- Dense tables: 36px rows, zebra off, 1px `--line` rules, hover row tint `#fff8ef` (brand at 6%).

## Components

- **Dropzone**: dashed 2px `--line`, brand border + `#fff8ef` fill on drag-over. Shows filename,
  row count and detected columns after parse.
- **Column mapper**: inline select row above the preview grid; auto-detected column is preselected
  and marked "otomatik".
- **Match row**: `[state dot] ERP kodu → site SKU · ürün adı · eski→yeni stok · aksiyon`.
  Review rows expand inline to show up to 5 candidates with confidence %, each with
  "Eşleştir ve hatırla".
- **Diff numbers**: old stock in `--idle` with strikethrough, arrow, new stock bold; green when up,
  red when down, neutral when equal.
- Buttons: brand fill for the single primary action per screen, otherwise ghost with `--line` border.
  Every async button shows an inline spinner and disables itself.

## Motion

One staggered fade-up (60ms step) when a result table first renders. Row state changes tint-flash
once (200ms) so a confirmation is visibly registered. Nothing else animates.

## Copy

Interface language is Turkish, technical terms kept as-is (SKU, slug, stok). Empty states explain
the next action, never just "veri yok".
