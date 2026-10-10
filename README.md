# RuangAI — AI Chat Webserver untuk Termux

Aplikasi chat AI mandiri yang tampil di browser ponsel dan berjalan sebagai webserver Node.js di Termux. Tidak memerlukan framework atau dependency npm. Server menyimpan API key; key tidak pernah dikirim ke browser.

## Persyaratan

- Android dengan [Termux](https://github.com/termux/termux-app) terpasang (disarankan dari F-Droid atau GitHub resmi Termux).
- Akun dan API key dari penyedia model yang menyediakan endpoint **kompatibel OpenAI Chat Completions**. Biaya penggunaan API ditentukan penyedia; aplikasi ini bukan layanan Blackbox AI dan tidak menyertakan API key.

## Instal di Termux dari GitHub

Ganti `NAMA_GITHUB` dengan pemilik/repo tempat proyek ini diunggah:

```sh
pkg update -y
pkg install -y git nodejs-lts
 git clone https://github.com/NAMA_GITHUB/termux-ai-webserver.git
cd termux-ai-webserver
```

Jika repositori Anda bernama lain, sesuaikan URL clone dan nama folder. Tidak perlu menjalankan `npm install`.

## Jalankan

Isi endpoint dan API key dari provider Anda. Contoh berikut memakai endpoint OpenAI; jangan menaruh key di file frontend atau mengunggah key ke GitHub.

```sh
export OPENAI_API_KEY='isi-api-key-anda'
export AI_BASE_URL='https://api.openai.com/v1'
export AI_MODEL='gpt-4o-mini'
node server.js
```

Buka browser Android ke **http://127.0.0.1:3000**. Biarkan sesi Termux berjalan. Hentikan server dengan `Ctrl+C`.

Untuk provider kompatibel lain, ganti `AI_BASE_URL` ke base URL API provider (tanpa `/chat/completions`) dan `AI_MODEL` ke ID model yang tersedia di akun provider. Variabel `AI_PROVIDER_NAME` opsional dan hanya untuk label status.

### Memakai ulang konfigurasi

Agar tidak mengetik variabel setiap kali, buat file lokal `~/.ruangai-env` (file ini berada di luar folder repo):

```sh
nano ~/.ruangai-env
```

Isi file dengan tiga baris `export` di atas, simpan, lalu:

```sh
chmod 600 ~/.ruangai-env
source ~/.ruangai-env
cd ~/termux-ai-webserver
node server.js
```

Jangan membagikan file konfigurasi tersebut. Mengubah konfigurasi pada sesi Termux yang sedang berjalan tidak memerlukan perubahan kode.

## Opsi

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port webserver |
| `HOST` | `0.0.0.0` | Interface listen; default dapat diakses pada perangkat Android sendiri melalui `127.0.0.1` |
| `OPENAI_API_KEY` | — | API key provider; wajib untuk chat |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Base URL API kompatibel OpenAI |
| `AI_MODEL` | `gpt-4o-mini` | ID model yang dipilih |
| `AI_PROVIDER_NAME` | `OpenAI-compatible API` | Label provider di status server |

Jalankan di jaringan lokal dengan hati-hati: tanpa proxy HTTPS dan autentikasi tambahan, jangan mengekspos port server ke internet atau jaringan publik. Jangan mengunggah API key. Gunakan endpoint provider tepercaya.

## Update kode dari GitHub

```sh
cd ~/termux-ai-webserver
git pull
```

Jika repository privat, pastikan Termux telah diberi autentikasi GitHub.

## Troubleshooting

- **API key belum diatur** — ekspor `OPENAI_API_KEY` pada sesi Termux yang sama sebelum menjalankan server.
- **401 / unauthorized** — periksa API key dan status akun/provider.
- **404 model atau endpoint** — pastikan `AI_BASE_URL` dan `AI_MODEL` sesuai dokumentasi provider.
- **Port sudah digunakan** — jalankan `PORT=3001 node server.js`, lalu buka `http://127.0.0.1:3001`.
- **GitHub belum punya repo** — unggah folder proyek ke repository milik Anda terlebih dahulu; jangan memasukkan key API ke commit.

## Lisensi

MIT — lihat `LICENSE`.
