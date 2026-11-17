# Spec: Harçlık

**Created**: 2026-11-16
**Status**: draft (kullanıcı "direkt başla" dedi; aşağıdaki varsayımlar soru sorulmadan alındı)
**Author**: goktu
**Epic**: none

## Problem

Ayda iki kez (ay başı ve ay ortası) aileden sabit bir harçlık geliyor. Her harçlığın bir sonrakine
kadar yetmesi gerekiyor ama "bugün ne kadar harcayabilirim" sorusunun cevabı kafadan hesaplanıyor
ve para dönem bitmeden tükenebiliyor.

## Goal

Uygulama açıldığında tek bakışta şu üç şey görünür: bugün harcanabilecek tutar, dönemde kalan para,
bir sonraki harçlığa kaç gün kaldığı. Bir harcamayı kaydetmek en fazla üç dokunuş sürer
(+ → tutar → kategori → Kaydet).

## User Stories

- Harçlık alan bir öğrenci olarak, harcamamı birkaç saniyede girmek istiyorum ki takibi bırakmayayım.
- Harçlık alan bir öğrenci olarak, bir sonraki harçlığa kadar günde ne kadar harcayabileceğimi
  görmek istiyorum ki param dönem bitmeden tükenmesin.
- Harçlık alan bir öğrenci olarak, paramın hangi kategorilere gittiğini görmek istiyorum ki nerede
  kısabileceğimi bileyim.

## Requirements

### Must-have

1. **Harçlık planı**: ayın iki günü ve her biri için tutar (varsayılan 1 ve 15). Gün o ayda yoksa
   ayın son gününe kayar.
2. **Otomatik harçlık kaydı**: harçlık günü geldiğinde uygulama o tutarı "Harçlık" geliri olarak
   kendisi ekler. Kayıt düzenlenebilir ve silinebilir (geç ya da farklı tutarda geldiyse).
3. **Dönem**: bir harçlık kaydından bir sonraki harçlık gününe kadar olan aralık.
4. **Özet ekranı**: bugün harcanabilecek tutar, dönemde kalan, sonraki harçlığa kalan gün, tempo
   göstergesi (harcanan pay ile geçen gün payı), son kayıtlar.
5. **Hızlı giriş**: uygulama içi sayı tuş takımı, 8 sabit kategori, isteğe bağlı not, tarih
   (varsayılan bugün). Harcama ya da ek gelir.
6. **Geçmiş**: dönem dönem gezinme, kategori dağılımı, güne göre gruplu kayıtlar; kayda dokununca
   düzenle/sil.
7. **Devir**: artan (ya da eksiye düşen) para sonraki döneme devreder; ayarlardan kapatılabilir.
8. **Veri telefonda kalır**: `localStorage`; sunucu ve hesap yok.
9. **Ana ekrana eklenebilir ve çevrimdışı çalışır** (manifest + service worker).
10. **Yedek**: tüm veriyi JSON dosyası olarak dışa aktarma ve geri yükleme.

### Nice-to-have (bu sürümde yok)

- Kategori düzenleme, bildirimler, grafik geçmişi, birden fazla para birimi.

### Out of scope

- Banka/kart bağlantısı, hesap ve bulut senkronu, App Store dağıtımı, Android'e özel iş.

## Data Model

`localStorage["harclik.v1"]`, tek JSON nesnesi. Tutarlar kuruş cinsinden tam sayı, günler yerel
takvim günü (`YYYY-AA-GG`); harcama bir "gün"e aittir, saat dilimi kavramı gerekmez.

```js
{
  version: 1,
  settings: {
    setupDone: true,
    paydays: [{ day: 1, amount: 300000 }, { day: 15, amount: 300000 }],
    carryOver: true
  },
  generatedThrough: "2026-11-16",   // otomatik harçlık bu güne kadar üretildi
  entries: [
    { id, type: "expense" | "income", amount, category, note, date, createdAt }
  ]
}
```

- Harçlık kaydı = `type: "income"` ve `category: "harclik"` (ayrı bir bayrak yok; tek doğruluk kaynağı
  kategori). Dönem sınırlarını bu kayıtlar belirler; plan yalnızca gelecekteki harçlıkları üretir.
  Böylece planı değiştirmek geçmişi bozmaz.
- Silme kalıcıdır (yerel, tek kullanıcı); yanlışlıkla silmeye karşı "Geri al" vardır.

