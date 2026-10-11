# 10 — Paket o‘rnatish va birinchi ishga tushirish UI

**Holat:** npm/Python/shell installer UI va Go welcome/setup kodi qo‘shildi. Go CLI testlari, npm/Python fixture testlari, shell lokal archive testi va Windows build tekshirildi. Shell yuklash vaqtida bosqich matnini va yakunda bayt hajmini ko‘rsatadi; npm/Python TTY’da haqiqiy progress ko‘rsatadi. Haqiqiy macOS/Linux release smoke sinovi va paket nashri release bosqichida bajariladi.
**Sana:** 2026-10-10.
**Maqsad:** npm yoki boshqa qo‘llab-quvvatlanadigan usul orqali trqsh o‘rnatgan odam terminalda brendli, tushunarli o‘rnatish jarayonini va ilk ishga tushganda sodda sozlash ekranini ko‘rsin.

## 1. Asosiy qaror

Tajriba ikki qismdan iborat:

1. **O‘rnatish UI:** logo, versiya, platforma, haqiqiy yuklash holati, tekshirish natijasi va keyingi buyruq. Paket installerida savol-javob bo‘lmaydi.
2. **Birinchi ishga tushirish UI:** umumiy Go terminal interfeysida welcome, akkauntga kirish va birinchi tunnel bo‘yicha yo‘riqnoma. Barcha kanallardan o‘rnatilgan binary shu oqimdan foydalanadi.

