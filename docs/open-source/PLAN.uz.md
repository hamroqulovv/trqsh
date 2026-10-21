# trqsh: localhost va ochiq loyiha tayyorgarligi

For the new `trqsh.uz` / `app.trqsh.uz` / `api.trqsh.uz` production deployment and GitHub/Google-only authentication, use [DOMAIN-AUTH.md](../../deploy/DOMAIN-AUTH.md). Earlier single-origin addresses and audit results below describe the previous deployment.

2026-10-20. Holat: reja va hujjatlar; funksional kod, litsenziya, GitHub sozlamalari va ishlayotgan xizmatlar bu bosqichda o‘zgartirilmaydi.

## Ish uchun tanlangan nusxa

| Joy | Git holati | Xulosa |
| --- | --- | --- |
| `Desktop/trqsh` | `ec8b4a1`, 2026-10-16; 605 kuzatiladigan fayl; `codex/fix-github-security-alerts` branchi | Asosiy ish nusxasi |
| `repos/trqsh` (D diski) | `d72ba42`, 2026-08-08; 530 kuzatiladigan fayl; 421 fayl diskda yo‘q | Eski, to‘liq bo‘lmagan nusxa; o‘chirilmaydi yoki avtomatik tiklanmaydi |

Eski commit yangisining ajdodi; Desktop nusxasi undan 35 commit oldinda. Papka sanasigagina tayanilmadi. Desktop HEAD GitHub `main`dagi tekshirilgan commitga mos.

Desktop’da bundan tashqari 14 ta kuzatiladigan faylda saqlanmagan o‘zgarish bor: Go 1.26, Go modullari, uchta frontend paketlari/lock fayllari va bog‘liq hujjatlar. `ADS/` va `docs/DEPENDENCY_SECURITY.md` kuzatilmagan. Ular foydalanuvchining avvalgi ishi sifatida saqlanadi; bu hujjat ularni testdan o‘tgan deb e’lon qilmaydi. Joriy README’dagi Go 1.26 yangilanishi ham saqlanadi.

## Arxitektura va hozirgi localhost

Agent/CLI (`cmd/trqsh`) foydalanuvchi qurilmasida ishlaydi. Edge (`cmd/trqshd`, `internal/server`) agent sessiyalari va tashqi HTTP/TCP/UDP oqimlarini ulaydi. Control API (`cmd/trqshapi`, `internal/api`) auth, kvotalar, domenlar va billingni yuritadi. Holat PostgreSQL va Redis’da, ikkita Next.js ilovasi site/dashboard’da, desktop mijoz Tauri’da.

Transportlar: QUIC, TCP/yamux fallback va yangi WebSocket yo‘li (`pkg/tunnel/websocket.go`). Oddiy web sahifa ochilishi barcha transportlar ishlayotganini isbotlamaydi.

Mavjud `trqsh` konteyneri tekshiruv vaqtida allaqachon healthy va ish holatida edi. Ushbu ish uni ishga tushirmaydi, to‘xtatmaydi yoki qayta yaratmaydi.

| Vazifa | Mavjud single-container yo‘li |
| --- | --- |
| Sayt | `http://localhost:3004` |
| Dashboard | `http://localhost:3004/dashboard` |
| API | `http://localhost:3004/v1` |
| Health | `http://localhost:3004/healthz` |
| Agent QUIC/TCP | `127.0.0.1:4443` |
| Tunnel ingress | `127.0.0.1:80` va `127.0.0.1:443` |
| Raw TCP/UDP | `127.0.0.1:20000–20009` |
| Saqlanadigan holat | `trqsh_trqsh_data` volume’i |

Muhim: single image’dagi frontend URL’lari `https://tunnel.trqsh.uz` uchun build qilinadi. Localhost ochilishi barcha link/OAuth chaqiruvlari faqat localhostga borishini anglatmaydi. Sof lokal ishlashni tekshirganda redirect, cookie, API origin va WebSocket endpointlar alohida kuzatiladi.

Keyingi localhost bosqichi:

