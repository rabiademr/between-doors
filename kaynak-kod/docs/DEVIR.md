# Devir notu — nerede kaldık

## BURADAN DEVAM (2026-11-17, 8. oturum sonu) — teslim hazırlığı + CEO'nun oyunda bulduğu hatalar
Son kod commit'i `v2`: 2ebb3b2 (+ bu not), push'lu, çalışma ağacı temiz. typecheck temiz, **446 test**, `npm run build`
başarılı. Kayıt v6 (değişmedi).
**Sonraki oturum buradan başlar:**
1. CEO elle dener (dev: `npm run dev`; 5201 sunucusu bellek azlığından kapandı, açık değil): sahne konuşmalarında
   imleç her satırda görünüyor mu (a447909); araçla teslim çemberinde E teslim ediyor mu (2ebb3b2); çit dibinde
   araçtan inince doğru tarafa iniyor mu (40c5088).
2. Teslim: zip paketleme betiği `npm run pack` önerildi (OYUN/ + kaynak-kod/ git archive + BENIOKU.txt; yeni bağımlılık
   yok) — **CEO onayı bekliyor**. `rapor.pdf` CEO'da mı yoksa birlikte mi yazılacak — **CEO cevabı bekliyor**.
3. CEO elle: tam hafta `dist/index.html` çift tıkla, ışınlanmadan. Sonra `/release-readiness` yeniden (şu an NO-GO).
**8. oturumda düzeltilen CEO hataları:**
- ✅ Sahne/diyalogda imleç kayboluyordu (Devam'a basılamıyor, Esc gerekiyordu): kilit isteği tarayıcıda gecikmeli
  geliyor, sonraki satır açılınca diyalog üstünde fare yakalanıyordu. `MouseLook`: devre dışıyken gelen kilit hemen
  bırakılır; yoldaki istek `wantsLock` ile yeniden yakalamaya sayılır (a447909, `MouseLook.test.ts` sahte document).
  Playwright tarayıcısı pointer lock vermiyor → canlı doğrulanamadı.
- ✅ Araçla teslim çemberinde E araçtan indiriyordu (kapı yanda kalınca 70° yön konisi dışı → hedef yok → E = in;
  hırsız yetişiyordu): sürerken `selectTarget(..., { anyDirection })` — menzil aynı, en yakın kazanır (2ebb3b2).
  Tarayıcıda bisiklet: yandaki kapıya E → Teslim Et → +70 kredi, araçta kalır. Yan etki: araçtayken hedef menzildeyse
  E inmez (birkaç adım uzaklaş).

**8. oturum (2026-11-16 akşam):** ✅ CREDITS dosyalarla birebir (hepsi CC0; müzik Web Audio, dosya yok); ✅ 435 test,
typecheck, `npm run build` → `dist/` 20 MB (game.js 4,7 MB + packs 16 MB), file:// menü + modeller açılıyor;
✅ `BENIOKU.txt` (tuşlar, klasörler) ve `README.md` (derlemeler, kayıt v6, geo.json katmanları) güncel (a7cab03).
`/release-readiness` → NO-GO (kod sağlam; zip, rapor.pdf, elle tam hafta eksik). Codex adversarial (v2↔main) tek
bulgu: araçtan inerken çitin/kapalı kapının arkasına ışınlanma → ✅ `pathClear` (40c5088, 439 test).
Açık: zip'i paketleyen betik yok (OYUN/ + kaynak-kod/ + rapor.pdf elle); rapor.pdf CEO'da.
CEO elle (7. oturumdan kalan): grafik Otomatik/Düşük'ün gerçek zayıf makinede hissi, harita sürükleme.

## 7. oturum sonu (2026-11-16) — hafta bitti; serbest dolaş, F4 artıkları, FPS, harita
- ✅ qa açıkları (6. oturum listesi): tekrar oynanan bölümde "Mesaiyi bitir"; sahne başka diyalogla kesilince
  askıya alınır/sürer (`ScenePlayer` SceneHandle); kaybedilen hırsız 8 sn bekler; araçla paydos rafı toplar; dil
  değişince sahne satırı yenilenir; hafta yürüyüşü testi (`content/week.test.ts`).
- ✅ Codex (v2↔main): çapraz park aracının çarpışması kendi boyunda (`collider:'box'`).
- ✅ **Serbest dolaş** (CEO): hafta bitince menü/bitiş ekranında; ch7 kurulur ama `opened` yollanmaz → Mara "pano
  her zaman açık", pano çalışır; duraklatmada "yeniden başlat" yok.
- ✅ F4 artıkları: araca binerken duvar/çit kontrolü (`domain/vehicles/parking.ts mountCheck`, araç merkezine prob);
  tek satın alma kuralı (`Economy.purchase`, `stallCard`); hırsız pusu/kaçışları, Magpie ini, raf ve Finn yolları
  geo.json'da (`marker`/`route` katmanları; `mapMarker`/`mapRoute`/`wallsRect`). Van yuvası x −1,3 (ortadaki
  scooter'a ulaşılabilsin, testli).
- ✅ **FPS** (geliştirme derlemesi, aynı kamera): kare başına çizim çağrısı Indigo Row 1482 → ~1040, Railway Yard
  1345 → ~650. Gölge listesi ışık uzayında gölge karesine göre kırpılır (500 ms / 4 m'de bir, yeni dizi atanır);
  arabalar tek mesh (`modelLibrary.mergeByMaterial`, hata olursa parçalar kalır); kasaba halkı 55 m'de, hayvanlar
  50 m'de gizlenir; durağan dünya `freezeStaticMeshes` (gökyüzü/billboard/hareketli hariç); biber/ampuller tek mesh.
  Süre ölçümü arka plandaki Playwright sekmesinde güvenilmez (12–32 ms oynuyor) — CEO makinesinde elle bakılmalı.
- ✅ **Harita (M)**: sürükleyerek kaydırma (el imleci), tekerlek imlece doğru yakınlaştırır; harita açıkken fare
  serbest, kapanınca yeniden yakalanır.
- qa-reviewer bulguları 1–7 düzeltildi; açık kalan küçükler: dönük kare kasalar (`parcelBox*`) daire çarpışır
  (eski davranış, yorum `WorldBuilder` ~356 güncel değil); bölüm başlarken arka planda ch7 açılır (zararsız).
- ✅ **Grafik kalitesi** (CEO onayı, kayıt **v6** + `migrateV5toV6`): Ayarlar → Grafik Otomatik/Yüksek/Düşük.
  Otomatik ilk ~5 sn akıcı oyunu ölçer (modeller yüklendikten sonra, diyalog/gizli sekme hariç), 45 fps altı →
  Düşük + bildirim, karar kaydedilir. Düşük: çözünürlük ölçeği 1,25, MSAA 1, bloom yok, gölge haritası 1024
  (`shadows.mapSize`; Atmosphere her kırpmada güncel haritayı alır), sis 30–95 m (akış yarıçapı 105), kalabalık
  40/35 m'de gizlenir. Tarayıcıda: v5 kaydı v6'ya taşındı, Düşük/Yüksek geçişi ve gölgeler görüldü.
- **SIRADAKİ (CEO'ya önerildi):** 1) ~~"Düşük kalite" ayarı~~ (bitti) 2) teslim hazırlığı (`/release-readiness`, CREDITS, zip) 3) aktör/sahne/ipucu koordinatları geo.json'a
  4) model instancing 5) kesme çizgisinin altı. Tam hafta elle (ışınlanmadan) hâlâ oynanmadı.

## F5 HİKÂYE SÜRÜYOR (2026-11-16, 6. oturum) — plan `~/.claude/plans/splendid-scribbling-locket.md`
CEO kararları: gün başına 1 yeni bölüm (ch4–ch7 = 2–5. gün; ch1–3 = 1. gün), Magpies yalnız kovalamaca,
gün sonu = o günün hikâye bölümü + 2 pano işi. Kayıt şeması değişmedi (v5).
- ✅ A1 (48ea67e) `domain/story.ts` bölüm↔gün; `opened` olayı (günü gelmeyen bölümde Mara'nın E'si `day.end`);
  Devam = hikâyenin sıradaki bölümü; ch4 iskeleti (Mara → pazarcı).
- ✅ A2 (d0721c9) `content/clues.ts` (ipucu metinleri veriden, `requiredClueIds`).
- ✅ A3 (bab83eb) `domain/scene` + `content/scenes.ts` + `app/ScenePlayer` (altyazı diyaloğu, `CameraRig.setShot`,
  sahnede oyuncu konumu); paydosta sabah sahnesi (yalnız 2. gün yazıldı).
- ✅ A4 (5870a29) `content/actors.ts` + `world/StoryCast` (Arthur, Finn, June, Mr Crane/Swift Parcel turuncu takım).
- ✅ A5 (c12558a) hikâye Magpies (`chase.ts` arm/lead/lost) — ch4 baştan sona (kapma → yakala ya da sandık → tezgâhtar sahnesi).
- ✅ A6 (1d02a02) `varyTune` + her sabaha ve finale ayrı melodi.
- ✅ A7 (a0b45bf) ch5 Arthur's Round (Lock Street, iki mavi kapı + LOCK HOUSE plakası), ch6 Stakeout (yem → takip → indeki
  iki ipucu → June), ch7 The Neighbourhood Did (Market Cross, Mr Crane gider, teşekkür ekranı, başarım First Week);
  3–5. gün sabah sahneleri. Tarayıcıda her bölüm gerçek E/tıklamayla denendi (konumlara ışınlanarak), file:// menü açılıyor.