npm lifecycle skripti chiqishi foydalanuvchiga har doim ko‘rinmaydi: `foreground-scripts` odatda o‘chiq, `ignore-scripts` esa lifecycle skriptlarini o‘tkazib yuboradi. Shu sabab to‘liq onboarding `postinstall` ichida ochilmaydi. Manba: [npm install konfiguratsiyasi](https://docs.npmjs.com/cli/install/#foreground-scripts), [ignore-scripts](https://docs.npmjs.com/cli/install/#ignore-scripts).

Hujjatlarda asosiy ko‘rsatma:

```sh
npm install -g @trqsh-uz/trqsh --foreground-scripts
trqsh
```

Oddiy `npm install -g @trqsh-uz/trqsh` ham ishlaydi; o‘rnatish animatsiyasi ko‘rinishi kafolatlanmaydi, onboarding esa keyingi interaktiv `trqsh` ishga tushishida ochiladi. `npx @trqsh-uz/trqsh` bir martalik ishga tushirish yo‘li bo‘lib qoladi; uni global o‘rnatildi deb ko‘rsatmaslik kerak.

## 2. Mavjud asos

| Qism | Hozirgi holat | Rejadagi o‘zgarish |
| --- | --- | --- |
| `packaging/npm/lib/install.js` | Binary yuklash, checksum, unpack, Windows global PATH yordamchisi | Bosqichli installer renderer va aniq natija |
| `packaging/npm/bin/trqsh.js` | Binary yo‘q bo‘lsa birinchi ishga tushishda yuklaydi | Xuddi shu renderer; argumentlar va exit code saqlanadi |
| `packaging/pypi/src/trqsh/_runtime.py` | Native binary birinchi ishga tushganda yuklanadi | Shu bosqichlar va matnli fallback |
| `packaging/install.sh` | macOS/Linux installer | Brendli holatlar, tekshirish va PATH natijasi |
| `internal/agent/cli/dashboard.go` | Terminalni tekshiradi, daemonni boshlaydi, TUI ochadi | Onboarding holatini TUI’ga uzatish |
| `internal/agent/cli/tui/` | Bubble Tea + Lip Gloss, slash buyruqlar, browser/API-key login | Welcome/setup holatlari va `/setup` |

Mavjud Go UI kutubxonalari qayta ishlatiladi. npm/Python wrapperlari uchun yangi tashqi UI dependency talab qilinmaydi. Terminal uslubi `tui/styles.go` dagi amaldagi oq/qora/kulrang palitraga mos bo‘ladi.

## 3. Terminal maketi

Quyidagi matnlar taklif qilingan UI namunalari; versiya, platforma va progress haqiqiy qiymatlardan olinadi. UI matni mavjud CLI kabi inglizcha bo‘ladi.

```text
  trqsh  /  install
  Localhost, online.

  [ok] Platform       Windows / x64
  [ok] Release        vX.Y.Z
  [..] Downloading    6.4 / 12.8 MB
  [  ] Verify         SHA-256
  [  ] Install        Native CLI

  Installed successfully.
  Next: trqsh
```

Bu maketning jarayon holatida pastdagi success matni hali chiqmaydi. Yakunda barcha tugagan bosqichlar yangilanib, versiya va binary joylashuvi ko‘rsatiladi. PATH yangilangan bo‘lsa, yangi terminal ochish kerakligi aniq yoziladi; shu terminalda buyruq ishlashi va’da qilinmaydi.

```text
  trqsh  /  welcome

  Bring your localhost online.

  > Sign in with browser
    Use an API key
    Set up later

  Up/Down select   Enter continue   Esc skip
```

Kirgandan keyin `/http 3000` misoli va ikki tanlov: `Start a tunnel` yoki `Open console`. Tunnel yaratishdan oldin protokol va port ko‘rsatiladi, foydalanuvchi ishga tushirishni tanlaydi. O‘rnatish yoki login o‘zidan-o‘zi lokal xizmatni internetga chiqarmaydi.

## 4. Kanal bo‘yicha xulq

| Kanal | O‘rnatish paytidagi UI | Umumiy onboarding |
| --- | --- | --- |
| npm global | `--foreground-scripts` bilan ko‘rinadigan bosqichlar; TTY bo‘lsa animatsiya | Birinchi interaktiv `trqsh` |
| npm, skriptlar o‘tkazib yuborilgan | Binary bo‘lmasa launcher yuklash UI’ini ko‘rsatadi | Yuklashdan keyin |
| npx | Kerak bo‘lsa binary yuklash; global install deb yozilmaydi | Ishga tushirilgan CLI ichida |
| pip / pipx | Paket managerining o‘z chiqishi; binary birinchi ishlatishda yuklanadi | Birinchi interaktiv ishga tushishda |
| curl / shell | Savolsiz bosqichlar; stdout/stderr terminal bo‘lsa progress | Keyingi `trqsh` |
| Tayyor native archive | Arxivni chiqarish uchun custom installer yo‘q | Birinchi interaktiv `trqsh` |
| Homebrew / winget / Scoop | Paket managerining o‘z chiqishi | Kanal release’ga tayyor bo‘lgach, o‘sha umumiy onboarding |

Paket managerining o‘z ekranini almashtirish va’dasi berilmaydi. Barcha usullardagi bir xil tajriba native CLI’ning birinchi ishga tushishida ta’minlanadi.

## 5. Oqim va terminal qoidalari

- Installer bosqichlari: `detect → resolve version → download → verify → extract/install → ready`.
- Progress faqat o‘lchangan baytlardan hisoblanadi. Hajm noma’lum bo‘lsa spinner va yuklangan baytlar; sun’iy foiz yoki majburiy kutish yo‘q.
- Wrapper UI uchun yozilayotgan oqimning TTY holati tekshiriladi. Shell pipe orqali kelgan stdin interaktiv hisoblanmaydi va undan javob o‘qilmaydi.
- CI yoki yo‘naltirilgan chiqishda oddiy satrlar, animatsiyasiz va ANSI kodlarisiz natija. `TERM=dumb`, `NO_COLOR` va `TRQSH_NO_COLOR` qo‘llanadi; rangsiz TTY’da ham menyu ishlay oladi.
- Tor terminalda qutilar va uzun satrlar soddalashtiriladi. Windows PowerShell, Windows Terminal va macOS/Linux terminallarida o‘qiladigan ASCII fallback bo‘ladi.
- Installer akkauntga kirmaydi, browser yoki daemon ochmaydi. Browser login faqat welcome ekranidagi tanlovdan keyin boshlanadi.
- Native `--help`, `--version` va yashirin `daemon` yo‘llari onboarding ochmaydi. Amaldagi interaktiv CLI cheklovi saqlanadi: bu reja headless tunnel buyruqlarini qo‘shmaydi.

## 6. Birinchi ishga tushirish holati

- Yangi foydalanuvchi uchun holatlar: `welcome → sign-in (optional) → ready → console`.
- `Set up later` va `Esc` konsolga o‘tkazadi; `/login` keyin ham ishlaydi. `Ctrl+C` joriy UI’ni yopadi va terminal holatini tiklaydi.
- `/setup` welcome oqimini qayta ochadi. `trqsh setup` amaldagi positional-argument → slash-command yo‘li orqali shu oqimga boradi; yangi Cobra subcommand kerak emas.
- Mavjud credential yoki konfiguratsiya topilgan foydalanuvchi majburiy welcome’dan o‘tkazilmaydi; `/setup` orqali ixtiyoriy kiradi. Tarmoq vaqtincha ishlamasa, bu yangi foydalanuvchi deb talqin qilinmaydi.
- `trqsh http 3000` kabi aniq buyruq berilgan bo‘lsa, avtomatik welcome uni to‘sib qo‘ymaydi; amaldagi buyruq va `/login` ko‘rsatmasi ishlaydi.
- Setup holati haqiqiy tanlangan config yo‘li yonidagi alohida `onboarding.<config-path-hash>.json` faylida saqlanadi: schema versiyasi va `completed` yoki `dismissed` status. Hash normallashtirilgan to‘liq config yo‘lidan olinadi, shunda bitta papkadagi `A.yml` va `B.yml` holatlari aralashmaydi. `--config` hamda `TRQSH_CONFIG` hisobga olinadi; holat vaqtinchalik fayl orqali atomik yoziladi.
- Holat faylida token saqlanmaydi. API key maxsus yashirilgan input orqali olinadi; transcript/history’ga yozilmaydi. Login mavjud daemon API’sini qayta ishlatadi.
- Foydalanuvchi bir bosqichda to‘xtasa credential/config buzilmaydi. Tugatish yoki ongli skip’dan keyin welcome qayta-qayta ochilmaydi. Holat fayli buzilsa xavfsiz tiklash, yozib bo‘lmasa tushunarli xabar va konsolga o‘tish mavjud bo‘ladi.
- Config YAML kontrakti o‘zgarmaydi. Eski arxitektura rejasidagi `~/.trqsh-uz` matniga qaramay, yo‘llar amaldagi `agent.DefaultConfigPath()` va tanlangan config’dan olinadi; odatiy amaldagi yo‘l `~/.trqsh/trqsh.yml`.

## 7. Installer natijasining ishonchliligi

Hozir npm/Python wrapperlari ayrim checksum xatolarida tekshiruvni tashlab davom etadi. Yangi UI’da `Verified` faqat SHA-256 solishtirish muvaffaqiyatli tugaganda chiqishi kerak. Tavsiya: checksum yuklanmasa, yozuv topilmasa yoki mos kelmasa odatiy install xato bilan tugasin. Mavjud `TRQSH_SKIP_CHECKSUM=1` override alohida `Verification skipped` holatini ko‘rsatadi.

- Tarmoq so‘rovlari timeout bilan tugaydi; uzilish/qayta urinishda yarim binary tayyor deb olinmaydi. Tayyor nusxa muvaffaqiyatli tekshirish va unpack’dan keyin almashtiriladi.
- Keshdagi binary ishlashi va versiyasi tekshiriladi; mavjud faylning o‘zi success dalili bo‘lmaydi. Aniq berilgan `TRQSH_VERSION` qayta ishlatilishda ham talab qilinadi. Override bo‘lmasa paket versiyasi boshlang‘ich yuklash uchun ishlatiladi: mavjud `/update` orqali olingan, tekshirilgan yangi binary’ni eski paket versiyasiga avtomatik tushirmaslik kerak.
- macOS uchun `shasum -a 256` kabi mavjud vosita bilan tekshirish yo‘li bo‘ladi; kerakli vosita bo‘lmasa aniq xato chiqadi.
- Ruxsat yetishmasligi, disk to‘lishi, unsupported platform, 404 va checksum mismatch qaysi bosqichda bo‘lganini ko‘rsatadi. Xatodan keyin success banner chiqarilmaydi.
- Shell versiyani aniqlay olmasa eski versiyaga jimgina tushmaydi; aniq versiya ko‘rsatish yoki qayta urinish yo‘lini beradi.
- Wrapper/package va binary versiyasi bir-biridan farq qilsa, UI ularni adashtirmaydi. O‘rnatilgan native binary `--version` bilan tekshiriladi.

## 8. Ishni bajarish tartibi

1. **npm installer UI — birinchi natija.** `packaging/npm/lib/ui.js` rendererini qo‘shish; `install.js` ichidagi bosqichlarga ulash; yangi faylni `package.json` dagi `files` ro‘yxatiga qo‘shish. Oddiy install, foreground va launcher orqali kechiktirilgan yuklash bir xil natija beradi. Shu bosqichda timeout, checksum va interrupted-install xatti-harakati mustahkamlanadi.
2. **Umumiy welcome/setup.** `tui/setup.go` va holat saqlash yordamchisi; `model.go`, `view.go`, `commands.go`, `dashboard.go` bilan ulash. Mavjud login, loading va stil komponentlarini qayta ishlatish; hozirgi TUI o‘zgarishlari ustiga kichik integratsiya qilish.
3. **Python va shell.** Bir xil bosqich nomlari va fallback qoidalari; `packaging/install.sh` hamda `web/site/public/install.sh` bir xil saqlanadi. npm’dagi ishonchlilik qoidalari bu wrapperlarga ham qo‘llanadi.
4. **Hujjatlar va release tekshiruvi.** `packaging/README.md`, kanal README’lari, `docs/content/installation.md` va download sahifasini haqiqiy buyruqlarga moslash. Eski unscoped npm nomini `@trqsh-uz/trqsh` bilan, shell release manbasini amaldagi CLI release repo bilan tekshirib moslash. Homebrew/winget kabi kanallar tayyorligi alohida tekshirilmaguncha ishlaydigan yo‘l sifatida va’da qilinmaydi.

Bu ketma-ketlikda npm UI va umumiy onboarding birinchi chiqariladigan hajmni tashkil qiladi; Python/shell pariteti keyingi bosqichda tugallanadi.

## 9. Qabul mezonlari va tekshiruv

- [ ] npm foreground install’da bosqichlar, haqiqiy progress va keyingi buyruq ko‘rinadi; oddiy install hook’i input kutmaydi.
- [ ] `--ignore-scripts` bilan o‘rnatilgandan keyingi launch binary’ni to‘g‘ri tayyorlaydi; `npx` global o‘rnatildi deb da’vo qilmaydi.
- [ ] Yangi interaktiv foydalanuvchi welcome ko‘radi; skip/tugatish saqlanadi; `/setup` qayta ochadi; mavjud foydalanuvchi to‘silmaydi.
- [ ] Browser/API-key login muvaffaqiyatsiz bo‘lsa qayta urinish yoki skip mumkin; token transcript/history/diagnostikaga chiqmaydi.
- [ ] Tunnel faqat foydalanuvchi tanlagandan keyin boshlanadi; `/http 3000` va boshqa mavjud buyruqlar buzilmaydi.
- [ ] Help/version/daemon/setup uchun TTY, non-TTY va CI holatlari alohida tekshiriladi; rangsiz va tor terminal chiqishi o‘qiladi.
- [ ] Lokal release fixture bilan 404, timeout, buzilgan archive, checksum yo‘q/mos emas, interrupt va qayta urinish sinovdan o‘tadi; tayyor binary buzilmaydi.
- [ ] Custom config, kesh versiyasi, bo‘sh joy/apostrofli Windows yo‘llari, PATH yangilanishi va faqat joriy shell’da eski PATH qolishi tekshiriladi.
- [ ] Windows/macOS/Linux uchun native smoke tekshiruvi; shell nusxalari bir xil; `npm pack --dry-run` yangi renderer paketga kirishini ko‘rsatadi.
- [ ] Go’da o‘zgargan CLI paketlarining mavjud testlari va setup holat o‘tishlari testlari ishlaydi; haqiqiy akkauntsiz fixture orqali login xatolari tekshiriladi.

Implementatsiya paket versiyasini oshirmaydi va avtomatik publish qilmaydi; tarqatish uchun odatiy release jarayoni ishlatiladi.