1. Mavjud konteynerning Compose loyiha nomi, image’i va volume’ini qayd qilish; tayyor holatning zaxirasini tekshirish. Port 80/443 bandligida boshqa full-stack Compose’ni parallel boshlamaslik.
2. Saqlanmagan dependency yangilanishlarini alohida tekshirish: Go test/vet, uchta frontend build’i, auth va migration regressiyalari. Natijalarni yangi image bilan bog‘lash.
3. Joriy single-container rejimini davom ettirish yoki ko‘p xizmatli sof localhost rejimiga o‘tishni tanlash. Rejim almashganda volume’lar avtomatik bir xil deb taxmin qilinmaydi.
4. Sayt, dashboard, API, login/logout va device approval’ni sinash. Shaxsiy kalit, cookie, OAuth token yoki .env qiymatlarini hujjatga chiqarmaslik.
5. Faqat mahalliy test HTTP ilovasi bilan tunnel yaratish; HTTP va kerak bo‘lsa QUIC/TCP/WebSocket’ni bittalab tekshirish. So‘ng alohida raw TCP/UDP testlari. Billing uchun test providerlardan foydalanish.
6. Qayta ishga tushishda hisoblar va sozlamalar saqlanishini tasdiqlash. Foydalanuvchi ruxsatisiz volume o‘chirish yoki `down -v` ishlatmaslik.

Development auth yoqilgan single-container sxemasi ommaviy production uchun asos deb qabul qilinmaydi. Bir API jarayoniga bog‘liq QR relay, cloud inspector arxivi va raw port routing kabi cheklovlar joriy hujjatlar bilan solishtirib ko‘rsatiladi.

## GitHub va fayllar bo‘yicha reja

Repo hozirning o‘zida public: `trqsh-tunnel/trqsh`. Yangi repo yoki qayta public qilish kerak emas. Tashkilotning public `.github` repozitoriysi va `profile/README.md` fayli ham mavjud.

Ushbu hujjatlar PR’ida tayyorlangan fayllar:

- Bosh README: radiusli logo, yagona loyiha ta’rifi, canonical tashkilot havolalari, agent va self-hosting yo‘llari, arxitektura, aniq cheklovlar, joriy litsenziya va rejalashtirilgan o‘tish.
- `docs/open-source/org-profile/README.md`: tashkilot profiliga mo‘ljallangan draft. Keyinchalik `trqsh-tunnel/.github` ichidagi `profile/README.md`ga alohida PR orqali ko‘chiriladi. Asosiy repo ichida `profile` yaratish tashkilot profilini avtomatik yangilamaydi.
- `docs/open-source/github-metadata.json`: repo va tashkilot description/homepage/topics takliflari. Bu konfiguratsiya qo‘llanmaydi.
- `assets/brand/`: asl PNG, radiusli SVG va uni almashtirish yo‘riqnomasi. Veb va desktop logolari hozir almashtirilmaydi.

Keyingi GitHub ishlari:

1. Dependency/security ishini shu branchdagi foydalanuvchi o‘zgarishlari sifatida alohida review qilish. Docs, litsenziya va funksional o‘zgarishlarni bir commitga aralashtirmaslik.
2. `codex/` branchlar va PR’lar orqali ishlash; `main`ga to‘g‘ridan-to‘g‘ri push qilmaslik. Joriy `main` protected emas; review va zarur CI tekshiruvlari uchun branch ruleset rejalashtirish.
3. Repo description va homepage’ni tekshirilgan URL bilan yangilash, mavzularni saqlab tartiblash. Org description hozir bo‘sh; draftdagi matnni org sozlamasiga qo‘llash. Asosiy repo va CLI release reposini pin qilish.
4. Tashkilot README’sini ixchamlashtirish; ikki sahifada bir xil uzun qo‘llanmani ko‘paytirmaslik. Logo URL’i asosiy README’dagi nisbiy yo‘ldan farqli ravishda canonical `raw.githubusercontent.com` URL’iga ega bo‘ladi.
5. README badge va issue/security havolalarini `trqsh-tunnel`ga keltirish. `ghcr.io/uzcreator/*` Compose manzillari bilan workflow yaratadigan `ghcr.io/${github.repository_owner}/*` o‘rtasidagi nom farqini aniqlashtirish va image’larni commit/tag bilan pin qilish.
6. Go modulining `github.com/trqsh-uz/trqsh` nomini va `@trqsh-uz/trqsh` npm scope’ini shunchaki yangi GitHub org nomiga almashtirmaslik: ular importlar, release ldflags va mavjud foydalanuvchilarga ta’sir qiladi. Buning uchun alohida migration rejasi kerak.
7. `SECURITY.md`, contribution, issue/PR andozalari, release/checksum/imzo yo‘llari va install manzillarini tekshirish. Git tarixi hamda release artifactlarda secrets scan o‘tkazish; `.env.example`larda faqat namuna qiymatlari bo‘lishini tekshirish.
8. `bin/`, `.exe`, `data/`, node_modules, Rust target va shaxsiy marketing/media fayllarini birma-bir tasniflash. Kuzatilmayotgan `ADS/`ni ko‘rmasdan publish yoki delete qilmaslik. D diskdagi eski nusxani o‘chirmaslik.

