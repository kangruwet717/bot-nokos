# PRD Bot Telegram Virtual OTP Full Button

## 1. Ringkasan Produk

Produk yang akan dibuat adalah bot Telegram berbasis full button/inline keyboard untuk penjualan layanan virtual OTP secara otomatis. Bot digunakan sebagai front-end utama untuk user, sedangkan backend menggunakan Node.js + Express.js untuk mengelola user, saldo, deposit, order, integrasi payment gateway, integrasi supplier, webhook, dan admin operation.

Sistem ini dirancang untuk penggunaan legal seperti testing aplikasi, QA, verifikasi layanan internal, dan kebutuhan lain yang tidak melanggar aturan platform pihak ketiga. Sistem wajib memiliki pembatasan layanan, Terms of Service, logging, anti-abuse, dan kemampuan suspend/ban user.

## 2. Tujuan Produk

### 2.1 Tujuan Utama

1. Membuat bot Telegram full button seperti contoh pada gambar.
2. User dapat deposit saldo otomatis melalui payment gateway JagoPay.
3. User dapat membeli nomor virtual/OTP dari supplier melalui API provider.
4. Saldo user otomatis terpotong saat order berhasil dibuat.
5. User dapat melihat nomor, status order, OTP masuk, histori order, dan histori deposit.
6. Admin dapat mengelola user, saldo, markup harga, layanan aktif, broadcast, refund, dan laporan transaksi.

### 2.2 Target Pengguna

1. User umum yang membutuhkan layanan nomor virtual untuk kebutuhan legal.
2. Admin/operator bisnis.
3. Customer support.
4. Owner bisnis.

### 2.3 Nilai Bisnis

1. Proses order otomatis 24 jam.
2. Tidak perlu manual mengecek pembayaran.
3. Tidak perlu manual mengambil nomor dari supplier.
4. Bisa menambahkan markup harga per layanan/negara.
5. Bisa dikembangkan menjadi multi-supplier di kemudian hari.

## 3. Batasan dan Kepatuhan

### 3.1 Batasan Penggunaan

Sistem tidak boleh diposisikan untuk:

1. Membypass verifikasi akun secara ilegal.
2. Membuat akun massal untuk spam, scam, phishing, atau fraud.
3. Mengakses layanan yang melarang penggunaan nomor virtual.
4. Aktivitas yang melanggar hukum atau kebijakan platform pihak ketiga.

### 3.2 Fitur Kepatuhan Wajib

1. Terms of Service sebelum user melakukan order pertama.
2. Checkbox persetujuan melalui tombol: “Saya Setuju”.
3. Blacklist service tertentu dari dashboard/admin command.
4. Limit order per user.
5. Sistem ban/suspend user.
6. Log semua transaksi, request, response provider, webhook payment, dan perubahan saldo.
7. Refund hanya mengikuti status dari provider dan aturan bisnis.
8. Admin dapat melihat aktivitas user yang mencurigakan.

## 4. Ruang Lingkup MVP

### 4.1 Fitur MVP

1. Bot Telegram full button.
2. Registrasi otomatis saat user `/start`.
3. Menu utama.
4. Deposit saldo via JagoPay.
5. Webhook pembayaran sukses.
6. Saldo otomatis bertambah.
7. Pilih layanan OTP.
8. Pilih negara.
9. Cek harga dan stok dari provider.
10. Order nomor.
11. Cek status OTP.
12. Batalkan order jika belum menerima OTP dan provider mengizinkan.
13. Histori order.
14. Histori deposit.
15. Admin command dasar.
16. Logging dan audit saldo.

### 4.2 Fitur Setelah MVP

1. Referral system.
2. Voucher/promo code.
3. Multi-supplier routing.
4. Dashboard web admin.
5. Statistik profit harian/bulanan.
6. Auto broadcast restock.
7. Cache service dan harga.
8. Sistem membership/reseller.
9. Export laporan CSV/Excel.
10. Fraud scoring user.

## 5. User Persona

### 5.1 User/Pembeli

Kebutuhan:

1. Deposit cepat.
2. Harga jelas.
3. Nomor langsung muncul.
4. OTP cepat diterima.
5. Bisa refund jika nomor gagal.
6. Bisa melihat histori transaksi.

### 5.2 Admin

Kebutuhan:

1. Melihat total user.
2. Melihat deposit masuk.
3. Melihat order aktif.
4. Mengatur markup.
5. Menonaktifkan layanan tertentu.
6. Menambah/mengurangi saldo user.
7. Broadcast pesan.
8. Ban user bermasalah.

### 5.3 Owner

Kebutuhan:

1. Melihat omzet.
2. Melihat profit.
3. Melihat biaya provider.
4. Melihat transaksi sukses/gagal.
5. Mengatur strategi harga.
6. Mengelola risiko penyalahgunaan.

## 6. Arsitektur Sistem

### 6.1 Komponen Utama

1. Telegram Bot
   - Menggunakan Telegraf.js.
   - Menampilkan menu full button.
   - Mengirim notifikasi user.

2. Backend API
   - Menggunakan Node.js + Express.js.
   - Mengelola polling mutasi JagoPay.
   - Mengelola webhook/polling provider jika tersedia.
   - Menyediakan health check.

3. Database
   - Disarankan PostgreSQL.
   - Menyimpan user, saldo, deposit, order, provider log, audit saldo, dan setting.

4. Cache/Queue
   - Disarankan Redis.
   - Menyimpan session user, cache harga/stok, rate limit, dan job polling OTP.

5. Payment Gateway
   - JagoPay untuk QRIS/payment channel.
   - Webhook digunakan untuk update status deposit.

6. Provider OTP
   - Supplier API seperti SmsBower.
   - Dibungkus dalam provider adapter agar mudah diganti/ditambah supplier.

7. Worker
   - Memproses polling status OTP.
   - Memproses timeout order.
   - Memproses refund otomatis jika sesuai aturan.

### 6.2 Diagram Alur Sederhana

