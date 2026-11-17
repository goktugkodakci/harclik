# Harçlık

Ay başı ve ay ortası gelen harçlığını bir sonrakine kadar idare etmek için basit bir bütçe uygulaması.
iPhone'da ana ekrana eklenir, kendi simgesiyle açılır, internetsiz çalışır. Veriler sadece telefonda durur.

## Ne yapar

- **Bugün harcayabileceğin**: kalan parayı bir sonraki harçlığa kadarki günlere böler. Gün içinde
  harcadıkça "bugün kalan" düşer ama günün limiti sabit kalır.
- **Hızlı giriş**: + → tutar → kategori → Kaydet. Son kullandığın kategori hazır seçili gelir.
- **Harçlık kendiliğinden eklenir**: harçlık günü gelince uygulama tutarı kendisi yazar. Geç ya da farklı
  geldiyse Geçmiş'ten kaydı açıp tarihini/tutarını düzeltebilirsin.
- **Devir**: artan (ya da eksi) para sonraki döneme geçer. Ayarlar'dan kapatılabilir.
- **Geçmiş**: dönem dönem gezinme, kategorilere göre dağılım, günlük liste.
- **Yedek**: Ayarlar → Yedek al ile tüm veriyi bir dosyaya kaydedip başka telefona taşıyabilirsin.

## iPhone'a kurmak

Uygulama bir web uygulaması (PWA). App Store'a koymak için Mac ve ücretli Apple geliştirici hesabı
gerekir; bu yol ikisini de istemez. iOS 15.4 veya üstü gerekir.

### Kalıcı kurulum (önerilen): GitHub Pages, ücretsiz

1. github.com'da `harclik` adında **public** bir depo aç.
2. Bu klasörde:
   ```bash
   git add .
   git commit -m "Harçlık"
   git remote add origin https://github.com/KULLANICI_ADIN/harclik.git
   git push -u origin main
   ```
3. Depoda **Settings → Pages → Build and deployment**: Source "Deploy from a branch", Branch `main`,
   klasör `/ (root)` → Save.
4. Bir iki dakika sonra iPhone'da **Safari** ile `https://KULLANICI_ADIN.github.io/harclik/` adresini aç.
5. Alttaki **Paylaş** düğmesi → **Ana Ekrana Ekle**.

Bundan sonra uygulama internetsiz de açılır. Depo public olduğu için bu klasördeki her şey (kod,
testler, `.planning/` altındaki tasarım notu) herkese açık olur; senin harcamaların değil, onlar sadece
telefonunda durur.

### Hızlıca denemek: aynı Wi-Fi

```bash
npm start
```

Çıktıdaki `Aynı Wi-Fi'deki telefon: http://192.168.x.x:8080` adresini iPhone'da Safari ile aç.
Windows güvenlik duvarı sorarsa "Özel ağlar"a izin ver. Bu yöntemde çevrimdışı mod çalışmaz ve
bilgisayardaki sunucu açık olmalıdır; sadece denemek içindir. Buradaki kayıtlar GitHub Pages
adresine taşınmaz (gerekirse Yedek al → Geri yükle).

## Verilerin

- Her şey telefonun içindeki tarayıcı deposunda durur; hesap ya da sunucu yok.
- Uygulamayı ana ekrandan silersen veriler de silinir. Arada bir **Ayarlar → Yedek al** ile dosyayı
  Dosyalar'a ya da iCloud Drive'a kaydet.

## Geliştirme

```bash
npm test          # iş mantığı testleri (Node 20+)
npm start         # http://localhost:8080
node tools/make-icons.js   # simgeleri yeniden üret
```

- Bağımlılık yok: düz HTML, CSS ve JavaScript modülleri. `npm install` gerekmez.
- Hesaplamalar `js/core/` içinde ve testli; ekranlar `js/ui/` içinde.
- Bir dosyayı değiştirip yayınladığında `sw.js` içindeki `VERSION` değerini artır; yoksa telefonlar
  eski kopyayı açmaya devam eder. Yeni dosya eklersen `ASSETS` listesine de yaz (test bunu yakalar).