## AGPLv3 o‘tishi

Tanlangan yo‘nalish: tijoriy foydalanish mumkin bo‘lgan, tarmoq orqali ishlatiladigan o‘zgartirilgan versiyadan Corresponding Source taklifini talab qiladigan GNU AGPLv3. Reja uchun tavsiya etiladigan aniq identifikator — `AGPL-3.0-only`; `or-later` tanlovi alohida kelishiladi.

Hozir `LICENSE`, `NOTICE`, README, npm/PyPI va paket metadata’si Apache-2.0 deydi. LICENSE o‘zgarmasdan AGPL badge chiqarish noto‘g‘ri bo‘ladi. Shu sabab bu bosqichda Apache amalda qoladi va README rejalashtirilgan o‘tishni alohida belgilaydi.

O‘tish alohida release/PR bilan izchil bajariladi:

- Mualliflik va tashqi hissalar/bog‘liqliklar auditini o‘tkazish. O‘ziga tegishli kodga ruxsatlar bilan uchinchi tomonning Apache/MIT/BSD notices’ini aralashtirmaslik; zarur eski attribution va litsenziya nusxalarini saqlash.
- O‘tish commit/tag chegarasini belgilash. Avval Apache shartlari bilan berilgan nusxalardagi huquqlar orqaga qaytarilmaydi; yangi AGPL release ularni avtomatik AGPL qilmaydi.
- Rasmiy AGPLv3 matnini `LICENSE`ga joylash, `NOTICE`, README, CONTRIBUTING, xavfsizlik hujjatlari, package metadata va artifact paketlashni bir PR’da moslashtirish.
- Tekshiriladigan joylar: `packaging/npm/package.json`, `packaging/pypi/pyproject.toml`, `.goreleaser.yaml`, desktop/package metadata, Docker/Helm/OCI license labels, third-party notices va nashr qilinadigan arxivlar.
- Hosted o‘zgartirilgan versiyadan unga mos Corresponding Source’ni ko‘rinadigan va bepul olish imkonini berish. Tegishli build/install skriptlari va ishlayotgan commitni topish yo‘li rejalashtiriladi. Bu funksional integratsiya keyingi kod bosqichiga tegishli.
- README’da AGPL tijoriy ishni taqiqlamasligini aniq tushuntirish. Oddiy foydalanish, o‘zgartirilgan xizmat va tarqatish shartlarini bir xil deb ko‘rsatmaslik. Tunnel orqali uzatiladigan mustaqil foydalanuvchi ilovasi shunchaki tunnel ishlatgani uchun avtomatik AGPL bo‘lib qolmaydi.
- Logo va `trqsh` nomi uchun alohida brand/trademark yo‘riqnomasini ko‘rib chiqish. Fork yoki tijoratni taqiqlovchi qo‘shimcha shartlarni AGPL matniga qo‘shmaslik.

Asoslar: [GNU AGPL](https://www.gnu.org/licenses/agpl-3.0.html), [GNU litsenziyalar izohi](https://www.gnu.org/licenses/licenses.html), [Apache-2.0, 2 va 4-bo‘limlar](https://www.apache.org/licenses/LICENSE-2.0), [OSI ta’rifi](https://opensource.org/osd). Tashkilot profili joylashuvi: [GitHub hujjati](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile).

## Navbat va yakun mezonlari

1. Hozir: manba tanlandi, README/logo, GitHub draftlari va AGPL o‘tish rejasi alohida `codex/` branchida commit va PR orqali taqdim etiladi. Kod, paketlar, xizmatlar, litsenziya, repo/org sozlamalari yoki VPS o‘zgartirilmaydi.
2. Keyin: mavjud dependency/security o‘zgarishlari tekshirilib, foydalanuvchi ishi sifatida review qilinadi.
3. So‘ng: localhost’dagi mavjud holatni saqlagan holda yuqoridagi qabul testlari va kerakli image rebuild/restart.
4. Alohida PR: AGPL huquq/metadata auditidan so‘ng o‘tish, source-offer va yangi release.
5. Alohida repo/org PR’lari: tayyor README/metadata, branch rules va release manzillarini publish qilish.

Hujjatlar PR’i yangi xizmat ishga tushirilganini, VPS deploy qilinganini yoki repo/org sozlamalari qo‘llanganini anglatmaydi.