```text
User Telegram
   ↓
Telegram Bot / Telegraf
   ↓
Node.js + Express.js Backend
   ↓
Database PostgreSQL
   ↓
Redis / Queue Worker
   ↓                ↓
JagoPay QRIS       Provider OTP API
   ↓                ↓
Webhook          Polling/Webhook OTP
   ↓                ↓
Update Saldo     Update Order
   ↓                ↓
Notifikasi Telegram User
```

## 7. Teknologi yang Digunakan

### 7.1 Backend

1. Node.js LTS.
2. Express.js.
3. Telegraf.js.
4. Axios atau undici untuk HTTP client.
5. Prisma ORM.
6. PostgreSQL.
7. Redis.
8. BullMQ untuk queue worker.
9. PM2 untuk process manager.
10. Nginx sebagai reverse proxy.
11. SSL HTTPS.

### 7.2 Development Tools

1. Git.
2. GitHub/GitLab.
3. Docker optional.
4. Postman/Insomnia untuk testing API.
5. ESLint + Prettier.
6. Jest/Vitest untuk unit test.

### 7.3 Infrastruktur Minimal

1. VPS 1 core CPU, 1-2 GB RAM untuk MVP.
2. Domain aktif.
3. SSL certificate.
4. PostgreSQL.
5. Redis.
6. Backup otomatis database.

## 8. Struktur Menu Bot

### 8.1 Menu Utama

Tampilan awal setelah `/start`:

```text
Halo {first_name} 👋
{tanggal_jam}

👤 User Info:
- ID: {telegram_id}
- Saldo: Rp {balance}

🤖 BOT Stats:
- Total User: {total_user}

Silakan pilih menu di bawah ini:
```

Button:

```text
[📲 Order OTP]
[💳 Deposit Saldo] [🤝 Undang Teman]
[📦 Histori Order] [💰 Histori Depo]
[📖 Cara Pakai] [☎️ Bantuan CS]
```

### 8.2 Menu Order OTP

Button awal:

```text
[🇮🇩 Indonesia]
[🇺🇸 United States]
[🇬🇧 United Kingdom]
[🌍 Negara Lainnya]
[⬅️ Kembali]
```

Setelah pilih negara:

```text
[WhatsApp]
[Telegram]
[Google]
[TikTok]
[Shopee]
[Service Lainnya]
[⬅️ Kembali]
```

Setelah pilih layanan:

```text
Layanan: WhatsApp
Negara: Indonesia
Harga: Rp {sell_price}
Stok: {stock}

Lanjut order?

[✅ Order Sekarang]
[🔄 Refresh Stok]
[⬅️ Kembali]
```

Setelah order berhasil:

```text
✅ Order berhasil dibuat

Layanan: {service_name}
Negara: {country_name}
Nomor: {phone_number}
Harga: Rp {sell_price}
Status: Menunggu OTP

[🔄 Cek OTP]
[❌ Batalkan]
[✅ Selesai]
[⬅️ Menu Utama]
```

Jika OTP masuk:

```text
✅ OTP diterima

Nomor: {phone_number}
Kode OTP: {otp_code}
Pesan: {sms_text}

[✅ Selesai]
[📲 Order Lagi]
[⬅️ Menu Utama]
```

### 8.3 Menu Deposit

```text
💳 Deposit Saldo

Pilih nominal deposit:

[Rp10.000] [Rp25.000]
[Rp50.000] [Rp100.000]
[Rp250.000] [Rp500.000]
[✏️ Nominal Custom]
[⬅️ Kembali]
```

Setelah invoice dibuat:

```text
✅ Invoice deposit dibuat

Reference: {reference}
Nominal: Rp {amount}
Fee: Rp {fee}
Total Bayar: Rp {total_amount}
Status: Menunggu Pembayaran
Expired: {expired_at}

Silakan bayar menggunakan QRIS/payment link di bawah.

[🔄 Cek Status]
[❌ Batalkan Invoice]
[⬅️ Menu Utama]
```

Setelah pembayaran sukses:

```text
✅ Deposit berhasil

Nominal masuk: Rp {amount}
Saldo sekarang: Rp {balance}
Reference: {reference}
```

### 8.4 Menu Histori Order

```text
📦 Histori Order

1. {date} - {service} - {country} - Rp {price} - {status}
2. {date} - {service} - {country} - Rp {price} - {status}

[⬅️ Prev] [Next ➡️]
[⬅️ Menu Utama]
```

### 8.5 Menu Histori Deposit

```text
💰 Histori Deposit

1. {date} - Rp {amount} - {status}
2. {date} - Rp {amount} - {status}

[⬅️ Prev] [Next ➡️]
[⬅️ Menu Utama]
```

### 8.6 Menu Cara Pakai

Isi:

1. Deposit saldo terlebih dahulu.
2. Pilih negara.
3. Pilih layanan.
4. Pastikan stok tersedia.
5. Klik order.
6. Gunakan nomor sesuai kebutuhan legal.
7. Tunggu OTP masuk.
8. Jika gagal dan masih memenuhi aturan refund, klik batalkan.

Button:

```text
[📲 Mulai Order]
[💳 Deposit]
[⬅️ Menu Utama]
```

### 8.7 Menu Bantuan CS

```text
☎️ Bantuan Customer Service

Telegram Admin: {admin_username}
Jam layanan: {support_hour}

Sertakan ID user dan screenshot kendala saat menghubungi CS.

[Hubungi CS]
[⬅️ Menu Utama]
```

## 9. Functional Requirements

## 9.1 User Management

### FR-USER-001 Registrasi Otomatis

Saat user menjalankan `/start`, sistem harus:

1. Mengecek apakah `telegram_id` sudah ada di database.
2. Jika belum ada, buat data user baru.
3. Jika sudah ada, update nama/username terbaru.
4. Tampilkan menu utama.

Acceptance Criteria:

1. User baru berhasil tersimpan.
2. User lama tidak dibuat duplikat.
3. Saldo awal user adalah Rp0.
4. User banned tidak dapat mengakses menu order/deposit.

### FR-USER-002 Profil User

Sistem harus menampilkan:

1. Telegram ID.
2. Nama user.
3. Username jika tersedia.
4. Saldo.
5. Status akun.
6. Tanggal daftar.

### FR-USER-003 Ban/Suspend User

Admin dapat melakukan ban/unban user.

Jika user banned:

1. Tidak bisa order.
2. Tidak bisa deposit.
3. Tetap bisa melihat pesan bahwa akun dibatasi.
4. Diarahkan ke CS.

## 9.2 Saldo dan Wallet

### FR-WALLET-001 Saldo User

Sistem harus menyimpan saldo user dalam satuan integer rupiah.

Aturan:

1. Saldo tidak boleh minus.
2. Semua perubahan saldo wajib masuk audit log.
3. Perubahan saldo harus atomic menggunakan database transaction.
4. Deposit sukses menambah saldo.
5. Order sukses mengurangi saldo.
6. Refund menambah saldo.
7. Manual adjustment admin masuk audit log.

### FR-WALLET-002 Audit Saldo

Setiap perubahan saldo harus menyimpan:

1. User ID.
2. Tipe transaksi: deposit, order, refund, admin_add, admin_deduct.
3. Nominal perubahan.
4. Saldo sebelum.
5. Saldo sesudah.
6. Reference ID.
7. Admin ID jika manual.
8. Timestamp.

## 9.3 Deposit JagoPay

### FR-DEPOSIT-001 Buat Invoice Deposit

User dapat membuat invoice deposit dengan nominal preset atau custom.

Aturan:

1. Minimal deposit: dapat dikonfigurasi admin.
2. Maksimal deposit: dapat dikonfigurasi admin.
3. Satu user boleh memiliki beberapa invoice, tetapi hanya invoice `PAID` yang menambah saldo.
4. Invoice memiliki expiry time.
5. Reference invoice harus unik.
6. Gunakan idempotency key saat request ke payment gateway.

Acceptance Criteria:

1. Invoice berhasil dibuat.
2. Data invoice tersimpan di tabel `deposits`.
3. User menerima instruksi pembayaran.
4. Jika gagal membuat invoice, user menerima pesan gagal yang jelas.

### FR-DEPOSIT-002 Webhook Pembayaran

Sistem harus melakukan polling mutasi JagoPay.

Proses webhook:

1. Validasi signature webhook jika tersedia.
2. Validasi timestamp untuk mencegah replay attack.
3. Cari deposit berdasarkan reference/payment ID.
4. Jika status sudah diproses, return success tanpa memproses ulang.
5. Jika status payment sukses, update deposit menjadi `PAID`.
6. Tambahkan saldo user menggunakan transaction.
7. Tulis audit saldo.
8. Kirim notifikasi Telegram ke user.

Acceptance Criteria:

1. Webhook sukses menambah saldo hanya sekali.
2. Webhook duplikat tidak menggandakan saldo.
3. Webhook invalid ditolak.
4. Semua webhook tersimpan di log.

### FR-DEPOSIT-003 Cek Status Deposit

User dapat menekan tombol cek status.

Sistem akan:

1. Cek status deposit di database.
2. Jika perlu, cek ke API payment gateway.
3. Tampilkan status terbaru.

Status deposit:

1. `PENDING`
2. `PAID`
3. `EXPIRED`
4. `FAILED`
5. `CANCELLED`

## 9.4 Order OTP

### FR-ORDER-001 Pilih Negara

Sistem harus menampilkan daftar negara yang aktif.

Sumber data:

1. Cache dari provider.
2. Database lokal untuk override nama/flag/status aktif.

Acceptance Criteria:

1. Hanya negara aktif yang muncul.
2. Admin dapat menonaktifkan negara.
3. Negara ditampilkan dengan pagination jika terlalu banyak.

### FR-ORDER-002 Pilih Layanan

Sistem harus menampilkan daftar layanan aktif.

Aturan:

1. Service yang di-blacklist tidak ditampilkan.
2. Service bisa dikategorikan populer dan lainnya.
3. Service memiliki nama lokal, kode provider, dan status aktif.

### FR-ORDER-003 Cek Harga dan Stok

Setelah user memilih negara dan layanan, sistem harus:

1. Mengecek harga modal dari provider.
2. Mengecek stok jika API mendukung.
3. Menghitung harga jual menggunakan markup.
4. Menampilkan harga jual ke user.

Aturan markup:

1. Markup flat: harga modal + nominal tetap.
2. Markup persen: harga modal + persentase.
3. Markup minimum: harga jual tidak boleh di bawah minimal profit.
4. Pembulatan harga ke atas, misalnya kelipatan Rp100/Rp500.

Acceptance Criteria:

1. Harga tampil sesuai rumus markup.
2. Jika provider error, tampilkan pesan gagal.
3. Jika stok kosong, tombol order tidak tersedia.

### FR-ORDER-004 Membuat Order

Saat user klik “Order Sekarang”, sistem harus:

1. Validasi user tidak banned.
2. Validasi user sudah menyetujui Terms of Service.
3. Validasi saldo cukup.
4. Validasi limit order user.
5. Cek ulang harga/stok provider.
6. Buat order ke provider.
7. Jika provider berhasil memberikan nomor, potong saldo user.
8. Simpan order ke database.
9. Tampilkan nomor ke user.
10. Buat job polling OTP.

Catatan transaction:

1. Potong saldo dan simpan order harus atomic.
2. Jika provider berhasil tetapi database gagal, sistem harus mencatat error untuk manual recovery.
3. Jika provider gagal, saldo tidak boleh dipotong.

Status order:

1. `PENDING_PROVIDER`
2. `WAITING_SMS`
3. `SMS_RECEIVED`
4. `COMPLETED`
5. `CANCELLED`
6. `REFUNDED`
7. `EXPIRED`
8. `FAILED`

