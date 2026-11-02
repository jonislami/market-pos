# Market POS – paketa për fillimin e kodimit

## Çfarë ka brenda
- `CLAUDE.md` – udhëzimet e projektit (Claude Code e lexon vetë sa herë hapet në këtë dosje)
- `PROMPT.md` – mesazhi i parë për ta ngjitur në Claude Code
- `design/screenshots/` – pamjet e 13 ekraneve (desktop, telefon, fatura)
- `design/html/` – markup-i i çdo ekrani, mund ta hapësh në shfletues
- `supabase/schema.sql` – tabelat, rolet, RLS dhe funksionet për shitjen dhe hyrjen e mallit

## Hapat
1. Shpaketoje ZIP-in, p.sh. te `C:\Projects\market-pos`.
2. Krijo një projekt të ri në Supabase. Te **SQL Editor** ngjit dhe ekzekuto `supabase/schema.sql`.
3. Te **Authentication → Users** krijo përdoruesin tënd, kopjo UUID-në dhe ekzekuto rreshtin e fundit të `schema.sql` (insert në `profiles` me rolin `admin`).
4. Hap terminalin në dosjen `market-pos` dhe nis Claude Code:
   ```
   cd C:\Projects\market-pos
   claude
   ```
5. Ngjit tekstin nga `PROMPT.md`.
6. Kur Claude Code të krijojë `.env.example`, bëje kopje si `.env.local` dhe vendos URL-në dhe anon key nga Supabase → Project Settings → API.
7. `npm run dev` dhe kontrollo. Pastaj thuaji "Vazhdo me Fazën 2", e kështu me radhë.

Këshillë: bëj `git init` dhe një commit pas çdo faze, që të kthehesh mbrapa lehtë nëse diçka prishet.
