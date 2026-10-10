# RuangAI — lisensi chat AI untuk Termux & Cloudflare Workers

RuangAI adalah chat AI ringan untuk browser, Termux, dan Cloudflare Workers. Pengguna memasukkan **key lisensi RuangAI** sebelum menggunakan chat. Admin menerbitkan lisensi setelah memeriksa pembelian secara manual melalui WhatsApp. Semua permintaan AI memakai OpenRouter key admin; **biaya model dibebankan ke akun admin**.

## Hubungi admin

Untuk menanyakan atau membeli lisensi, hubungi admin melalui [WhatsApp](https://wa.me/6281398034284). Nomor ini ditambahkan atas permintaan pemilik repository.

## Hosting Cloudflare gratis

Workers Free menyediakan **100.000 permintaan Worker per hari** dan batas **10 ms CPU per pemanggilan**. Aset statis pada konfigurasi ini tidak dihitung sebagai permintaan Worker. Cloudflare Workers Builds mendukung deployment dari GitHub. Hosting gratis **tidak** membayar pemakaian model OpenRouter. Lihat [batas resmi](https://developers.cloudflare.com/workers/platform/pricing/) dan [panduan integrasi GitHub](https://developers.cloudflare.com/workers/ci-cd/builds/).

1. Di Cloudflare, buka **Workers & Pages → Create application → Import a repository** dan pilih `husein2014123/termux-ai-webserver`.
2. Pastikan root repository dan `wrangler.jsonc` terdeteksi, lalu deploy Worker. Push berikutnya dapat di-deploy otomatis melalui Workers Builds.
3. Di **Settings → Variables and Secrets**, buat empat nilai berikut sebagai **secrets** Cloudflare, bukan variables biasa. Jangan masukkan secret ke GitHub atau chat:
   - `OPENROUTER_API_KEY` — API key OpenRouter admin.
   - `LICENSE_SIGNING_SECRET` — rahasia acak setidaknya 32 byte untuk menandatangani lisensi. Contoh generator lokal: `openssl rand -hex 32`.
   - `ADMIN_PASSWORD` — password admin yang kuat, unik, minimal 16 karakter.
   - `ADMIN_PATH` — path admin privat yang acak. Buat, misalnya, dengan `printf '/manage-%s' "$(openssl rand -hex 20)"`; simpan nilainya sendiri di password manager. Path ini tidak disimpan di source publik.
4. Atur spending limit di akun/key OpenRouter sebelum memberi key kepada siapa pun. Setelah secrets siap, deploy ulang Worker.
5. Catat alamat `*.workers.dev` yang dibuat Cloudflare serta nilai `ADMIN_PATH` secara pribadi. URL panel admin adalah alamat Worker diikuti nilai `ADMIN_PATH`; **jangan publikasikan URL/path tersebut**. Aplikasi dan kode GitHub tidak menampilkan tautan ke panel.

Setelah pembayaran dikonfirmasi lewat WhatsApp, admin membuka panel privat, memilih durasi **1–3650 hari**, membuat key, lalu mengirim key lisensi langsung kepada pembeli. Tidak ada checkout atau pemrosesan pembayaran otomatis.

## Jalankan di Termux

Deploy Worker Cloudflare terlebih dahulu supaya lisensi dan chat memiliki server pusat. Lalu di Termux:

```sh
pkg update -y
pkg install -y git nodejs-lts
git clone https://github.com/husein2014123/termux-ai-webserver.git
cd termux-ai-webserver
export LICENSE_API_URL='https://nama-worker-akun-anda.workers.dev'
npm start
```

Buka `http://127.0.0.1:3000`. Layar awal akan meminta key lisensi, memeriksanya ke Worker, dan membuka chat bila masih berlaku. Key hanya disimpan dalam `sessionStorage` pada tab browser dan dikirim ke Worker melalui HTTPS saat verifikasi/chat. Termux tidak menyimpan OpenRouter key admin. Hentikan server dengan `Ctrl+C`.

Untuk mengganti port: `PORT=3001 npm start`, lalu buka `http://127.0.0.1:3001`. Ganti `nama-worker-akun-anda` dengan alamat Worker Anda. File `.env.example` hanya template; jangan isi lalu commit secret.

## Sifat dan batasan lisensi

Lisensi ditandatangani oleh Worker dan dapat diverifikasi tanpa database. Key adalah bearer: siapa pun yang memilikinya dapat menggunakannya sampai kedaluwarsa, termasuk pada beberapa perangkat. Versi ini **belum dapat mencabut satu key tertentu**. Mengganti `LICENSE_SIGNING_SECRET` membatalkan semua lisensi yang pernah diterbitkan. Simpan password dan path admin dengan aman.

Worker membatasi respons hingga 2.048 token dan menerapkan batas sementara 12 permintaan per menit per lisensi per isolate. Batas laju ini best-effort, bukan kuota billing keras; tetapkan spending limit OpenRouter dan pantau pemakaiannya. Hosting Cloudflare bisa gratis, tetapi model OpenRouter dapat menimbulkan biaya bagi admin.

## Environment

| Nama | Tempat | Kegunaan |
|---|---|---|
| `OPENROUTER_API_KEY` | Cloudflare Secret | API key admin; seluruh penggunaan AI ditagihkan ke akun ini |
| `LICENSE_SIGNING_SECRET` | Cloudflare Secret | Menandatangani dan memverifikasi lisensi |
| `ADMIN_PASSWORD` | Cloudflare Secret | Melindungi pembuatan lisensi |
| `ADMIN_PATH` | Cloudflare Secret | Path admin acak yang harus disimpan privat |
| `LICENSE_API_URL` | Termux | Alamat Worker untuk verifikasi key dan chat |
| `AI_MODEL` | Cloudflare Variable | Model OpenRouter, default `openrouter/auto` |
| `PORT` | Termux | Port lokal, default `3000` |

## Struktur

- `server.js` — server/proxy lokal Termux; tidak menyimpan OpenRouter key admin.
- `cloudflare/worker.js` — penerbit dan validator lisensi, serta chat OpenRouter.
- `cloudflare/admin-ui.js` — panel penerbitan yang dikirim hanya pada `ADMIN_PATH`.
- `public/` — UI chat dan input lisensi.
- `wrangler.jsonc` — konfigurasi Worker Cloudflare.

## Troubleshooting

- **Server lisensi belum dikonfigurasi di Termux** — atur `LICENSE_API_URL` ke alamat Worker yang benar.
- **Key tidak valid/kedaluwarsa** — minta admin memeriksa masa aktif dan menerbitkan key baru.
- **Layanan Worker belum siap** — periksa empat Cloudflare secrets, lalu deploy ulang.
- **OpenRouter menolak permintaan** — periksa saldo/spending limit, akses API, dan slug model.
- **Port sudah dipakai** — jalankan `PORT=3001 npm start`.

## Lisensi

MIT — lihat `LICENSE`.