- qa-reviewer (F5 farkı) — DÜZELTİLDİ: hikâye hırsızı modeller yüklenmese de çalışır (ch6 kilitlenmesi), hikâye hırsızı
  rotaları da rota testlerinde, ch5'te plaka okunmadan doğru kapı kabul edilmez (`whichDoor`), bölüm başında kamera çekimi
  sıfırlanır, Mr Crane yürüyüşün sonunda gizlenir (`actor.walk hideAtEnd`).
- **qa-reviewer açıkları (7. oturum, 2026-11-16):**
  - ✅ 1. Tekrar oynanan (bitmiş) bölümde Mara'nın notunda "Mesaiyi bitir" düğmesi (yalnız `dayStatus.canEnd` iken) →
    gün sonu penceresi. Tarayıcıda: 4. gün, ch5 tekrar → Mesaiyi bitir → Paydos → 5. gün + sabah sahnesi.
  - ✅ 2. Sahne askıya alınır: başka bir pencere sahne satırının yerine açılırsa sahne bekler (kamera takibe döner), o
    pencere kapanınca aynı satırdan sürer; bölüm kurulumu eski sahneyi iptal eder (`ScenePlayer` → `SceneHandle`
    resume/cancel; `GameApp.scene`). Tarayıcıda araya pencere sokularak denendi.
  - ✅ 3. Kaybedilen hikâye hırsızı pusuda `CHASE_TUNING.relurkSeconds` (8 sn) bekler, hemen yeniden kapmaz (test).
  - 4. Günleri ileride eski kayıtlar ch4…'ü arka arkaya oynar, sabah sahnelerini görmez (kabul).
  - 5. Hafta bitince "Devam" ch7'yi yeniden açar — "serbest dolaş" etiketi CEO kararı (açık). ✅ Araçtayken paydos:
    sürülen dışındaki tüm araçlar rafa döner.
  - ✅ 6. HUD dil düğmesi sahne ortasında açık satırı yeni dilde yeniden gösterir (tarayıcıda TR→EN denendi).
  - ✅ 7. Test boşlukları: ScenePlayer sahte host testi, chase "kaybedildi → bekleme", gerçek bölüm listesi + görevler +
    sabah sahneleriyle hafta yürüyüşü (`content/week.test.ts`).
  - ✅ `dist/index.html` file:// (headless Edge) açılıyor: sahne + ana menü (fa03675 sonrası derleme).
- Açık: `/codex:review` CEO'ya önerildi; tam hafta elle (ışınlanmadan) oynanmadı; ch1–2 Finn/sokak Arthur StoryCast'e
  taşınmadı (bilerek); finalde resim (captureView) yok; 5201'deki test profili 5. günde, hafta bitmiş.
- Test notu: tarayıcıda profile elle bölüm silerken `rewardClaimedChapterIds`'i de düzelt (yoksa kayıt "bozuk" sayılır —
  doğrulayıcı haklı).

