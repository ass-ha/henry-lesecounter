# Henrys Lesecounter

Gemeinsamer Lesezähler für zwei Geräte. Statische Seite für GitHub Pages, die Daten liegen in Firebase.

- Klicker für Wörter, Seiten, Bücher oder Minuten
- Tarif und Einheit jederzeit änderbar (Bereich "Tarif einstellen")
- Statistik pro Tag, Woche und Monat mit Menge und verdientem Geld
- Beide Eltern melden sich an und sehen denselben Stand live

## Einrichtung (ca. 15 Minuten)

### 1. Firebase-Projekt

1. In der [Firebase-Konsole](https://console.firebase.google.com) ein Projekt anlegen (Google Analytics nicht nötig).
2. Projekteinstellungen, "Deine Apps", Web-App (`</>`) hinzufügen. Hosting nicht aktivieren.
3. Die angezeigte `firebaseConfig` in `firebase-config.js` übernehmen.

### 2. Anmeldung

1. Build, Authentication, "Anmeldemethode": **E-Mail/Passwort** aktivieren.
2. Tab "Users", "Nutzer hinzufügen": zwei Konten anlegen (deins und das deines Mannes) mit je einem Passwort.

### 3. Datenbank und Regeln

1. Build, Firestore Database, Datenbank erstellen. Standort in Europa wählen (zum Beispiel `eur3` oder `europe-west3`). Im **Produktionsmodus** starten.
2. Tab "Regeln": den Inhalt von `firestore.rules` einfügen. Beide E-Mail-Adressen **kleingeschrieben** eintragen, genau wie bei den Konten aus Schritt 2. Dann "Veröffentlichen".

Ohne diese Regeln kann niemand etwas speichern. Mit ihnen kommen nur die zwei Adressen an die Daten, auch wenn die Seite öffentlich im Netz steht.

### 4. GitHub Pages

1. Auf GitHub ein neues Repository anlegen, zum Beispiel `henry-lesecounter`. GitHub Pages ist im kostenlosen Tarif nur für öffentliche Repositories verfügbar. Das ist unkritisch, weil im Code keine Lesedaten stehen. Die Seite zeigt nur die Anmeldung.
2. Den Ordner hochladen. Auf der Kommandozeile jeweils eine Zeile einzeln ausführen:

```
git init -b main
git add .
git commit -m "Lesecounter"
git remote add origin https://github.com/DEIN-NAME/henry-lesecounter.git
git push -u origin main
```

   Alternativ im Browser: Repository öffnen, "Add file", "Upload files" und alle Dateien hineinziehen.
3. Im Repository: Settings, Pages, Source "Deploy from a branch", Branch `main`, Ordner `/ (root)`. Nach etwa einer Minute ist die Seite unter `https://DEIN-NAME.github.io/henry-lesecounter/` erreichbar.
4. Den Link auf beiden Handys als Lesezeichen oder auf dem Startbildschirm ablegen.

## So wird gespeichert

- Pro Tag ein Dokument in `days/JJJJ-MM-TT` mit den Mengen je Einheit und dem verdienten Betrag in Cent.
- Beim Klicken wird der Betrag **zum Tarif von jetzt** addiert. Wenn du den Tarif später änderst, bleiben alte Tage und Wochen deshalb unverändert.
- Der Tarif steht in `settings/tariff` (Einheit und Cent pro Einheit, Dezimalwerte wie 0,5 sind möglich).
- Zähler laufen über `increment()` auf dem Server. Zwei Geräte gleichzeitig überschreiben sich nie.
- Tage richten sich nach der lokalen Zeit des Geräts (Mitternacht deutscher Zeit).

## Kosten und Grenzen

Der kostenlose Firebase-Tarif (Spark) reicht dafür locker: Jeder Klick ist eine Schreiboperation, erlaubt sind 20.000 pro Tag.

## Datenschutz

Es werden nur Mengen, Beträge und deine zwei E-Mail-Adressen bei Firebase (Google) gespeichert, keine Namen oder Texte von Henry. Mit dem Standort Europa bleiben die Daten in der EU.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `index.html` | Oberfläche und Design |
| `app.js` | Anmeldung, Klicker, Statistik, Tarif |
| `stats.js` | Auswertung nach Tag, Woche, Monat und Formatierung |
| `firebase-config.js` | Deine Firebase-Werte |
| `firestore.rules` | Zugriffsregeln für die Datenbank |
