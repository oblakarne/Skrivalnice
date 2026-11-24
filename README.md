# Skrivalnica 🙈🔫

3D večigralska igra skrivanja za telefon (deluje tudi na računalniku). **Skrivalci** se spremenijo v predmet v hiši (stol, lonec, žogo, svetilko …), **lovci** jih iščejo in streljajo nanje. Igra teče v brskalniku – nič ni treba nameščati.

- 2–8 igralcev v sobi, pridružiš se s 4-mestno kodo ali povezavo
- dve mapi (izbere ju gostitelj v čakalnici):
  - **Hiša** (36 × 26 m): 8 prostorov, vsak s svojo barvo sten in tal
  - **Construction** (48 × 36 m): gradbišče na prostem z modrim nebom in oblaki; stavba v gradnji s štirimi nivoji (tla, 3 m, 6 m, 9 m), oder, stolp z mostom, bager, žerjav, kupi nosilcev. Skrivalec ima nabor **6 oblik** in med njimi preklaplja z gumbom **Zamenjaj**. Lovci med skrivanjem čakajo v zaprti sobi, vrata se odprejo ob lovu; ob stavbi vozi **dvigalo** (tla → 3 m → 6 m)
- 53 vrst predmetov (pohištvo, gradbeni material …)
- upravljanje z dotikom (vedno vidna igralna palica + vlečenje za pogled) ali s tipkovnico in miško
- vsa grafika in zvoki so narejeni v kodi (brez tujih datotek)

---

## 1. Igranje doma (isti Wi-Fi)