## BURADAN DEVAM (2026-11-14, 5. oturum sonu) — F4 kapandı, F5.0 gün ilerletme bitti; açık hatalar + F5 hikâyesi kaldı
Son commit `v2`: 579a4d8 (push'lu). typecheck temiz, 373 test, `npm run build` başarılı. Kayıt **v5**.
Bu oturumda yapılanların ayrıntısı aşağıda "CEO oyun testi sonrası" ve "F5.0 gün ilerletme" başlıklarında.

**6. oturum (2026-11-16) — açık hatalar 1–3 kapandı**
- ✅ Araç menü açıkken süzülmüyor: `PlayerController.update` `movementEnabled` false iken mover'ı çağırmaz, hızı 0 yapar
  (tarayıcı: bisiklet 4,5 m/s'de menü açıldı → 0 m kaydı; kapanınca yeniden hızlandı).
- ✅ "Yeni gün" bildirimi hata değilmiş: gerçek "Paydos" tıklamasında bildirim doğru metinle açılıyor ve görünür; önceki
  testte 5 sn'lik süre dolduktan sonra bakılmıştı.
- ✅ Gün sonu uçtan uca: panodan iki iş alındı, adrese gidilip gerçek E tuşu + "Teslim Et" ile teslim edildi (dayJobs 2,
  80 kredi), Mara'da E → "Mesaiyi bitir" → özet → "Paydos" → 3. gün.

**Açık hatalar**
4. Bisiklet sürüş hissi (duvara sürtme / sıkışınca W+A/D ile dönme / geri 3 m/s) yalnız sayılarla doğrulandı; CEO elle
   deneyecek. Süreli (timed) yan iş F4'ten beri yeniden denenmedi.
5. Bölge kapısı tabelalarından yalnız MARKET HILL ekranda görüldü; CANAL SIDE / HILLSIDE PARK / RAILWAY YARD konumdan
   doğrulandı. Teknelerde karıncalanma tek durağan karede kontrol edildi (hareket halinde bakılmadı).
6. Diğer bölgelerde gezerek "görünmez engel" turu yapılmadı (çarpışma listesi tarandı, dev kutu kalmadı).
7. Bankta oturanların ayakları 30 cm havada (kısa bacak); kaldırma 0.28 m tüm banklarda sabit, diğer bölgelerin
   banklarına tek tek bakılmadı.
8. Scooter ve motosikletin park görünümü görülmedi (test profilinde yoklar); bisiklet rafta düzgün.

**Sıradaki işler**
1. ~~Yukarıdaki 1–3~~ (6. oturumda bitti).
2. **F5 hikâye içeriği:** yalnız gün mekanizması var. Yol haritası: 5 gün × 2–3 ana görev, Swift Parcel / Magpies
   çatışması, ara sahneler, hafta sonu finali (`~/.claude/plans/ama-ele-tirimi-yapay-m-m-adaptive-unicorn.md`).
   Kapsamı büyük: önce plan + CEO onayı. Hafta bitince şu an yalnız Mara'nın bir cümlesi var.
3. **Zayıf makinede FPS.** CEO'nun makinesinde (RX 9070 XT, 1280×720) kare süresi: Indigo Row / Dial Square 9,3 ms,
   Railway Yard 7,6, Market Hill 6,4, Canal Side 4,6, Hillside Park 3,4. Indigo Row 765, Railway Yard 861 aktif mesh:
   hocanın dizüstünde ilk zorlanacak yerler. Bu oturumda +67 ayakkabı mesh'i eklendi.
4. F4'ten ertelenenler: araca binerken çit/duvar kontrolü yok; `MAGPIE_DEN` / rotalar / raf koordinatları kodda;
   `priceFor` ve satın alma mantığı iki yerde. Kesme çizgisinin altı: sessiz teslim, dövüş, stamina, kısa yol çitleri,
   park konumunun kaydı.
5. Teslim öncesi: `dist/index.html` file:// testi bu oturumun değişikliklerinden sonra yeniden yapılmadı.

**Ortam notu:** dev sunucusu oturum sonunda kapatıldı; `npm run dev` ile yeniden başlat (5200'deki eski sunucunun
vite önbelleği bozuktu: `--force` ile aç). Test profili (5201 kökeninde) 2. günde, 355 kredi, bisiklet sahibi.

---

## ESKİ: 4. oturum sonu (2026-11-14) — F4 kapandı; araç kararı + FPS + F5 kaldı
Plan: `~/.claude/plans/devir-notunda-kalan-yerden-vivid-karp.md` (F4: yan işler, araca binme, skiller, Magpies).
F3 bitti (aşağıdaki bölüm). CEO: commit/push onaysız; süre kısıtlı; dövüş bu fazda yok.

**F4'te biten (v2'de, push'lu)**
- Kayıt **v4** (anahtar `betweenDoors.save.v4`; `jobsCompleted`, `parcelsRecovered`, `settledJobIds`; `migrateV3toV4`;
  `ownedVehicleIds` `content/vehicles.ts` kataloğuna karşı doğrulanır; sıfırlama v1–v4'ü siler).
- İş panosu (b1d05a1): `domain/jobs/jobs.ts` (saf: `generateJobs` tohumlu, `JobController`, `settleJob`, `jobCapacity`),
  `app/JobsController.ts`, `content/jobs.ts` (`JOB_RULES` = QuestRunner yedek kuralları; E yine `emit()`'ten geçer),
  `ui/JobBoardView.ts`. Türler: plain / timed (geri sayım) / fragile (koşu + iki tekerde ani duruş hasarı; van muaf) /
  redirect (ilk kapı ikinciye yollar; panoda düz paket gibi görünür). Pano spotu `job_board` (Relay, −4.35, −10.6),
  dış bölgelerde 23 `address` spotu (`name` özelliği; yalnız eldeki işin kapısı etkileşimli). Bölüm teslimatı ACTIVE iken
  pano kapalı. HUD'da geri sayım, Tab'da iş notu, kapıda halka (`jobMarker`). Dev: `__game.jobOffers()`, `takeJob(job)`,
  `openJobBoard()`. Adresler tek seferlik betikle üretildi (repoda yok) — artık geo.json'da elle düzenlenir.
- Satıcı (d6fe77c): `bag` (Courier Bag, 2 iş), `haggling` (−%15, `Economy.priceFor`), araçlar (`vehicleStock`,
  `purchaseVehicle`; bike 120 / scooter 300 / motorcycle 600 / van 900).
- GPS hedef işareti (b4fd65c): minimap kenarında + M haritasında (`mapLayers.targetMarker`).
- W-G Magpies (merge edildi): `domain/chase/chase.ts` (saf `Thief`: lurking → approaching → fleeing → atDen / beaten),
  `content/magpies.ts` (4 pusu + ine rotalar, `MAGPIE_RULES`), `world/Magpie.ts`. `storyDay ≥ 2` veya dev
  `__game.setMagpies(true)` ve elde paket varken etkin. Kapınca `setStolen(true)`; 1.6 m içinde E → geri al
  (`parcelsRecovered`++); ine varırsa `magpie_crate` (18.2, −83) spotundan alınır. İn: Railway Yard çiti x 10..26, z −94..−80.

- W-E araca binme (merge fd07657): `domain/vehicles/parking.ts` (saf: `rackSlot`, `dismountSpot`, `ParkedState`),
  `world/ParkedVehicles.ts`, `content/vehicles.ts` (raf: iki tekerlekliler (−4.1, −4.2 / −3.1 / −2.0) doğuya bakar, van
  (−1.7, −1.5) yol kenarında; `VEHICLE_RULES`). Sahip olunan araç Relay önünde park eder; yanında E → bin (`vehicle.mount`),
  sürerken hedef yokken E → in (yer yoksa "inecek yer yok"); araç indiğin yerde kalır (kaydedilmez; bölüm başında
  sürülen araç rafa döner). Dev B tuşu duruyor.

**F4.2 kapanış (2026-11-14, 4. oturum) — plan `~/.claude/plans/devir-notunda-kalan-yerden-warm-nova.md`**
- Tarayıcıda (dev, `__game.frame(dt)` + gerçek tuş olayı, konuma ışınlanarak): bölüm 1→2→3 baştan sona (elde yan iş
  varken de), pano → redirect/plain iş → ödeme → yenileme sonrası kalıcılık, satıcıdan gerçek bisiklet alımı, dört araca
  E ile binme/inme, bisikletle ch1+ch2 teslimi, Magpie kapma → E ile geri alma, ine kaçış → sandıktan alma, TR metinler.
- qa-reviewer (F4 diff'i) bulguları düzeltildi (1d14f30): elde yan iş varken Mara paket vermez (`jobs.finishFirst`);
  hikâye teslimi araç üstündeyse araç orada park edilir (`leaveVehicleForStory`); iş saati/hırsız adımı kare başına en çok
  0.25 sn (`MAX_AMBIENT_STEP`); aynı kapıya iki işte eldeki paket önce (`JobsController.forDoor`); sıfırlama eldeki işleri
  bırakır (`jobs.clear`); araca binmek kırılır pakete darbe sayılmaz. Yedek kurallar tek liste: `content/worldRules.ts`
  (`WORLD_RULES`; GameApp ve `quests.test.ts` aynısını kullanır).
- file:// headless Edge: `dist/index.html` ana menü + kasaba açılıyor (dist 20 MB). Worker dalları/worktree'leri silindi.

**Sıradaki**
1. ~~CEO kararı: bölümlerde araç~~ → **karar verildi (CEO, 2026-11-14): hikâye teslimatı yürüyerek.** Bölüm ACTIVE iken
   park etmiş araca E → "yürüyerek yapılır" uyarısı; notu araç üstünde kabul edersen araç orada park edilir
   (`mountNearestVehicle`, `acceptNote`). Yan işlerde araç serbest.
2. FPS (pencere önde) — F3'ten beri ölçülmedi. İki tekerlilerin park görünümü gözle doğrulanmadı (kamera açısı tutmadı).
3. Yürüyerek/sürerek uçtan uca gerçek yol (ışınlanmadan) yalnız elle denenebilir; timed iş bu oturumda yeniden denenmedi.
4. F5 (gün ilerletme: `storyDay` yalnız dev `setDay` ile değişiyor → Magpies, motosiklet, van oyunda henüz erişilemez).
5. Kesme çizgisinin altı: sessiz teslim, dövüş, stamina, kısa yol çitleri, park konumunun kaydı, M haritasının hedefe
   göre açılması, hırsıza renk.

**CEO oyun testi sonrası (2026-11-14, 5. oturum)**
- **Görünmez duvar (Dial Square kuzeyi):** `Dressing.ts` malzemeye göre birleştirirken iki çiçek tarhını TEK mesh yapıyordu;
  `checkCollisions` birleşik mesh'e geçince çarpışma kutusu x −15..18.5, z 34.8..39.5 oluyordu. Katı parçalar artık
  birleştirilmiyor. Ders: `MergeMeshes` + `checkCollisions` = dev kutu; yeni birleştirme yazarken katıları ayır.
- **Çapraz duran proplar** (`collider: 'box'`, ör. Railway Yard arabaları) dünya eksenli kutu alıyordu (1.8×4.2 araba →
  3.9×4.6). `SceneColliders.measure` artık dönük kutuya kendi hattı boyunca kapsül veriyor.
- **İki tekerli sürüş hissi** (`VehicleMover`): duvara değen her karede hız ×bumpKeep oluyordu (sürtünce saniyenin onda
  birinde duruyordu). Şimdi yalnız duvara GİREN hız, zamana bağlı sönüyor; sürtünen araç burnunu duvar boyuna çeviriyor
  (`DEFLECT_*`), W/S basılıyken yürüme hızında direksiyon var (`minSteerSpeed`), geri hız 3 m/s, gövde yarıçapı
  bisiklet 0.36 / scooter 0.34 / motosiklet 0.45. Van'a dokunulmadı. Değerler ilk ayar — CEO elle denemeli.
- **Karıncalanma (z-fighting):** bölge kapısı tabelaları kemer yüzüyle, teknelerde gövde/burun/küpeşte güverteyle aynı
  düzlemdeydi. Tabelalar 3 cm önde + `zOffset` (`WorldBuilder.signAt`); tekne parçaları 2 cm kaydırıldı. Ders: iki yüzey
  asla aynı düzlemde bitmesin.
- **Ayakkabı:** Quaternius gövdeleri ayaksız (bilekte bitiyor). `player/characterShoes.ts` her karaktere ayak kemiğine
  bağlı tek skinned mesh ekliyor (+67 draw call; FPS ölçülmedi).
- **Bankta oturanlar** gömülüyordu (sit klibi kalçayı yere indiriyor): `Routine.onSeat` × `SEAT_LIFT` 0.28 m (`NpcDirector`).
- **Bölüm 3 mesajı:** pirinç kapı artık "solundaki eski posta tabelasını incele (E)" diyor (CEO eski sürümde takılmıştı).
- Bakılmadı: diğer bölgelerde gözle "görünmez engel" turu (liste tarandı, bariz dev kutu kalmadı; gizli yer tutucu
  bloklar model ayak izinden büyük olabilir).

**F5.0 gün ilerletme (2026-11-14, 5. oturum)**
- Kayıt **v5** (`dayJobs`, `dayEarnings`; `migrateV4toV5`). `domain/day.ts`: günde 2 pano işi → Mara'da "Mesaiyi bitir"
  (bölüm READY iken not diyaloğunda ikinci düğme; bölüm bitmişken Mara'nın E'si `day.end`). Özet diyaloğu: bugünkü iş +
  kazanç, yarın tezgâha gelenler, 2. güne geçerken Magpies uyarısı. Gün değişince araçlar rafa döner. Tab panelinde
  "N. gün · bugünkü pano işleri x/2" satırı. Tarayıcıda denendi (iş ödemesi `profiles.settleJob` ile enjekte edildi).
- Eksik: gün başı/sonu sahnesi yok (yalnız toast), 5 günlük ana hikâye içeriği yok (yalnız mekanizma), hafta bitince
  yalnız Mara'nın bir cümlesi var. `maraDone` metni kalktı.

**Bilinen (F4)**
- Hırsız engellerin içinden geçer (çarpışması yok); sıfırlanınca pusu noktasında belirir (yakındaysan görünür).
- Sandıktan geri alma `parcelsRecovered` saymaz (yalnız E ile kapma sayar).
- Yaya kovalamaca kolay: kapıştan sonra 1.2 sn sendeleme (`CHASE_TUNING.stumbleSeconds`).
- Fiyat/ödeme/süre değerleri ilk tahmin (`JOB_TUNING`, `content/vehicles.ts`) — F6'da dengelenecek.
- `/code-review` (F4 diff'i) düzeltilenler: sürerken yakındaki kasabalı E'yi kapmaz (iniş çalışır), hikâye tesliminde kurye
  yer varsa aracın yanına iner, Tab'daki iş geri sayımı saniyede bir yenilenir, CLAUDE.md kayıt v4'e güncellendi.
- `/code-review` ertelenenler: araca binme arada duvar/çit var mı bakmaz (2.2 m içinde ince çitin öbür yanından binilebilir —
  `CollisionWorld`'e doğru parçası sorgusu gerek); `MAGPIE_DEN` + in rotası + raf konumları kodda (geo.json'a taşınmalı);
  `Economy.priceFor` ile `jobs.ts` `round5` ve `purchaseVehicle`/`purchaseItem` tekrar ediyor.
- Bırakılan/geciken iş panoda aynı haliyle yeniden alınabilir (ceza yok) — F6 dengelemesi.
- Kırılır paket "darbe" kuralı GameApp'te (`updateJobs`), testsiz — `domain/jobs`'a taşınmalı.
- `generateJobs` karıştırması `sort(() => rnd() - 0.5)`: iş listesi tarayıcı motoruna göre değişebilir (işler kaydedilirse sorun).
- Bozuk `ownedVehicleIds` (dizi değil) sessizce boş listeye döner; `ProfileController.settleJob/recoverParcel/buyVehicle` testi yok.
- Raf sıkışık (1.1 m aralık): iki aracın arasında E en yakın olanı seçer.
- Elde iş yenilemede kaybolur (kaydedilmez).
- 5200'deki eski vite sunucusunun bağımlılık önbelleği bozuk (504 Outdated Optimize Dep → fotoğraf/final resmi düşer):
  kapatıp `npx vite --port 5200 --strictPort --force` ile yeniden başlat. Bu oturum 5201 kullanıldı.
- Boş klasör `.claude/worktrees/agent-aebe67f952bb7e335` Windows kilidi yüzünden silinemedi (zararsız).

**Son doğrulama (bu not yazılırken)**: typecheck temiz, 356 test, `npm run build` başarılı; yukarıdaki tarayıcı turu.

---

## F3 (2026-11-14 gece, 2. oturum) — bitti
F3 planı: `~/.claude/plans/kald-m-z-yerden-devam-edelim-curried-heron.md` (dalgalar, worker sahiplikleri).
CEO: commit/push onaysız; hız için subagent'lar; eksik modeller (ördek/kuş, scooter, motosiklet, van) şimdilik yer tutucu;
**model Fable 5.2'ye alındı — tasarım, işleyiş ve görsellikte daha yüksek kalite bekleniyor.**

**Bitti (v2'de, push'lu)**
- F3.0 temel (af3b6ba): bölgeler haritayı çakışmadan döşer, her feature bir bölgede (doğrulayıcı), dış kenarlara otomatik
  sınır duvarı (`worldData.boundaryWalls`). 7 bölge aktif: indigo-row, dial-square (çekirdek, `content/world` `coreRect`),
  postmark-mews, market-hill, canal-side, railway-yard, hillside-park (`districts.geo.json`; dış dört bölgenin içi BOŞ zemin).
  Çekirdek duvarlarında 3 açıklık: sokak güneyi (x −5..5, z −20), meydan kuzeyi (x −3..3, z 40), avlu doğusu (z 2..6, x 28);
  KayKit sıraları bu sokakları boş bırakır (`townLayout.coreOpenings`). Mews kapısı/ipuçları artık duvar verisine bağlı.
  Performans tabanı: karakter GLB'si sahne başına bir kez çözülür (`CharacterModel.containerFor`; "Body" adı 3 düğümde —
  kemik düğümü öncelikli), `SceneColliders` yalnız katı mesh'te yeniden kurar, `camera.maxZ` 190, gölge haritası kamerayı izler.
- W-A pazarcı + ekonomi (c3d4e71, merge edildi): `domain/Economy.ts`, `ui/VendorView.ts`, kayıt **v3** (`ownedItemIds`,
  anahtar `betweenDoors.save.v3`, zincir v1→v2→v3), menü mağazası kalktı, SpotKind `vendor`, çağrı `vendor.open`.
  Dev: `__game.openVendor()`, `__game.setDay(n)`. GPS 2. günden itibaren 150 kredi (gün ilerletme F5'te; istenirse 1. güne alınır).
  Haritada `npc_vendor` spotu HENÜZ YOK (W-C koyacak). Satıcının adı yok ("Vendor"/"Satıcı" yer tutucu).

- W-B araçlar (d697239, merge edildi): `player/movers/VehicleMover.ts` + `vehicles.ts` (bike/scooter/motorcycle/van ayar
  tablosu), van için `CollisionWorld.moveCapsule`, yer tutucu görseller `player/vehicles/*`, `PlayerController.setVehicle`,
  dev'de B tuşu araçlar arasında döner. E ile binme/sahiplik F4. **Görsel kontrol ana oturumda yapılamadı** (worker kendi
  testinde baktı): yeni sohbette B ile dört aracı gözle kontrol et; görseller basit — Fable ile güzelleştirilebilir.
  Bilinen: burnu duvara dayalı van dönemez (önce geri), motosiklet uçları duvara hafif girebilir.

- Dalga 2 (2026-11-14, plan `~/.claude/plans/devir-notunda-kalan-yerden-vivid-karp.md`):
  - Şema (73b6262): yüzeyler `grass`/`water`/`bridge` (su yürünmez = görünmez çarpışma kutusu; köprü = su parçaları
    arasındaki boşluk, doğrulayıcı suyun yol/kaldırım/köprüyle kesişmesini reddeder), bina/kapı cephesi north/south
    (`facadeEdge`; cephe süsü yalnız east/west), poi `stall`, bölge başına zemin (`District.ground`), KeepOut cephe düzlemine bağlı.
  - M haritası (72d36a0): `domain/world/mapFrame.ts` (saf) + `ui/MapView.openSketchMap` — bulunulan bölgede açılır, tekerlek/±
    ile yakınlaşır, oklarla kayar, 0 sıfırlar; girilmemiş bölge "?"; ilk girişte `ProfileController.discoverDistrict` + bildirim.
    Final notu sabit kroki (`buildMap`). Minimap keşfe bakmaz (hepsini çizer).
  - `world/SceneStreamer.ts` (ec79716): sis sonu + 10 m'den uzak sabit kök düğümler kapanır; çekirdek + Postmark Mews hariç;
    iskeletli / `dynamicCollider` / `metadata.noStream` düğümler alınmaz. Dev: `__game.streamer.stats`.
  - W-D (merge 6f73d01): `domain/npc/routine.ts` (saf rutin makinesi), `content/npcs.ts` (28 kasabalı + 3 kedi, 2 köpek, yalnız
    çekirdekte), `world/NpcDirector.ts`, `world/Animals.ts`, `world/crowd.ts`; E → `townsfolk.greet` (spot türü `townsfolk`,
    en yakın kasabalıyı izleyen tek spot). Hayvanlar `build/animals/convert.mjs` (worktree'den çalıştırılırsa `--source`).
    `waypoints` saf kısmı `domain/npc/`'ye taşındı. Pazarcı modeli `npc_vendor` noktasına bağlı (`oldclassy_f`).
  - Araçlar gözle kontrol edildi (scooter, motosiklet, van): bariz bozukluk yok; bisiklete bakılmadı.

  - W-C bölge içerikleri (merge c810861): `content/world/{market-hill,canal-side,railway-yard,hillside-park}.geo.json`,
    `world/districtLayout.ts` (saf) + `world/districtDressing.ts` (bölge başına birleşik süsleme, KayKit sıra evleri bina
    bloklarının üstüne; ne olacağı id belirteçlerinden: hall, wagon, boat, stack, track…), poi `lamp`. Pazarcı: tezgâh
    (6.2, 72.5), spot `npc_vendor` (6.2, 74). Kanal x 84..96 (köprüler z −40..−34, 0..8, 22..28). Postmark Mews dışarıdan
    duvarla kapalı (yalnız kapıdan). geo.json'lar tek seferlik üreteçle yazıldı (repoda yok) — artık elle düzenlenir.
  - QA düzeltmeleri (2b6389a): Mews ch3'ten önce duyurulmaz/adlandırılmaz (`domain/world/discovery.ts`), müstakil evlere
    çarpışma + harita köşelerine dolgu zemin (`world/TownSolids.ts`; sıra evlerinki `districtDressing`'de), harita açıkken
    tekerlek kameraya gitmez, aynı döngüdeki duran kişinin içine yürünmez.
  - Dalga 3: `content/npcs.ts` `OUTER_TOWNSFOLK` (26 kişi: pazar 12, kanal 4, park 5, depo 5) + `OUTER_ANIMALS`
    (park köpeği, kedi); `CORE_*` + `OUTER_*` = `TOWNSFOLK`/`ANIMALS`. Dış bölge noktaları harita katmanlarına karşı testli.

**Sıradaki**
1. FPS ölçümü (pencere önde). Bu oturumda yalnız senkron `scene.render()` süresi ölçüldü (arka pencere): çekirdek 12 ms /
   738 aktif mesh, meydan 10 ms, pazar 10 ms, kanal 6.5 ms, depo 6 ms, park 5 ms; sahnede 2777 mesh, 70 iskelet.
2. `/code-review` (F3 diff'i, 4e9f932..HEAD) — bu oturumda ÇALIŞTIRILMADI. qa-reviewer çalıştı (bulgular aşağıda).
3. Elle: çekirdeğin üç açıklığından yürüyerek geçiş, tekerlek + yürüyen kuyruğu düzeltmeleri, pazarcıdan satın alma +
   yenileme sonrası kalıcılık, TR dilinde yeni bölgeler.
4. F4 Oynanış (yan işler, Magpies, skiller, E ile araca binme).
5. Kesme çizgisinin altı: araç görselleri, kartal/ördek, Dressing'in çekirdek dışına genellenmesi, KayKit doku tekrarı,
   minimap'in keşfe uyması, su renginin (çok parlak camgöbeği) yumuşatılması, tezgâhların hepsi kuzeye bakıyor.

**Bilinen / ertelenen (qa-reviewer)**
- Kasabalıların tüm mesh'leri gölge düşürür (Atmosphere otomatik kayıt) — FPS ölçümünden sonra karar.
- Selamlaşma yalnız en yakın kişiye bakar (en yakın arkadaysa öndeki için E çıkmaz).
- Doğrulayıcı boşlukları (bugünkü veride tetiklenmiyor): bölgeler sınır kutusunu döşemek zorunda değil (dolgu zemin var),
  `mapOnly` su reddedilmiyor, K/G kapıların keepOut'u yok.
- ch1 tesliminden sonra kasabalılar Arthur sahnesi için gizlenir, sonuç ekranı boyunca gizli kalır.
- 35–70 m arası kasabalılar donuk pozda kayar; yükleme göstergesine dahil değiller.
- `npcs.test.ts` çekirdek engellerinin bir kısmı (lamba, bank, çiçeklik) sabit kopya — Dressing değişirse test güncellenmeli.
- Eski worker dalları ve worktree'leri silindi (2026-11-14, CEO onayıyla); hepsi `v2`'ye merge edilmişti.

**Dikkat**
- Playwright penceresi arkada kalınca tarayıcı kareyi kısıyor (rAF ~1/sn): hikâye testlerinde kareler `__game.frame(dt)`
  ile elle ilerletildi; FPS için pencere önde olmalı. Ekran görüntüleri `.playwright-mcp/` (ignore'lu).
- 5200 portunda vite sunucusu çalışıyor olabilir; çalışıyorsa onu kullan.
- Son doğrulama: typecheck temiz, 292 test, `npm run build` başarılı (dist 20 MB); ch1–3 `__game` ile baştan sona (dış
  bölgeler eklenmeden önce); dört bölge + pazarcı tezgâhı + kanal/köprü tarayıcıda; file:// headless Edge ana menü açılıyor
  (dış bölgeler eklenmeden önceki derleme).

## v2 (dal `v2`, push'lu) — 2026-11-13
Plan: `~/.claude/plans/ama-ele-tirimi-yapay-m-m-adaptive-unicorn.md` (F0–F6). Kurallar: `CLAUDE.md`.

**F1 Temel — bitti**
- 6d61127 zip derlemesi (klasik script + `packs/<kit>.js`), `@asset-source`.
- f6c7401 dünya GeoJSON katmanlarından (`content/world/*.geo.json`, `domain/world/worldData.ts`); 3D + M haritası aynı veriden.
- 6052f23 `CollisionWorld` (saf 2D) + `SceneColliders` + `FootMover`; `moveWithCollisions` yok.
- 721c900 `BikeMover` + geçici `BikeVisual` + `CameraRig` (araçta arkaya döner). Bisiklet yalnız dev'de B tuşu.
- d5f5a34 + 8be1d09 `QuestRunner` + `content/quests` (ch1–3 veri); /code-review bulguları düzeltildi.
- 2710df7 kayıt v2 (`betweenDoors.save.v2`, `migrateV1toV2`, v1 silinmez; sıfırlama ikisini siler).

**F2 Görünüm — sürüyor**
- 4823261 F2.1 Quaternius UACP karakterleri: `build/characters/` (cast.json + convert.mjs, Blender 5.3 headless),
  `src/assets/models/chars/` (27 karakter + ortak `anims.glb`). Roller: courier, mara, finn, june, arthur.
- e0307d6 F2.2 `Animator` (taşıma klipleri, tek seferlik pick-up/victory, bisiklet pozu sit-down) + `gestures.ts`
  (talk/wave/nod; kemik eksenleri dosyada).
- F2.3 (commit bekliyor) `ui/Compass.ts` kadranlı pusula iğnesi (Compass yükseltmesiyle, bakış yönü), `ui/Minimap.ts`
  yuvarlak minimap (kuzey yukarıda, oyuncu oku) ve M haritasında "buradasın" — ikisi de **GPS'e kadar gizli**
  (CEO kararı 2026-11-13). `GameApp.gpsActive` F4'te pazarcıdaki GPS skilline bağlanacak; dev'de `__game.setGps(true)`.
  Çizim ortak: `ui/mapLayers.ts`. "Keşfedilen yerler" (kayıt şeması değişir) F3'e kaldı.
- F2.4 (bu commit) KayKit City Builder Bits (`build/city/convert.mjs` → `src/assets/models/city/`, paket `city.js`
  1.5 MB). Haritada yeni `prop` katmanı (sokak eşyası + park etmiş arabalar; `worldData.ts` `PROP_MODELS`, ölçüler
  `world/cityKit.ts`): çarpışma kutuları WorldBuilder'da senkron, modeller kasaba yüklemesinde. Sınırın K/G/D dışında
  KayKit bitişik nizam sıraları (`townLayout.cityRows`, CEO kararı 2026-11-14); batı + Postmark Mews çevresi Kenney kaldı
  (ch3 fotoğraf açıları değişmesin). Ortak yükleyici `world/modelLibrary.ts` (`anchor: 'footprint'`). Işık/renk sabitleri
  `world/palette.ts`'de toplandı (değerler aynı; kit malzemeleri mat). Mews: kodla ahşap sandalyeler, misafirler ve masadaki
  Arthur `sit-down` son karesinde oturur, kollar `gestures.SEATED_ARMS` ile kucakta. Teslim boyutu 20 MB.
  `city/watertower.glb` dönüştürüldü ama henüz kullanılmıyor (F3 çatı dekoru adayı).
  İnceleme (qa-reviewer + /code-review) düzeltmeleri: prop çarpışma kutusu model gelene kadar görünür yer tutucu (görünmez
  duvar yok), döndürülmüş kutular AABB, Kenney ev sırası eskisiyle birebir (test), binalar gövde merkezinden (`anchor:
  'ground'`), kit ölçüleri GLB'lere karşı testli (`world/cityKit.test.ts`), eşya–rota/kapı mesafesi ayak izine göre.
  Ertelenen: KayKit dokusu her GLB'de ayrı gömülü (~0.5 MB tekrar), MewsCast oturma pozu Animator'daki kemik
  ofseti mantığını tekrar ediyor (birleştirilebilir), `yardNorthBlock` kaplama dikdörtgeni kodda (haritadan okunmalı).
- Commit/push artık onaysız (CEO 2026-11-14; CLAUDE.md).
- **Sıradaki: F3 Dünya** (6 bölge, ≥25 NPC rutini, hayvanlar, pazarcı/ekonomi) — plan dosyasındaki sırayla.

**Notlar**
- Dev sunucusu: `npx vite --port 5200 --strictPort --force` (5199'daki eski sunucunun önbelleği bozuk).
- Test yardımcıları: dev'de `window.__game` (`interact`, `startChapter`, `quest`, `staticNpcs`, `player.setRiding`).
- file:// testi: headless Edge `--user-data-dir` ile ayrı profil (yoksa açık Edge'e yapışıyor).
- Teslim boyutu 18 MB (chars 11.9 MB). Bütçe ~40 MB.

---

# v1 devir notu (2026-11-12)

## Bitti (main, push'lu)
- İskelet: Vite + TS + Babylon 9, tek dosya teslim derlemesi (`npm run build` → `dist/index.html`, file:// çalışır).
- Oyuncu: WASD/Shift, pointer-lock fare bakışı (Esc bırakır), çarpışma, kamera duvar önüne yaklaşır.
- Bölüm 1 First Impressions: Mara → not → iki mavi kapı (biber saksılı doğru kapı) → teslim → sonuç.
- İlerleme/kayıt: kredi (ilk bitiriş 100), rekorlar, 3/4 başarım, Relay dükkânı (Compass, Steady Pace),
  doğrulamalı localStorage kaydı (bozuk kayıt silinmez), iki sekme koruması.
- EN/TR dil paketi (çalışma anında değişir, profile kaydolur).
- Bölüm 2 Crossing Paths: Dial Square + çeşme, Crossing Yard + kapı, Finn (devriye → buluşma rotası),
  tek onay, erken bekleme süreden düşer, kestirme kapısı ch2 sonrası açık.
- Görsel 1. aşama: güneş + gölge, gökyüzü kubbesi, sis, post-process (`world/Atmosphere.ts`); pencereler, çatılar,
  kaldırım, lambalar, meydan dekoru, arka plan silüeti (`world/Dressing.ts`). Oynanış geometrisi aynı.
- 86 birim testi; her adımda tarayıcı + file:// testi yapıldı.

## Sıradaki işler (öncelik sırası)
1. (Bitti) Görsel 2. aşama: Kenney Suburban/Commercial (`world/TownModels.ts`). Ana sokak cepheleri bizim (ipucu kapıları).
   İsteğe bağlı: avlu/ara sokak yan cepheleri, depo bloğu, düşük kalite ayarı.
2. (Bitti) Bölüm 3 Between Doors: Dial Square batı duvarında gate_postmark + ipuçları (BELLWICK POST tabelası =
   old_post_sign, kırık duvar, eğik ağaç); doğu duvarında sahte gate_east (−100). Sylvie'nin fotoğrafı gerçek girişten
   render edilir (`MewsCast.captureView`, CSS sepya). Tabela incelenmeden kapı açılmaz. Final: Arthur kapıda →
   "The neighbourhood did" → albüm → masa resmi → kroki notu → sonuç → teşekkürler. ch3 referans süresi 90 sn (tahmin).
   ch1 sonrası Arthur karşılaşması (Bitti, 0e86121): June'a teslimden sonra, sonuçtan önce Arthur kapının yanında
   belirir (`ARTHUR_CAMEO`, `GameApp.showArthurCameo`), sonuç ekranı açıkken Dial Square'e yürüyüp kaybolur. Puan/kayıt etkilenmez.
3. (Bitti) Ana menü: Continue / Start Shift / Chapters (kilit + rekor) / Settings (dil, fare hassasiyeti,
   onaylı Reset Progress — ayarlar korunur). Bitiş ekranında Ana Menü.
4. (Bitti) İpucu FR-13: H → onay; 1. metin (−50), 2. arama bölgesi halkası (−100, ch2'de buluşma noktasına
   kayar); tekrar görmek ücretsiz. İçerik `chapters.ts` hintText/hintArea.
5. (Bitti) M: sabit kroki (`ui/MapView.ts`, canlı konum yok; Postmark Mews ch3 sonrası kırmızı kesikli).
   Esc: duraklatma (Devam / Teslimatı Baştan Başlat / Ayarlar / Ana Menü; süre durur; fare yakalıysa ilk Esc fareyi bırakır).
   Yükleme çipi "Bellwick yükleniyor… n/m", hata olursa "Tekrar Dene". İpucu halkası CEO kararıyla doğru kapının önünde.
6. (Yapıldı) Kapanış incelemesi: qa-reviewer bulguları düzeltildi (ch2 tekrarında Finn donması, WebGL hata ekranı,
   bildirim kuyruğu, oyun özeti + ekipman satırı, finalde kroki görseli, fotoğraf/resim zaman aşımları, sıfırlama metni,
   bilinmeyen bölüm → ch1). Bağımsız ikinci görüş için `/codex:review` CEO'ya önerildi.
7. (Bitti) Müzik: "Arthur's tune" — oyuna özgü kısa vals (`content/melody.ts`), ses dosyası yok; Web Audio ile
   kodda çalınır (`audio/MusicPlayer.ts`, zamanlama `audio/melody.ts` testli). ch1 sonrası Arthur ilk cümleyi mırıldanır,
   ch3 finalinde (albüm) müzik kutusu tam çalar. Ayarlar → Müzik (0 = Kapalı, bırakınca kısa örnek), profilde `musicVolume`.

## Teslim öncesi elle kontrol listesi
- Temiz klasörde `npm ci && npm run typecheck && npm test && npm run build` (NFR-02); Node sürümünü not et.
- Zip'ten çıkarılmış `dist/index.html` çift tıkla: Chrome, Edge ve Safari (Safari file:// localStorage → geçici oturum olabilir).
- M-01: yeni profil ch1 → ch2 (çeşme) → ch3; ikinci denemede avlu seçimi; ch3 kestirme açık başlıyor mu.
- Bölümler'den ch2'yi aynı oturumda tekrar oyna (Finn yürümeli).
- M-03: bölüm ortasında yenile → bölüm başı; tekrar oyunda kredi yok; Special Delivery final resminden sonra; puan-ekipman eşleşmesi.
- Final resminde Mara, Finn, June, Arthur masada.
- Esc her durumda: fare kilitli, panel/kroki açık, ipucu dialogu.
- Tam oyun TR; Ayarlar'dan dil değiştirme.
- Müzik file:// üzerinden Chrome/Edge/Safari'de duyuluyor mu; Müzik = Kapalı iken sessiz mi.
- WebGL kapalı, depolama dolu/engelli, yavaş yükleme (yükleme çipi + Tekrar Dene).
- Hedef bilgisayarda 1280x720 FPS ölç ve kaydet (NFR-05).

## Açık kararlar / notlar
- Oyun içi metin: EN/TR; özel isimler İngilizce kalır.
- Yanlış kapı adayı ch1'de tek (belgeye uygun).
- Pusula = baktığın yön (hedefi göstermez) — CEO onayladı (2026-11-13).
- Playwright penceresi görünür: testler sırasında o pencerede tuşa basılmasın.
- Test yardımcıları: dev modda `window.__game` (prod derlemede yok).
