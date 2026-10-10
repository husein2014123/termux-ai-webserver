# RuangAI — AI Chat Webserver untuk Termux

Aplikasi chat AI ringan berbasis Node.js yang dapat berjalan di Termux. Tidak memerlukan framework maupun dependency npm. API key disimpan hanya pada environment server, tidak dikirim ke browser.

## Persyaratan

- Android dengan [Termux](https://github.com/termux/termux-app) terpasang (disarankan dari F-Droid atau GitHub resmi Termux).
- Akun dan API key dari penyedia model. **OpenRouter didukung langsung** dan dapat mengakses katalog model dari satu endpoint. Pemakaian model dapat berbayar sesuai harga dan saldo akun penyedia.

## Instal di Termux dari GitHub

```sh
pkg update -y
pkg install -y git nodejs-lts
git clone https://github.com/husein2014123/termux-ai-webserver.git
cd termux-ai-webserver
```

Tidak perlu menjalankan `npm install`.

## Jalankan dengan OpenRouter (disarankan)

1. Buat API key di [OpenRouter](https://openrouter.ai/keys).
2. Atur key dan model pada sesi Termux yang sama, lalu jalankan server:

```sh
export OPENROUTER_API_KEY='isi-api-key-openrouter-anda'
export AI_MODEL='openrouter/auto'
node server.js
```

3. Buka **http://127.0.0.1:3000** di browser Android. Biarkan Termux berjalan. Hentikan server dengan `Ctrl+C`.

`openrouter/auto` membiarkan router OpenRouter memilih model. Anda juga dapat mengganti `AI_MODEL` dengan ID model yang tersedia di katalog [OpenRouter Models](https://openrouter.ai/models), misalnya `openai/gpt-4o-mini`, jika model tersebut tersedia untuk akun Anda.

Opsional untuk atribusi aplikasi OpenRouter:

```sh
export SITE_URL='https://alamat-situs-anda.example'
export OPENROUTER_APP_TITLE='RuangAI'
```

## OpenAI atau endpoint kompatibel lainnya

Aplikasi tetap mendukung API OpenAI dan layanan kompatibel OpenAI Chat Completions:

```sh
export OPENAI_API_KEY='isi-api-key-anda'
export AI_BASE_URL='https://api.openai.com/v1'
export AI_MODEL='gpt-4o-mini'
node server.js
```

Untuk provider lain, sesuaikan `AI_BASE_URL` (base URL tanpa `/chat/completions`), `AI_MODEL`, dan `OPENAI_API_KEY`. Jika memakai provider non-OpenRouter dengan nama key berbeda, isi ke `OPENAI_API_KEY` pada environment server.

## Biar dapat dibuka dari mana saja

Menambahkan OpenRouter **tidak dengan sendirinya meng-host situs**. Saat dijalankan di Termux, situs hanya aktif ketika ponsel dan proses Termux menyala, dan alamat `127.0.0.1` hanya dapat dibuka dari ponsel tersebut.

Untuk tautan publik yang dapat dibuka dari perangkat lain, deploy aplikasi Node.js ini ke layanan hosting publik yang mendukung Node.js. Hubungkan repository GitHub ini, atur perintah start `node server.js`, lalu masukkan rahasia `OPENROUTER_API_KEY` pada pengaturan environment/secret di hosting (jangan di source, commit, atau browser). Set `AI_MODEL=openrouter/auto` juga pada environment hosting. Setelah hosting memberi URL HTTPS, alamat tersebut dapat dibuka dari perangkat mana pun.

**Keamanan dan biaya:** situs publik saat ini tidak memiliki akun pengguna maupun autentikasi. Siapa pun yang mengetahui tautannya dapat mengirim permintaan AI memakai saldo/API key Anda. Sebelum membagikan tautan publik, batasi saldo/limit pengeluaran key pada OpenRouter dan gunakan autentikasi/rate limiting di depan aplikasi bila akan dibuka luas. Jangan mengekspos server Termux polos langsung ke internet.

## Konfigurasi environment

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port webserver (hosting biasanya menentukan port sendiri) |
| `HOST` | `0.0.0.0` | Interface server |
| `AI_PROVIDER` | otomatis dari key | `openrouter` atau `openai`; berguna untuk memilih provider secara eksplisit |
| `OPENROUTER_API_KEY` | — | Rahasia API key OpenRouter; disimpan pada environment server |
| `OPENAI_API_KEY` | — | Key OpenAI/provider OpenAI-compatible |
| `AI_BASE_URL` | sesuai provider | Endpoint API khusus (opsional) |
| `AI_MODEL` | `openrouter/auto` atau `gpt-4o-mini` | ID model; default mengikuti provider yang dipilih |
| `SITE_URL` | — | URL publik untuk header atribusi OpenRouter (opsional) |
| `OPENROUTER_APP_TITLE` | `RuangAI` | Nama aplikasi untuk header atribusi (opsional) |
| `AI_PROVIDER_NAME` | sesuai provider | Label provider pada status (opsional) |

Jika kedua API key diisi sekaligus, tetapkan `AI_PROVIDER=openrouter` atau `AI_PROVIDER=openai` supaya pemilihannya jelas.

## Simpan konfigurasi lokal di Termux

Agar tidak mengetik key tiap kali, buat file **di luar repository**:

```sh
nano ~/.ruangai-env
```

Masukkan `export OPENROUTER_API_KEY='...'` dan `export AI_MODEL='openrouter/auto'`, simpan, lalu:

```sh
chmod 600 ~/.ruangai-env
source ~/.ruangai-env
cd ~/termux-ai-webserver
node server.js
```

Jangan membagikan file tersebut atau memasukkan API key ke GitHub.

## Update kode

```sh
cd ~/termux-ai-webserver
git pull
```

## Troubleshooting

- **Kunci OpenRouter belum diatur** — ekspor `OPENROUTER_API_KEY` pada sesi Termux yang sama sebelum menjalankan server.
- **401 / unauthorized** — periksa API key dan status akun/provider.
- **404 model atau endpoint** — pastikan ID model dan endpoint cocok dengan dokumentasi penyedia.
- **Port sudah digunakan** — jalankan `PORT=3001 node server.js`, lalu buka `http://127.0.0.1:3001`.
- **Chat gagal di hosting** — pastikan secret `OPENROUTER_API_KEY` sudah diatur di hosting dan server di-restart setelah perubahan environment.

## Lisensi

MIT — lihat `LICENSE`.