### FR-ORDER-005 Cek OTP

Sistem harus menyediakan tombol “Cek OTP”.

Saat ditekan:

1. Cek status order di database.
2. Jika belum ada OTP, cek ke provider.
3. Jika OTP tersedia, update order.
4. Kirim kode OTP ke user.
5. Jika masih menunggu, tampilkan pesan menunggu.

### FR-ORDER-006 Polling Otomatis OTP

Worker harus mengecek order aktif secara berkala.

Aturan polling:

1. Polling setiap 5-15 detik untuk order aktif.
2. Stop polling jika status final.
3. Timeout sesuai aturan provider/setting admin.
4. Simpan semua response provider penting di log.

### FR-ORDER-007 Batalkan Order

User dapat membatalkan order jika:

1. OTP belum diterima.
2. Status provider mengizinkan cancel.
3. Belum melewati batas waktu cancel.
4. Order belum final.

Proses cancel:

1. Kirim request cancel ke provider.
2. Jika provider menerima cancel, update order `CANCELLED`.
3. Refund saldo user sesuai aturan.
4. Tulis audit saldo.
5. Kirim notifikasi ke user.

Jika provider menolak cancel:

1. Tampilkan alasan umum.
2. Order tetap aktif.

### FR-ORDER-008 Selesaikan Order

User dapat klik “Selesai” setelah OTP diterima.

Proses:

1. Update status provider menjadi selesai jika API mendukung.
2. Update order menjadi `COMPLETED`.
3. Stop polling.
4. Tampilkan ringkasan.

## 9.5 Histori

### FR-HISTORY-001 Histori Order

User dapat melihat histori order dengan pagination.

Data yang ditampilkan:

1. Tanggal.
2. Layanan.
3. Negara.
4. Nomor masking sebagian.
5. Harga.
6. Status.

### FR-HISTORY-002 Detail Order

User dapat melihat detail order:

1. Order ID.
2. Layanan.
3. Negara.
4. Nomor.
5. OTP jika sudah masuk.
6. Harga.
7. Status.
8. Waktu order.
9. Waktu selesai.

### FR-HISTORY-003 Histori Deposit

User dapat melihat deposit:

1. Reference.
2. Nominal.
3. Status.
4. Tanggal dibuat.
5. Tanggal dibayar.

## 9.6 Referral

Fitur referral boleh masuk fase 2.

Konsep:

1. Setiap user memiliki referral code.
2. User baru yang join via link referral tercatat sebagai referral.
3. Komisi diberikan setelah referral melakukan order sukses.
4. Persentase komisi dapat dikonfigurasi admin.

Status MVP:

1. Button “Undang Teman” boleh ditampilkan.
2. Isi awal hanya link referral dan status “fitur komisi segera hadir” atau langsung implement basic referral tanpa komisi.

## 9.7 Admin Command

### FR-ADMIN-001 Menu Admin

Command:

```text
/admin
```

Menampilkan:

1. Total user.
2. Total saldo beredar.
3. Deposit hari ini.
4. Order hari ini.
5. Profit estimasi hari ini.
6. Order aktif.
7. Provider balance.

Button admin:

```text
[👥 Users]
[💰 Deposits]
[📦 Orders]
[⚙️ Settings]
[📢 Broadcast]
[📊 Report]
```

### FR-ADMIN-002 Tambah Saldo

Command:

```text
/addsaldo {telegram_id} {nominal} {catatan}
```

Aturan:

1. Hanya admin yang diizinkan.
2. Masuk audit saldo.
3. User mendapat notifikasi.

### FR-ADMIN-003 Kurangi Saldo

Command:

```text
/minsaldo {telegram_id} {nominal} {catatan}
```

Aturan:

1. Saldo tidak boleh minus kecuali setting khusus mengizinkan.
2. Masuk audit saldo.
3. User mendapat notifikasi.

### FR-ADMIN-004 Ban/Unban User

Command:

```text
/ban {telegram_id} {reason}
/unban {telegram_id}
```

### FR-ADMIN-005 Broadcast

Command:

```text
/broadcast {pesan}
```

Aturan:

1. Broadcast dikirim bertahap agar tidak terkena limit Telegram.
2. Simpan jumlah sukses/gagal.
3. User yang block bot ditandai.

### FR-ADMIN-006 Set Markup

Command:

```text
/setmarkup {service_code} {type} {value}
```

Contoh:

```text
/setmarkup wa flat 2000
/setmarkup tg percent 25
```

### FR-ADMIN-007 Aktif/Nonaktifkan Service

Command:

```text
/service_off {service_code}
/service_on {service_code}
```

### FR-ADMIN-008 Aktif/Nonaktifkan Negara

Command:

```text
/country_off {country_code}
/country_on {country_code}
```

### FR-ADMIN-009 Laporan

Command:

```text
/report today
/report month
```

Data laporan:

1. Total deposit paid.
2. Total order sukses.
3. Total refund.
4. Total revenue.
5. Total provider cost.
6. Gross profit.
7. Top service.
8. Top country.

## 10. Non-Functional Requirements

## 10.1 Performance

1. Response button bot maksimal 2 detik untuk menu lokal.
2. Response yang membutuhkan API provider maksimal 10 detik.
3. Cache daftar service/negara minimal 5-30 menit.
4. Bot mampu menangani minimal 100-500 user aktif untuk MVP.

## 10.2 Reliability

1. Sistem tidak boleh menggandakan saldo akibat webhook duplikat.
2. Sistem tidak boleh memotong saldo jika order provider gagal.
3. Worker polling harus dapat resume setelah server restart.
4. Semua job aktif tersimpan di database/queue.

## 10.3 Security

1. API key disimpan di `.env`, bukan hardcode.
2. Webhook harus menggunakan HTTPS.
3. Validasi signature webhook payment.
4. Validasi payload webhook.
5. Gunakan rate limiting.
6. Admin command hanya untuk Telegram ID terdaftar.
7. Database backup terenkripsi jika memungkinkan.
8. Jangan tampilkan API response mentah ke user.
9. Log tidak boleh menyimpan API key.
10. Gunakan idempotency untuk transaksi payment dan saldo.

