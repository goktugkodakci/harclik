# Spec: Gerekli bölümler ve keyif parası

**Created**: 2026-11-18
**Status**: approved (kullanıcı A seçeneğini seçti; aşağıdaki "Benim kararlarım" bölümü onun yerine verildi)
**Author**: goktu
**Epic**: none
**Değiştirdiği**: `harclik.md` içindeki günlük limit ve sabit 8 kategori

## Problem

Günlük harcama limiti kullanıcının düşünme şekline uymuyor. Kullanıcı önce zorunlu harcamalarını
(yemek, ulaşım, telefon...) ayırıp, kalan parayla ne kadar "keyif" harcaması yapabileceğini görmek istiyor.

## Goal

Ana ekrandaki büyük sayı "Keyif için kalan". Gerekli bölümler ve tutarları kullanıcının kendi yazdığı,
eklenip silinebilen bir liste. Her bölümde plan ve gerçekleşen harcama yan yana görünür.

## Kullanıcının seçtiği yaklaşım (A: takip)

| Yaklaşım | Artı | Eksi |
|---|---|---|
| **A. Gerekli bölümlere de harcama girilir** (seçilen) | Bölüm planı aşılırsa fark keyiften düşer, keyif rakamı hep doğru | Her yemek harcaması girilmeli |
| B. Gerekli tutarlar bir kez düşülür, sadece keyif girilir | Daha az kayıt | Gerekli bölümde aşım fark edilmez, keyif rakamı yanılır |

## Hesap

Bir dönem için (dönem tanımı değişmedi: bir harçlıktan bir sonrakine):

- `eldeki = devreden + gelen`
- Her plandaki bölüm için `planlanan`, `harcanan`
- `keyif bütçesi = eldeki − Σ planlanan`
- `keyif harcaması` = kategorisi `keyif` olan ya da o dönemin planında olmayan bölümlere yapılan harcamalar
- `keyif için kalan = bakiye − Σ max(0, planlanan − harcanan)` (= eldeki − keyif harcaması − Σ max(planlanan, harcanan))
- Bakiye ve devir eskisi gibi gerçek paradan hesaplanır.

## Benim kararlarım (düzeltilebilir)

1. Günlük limit ve tempo çubuğu tamamen kalkar.
2. Plan her harçlık dönemi içindir. Dönemin planı, başlangıç günü o dönemin başlangıcına eşit ya da daha
   önce olan en son kayıtlı plandır; böylece plan bir sonraki döneme kendiliğinden geçer. Planı
   düzenlemek sadece içinde bulunulan dönemi ve sonrasını etkiler, geçmiş dönemler korunur.
3. Bölüm kataloğu kalıcıdır (yeniden adlandırma geçmişte de görünür). Aynı adla yeniden eklenen bölüm
   eski kimliğini geri alır, böylece eski harcamalar yeniden ona sayılır.
4. Bir bölüm plandan çıkarılırsa o dönemki harcamaları keyiften sayılır (silmeden önce sorulur).
5. Kategori yerine harcama ekranında "Keyif" + plandaki bölümler gösterilir. Gelirde Harçlık / Ek para kalır.
6. Kurulumda "gerekli harcamaların" grubu eklenir (Yemek ve Ulaşım öneri satırı, tutar boşsa atlanır).
   Kurulumdan önceki harcama farkı keyiften sayılır; kullanıcı Geçmiş'ten bölümüne taşıyabilir.
7. Ana ekrandaki gerekli bölüm satırına dokunmak o bölüme harcama ekler; plan "Düzenle" ile değişir.
8. Bölüm simgesi addan tahmin edilir (yemek → 🍽️, ulaşım → 🚌 ...), bulunamazsa baş harf gösterilir.
9. En fazla 12 bölüm, ad en fazla 24 karakter, "Keyif" adı ayrılmış.

## Veri modeli (sürüm 2)

