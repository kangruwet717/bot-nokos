const env = require('../config/env');

module.exports = {
  providerBusy:
    'Layanan sedang sibuk.\n\nGagal mengambil nomor dari supplier. Silakan coba beberapa saat lagi atau pilih layanan lain.',
  stockEmpty: (service, country) => `Stok kosong.\n\nLayanan ${service} untuk negara ${country} sedang kosong.`,
  banned: (reason) => `Akun kamu sedang dibatasi.\n\nAlasan: ${reason || '-'}\nSilakan hubungi CS jika ini kesalahan.`,
  tos:
    'Terms of Service\n\nGunakan layanan hanya untuk kebutuhan legal seperti testing, QA, atau verifikasi layanan internal. Dilarang memakai layanan untuk spam, scam, phishing, fraud, bypass ilegal, atau pelanggaran aturan platform pihak ketiga.',
  support: `Bantuan Customer Service\n\nTelegram Admin: ${env.SUPPORT_USERNAME}\nJam layanan: ${env.SUPPORT_HOUR}\n\nSertakan ID user dan screenshot kendala saat menghubungi CS.`
};
