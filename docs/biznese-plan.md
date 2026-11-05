# Llojet e bizneseve – një platformë, i njëjti dizajn

Vendimi: **një aplikacion, një databazë**. Çdo dyqan ka një **lloj biznesi**; aplikacioni shfaq modulet dhe
termat e atij lloji. Dizajni (ngjyrat, komponentët, menuja), përdoruesit/PIN-et, printeri, raportet dhe
fiskalizimi (SEF) janë të përbashkëta për të gjithë.

Renditja: llojet e bizneseve tani, pastaj fiskalizimi (docs/fiskalizimi-plan.md) për të gjithë njëherësh.

## Llojet

| Lloji | Çka e dallon | Modulet specifike |
|---|---|---|
| **Market** (ekzistues) | Barkod, peshë (kg), stok | Arka, Produktet, Stoku, Raportet |
| **Kafiterie / Restorant** | Tavolina, kamarierë, kuzhinë/bar | Tavolinat (plani i sallës), porositë e hapura për tavolinë, dërgimi te kuzhina/bari (printer i veçantë), ndarja e llogarisë, ndërrimi i tavolinës, **recetat** (shitja e "Makiato" zbret kafe + qumësht nga stoku), modifikuesit (pa sheqer, e madhe) |
| **Barnatore** | Afati dhe seria | **Lot-et**: çdo hyrje ka numër serie + afat skadimi; shitja zbret nga lot-i që skadon i pari (FEFO); paralajmërim për barnat që skadojnë; kërkim sipas substancës aktive; shënim "me recetë" |
| **Butik / Veshje & Këpucë** | Madhësi dhe ngjyra | **Variantet** e produktit (M/L/XL × ngjyra), secila me barkod dhe stok të vet; printimi i etiketave me barkod; ndërrimi i artikullit (kthim + shitje) |
| **Sallon / Shërbime** | Shërbime dhe termine | **Shërbimet** pa stok (me kohëzgjatje); **terminet** (kalendari për punëtor); punëtori i caktuar në çdo shërbim; **komisioni** për punëtor; produktet (shampo, etj.) mbeten me stok |

## Fazat

| Faza | Përmbajtja |
|---|---|
| **B0 – Themeli** | `stores.business_type`; regjistri i llojeve në klient (emri, ikona, termat, modulet); menuja dhe titujt sipas llojit; zgjedhja e llojit kur krijohet dyqani (Cilësimet → Dyqanet); ndryshimi i llojit nga admini i platformës. |
| **B1 – Sallon / Shërbime** | Produkt i tipit "shërbim" (pa stok), punëtori në shitje, komisioni, terminet. |
| **B2 – Butik** | Variantet (madhësi/ngjyrë), etiketat me barkod. |
| **B3 – Barnatore** | Lot-et me afat, FEFO, paralajmërimet e skadimit. |
| **B4 – Kafiterie / Restorant** | Tavolinat, porositë e hapura, kuzhina/bari, ndarja e llogarisë, recetat. |

Çdo fazë: degë e veçantë, migrim i ri në `supabase/migrations/`, `npm run build`, pastaj në `main` vetëm pas miratimit.
