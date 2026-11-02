# Market POS – udhëzime për Claude Code

Aplikacion web për markete (dyqane ushqimore) në Kosovë: arka/shitja (POS), produktet & kategoritë, stoku & hyrjet e mallit, raportet, cilësimet me printer termik përmes Bluetooth. Punon në kompjuter dhe telefon.

## Stack-u
- Vite + React 18 + TypeScript (strict)
- Tailwind CSS
- React Router (rrugët më poshtë)
- Supabase: Auth, Postgres, RLS, RPC (funksione SQL) – klienti `@supabase/supabase-js`
- TanStack Query për leximin/ruajtjen e të dhënave
- PWA (vite-plugin-pwa) – instalohet në telefon/kompjuter
- Printimi: Web Bluetooth + komanda ESC/POS

## Dizajni (burimi i së vërtetës)
- `design/screenshots/*.png` – si duhet të duket çdo ekran.
- `design/html/*.html` – markup-i statik i çdo ekrani (stile inline). Përdore për masat, ngjyrat, tekstet dhe strukturën; ktheje në komponentë React + Tailwind, mos e kopjo HTML-në si të tillë.
- Ekranet `M-*` janë versioni për telefon (390px). Aplikacioni është NJË aplikacion responsive: nën `md` (768px) shfaq menunë poshtë (tab bar) dhe layout-in e telefonit; mbi `md` sidebar-in e errët.
- Të dhënat në dizajn (produktet, çmimet, shitjet) janë shembuj – në aplikacion vijnë nga Supabase.

### Tokenat (vendosi te `tailwind.config.ts`)
| Emri | Vlera | Përdorimi |
|---|---|---|
| brand-900 | #10241B | sidebar, header i errët |
| brand-800 | #1B3A2C | hover në sidebar |
| brand-600 | #0E6B4E | butoni kryesor, linqe, aktive |
| brand-400 | #3FBF86 | logo |
| brand-100 | #E3F1EA | sfond aktiv |
| ink | #14201A | teksti kryesor |
| muted | #56645C | teksti dytësor |
| line | #E2E7E3 | kufijtë e kartave |
| field | #CBD5CE | kufijtë e input-eve |
| bg | #F4F6F3 | sfondi i faqes |
| warn-700 / warn-100 | #9A3412 / #FFEDE0 | stok kritik |
| amber-700 / amber-100 | #854D0E / #FEF3C7 | stok i ulët |
| bt-600 | #1D4ED8 | butonat e Bluetooth |

- Shkronja: Inter (400/500/600/700); fatura: IBM Plex Mono. Shifrat: `tabular-nums`.
- Radius: kartat 14px, butonat/input 10–12px. Lartësia minimale e butonave 44px.
- Ikonat: lucide-react (stroke 2).

## Rrugët
| Rruga | Ekrani (desktop / telefon) |
|---|---|
| `/login` | Login.png / M-Login.png (menaxher me email+fjalëkalim, arkëtar me PIN 4-shifror) |
| `/` | Main.png / M-Paneli.png |
| `/arka` | Arka.png / M-Arka.png |
| `/produktet` | Produktet.png / M-Produktet.png |
| `/stoku` | Stoku.png / M-Stoku.png (tab-et: Hyrje e re, Historiku, Lëvizjet, Inventarizimi, Furnitorët) |
| `/cilesimet` | Cilesimet.png / M-Cilesimet.png |
| fatura e printuar | Fatura.png (80mm) |

## Rregullat e biznesit
- Valuta EUR, 2 decimale. Çmimet e shitjes JANË me TVSH të përfshirë.
- TVSH: 18% (A) dhe 8% (B), plus 0%. Baza = bruto / (1 + norma). Fatura shfaq ndarjen sipas normës.
- Marzha = (çmimi i shitjes − çmimi i blerjes) / çmimi i shitjes.
- Stoku NUK ndryshohet direkt nga klienti. Çdo ndryshim kalon nga RPC-të në `supabase/schema.sql` (`create_sale`, `confirm_stock_entry`, `adjust_stock`), që shkruajnë edhe `stock_movements`.
- Stok i ulët: `stock <= min_stock`; kritik: `stock <= min_stock / 2`.
- Njësitë: copë, kg, pako, litër (kg lejon decimale).
- Numri i faturës: rritet automatikisht (sekuencë), shfaqet si `#00487`.
- Rolet: `admin`, `manager`, `cashier`. Arkëtari sheh vetëm Arkën dhe Cilësimet e printerit; nuk sheh çmimet e blerjes dhe fitimin.
- Kuponi fiskal: jashtë fushës tani. Fatura shënohet "Kupon jo-fiskal".

## Printeri Bluetooth
- `src/lib/printer/`: `connect()` me `navigator.bluetooth.requestDevice` (filtro sipas shërbimeve të zakonshme të printerëve termikë, p.sh. `000018f0-0000-1000-8000-00805f9b34fb`, me `optionalServices`), gjej karakteristikën që lejon write, dërgo të dhënat në copa ≤ 512 bytes (për disa printerë 20–180).
- `src/lib/printer/escpos.ts`: gjenero bytes ESC/POS për faturën (init, align, bold, madhësi e dyfishtë për totalin, vija me `-`, prerja e letrës, hapja e sirtarit). 58mm = 32 karaktere/rresht, 80mm = 48.
- Shkronjat shqipe (ë, ç): përdor code page që i mbështet (p.sh. CP1250/CP852) ose zëvendësoji me e/c si rezervë – bëje opsion në cilësime.
- Mbaj mend pajisjen e fundit dhe provo rilidhjen automatike (`navigator.bluetooth.getDevices()` aty ku ekziston).
- Web Bluetooth punon në Chrome/Edge (desktop + Android), JO në iPhone/Safari – shfaq mesazh të qartë kur `navigator.bluetooth` mungon, dhe lejo printimin përmes `window.print()` me CSS 80mm si rezervë.

## Struktura e propozuar
```
src/
  app/ (router, layout: Sidebar, TabBar, AuthGuard)
  features/{auth,pos,products,stock,dashboard,settings}/
  components/ui/ (Button, Input, Select, Card, Badge, Table, Tabs, Toggle)
  lib/{supabase.ts, money.ts, vat.ts, printer/}
  types/database.ts (gjenero me `supabase gen types`)
```

## Mënyra e punës
- Puno në faza (shih PROMPT.md). Pas çdo faze: `npm run build` pa gabime, pastaj trego çfarë u bë.
- SQL-në e ekzekutoj vetë në Supabase SQL Editor – kur ndryshon skemën, krijo skedar të ri në `supabase/migrations/` dhe më trego ta ngjis.
- Çelësat në `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), asnjëherë në kod.
- Teksti i ndërfaqes në shqip; kodi, emrat e variablave dhe komentet në anglisht.
