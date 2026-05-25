# Bot Nokos MVP

Node.js + Express + Telegraf MVP untuk bot Telegram virtual OTP dengan deposit JagoPay QRIS dan provider SMSBower.

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Worker OTP dapat dijalankan terpisah:

```bash
npm run worker
```

## Endpoint

- `GET /health`
- `POST /webhooks/provider/smsbower`

## Admin Recovery Commands

- `/deposit_paid reference catatan` menandai deposit pending menjadi paid dan menambah saldo satu kali.
- `/deposit_cancel reference catatan` membatalkan deposit yang belum paid.
- `/deposit_sync reference` sync status deposit dari mutasi JagoPay.
- `/order_refund order_id alasan` refund order non-final ke user.
- `/order_fail order_id alasan` menandai order non-final sebagai failed tanpa refund.
- `/order_complete order_id` menandai order selesai.
- `/order_check order_id` cek status order ke provider.
- `/active_orders` melihat order aktif.
- `/webhook_errors` melihat error webhook terbaru.
- `/provider_errors` melihat error provider terbaru.
- `/finduser telegram_id` melihat ringkasan user.
- `/sync_provider` mengambil ulang daftar negara dan layanan dari SMSBower.
- `/provider_balance` mengecek saldo provider.
- `/setmarkup service_code flat|percent value` mengubah markup satu service.
- `/setprofit service_code nominal` mengubah minimum profit satu service.
- `/setpricing_all flat|percent markup_value min_profit` mengubah pricing semua service.

## Database

Project ini memakai SQLite via Prisma. Tidak perlu membuat database di panel Pterodactyl; database disimpan sebagai file.

```env
DATABASE_URL=file:./data/botnokos.db
```

Dengan path di atas, file database ada di `prisma/data/botnokos.db`. Pastikan file/folder project ikut tersimpan di backup panel. Redis tetap diperlukan untuk session callback, rate limit, dan queue worker.

## Production

Jalankan migrasi lalu start app:

```bash
npm run prisma:deploy
npm start
```

Backup database di Windows PowerShell:

```powershell
.\scripts\backup-db.ps1
```

Restore database:

```powershell
.\scripts\restore-db.ps1 -BackupFile backups\botnokos_YYYYMMDD_HHMMSS.db
```

## Referensi API

- JagoPay: https://jagopay.my.id/
- SMSBower: https://smsbower.app/api/?page=client

## Catatan

Semua perubahan saldo lewat `wallet.service.js` dan dicatat di `balance_logs`.