## 10.4 Observability

Sistem harus memiliki logging untuk:

1. User register.
2. Deposit created.
3. Payment webhook received.
4. Balance updated.
5. Order created.
6. Provider request/response.
7. OTP received.
8. Cancel/refund.
9. Admin action.
10. Error dan exception.

Level log:

1. INFO.
2. WARN.
3. ERROR.
4. DEBUG hanya untuk development.

## 10.5 Backup

1. Backup database minimal 1x sehari.
2. Simpan backup minimal 7-30 hari.
3. Siapkan prosedur restore.
4. Export transaksi penting secara berkala.

## 11. Data Model

## 11.1 users

```text
id                  UUID / BIGSERIAL
telegram_id         BIGINT UNIQUE
username            VARCHAR NULL
first_name          VARCHAR NULL
last_name           VARCHAR NULL
balance             BIGINT DEFAULT 0
is_banned           BOOLEAN DEFAULT false
ban_reason          TEXT NULL
tos_accepted_at     TIMESTAMP NULL
referral_code       VARCHAR UNIQUE NULL
referred_by_user_id UUID NULL
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

## 11.2 deposits

```text
id                  UUID / BIGSERIAL
user_id             FK users.id
reference           VARCHAR UNIQUE
provider_payment_id VARCHAR NULL
method              VARCHAR
amount              BIGINT
fee                 BIGINT DEFAULT 0
total_amount        BIGINT
status              VARCHAR
payment_url         TEXT NULL
qr_string           TEXT NULL
expired_at          TIMESTAMP NULL
paid_at             TIMESTAMP NULL
raw_response        JSONB NULL
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

## 11.3 orders

```text
id                    UUID / BIGSERIAL
user_id               FK users.id
provider              VARCHAR
provider_order_id     VARCHAR
service_code          VARCHAR
service_name          VARCHAR
country_code          VARCHAR
country_name          VARCHAR
phone_number          VARCHAR NULL
provider_cost         BIGINT
sell_price            BIGINT
profit                BIGINT
status                VARCHAR
otp_code              VARCHAR NULL
sms_text              TEXT NULL
cancel_reason         TEXT NULL
started_at            TIMESTAMP
sms_received_at       TIMESTAMP NULL
completed_at          TIMESTAMP NULL
expired_at            TIMESTAMP NULL
created_at            TIMESTAMP
updated_at            TIMESTAMP
```

## 11.4 balance_logs

```text
id                UUID / BIGSERIAL
user_id           FK users.id
type              VARCHAR
amount            BIGINT
balance_before    BIGINT
balance_after     BIGINT
reference_type    VARCHAR
reference_id      VARCHAR
note              TEXT NULL
admin_telegram_id BIGINT NULL
created_at        TIMESTAMP
```

## 11.5 services

```text
id              UUID / BIGSERIAL
provider        VARCHAR
service_code    VARCHAR
service_name    VARCHAR
local_name      VARCHAR
category        VARCHAR NULL
is_active       BOOLEAN DEFAULT true
is_blacklisted  BOOLEAN DEFAULT false
markup_type     VARCHAR DEFAULT 'flat'
markup_value    BIGINT DEFAULT 0
min_profit      BIGINT DEFAULT 0
sort_order      INT DEFAULT 0
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

## 11.6 countries

```text
id              UUID / BIGSERIAL
provider        VARCHAR
country_code    VARCHAR
country_name    VARCHAR
local_name      VARCHAR NULL
flag_emoji      VARCHAR NULL
is_active       BOOLEAN DEFAULT true
sort_order      INT DEFAULT 0
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

## 11.7 provider_logs

```text
id              UUID / BIGSERIAL
provider        VARCHAR
action          VARCHAR
request_payload JSONB NULL
response_body   JSONB NULL
status_code     INT NULL
is_error        BOOLEAN DEFAULT false
error_message   TEXT NULL
related_order_id UUID NULL
created_at      TIMESTAMP
```

## 11.8 webhook_logs

```text
id              UUID / BIGSERIAL
source          VARCHAR
headers         JSONB NULL
payload         JSONB
is_valid        BOOLEAN
processed       BOOLEAN DEFAULT false
error_message   TEXT NULL
created_at      TIMESTAMP
```

## 11.9 settings

```text
id          UUID / BIGSERIAL
key         VARCHAR UNIQUE
value       TEXT
created_at  TIMESTAMP
updated_at  TIMESTAMP
```

## 12. Integrasi Payment Gateway JagoPay

## 12.1 Kebutuhan Integrasi

Backend harus memiliki service `jagopay.service.js` yang bertanggung jawab untuk:

1. Membuat invoice pembayaran.
2. Mengecek status pembayaran jika endpoint tersedia.
3. Memvalidasi webhook.
4. Menangani error response.
5. Menggunakan idempotency key.

## 12.2 Environment Variable

```env
JAGOPAY_BASE_URL=https://jagopay.my.id
JAGOPAY_API_KEY=isi_api_key_jagopay
JAGOPAY_DEFAULT_METHOD=QRIS
JAGOPAY_UNIQUE_CODE_MAX=999
```

## 12.3 Create Payment Flow

```text
User pilih nominal
   ↓
Bot kirim request ke backend service
   ↓
Backend buat reference unik
   ↓
Backend request create payment ke JagoPay
   ↓
Response disimpan ke deposits
   ↓
Bot kirim QR/payment link ke user
   ↓
User membayar
   ↓
Sistem polling mutasi JagoPay
   ↓
Backend validasi dan proses saldo
```

## 12.4 Webhook Handling

Endpoint:

```text
Tidak digunakan; JagoPay memakai polling `qris_mutasi`
```

Rules:

