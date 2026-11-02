# Mesazhi i parë për Claude Code

Kopjoje tekstin më poshtë dhe ngjite në Claude Code, brenda dosjes `market-pos`.

---

Lexo `CLAUDE.md`, shiko të gjitha pamjet te `design/screenshots/` dhe skemën te `supabase/schema.sql`. Pastaj fillo **Fazën 1** dhe ndalu kur ta përfundosh, që ta kontrolloj.

**Faza 1 – Themeli**
1. Krijo projektin Vite + React + TypeScript në këtë dosje (mos i fshi `design/`, `supabase/`, `CLAUDE.md`).
2. Instalo Tailwind, React Router, @supabase/supabase-js, @tanstack/react-query, lucide-react.
3. Vendos tokenat e ngjyrave dhe shkronjën Inter sipas `CLAUDE.md`.
4. Ndërto komponentët bazë te `components/ui/` (Button, Input, Select, Card, Badge, Table, Tabs, Toggle) duke u nisur nga dizajni.
5. Ndërto layout-in: Sidebar për desktop, TabBar poshtë për telefon (nën 768px), me rrugët nga `CLAUDE.md` dhe faqe bosh për secilën.
6. Ndërto faqen `/login` (menaxher me email/fjalëkalim përmes Supabase Auth; tab-i i PIN-it vetëm vizualisht për tani) dhe AuthGuard.
7. Krijo `.env.example` me `VITE_SUPABASE_URL` dhe `VITE_SUPABASE_ANON_KEY`.

**Fazat e ardhshme (mos i fillo pa të thënë):**
- Faza 2 – Produktet & kategoritë (lista, filtrat, formulari, importi nga Excel)
- Faza 3 – Arka/POS (kërkim + barkod, shporta, TVSH, pagesa me `create_sale`, kusuri, shkurtoret F2/F12)
- Faza 4 – Stoku & hyrjet (hyrje e re, draft, `confirm_stock_entry`, lëvizjet, paralajmërimet)
- Faza 5 – Paneli & raportet (shitjet ditore, grafiku 7 ditë, më të shiturat, fitimi)
- Faza 6 – Cilësimet + printeri Bluetooth (ESC/POS) + fatura 80/58mm
- Faza 7 – Hyrja me PIN për arkëtarët, PWA, punë pa internet për arkën
