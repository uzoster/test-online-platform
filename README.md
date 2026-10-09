# Online Test Platform

O'qituvchi test yaratadi yoki Excel'dan yuklaydi, **havola** oladi va guruhga yuboradi.
Talabalar ro'yxatdan o'tmasdan (faqat ism va familiya bilan) testni topshiradi — savollar har biriga
tasodifiy tartibda beriladi, vaqtni **server** nazorat qiladi, natija avtomatik hisoblanib bazaga yoziladi.

**Texnologiyalar:** HTML5, CSS3, Vanilla JavaScript · Node.js + Express · SQLite · Multer · SheetJS (`xlsx`) · REST API.
Hech qanday frontend framework ishlatilmagan.

## Ishga tushirish

Kerak: **Node.js 18+** (tavsiya: 22 LTS yoki yangiroq).

```bash
npm install
npm start
```

Keyin brauzerda oching: **http://localhost:3000**

Birinchi ishga tushishda o'qituvchi hisobi avtomatik yaratiladi va terminalda chiqadi:

| Email | Parol |
| --- | --- |
| `admin@test.uz` | `admin123` |

Parolni **Sozlamalar** sahifasidan darhol o'zgartiring. Boshqa boshlang'ich ma'lumot uchun:
`ADMIN_EMAIL=... ADMIN_PASSWORD=... npm start` (faqat birinchi ishga tushishda ishlaydi).

### Sozlamalar (muhit o'zgaruvchilari, ixtiyoriy)

| O'zgaruvchi | Ma'nosi | Standart |
| --- | --- | --- |
| `PORT` | Server porti | `3000` |
| `PUBLIC_URL` | Test havolasidagi manzil (masalan, `https://test.maktab.uz`) | so'rovdagi host |
| `SESSION_SECRET` | Sessiya siri | `data/.session-secret` ga avtomatik yoziladi |
| `DATA_DIR` / `DB_FILE` | Baza joylashuvi | `./data/platform.db` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Birinchi o'qituvchi | yuqoridagi jadval |
| `TRUST_PROXY` | Nginx/Cloudflare orqasida bo'lsa `true` | o'chiq |

Havolani boshqa qurilmalardagi talabalarga yuborish uchun serveringiz ularga ko'rinishi (bir tarmoqda yoki internetda)
va `PUBLIC_URL` to'g'ri berilgan bo'lishi kerak (yoki o'qituvchi panelga shu manzil orqali kirsin).

## Foydalanish

1. **Kirish** — bosh sahifada email va parol.
2. **Test yaratish** — nom, fan, guruh, davomiylik, sozlamalar va savollar. *Qoralamani saqlash* yoki *E'lon qilish*.
3. **Excel yuklash** — shablonni yuklab oling, to'ldiring, yuklang, **ko'rib chiqing**, so'ng *Savollarni import qilish*.
4. **E'lon qilingach** noyob havola (`/test/7F82KQ`) paydo bo'ladi — *Havolani nusxalash* tugmasi bilan guruhga yuboring.
5. **Natijalar** — talabalar jadvali, har biri bosilganda savollar bo'yicha batafsil tahlil; Excel'ga eksport.
6. **Tahlil** — har bir savol bo'yicha to'g'ri javoblar foizi, eng qiyin savollar, ball taqsimoti.

### Excel formati

| Question | A | B | C | D | CorrectAnswer |
| --- | --- | --- | --- | --- | --- |
| O'zbekiston qachon mustaqil bo'lgan? | 1989 | 1991 | 1995 | 1992 | B |

- Birinchi qator — sarlavhalar; `CorrectAnswer` faqat `A`, `B`, `C` yoki `D`.
- Faqat `.xlsx`, hajmi 5 MB gacha, 1000 tagacha savol.
- Xatoli qatorlar ko'rib chiqishda ko'rsatiladi (`Qator 7: CorrectAnswer noto'g'ri…`) va import qilinmaydi.

### Test sozlamalari

Savollar tartibi tasodifiy · Variantlar tasodifiy (to'g'ri javob buzilmaydi) · Natijani darhol ko'rsatish ·
To'g'ri javoblarni ko'rsatish · Qayta topshirishga ruxsat. Shuningdek "talabaga beriladigan savollar soni" —
banka ichidan shuncha savol tasodifiy tanlanadi.

## Loyiha tuzilishi

```
server/        server.js, database.js, routes/, controllers/, middleware/, lib/
public/        index.html (kirish), teacher.html, tests.html, create-test.html, upload-test.html,
               results.html, analytics.html, settings.html, student-test.html (talaba: kirish → test → natija)
  css/         style.css (umumiy), dashboard.css (panel), test.css (talaba)
  js/          common.js (API, modal, toast), auth.js, dashboard.js, tests.js, create-test.js,
               upload-test.js, results.js, analytics.js, settings.js, student-test.js
test/          backend.test.js
```

## REST API

Himoyalangan (o'qituvchi sessiyasi kerak): `POST /api/auth/login` (ochiq), `GET /api/auth/me`, `PUT /api/auth/profile`,
`GET|POST /api/tests`, `GET|PUT|DELETE /api/tests/:id`, `POST /api/tests/:id/questions`, `POST /api/tests/upload` (preview),
`GET /api/tests/template`, `POST /api/tests/:id/publish|unpublish`, `GET /api/tests/:id/results`, `GET /api/tests/:id/results/export`,
`GET /api/tests/:id/analytics`, `GET|DELETE /api/attempts/:id`, `GET /api/stats`.

Ochiq (talaba, test kodi + urinish tokeni): `GET /api/test/:code`, `POST /api/test/:code/start`, `POST …/resume`,
`PUT …/answer`, `POST …/submit`, `GET …/result`.

## Xavfsizlik

- O'qituvchi API'lari sessiya bilan himoyalangan, parollar `scrypt` bilan xeshlanadi, login'ga so'rov limiti qo'yilgan.
- **To'g'ri javoblar test davomida studentga yuborilmaydi.** Variantlar aralashtirilganda ham javob server tomonida
  asl harfga qaytariladi va baholanadi.
- Vaqt **serverda** tekshiriladi (boshlanish vaqti bazada). Sahifa yangilansa taymer qayta boshlanmaydi.
  Muddati o'tgan urinishlar server tomonidan avtomatik yakunlanadi.
- Qayta topshirish bloklangan (ruxsat berilmagan bo'lsa, shu ism-familiya ham qayta boshlay olmaydi).
- Fayl yuklashda faqat `.xlsx`, 5 MB limit, fayl tarkibi ham tekshiriladi. CSP sarlavhalari yoqilgan.

## Testlar

```bash
npm test
```

## Muammolar

- **`better-sqlite3` o'rnatilmasa** (masalan, Windows'da kompilyator yo'q): u ixtiyoriy bog'liqlik. Node.js **22.5+** bo'lsa,
  loyiha avtomatik Node'ning o'rnatilgan SQLite modulidan foydalanadi (ogohlantirish chiqishi normal). Aks holda
  Node.js'ni yangilang yoki C++ build tools o'rnating.
- **Port band** — `PORT=3001 npm start`.
- Ma'lumotlarni tozalash — `data/` papkasini o'chiring (barcha testlar va natijalar yo'qoladi).