1. Simpan payload ke `webhook_logs`.
2. Validasi signature.
3. Validasi reference.
4. Validasi nominal.
5. Validasi status.
6. Gunakan database transaction.
7. Update deposit.
8. Tambah saldo.
9. Insert balance log.
10. Kirim notifikasi ke user.

## 13. Integrasi Provider OTP

## 13.1 Prinsip Adapter

Agar mudah diganti supplier, provider tidak dipanggil langsung dari handler bot. Semua provider harus melewati `provider.service.js`.

Interface provider:

```text
getBalance()
getCountries()
getServices()
getPrices(service, country)
createActivation(service, country, maxPrice)
checkActivationStatus(activationId)
cancelActivation(activationId)
finishActivation(activationId)
```

## 13.2 Environment Variable

```env
OTP_PROVIDER=smsbower
SMSBOWER_API_KEY=isi_api_key_provider
SMSBOWER_BASE_URL=isi_base_url_resmi_provider
```

## 13.3 Create Activation Flow

```text
User klik Order Sekarang
   ↓
Validasi saldo dan limit
   ↓
Cek ulang harga/stok provider
   ↓
Request create activation ke provider
   ↓
Provider memberi activation ID dan nomor
   ↓
Sistem simpan order
   ↓
Sistem potong saldo
   ↓
Bot tampilkan nomor
   ↓
Worker polling OTP
   ↓
OTP diterima
   ↓
Bot kirim kode OTP ke user
```

## 13.4 Provider Error Handling

Jika provider error:

1. Jangan potong saldo user.
2. Tampilkan pesan “Layanan sedang sibuk, coba beberapa saat lagi.”
3. Simpan error ke `provider_logs`.
4. Jika error berulang, admin mendapat notifikasi.

Jika provider berhasil membuat order tetapi terjadi error internal:

1. Simpan ke recovery log.
2. Admin diberi notifikasi.
3. Sistem mencoba sinkronisasi ulang berdasarkan provider activation ID.

## 14. Pricing dan Profit

## 14.1 Komponen Harga

1. Harga modal provider.
2. Markup flat atau persen.
3. Minimum profit.
4. Pembulatan.
5. Fee payment gateway tidak dibebankan ke order, kecuali strategi bisnis menginginkan.

## 14.2 Formula Harga

Flat:

```text
sell_price = provider_cost + markup_value
```

Percent:

```text
sell_price = provider_cost + (provider_cost * markup_value / 100)
```

Minimum profit:

```text
if sell_price - provider_cost < min_profit:
    sell_price = provider_cost + min_profit
```

Pembulatan:

```text
sell_price = ceil(sell_price / rounding_unit) * rounding_unit
```

## 14.3 Contoh

```text
Provider cost: Rp5.800
Markup flat: Rp2.000
Sell price awal: Rp7.800
Rounding Rp100
Harga jual: Rp7.800
Profit: Rp2.000
```

## 15. Rate Limit dan Anti-Abuse

## 15.1 Limit User

1. Maksimal order aktif per user: 1-3 order.
2. Maksimal order per jam: configurable.
3. Maksimal gagal/cancel per jam: configurable.
4. Maksimal deposit pending: configurable.
5. Delay antar klik order: 3-10 detik.

## 15.2 Deteksi Mencurigakan

Tandai user jika:

1. Banyak order cancel.
2. Banyak order ke service yang sama dalam waktu pendek.
3. Banyak deposit kecil berulang.
4. Banyak gagal payment.
5. Terindikasi spam klik button.

Aksi sistem:

1. Warning.
2. Temporary cooldown.
3. Suspend otomatis.
4. Notifikasi admin.

## 16. API Internal Backend

## 16.1 Health Check

```text
GET /health
```

Response:

```json
{
  "status": "ok",
  "uptime": 12345
}
```

## 16.2 JagoPay Webhook

```text
Tidak digunakan; JagoPay memakai polling `qris_mutasi`
```

## 16.3 Provider Webhook Optional

```text
POST /webhooks/provider/:provider
```

## 16.4 Admin Dashboard API Optional Fase 2

```text
GET /admin/stats
GET /admin/users
GET /admin/orders
GET /admin/deposits
PATCH /admin/services/:id
PATCH /admin/countries/:id
```

## 17. Struktur Folder Project

```text
bot-otp/
├─ src/
│  ├─ app.js
│  ├─ bot.js
│  ├─ server.js
│  ├─ config/
│  │  └─ env.js
│  ├─ bot/
│  │  ├─ handlers/
│  │  │  ├─ start.handler.js
│  │  │  ├─ order.handler.js
│  │  │  ├─ deposit.handler.js
│  │  │  ├─ history.handler.js
│  │  │  └─ admin.handler.js
│  │  ├─ keyboards/
│  │  │  ├─ main.keyboard.js
│  │  │  ├─ order.keyboard.js
│  │  │  ├─ deposit.keyboard.js
│  │  │  └─ admin.keyboard.js
│  │  └─ middlewares/
│  │     ├─ requireUser.js
│  │     ├─ requireAdmin.js
│  │     └─ rateLimit.js
│  ├─ routes/
│  │  ├─ health.route.js
│  │  ├─ provider.webhook.js
│  │  └─ provider.webhook.js
│  ├─ services/
│  │  ├─ user.service.js
│  │  ├─ wallet.service.js
│  │  ├─ deposit.service.js
│  │  ├─ order.service.js
│  │  ├─ pricing.service.js
│  │  ├─ jagopay.service.js
│  │  ├─ provider.service.js
│  │  └─ notification.service.js
│  ├─ providers/
│  │  ├─ base.provider.js
│  │  └─ smsbower.provider.js
│  ├─ workers/
│  │  ├─ otpPolling.worker.js
│  │  └─ broadcast.worker.js
│  ├─ utils/
│  │  ├─ money.js
│  │  ├─ date.js
│  │  ├─ signature.js
│  │  ├─ callbackData.js
│  │  └─ logger.js
│  └─ constants/
│     ├─ orderStatus.js
│     ├─ depositStatus.js
│     └─ messages.js
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ tests/
├─ .env.example
├─ package.json
└─ README.md
```