```js
{
  version: 2,
  settings: { setupDone, paydays, carryOver },
  generatedThrough,
  sections: [{ id, name, color }],                       // katalog
  plans: { "YYYY-AA-GG": { [sectionId]: kuruş } },      // dönem başlangıcına göre, ekleme sırası = görünüm sırası
  entries: [{ id, type, amount, category, note, date, createdAt }]
  // gider kategorisi: "keyif" ya da bir sectionId; gelir: "harclik" | "ek"
}
```

**Geçiş (v1 → v2):** v1 giderlerinin kullandığı eski kategoriler (yemek, kahve, ...) aynı kimlikle katalog
bölümü olur, plan boş başlar (bu yüzden ilk planlanana kadar keyiften sayılırlar). Kullanıcı "Yemek"
bölümünü eklediğinde ad eşleşmesiyle eski kayıtlar ona bağlanır. Hiçbir kayıt kaybolmaz.

## UI

```
Harçlık                                ⚙
Sonraki harçlık 1 Aralık · 13 gün sonra

┌ Keyif için kalan ─────────────────┐
│ ₺1.150                            │
│ Keyif bütçen ₺1.350 · ₺200 harcadın│
└───────────────────────────────────┘
Gerekli                        Düzenle
  🍽️ Yemek     ₺800 / ₺1.200   ████░░  +
  🚌 Ulaşım    ₺300 / ₺300     ██████  +
Bu dönem                          Tümü
  ...
```

Durumlar: harçlık yok (nötr) · keyif var (yeşil) · keyif bütçesi aşıldı ama para var (sarı: "gerekli
paradan ₺X kullandın") · plan eldeki parayı aşıyor (sarı) · bakiye eksi (kırmızı) · bölüm yok (boş durum
+ "Gerekli harcamalarını yaz").

Plan düzenleme: alt sayfa; satır = ad + tutar + sil; "+ Bölüm ekle"; altta canlı "keyif bütçen ₺X".

## Ek (2026-11-18): esnek harçlık günleri ve görsel yenileme

Kullanıcı isteği: "harçlık ne zaman geliyor kısmını da dinamik yap" ve "gorgeous bir UI". Benim kararlarım:

- Ayda 1–4 harçlık günü, her biri kendi tutarıyla; günler farklı olmalı, sıralı kaydedilir. Tek gün = aylık dönem.
- Plan seçimi: dönem başlangıcına eşit/önceki en son plan; hiçbiri yoksa ilk plan yalnızca o dönemin
  içinde kaydedildiyse kullanılır (eski dönemlere geriye dönük plan uygulanmaz).
- Ana ekran: gradyanlı keyif kartında büyük halka (kalan keyif payı) + paranın bölümlere/keyfe bölünüşünü
  gösteren şerit; takvim yaprağı görünümlü "sonraki harçlık" kartı; gerekli bölümler 2 sütunlu kutucuk,
  her birinde ilerleme halkası. Geçmiş: harcama dağılımı halka grafiği. Yuvarlak yazı tipi (iOS'ta SF
  Rounded), havada duran alt menü.

## Edge Cases

1. Plan toplamı eldeki parayı aşar → keyif bütçesi eksi, uyarı.
2. Bölüm planı aşılır → fark keyiften düşer, bölüm satırı kırmızı "₺X aştı".
3. Harcaması olan bölüm plandan çıkarılır → onay, harcamalar keyiften sayılır.
4. Harçlık tarihi değişir → plan en yakın önceki kayıttan bulunur.
5. Plan hiç yok → tüm giderler keyif, boş durum gösterilir.
6. Aynı ad iki kez, boş ad, "Keyif" adı, 12'den fazla bölüm → anlaşılır hata.
7. v1 verisi ya da v1 yedeği → otomatik geçiş, kayıp yok.

## Testing Criteria

`node --test`: planFor, periodBudget (aşım, plansız bölüm, eksi), applyPlan (yeni/yeniden adlandırma/ad
eşleşmesi), validatePlanRows, setupState(planRows), v1 → v2 geçişi ve v1 yedeği, sanitize (bölüm/plan).
Arayüz telefon genişliğinde elle.
