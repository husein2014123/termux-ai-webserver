# RuangAI — OpenRouter chat untuk Termux & Cloudflare Workers

Aplikasi chat AI Node.js ringan, dapat dijalankan lokal di Termux atau di-deploy sebagai Worker publik di Cloudflare. Login dengan satu kata sandi bersama diwajibkan. Kata sandi dan API key disimpan sebagai rahasia server dan tidak diletakkan di kode browser atau GitHub.

## Hosting gratis dengan Cloudflare Workers

Cloudflare Workers Free saat ini mencakup **100.000 permintaan Worker per hari** dengan **10 ms CPU per pemanggilan**; permintaan aset statis tidak dibatasi/ditagihkan sebagai request Worker. Cloudflare Workers Builds dapat menghubungkan GitHub dan melakukan deployment otomatis setiap kali ada perubahan. Lihat [harga dan batas resmi](https://developers.cloudflare.com/workers/platform/pricing/) serta [panduan GitHub Builds](https://developers.cloudflare.com/workers/ci-cd/builds/). Kuota gratis berlaku untuk hosting, bukan pemakaian model OpenRouter.

Konfigurasi [`wrangler.jsonc`](wrangler.jsonc) dan backend [`cloudflare/worker.js`](cloudflare/worker.js) sudah disiapkan.

1. Buat atau masuk ke akun Cloudflare, kemudian buka **Workers & Pages → Create application → Get started → Import a repository**.
2. Hubungkan GitHub dan pilih repository `husein2014123/termux-ai-webserver`.
3. Pastikan root repository dan konfigurasi `wrangler.jsonc` terdeteksi, lalu pilih **Save and Deploy**. Wrangler config menunjuk ke file Worker serta folder `public/`.
4. Setelah Worker dibuat, buka **Settings → Variables and Secrets** (nama bagian dapat berubah), lalu tambahkan dua nilai berikut sebagai **secret**:
   - `APP_PASSWORD` — pilih kata sandi yang panjang dan unik, lalu bagikan hanya kepada orang yang Anda izinkan.
   - `OPENROUTER_API_KEY` — API key dari [OpenRouter Keys](https://openrouter.ai/keys).
5. Deploy ulang atau restart Worker. Buka alamat `*.workers.dev` yang diberikan Cloudflare dan login dengan `APP_PASSWORD`.

Jika dashboard meminta pengaturan build, gunakan perintah deployment `npx wrangler deploy`. Jangan menambahkan nilai secret ke `wrangler.jsonc`, `.env.example`, perintah shell yang akan disimpan, atau commit GitHub.

### Perlindungan dan biaya

Password adalah **satu kata sandi bersama**, bukan akun berbeda untuk tiap pengguna. Siapa pun yang mengetahui password dapat memakai API OpenRouter milik Anda. Login membatasi upaya masuk (5 kegagalan per alamat IP tiap 15 menit), tetapi limit ini best-effort pada memori Worker dan bukan perlindungan kuota yang kuat. Tetapkan spending limit di OpenRouter, jaga password, dan ganti bila bocor. Trafik chat OpenRouter dapat berbiaya walaupun hosting Worker gratis.

## Jalankan lokal di Termux

```sh
pkg update -y
pkg install -y git nodejs-lts
git clone https://github.com/husein2014123/termux-ai-webserver.git
cd termux-ai-webserver
export APP_PASSWORD='kata-sandi-kuat-anda'
export OPENROUTER_API_KEY='isi-api-key-openrouter-anda'
export AI_PROVIDER='openrouter'
export AI_MODEL='openrouter/auto'
node server.js
```

Buka `http://127.0.0.1:3000`, masuk dengan password tersebut, lalu gunakan chat. Tidak perlu `npm install` untuk Termux. Hentikan server dengan `Ctrl+C`.

Agar tidak mengetik key tiap kali, simpan perintah `export` di file `~/.ruangai-env` di luar repository, lindungi dengan `chmod 600 ~/.ruangai-env`, lalu jalankan `source ~/.ruangai-env` sebelum `node server.js`.

## Model dan API

`openrouter/auto` menyerahkan pemilihan model ke router OpenRouter. Untuk memilih model sendiri, atur `AI_MODEL` ke slug yang tersedia di [katalog OpenRouter](https://openrouter.ai/models). Biaya penggunaan model mengikuti penyedia dan saldo akun OpenRouter.

Mode OpenAI langsung tetap tersedia: atur `AI_PROVIDER=openai`, `OPENAI_API_KEY`, dan bila perlu `AI_BASE_URL`/`AI_MODEL` pada environment server.

## Environment variables

| Variabel | Default | Keterangan |
|---|---|---|
| `APP_PASSWORD` | wajib | Kata sandi bersama; wajib diatur untuk server lokal maupun Worker |
| `OPENROUTER_API_KEY` | — | Rahasia untuk backend OpenRouter |
| `AI_PROVIDER` | otomatis | `openrouter` atau `openai` |
| `AI_MODEL` | `openrouter/auto` atau `gpt-4o-mini` | Slug model |
| `AI_BASE_URL` | sesuai provider | Base URL API opsional |
| `PORT` | `3000` lokal | Port untuk server Node.js di Termux |
| `SITE_URL` | — | URL publik untuk atribusi OpenRouter (opsional) |
| `OPENROUTER_APP_TITLE` | `RuangAI` | Header judul aplikasi OpenRouter (opsional) |

## Struktur

- `server.js` — server Node.js untuk Termux.
- `cloudflare/worker.js` — backend Cloudflare Worker dengan auth dan OpenRouter.
- `public/` — UI chat dan layar login.
- `wrangler.jsonc` — konfigurasi deployment Cloudflare.

## Update source

```sh
cd ~/termux-ai-webserver
git pull
```

Jika repository tersambung ke Cloudflare Workers Builds, push ke branch deployment akan memicu build/deploy otomatis.

## Troubleshooting

- **Server berhenti dengan `APP_PASSWORD wajib diatur`** — atur `APP_PASSWORD` sebelum menjalankan versi lokal.
- **Password salah / terlalu banyak percobaan** — pastikan password benar; tunggu 15 menit setelah 5 percobaan gagal.
- **Chat menyatakan OpenRouter key belum diatur** — atur `OPENROUTER_API_KEY` sebagai secret pada Worker dan deploy ulang.
- **401 OpenRouter** — periksa API key dan akses/limit akun OpenRouter.
- **Model tidak tersedia** — pilih slug aktif dari katalog OpenRouter.
- **Termux: port sudah dipakai** — jalankan `PORT=3001 node server.js`, lalu buka `http://127.0.0.1:3001`.

## Lisensi

MIT — lihat `LICENSE`.