## API Changes

Yok. Sunucu yok.

## UI Changes

Ekranlar: **Kurulum** (ilk açılış), **Özet**, **Geçmiş**, **Ayarlar**, **Kayıt sayfası** (alt sayfa).
Alt çubuk: Özet · (+) · Geçmiş. Ayarlar üst sağdaki dişliden.

Durumlar:

| Durum | Ne görünür |
|---|---|
| Boş | "Bu dönemde henüz harcama yok" + ekleme çağrısı |
| Bütçe aşıldı | Kırmızı ton, "₺X eksidesin" |
| Bugünkü limit aşıldı | "Bugünkü limiti ₺X aştın", yarından itibaren günlük tutar |
| Hata | Kaydedilemezse üstte uyarı; bozuk yedek dosyasında açıklayıcı mesaj |
| Başarı | Kısa bildirim; silmede "Geri al" |
| Yükleniyor | Yok: her şey yerel ve anlık |

Tasarım belirteçleri (`css/app.css` içinde CSS değişkeni olarak bağlayıcıdır):

- Renk: sıcak kâğıt zemin, koyu yeşil vurgu, uyarı için kehribar, aşım için kiremit. Açık ve koyu tema.
- Yazı: sistem yazı tipi (iPhone'da SF); tutarlar yuvarlak rakamlı ve sabit genişlikli.
- Aralık: 4 px tabanlı ölçek (4/8/12/16/24/32). Köşe: kart 20, düğme 14, etiket 12.
- Dokunma hedefi en az 44 px. Odak halkası görünür. `prefers-reduced-motion` gözetilir.
- Genişlik: 375 px öncelikli; 768 ve 1440'ta içerik ortalanmış tek sütun.

## Edge Cases

1. Harçlık günü o ayda yok (31, Şubat): ayın son gününe kayar.
2. Uygulama haftalarca açılmadı: aradaki tüm harçlık günleri sırayla üretilir, çift kayıt oluşmaz.
3. Otomatik harçlık kaydı silindi: yeniden üretilmez; dönem bir öncekiyle birleşir.
4. Plan dönem ortasında değişti: yalnızca bugünden sonraki harçlıkları etkiler.
5. Bütçe eksiye düştü: günlük limit 0, eksi tutar gösterilir, eksi sonraki döneme devreder.
   Günlük limit günün başındaki paraya göre sabitlenir; gün içinde eksiye düşülürse o günün limiti
   değişmez ama ekranda "eksidesin" durumu öne çıkar.
6. Dönemin son günü: günlük limit kalan paranın tamamıdır.
7. Kurulum dönem ortasında yapıldı: o döneme kadarki harcama isteğe bağlı tek kayıt olarak girilir.
8. Bozuk ya da eski `localStorage` verisi: uygulama çökmez, kuruluma döner; yedek yükleme önerilir.
9. Tutar girişi: virgülden sonra en fazla 2 hane, en fazla 7 tam hane, 0 tutar kaydedilmez.
10. Not alanına HTML yazılması: düz metin olarak gösterilir.

## Testing Criteria

Mantık `node --test` ile, arayüz tarayıcıda 375 px genişlikte elle doğrulanır.

- Mutlu yol: kurulum → harçlık kaydı oluşur → harcama eklenir → kalan ve günlük limit doğru.
- Plan: gün kaydırma (31 → 30/28/29), ay ve yıl geçişi, iki harçlık arası gün sayısı.
- Otomatik üretim: uzun aradan sonra eksiksiz ve tekrarsız; silinen geri gelmez.
- Günlük limit: bugünkü harcama limiti gün içinde küçültmez; son gün; eksi bakiye.
- Devir açık/kapalı farkı.
- Para: `12,5` → 1250 kuruş, `1.250,50` → 125050; biçimlendirme; tuş takımı kuralları.
- Depolama: bozuk JSON, eksik alan, yedek al → yükle gidiş dönüşü.

## Dependencies

- Çalışma zamanı bağımlılığı yok (düz HTML/CSS/JS, ES modülleri).
- Geliştirme: Node 20 (testler ve yerel sunucu için), `npm install` gerekmez.
- Telefona kalıcı kurulum için HTTPS üzerinden yayın gerekir (ayrı adım, kullanıcı onayıyla).