Potrebuješ [Node.js](https://nodejs.org) 20 ali novejši.

```bash
npm install
npm run build
npm start
```

Strežnik izpiše naslove, npr.:

```
Lokalno:      http://localhost:3000
Omrežje:      http://192.168.1.23:3000
```

Na telefonih (povezanih na **isti Wi-Fi**) odpri naslov »Omrežje«. Če se ne odpre, dovoli Node.js v požarnem zidu Windows (zasebna omrežja).

## 2. Igranje preko interneta (brezplačno na Render)

1. Naloži projekt na GitHub (nov repozitorij → naloži vse datoteke, razen `node_modules`).
2. Na [render.com](https://render.com) se prijavi → **New → Blueprint** → izberi repozitorij. Render prebere `render.yaml` in vse nastavi sam.
   (Ročno: **New → Web Service**, Build: `npm ci --include=dev && npm run build`, Start: `npm start`, Health check: `/health`.)
3. Ko je objava končana, dobiš naslov `https://skrivalnica-xxxx.onrender.com`. Pošlji ga prijateljem.

> Brezplačni strežnik po 15 minutah brez igralcev zaspi. Prvo nalaganje potem traja 30–50 sekund, nato deluje normalno.

**Nasvet za iPhone:** v Safariju tapni *Deli → Dodaj na začetni zaslon* – igra se potem odpre čez cel zaslon.

---

## Kako se igra

1. Vpiši ime → **Ustvari sobo** → **Deli povezavo** (ali povej kodo).
2. Prijatelji vpišejo kodo → **Pridruži se**. Gostitelj (👑) izbere mapo, nastavi čase in število rund ter pritisne **Začni igro**.
3. **Skrivanje** (30 s): skrivalec je že od začetka naključen predmet iz okolice. Če želi drugo obliko, pomeri v predmet v bližini (obrobi se zeleno) in pritisnejo **Spremeni**. Z **Zakleni** obstaneš na mestu in v isti smeri – obračaš lahko samo kamero. Lovci ta čas ne vidijo ničesar.
4. **Lov** (3 min): lovci udarjajo sumljive predmete z **lopato ⛏** – priti morajo čisto blizu (doseg 2,6 m, 2 udarca ujameta skrivalca). Lopata zadene tudi predmet, ki je nizko pod njo, če križ meri bolj naravnost. Vsakih 30 s so imena skrivalcev 10 s vidna vsem (tudi skozi stene). Skrivalec se vsakih 25 s samodejno spremeni v naslednjo obliko – na Hiši v predmet, ki je v bližini (ob vsaki spremembi se pokadi). Udarec v pravi predmet lovcu vzame 5 življenja! Ko lovec skrivalca prvič zadane, mu merjenje nanj rahlo pomaga – a nikoli ne »preskoči« na skrivalca, če lovec zadene pravi predmet (npr. kavč poleg njega).
5. Po vsaki spremembi moraš počakati **5 s** (odštevanje je na gumbu). Skrivalec ima 2 **vabi 🎭** – lažni kopiji sebe; če lovec ustreli vabo, izgubi 5 ❤, skrivalec pa dobi +20 točk. Lovec ima **radar 📡** (vsakih 25 s): za 5 s se pokaže zelen radarski krog z vrtečim se žarkom, na katerem pike nakažejo smer in grobo oddaljenost pravih skrivalcev v 12 m (vab ne zazna); obvestilo pove tudi smer najbližjega. Gostitelj lahko radar v čakalnici izklopi. Za vsak ulov lovec dobi +20 ❤. Ob koncu lova opozorilo »Še 30 sekund!« in odštevanje.
6. Zmagajo lovci, če ujamejo vse skrivalce; sicer zmagajo skrivalci. Vloge se vsako rundo zamenjajo.

**Točke:** ulov +100 · vsakih 10 s preživetja +10 · preživeta runda +50

| | Telefon | Računalnik |
|---|---|---|
| Hoja | igralna palica spodaj levo | W A S D |
| Pogled | vleci z desnim palcem | miška (klikni v igro) |
| Zamah z lopato | ⛏ (drži in vleci za merjenje) | levi klik |
| Radar (lovec) | 📡 | F |
| Vaba (skrivalec) | 🎭 | G |
| Spremeni se / Zamenjaj obliko | ✨ | E |
| Zakleni / odkleni (stoj pri miru) | 🔓 | Q |
| Skok | ⬆ | presledek |
| Meni | ☰ | Esc |

---

## Za razvijalce

| Ukaz | Kaj naredi |
|---|---|
| `npm run dev` | razvojni način: strežnik (3000) + Vite (5173) s samodejnim osveževanjem; na telefonu odpri `http://<IP-računalnika>:5173` |
| `npm run build` | zgradi odjemalca (`client/dist`) in strežnik (`server/dist`) |
| `npm start` | zažene zgrajeno igro (vrata `PORT`, privzeto 3000) |
| `npm test` | enotni in integracijski testi (cela igra z boti) |
| `npm run check` | preverjanje tipov TypeScript + ESLint |
| `npm run e2e` | test v pravem brskalniku (Edge/Chrome): PC + emuliran telefon; posnetki v `e2e-screens/` (najprej `npm run build`; za drugo mapo nastavi `E2E_MAP=construction`) |
| `npm run bots -- --room ABCD --count 3` | boti se pridružijo sobi (za testiranje, ko nimaš dovolj prijateljev) |
| `npm run icons` | ponovno ustvari ikone aplikacije |

### Struktura

```
shared/src/      skupna koda strežnika in odjemalca
  constants.ts   vse igralne številke (hitrost, škoda, časi …)
  props.ts       katalog predmetov – iz istih podatkov nastaneta model in hitbox
  maps/          mapi Hiša in Construction (stene/odri, predmeti, začetne točke, luči)
  physics.ts     trki in gibanje (isti izračun na strežniku in telefonu)
  combat.ts      zadetki strelov in pomoč pri merjenju (isti izračun na obeh straneh)
server/src/      Express + Socket.IO; Room.ts vodi potek igre (strežnik ima zadnjo besedo)
client/src/      Three.js 3D igra, vmesnik, dotik/tipkovnica, zvok
```

### Zanesljivost

- Strežnik preveri vse: hitrost gibanja, stene, razdaljo za spremembo, hitrost streljanja in zadetke (isti `raycast` kot odjemalec).
- Ko telefon zaklene zaslon ali izgubi signal, ima igralec 30 s, da se vrne na isto mesto v isti sobi.
- Testi preverijo tudi mapo: da se noben predmet ne prekriva s steno ali drugim predmetom in da so vsi prostori dosegljivi.