## 18. Environment Variable Lengkap

```env
NODE_ENV=production
PORT=3000
APP_URL=https://domainkamu.com

BOT_TOKEN=isi_token_bot
BOT_MODE=webhook
TELEGRAM_WEBHOOK_SECRET=isi_secret_webhook_telegram
ADMIN_IDS=123456789,987654321
SUPPORT_USERNAME=@username_cs

DATABASE_URL=postgresql://user:password@localhost:5432/bototp
REDIS_URL=redis://localhost:6379

JAGOPAY_BASE_URL=https://jagopay.my.id
JAGOPAY_API_KEY=isi_api_key_jagopay_JagoPay
JAGOPAY_DEFAULT_METHOD=QRIS
JAGOPAY_UNIQUE_CODE_MAX=999

OTP_PROVIDER=smsbower
SMSBOWER_BASE_URL=isi_base_url_resmi_provider
SMSBOWER_API_KEY=isi_api_key_smsbower

MIN_DEPOSIT=10000
MAX_DEPOSIT=10000000
ORDER_ROUNDING_UNIT=100
DEFAULT_MARKUP_TYPE=flat
DEFAULT_MARKUP_VALUE=2000
DEFAULT_MIN_PROFIT=1000

MAX_ACTIVE_ORDERS_PER_USER=2
MAX_ORDERS_PER_HOUR=10
OTP_POLL_INTERVAL_SECONDS=10
OTP_ORDER_TIMEOUT_MINUTES=20

LOG_LEVEL=info
```

## 19. Callback Data Design

Telegram callback data memiliki batas panjang, jadi gunakan format pendek.

Contoh:

```text
MAIN
ORDER:MENU
ORDER:COUNTRY:{countryCode}:p{page}
ORDER:SERVICE:{countryCode}:{serviceCode}:p{page}
ORDER:CONFIRM:{token}
ORDER:CHECK:{orderId}
ORDER:CANCEL:{orderId}
DEP:MENU
DEP:AMT:{amount}
DEP:CHECK:{depositId}
HIST:ORDER:p{page}
HIST:DEPO:p{page}
ADMIN:MENU
```

Untuk data panjang, gunakan token session di Redis:

```text
ORDER:CONFIRM:abc123
```

Redis menyimpan:

```json
{
  "telegramId": 123456,
  "countryCode": "id",
  "serviceCode": "wa",
  "price": 7800,
  "expiresAt": "..."
}
```

## 20. Error Message Standard

### 20.1 Error Saldo Tidak Cukup

```text
❌ Saldo tidak cukup

Harga layanan: Rp {price}
Saldo kamu: Rp {balance}
Kekurangan: Rp {shortage}

Silakan deposit terlebih dahulu.
```

Button:

```text
[💳 Deposit Saldo]
[⬅️ Kembali]
```

### 20.2 Error Provider

```text
⚠️ Layanan sedang sibuk

Gagal mengambil nomor dari supplier. Silakan coba beberapa saat lagi atau pilih layanan lain.
```

### 20.3 Error Stok Kosong

```text
❌ Stok kosong

Layanan {service_name} untuk negara {country_name} sedang kosong.
Silakan refresh stok atau pilih negara lain.
```

### 20.4 Error Banned

```text
⛔ Akun kamu sedang dibatasi

Alasan: {reason}
Silakan hubungi CS jika ini kesalahan.
```

## 21. Testing Plan

## 21.1 Unit Test

Test service:

1. Pricing calculation.
2. Wallet debit/credit.
3. Deposit webhook idempotency.
4. Order status transition.
5. Callback data parser.
6. Provider adapter parser.

## 21.2 Integration Test

1. Create deposit invoice.
2. Simulasi webhook paid.
3. Saldo bertambah sekali walau webhook dikirim dua kali.
4. Create order sukses.
5. Order gagal tidak memotong saldo.
6. Cancel order melakukan refund.
7. OTP polling update status.

## 21.3 Manual Test Bot

Checklist:

1. `/start` user baru.
2. Klik semua menu utama.
3. Deposit nominal preset.
4. Deposit custom.
5. Simulasi payment sukses.
6. Order layanan stok tersedia.
7. Order layanan stok kosong.
8. Saldo tidak cukup.
9. Cek OTP.
10. Cancel order.
11. Histori order.
12. Histori deposit.
13. Admin add saldo.
14. Admin ban user.
15. Broadcast.

## 22. Deployment Plan

## 22.1 Persiapan Server

1. Siapkan VPS.
2. Install Node.js LTS.
3. Install PostgreSQL.
4. Install Redis.
5. Install Nginx.
6. Install PM2.
7. Setup domain dan SSL.

## 22.2 Deploy Backend

1. Clone repository.
2. Buat `.env`.
3. Install dependency.
4. Run Prisma migration.
5. Build jika menggunakan TypeScript.
6. Jalankan aplikasi dengan PM2.
7. Set webhook Telegram.
8. Pastikan polling mutasi JagoPay berjalan di server production.
9. Test `/health`.
10. Test `/start` bot.

## 22.3 Monitoring Production

1. PM2 status.
2. Log error.
3. Database storage.
4. Redis memory.
5. Provider balance.
6. Payment webhook success rate.
7. Order success rate.

## 23. Milestone Implementasi

## 23.1 Sprint 1 - Fondasi Project

Durasi estimasi: 2-4 hari.

Deliverables:

1. Setup project Node.js + Express.
2. Setup Telegraf bot.
3. Setup Prisma + PostgreSQL.
4. Setup Redis.
5. Model database awal.
6. `/start` dan menu utama.
7. Middleware user registration.
8. Middleware admin.

## 23.2 Sprint 2 - Deposit JagoPay

Durasi estimasi: 3-5 hari.

Deliverables:

1. Menu deposit.
2. Create invoice.
3. Simpan deposit.
4. Webhook payment.
5. Update saldo.
6. Audit saldo.
7. Histori deposit.
8. Cek status deposit.

## 23.3 Sprint 3 - Provider OTP

Durasi estimasi: 4-7 hari.

Deliverables:

1. Provider adapter.
2. Get balance provider.
3. Get countries.
4. Get services.
5. Get price/stock.
6. Create activation.
7. Check OTP status.
8. Cancel activation.
9. Finish activation.

## 23.4 Sprint 4 - Order Flow

Durasi estimasi: 4-7 hari.

Deliverables:

1. Pilih negara.
2. Pilih layanan.
3. Konfirmasi harga.
4. Validasi saldo.
5. Create order.
6. Potong saldo.
7. Polling OTP.
8. Cek OTP manual.
9. Cancel/refund.
10. Histori order.

## 23.5 Sprint 5 - Admin dan Anti-Abuse

Durasi estimasi: 3-5 hari.

Deliverables:

1. Admin menu.
2. Add/min saldo.
3. Ban/unban.
4. Broadcast.
5. Set markup.
6. Service/country on/off.
7. Limit order.
8. Provider error alert.

## 23.6 Sprint 6 - Production Hardening

Durasi estimasi: 3-5 hari.

Deliverables:

1. Logging rapi.
2. Backup database.
3. Rate limit.
4. Webhook security.
5. Error handling.
6. Testing end-to-end.
7. Deployment VPS.
8. Dokumentasi operasional.

## 24. Risiko dan Mitigasi

## 24.1 Risiko Penyalahgunaan

Risiko:

User memakai layanan untuk aktivitas ilegal.

Mitigasi:

1. Terms of Service.
2. Blacklist layanan.
3. Limit order.
4. Ban user.
5. Audit log.
6. Manual review untuk pola mencurigakan.

## 24.2 Risiko Provider Down

Risiko:

Supplier error, stok kosong, harga berubah.

Mitigasi:

1. Cache pendek.
2. Retry terbatas.
3. Multi-supplier fase 2.
4. Notifikasi admin saat error tinggi.
5. Harga dicek ulang sebelum order.

## 24.3 Risiko Webhook Duplikat

Risiko:

Saldo user bertambah dua kali.

Mitigasi:

1. Reference unik.
2. Status deposit dicek sebelum proses.
3. Database transaction.
4. Unique constraint.
5. Webhook log.

## 24.4 Risiko Saldo Minus

Risiko:

Race condition saat user klik order berkali-kali.

Mitigasi:

1. Lock row user saat debit saldo.
2. Transaction database.
3. Redis rate limit.
4. Disable double click melalui session token.

## 24.5 Risiko API Key Bocor

Risiko:

API key provider/payment digunakan pihak lain.

Mitigasi:

1. Simpan di `.env`.
2. Jangan commit `.env`.
3. Rotasi key berkala.
4. Batasi IP webhook jika didukung.
5. Jangan log header rahasia.

## 25. Definition of Done

MVP dianggap selesai jika:

1. User bisa `/start` dan melihat menu utama.
2. User bisa deposit melalui JagoPay.
3. Webhook sukses menambah saldo otomatis.
4. User bisa memilih negara dan layanan.
5. User bisa melihat harga dan stok.
6. User bisa order nomor.
7. Saldo terpotong hanya saat order berhasil.
8. User bisa menerima OTP melalui bot.
9. User bisa cancel/refund sesuai aturan provider.
10. Histori order dan deposit tampil.
11. Admin bisa add/min saldo, ban, broadcast, dan set markup.
12. Sistem aman dari webhook duplikat.
13. Semua transaksi tercatat di audit log.
14. Bot berjalan stabil di VPS dengan PM2/Nginx/SSL.

## 26. Prioritas Implementasi

Urutan pengerjaan paling disarankan:

1. Setup database schema.
2. Setup bot `/start` dan menu utama.
3. Buat user registration.
4. Buat wallet service dan audit saldo.
5. Buat deposit service.
6. Integrasi JagoPay create invoice.
7. Integrasi polling mutasi JagoPay.
8. Buat provider adapter.
9. Buat flow order.
10. Buat worker polling OTP.
11. Buat cancel/refund.
12. Buat histori.
13. Buat admin command.
14. Tambahkan anti-abuse.
15. Deploy production.

## 27. Catatan Implementasi Penting

1. Jangan langsung menghubungkan logic order di file handler bot. Gunakan service layer.
2. Semua transaksi uang harus lewat `wallet.service.js`.
3. Semua perubahan saldo harus memakai database transaction.
4. Semua webhook harus idempotent.
5. Semua callback button yang berisi data penting sebaiknya memakai token session Redis.
6. Jangan menampilkan error mentah dari provider ke user.
7. Pastikan semua status order memiliki transisi yang jelas.
8. Pisahkan harga modal provider dan harga jual user.
9. Siapkan command admin untuk recovery manual.
10. Buat dokumentasi operasional sejak awal.

## 28. Roadmap Fase 2

1. Dashboard admin berbasis web.
2. Multi-provider/supplier.
3. Smart routing berdasarkan harga termurah dan stok terbaik.
4. Referral commission.
5. Reseller panel.
6. API publik untuk reseller.
7. Auto restock notification.
8. Sistem voucher.
9. Export laporan Excel.
10. Fraud detection lebih lengkap.

## 29. Ringkasan MVP Teknis

MVP teknis minimal terdiri dari:

```text
Telegram Bot
+ User registration
+ Wallet balance
+ JagoPay deposit
+ Webhook payment
+ Provider OTP adapter
+ Order OTP
+ Polling OTP
+ Cancel/refund
+ History
+ Admin commands
+ Logging
+ Rate limit
```

Dengan PRD ini, implementasi dapat dimulai dari pembuatan repository, schema database, struktur folder, lalu dilanjutkan ke menu bot, deposit, provider adapter, dan flow order.



