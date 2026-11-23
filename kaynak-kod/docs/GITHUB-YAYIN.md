# GitHub Pages'te yayınlama: adım adım

Bu adımların hepsi **tarayıcıdan, github.com üzerinden** yapılır. Diğer bilgisayara Git, Node veya başka bir
program kurmana gerek yok. Sadece GitHub hesabınla giriş yapman yeterli.

Sonuçta oyun şu adreste açılacak: **https://emrecigil.github.io/between-doors/**

---

## Başlamadan önce
- Güncel kod GitHub'da `v2` dalında olmalı (README, eskizler ve otomatik yayın ayarı dahil).
- Otomatik yayın ayarı projede hazır: `.github/workflows/pages.yml`. `main` dalına her yeni kod geldiğinde
  GitHub testleri çalıştırır, oyunu derler ve yayınlar. Elle derleme yapman gerekmez.

## 1. v2'yi main'e birleştir
1. https://github.com/emrecigil/between-doors adresini aç.
2. Üstteki **Pull requests** sekmesi → **New pull request**.
3. **base: `main`** ← **compare: `v2`** seç.
4. **Create pull request** → başlık örneği: "v2: teslim sürümü" → tekrar **Create pull request**.
5. **Merge pull request** → **Confirm merge**.

`v2` dalını silme, commit geçmişi orada da duruyor. "Düzenli Git kullanımı" puanı için bu geçmiş önemli.

## 2. Repoyu herkese açık yap
Hocanın ve akran değerlendirmesindeki arkadaşların görebilmesi için repo açık (public) olmalı. Ayrıca ücretsiz
hesapta GitHub Pages sadece açık repolarda çalışır.

1. Repoda **Settings** (sağ üst, dişli simgesi).
2. **General** sayfasının en altında **Danger Zone** → **Change repository visibility** → **Make public**.
3. GitHub senden repo adını yazmanı ister: `emrecigil/between-doors` yaz ve onayla.

> Dikkat: açık repoda her dosya herkese görünür. `CLAUDE.md` ve `docs/DEVIR.md` gibi çalışma notları da dahil.
> İçlerinde gizli bilgi (şifre, anahtar) yok.

## 3. GitHub Pages'i aç
1. **Settings** → soldaki menüde **Pages**.
2. **Build and deployment** → **Source**: **GitHub Actions** seç. ("Deploy from a branch" değil.)
3. Başka bir şey kaydetmene gerek yok.

## 4. İlk yayını başlat
1. Üstteki **Actions** sekmesi.
2. Soldan **Deploy to GitHub Pages** → sağda **Run workflow** → dal: `main` → yeşil **Run workflow**.
3. 2-3 dakika bekle. İki adım da (build, deploy) yeşil tik olunca yayın tamamdır.
   - Kırmızı çarpı çıkarsa: çarpıya tıkla, hata metninin ekran görüntüsünü al ve bana gönder.
4. **Settings → Pages** sayfasının üstünde adres görünür: https://emrecigil.github.io/between-doors/

Bundan sonra `main`'e gelen her yeni kod otomatik olarak yeniden yayınlanır.

## 5. Kontrol et
- Adresi Chrome veya Edge'de aç. Menü ve sokak görünmeli. İlk açılışta modellerin yüklenmesi birkaç saniye
  sürebilir.
- "Mesaiye Başla" → bir bölüm oyna, M ile haritayı aç.

## 6. Adresi gereken yerlere yaz
1. **Repo sayfası:** sağdaki **About** kutusunun yanındaki dişli → **Website** alanına oyun adresini yaz →
   **Use your GitHub Pages website** kutusunu işaretle → **Save**.
2. **Akran değerlendirme sistemi:** https://gmt458.hacettepe.edu.tr/ adresine repo linkini gir:
   `https://github.com/emrecigil/between-doors`
3. İstersen README'nin en üstüne "Oyna: https://emrecigil.github.io/between-doors/" satırını ekleyebilirsin.
   Bunu github.com'da README dosyasını açıp kalem simgesiyle düzenleyerek yapabilirsin.

---

## Sorun çıkarsa
| Belirti | Çözüm |
|---|---|
| Actions'da "Deploy to GitHub Pages" görünmüyor | 1. adımdaki birleştirme yapılmamış olabilir. `main` dalında `.github/workflows/pages.yml` var mı bak |
| Deploy adımı "Pages not enabled" hatası veriyor | 3. adımı yap (Source: GitHub Actions), sonra 4. adımı tekrarla |
| Sayfa 404 veriyor | Yayın bittikten sonra 1-2 dakika bekle ve sayfayı yenile |
| Sayfa açılıyor ama boş/siyah | Tarayıcıda WebGL kapalı olabilir. Başka tarayıcıda dene |
