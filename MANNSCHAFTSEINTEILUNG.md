# Mannschaftseinteilung

Die Einteilung in Mannschaften basiert ausschließlich auf der Setzliste-Position (Rang) aus der Verbandsmeldung. Sie ist unabhängig von den konkreten Spielern — bei einer neuen Meldeliste bleibt die Einteilung bestehen.

## Regeln

| Rang (Setzliste) | Mannschaft      | Farbe (UI) |
|-------------------|-----------------|------------|
| 1–6               | 1. Mannschaft   | Blau       |
| 7–12              | 2. Mannschaft   | Grün       |
| 13–18             | 3. Mannschaft   | Gelb       |
| ab 19             | 4. Mannschaft   | Grau       |

- Jede Mannschaft hat 6 Stammplätze
- Die 4. Mannschaft hat keine feste Obergrenze
- Spieler ohne Rang (z.B. reine Trainings-Spieler) werden keiner Mannschaft zugeordnet
- Bei Spieler-Import über Verbandsliste wird der Rang automatisch übernommen
- Die Einteilung gilt für 24 oder 100 Spieler gleichermaßen

## Mannschaftsführer

| Mannschaft      | Mannschaftsführer        |
|-----------------|--------------------------|
| 1. Mannschaft   | Uwe Schielke (17102281)  |
| 2. Mannschaft   | Peter Keutmann (16502859)|
| 3. Mannschaft   | (noch nicht besetzt)     |
| 4. Mannschaft   | Markus Wages (16702455)  |

Markus Wages hat zusätzlich die Rolle `trainings_verwalter`.

## Kernmannschaft (Feld "kern")

Die Kernmannschaft ist unabhängig vom Rang. Sie definiert:
- Welche Spieltage der Spieler **priorisiert** sieht (seine Mannschaft zuerst)
- Für welche Mannschaft der Spieler primär eingeplant wird

Ein Spieler mit Rang 20 (= 4. Mannschaft laut Setzliste) kann Kern M3 sein, wenn er dort regelmäßig spielt.

Werte: 1, 2, 3, 4 oder leer (keine Kernmannschaft zugewiesen)

Wird in der Spieler-Verwaltung per Klick gesetzt (Admin/Verwalter).

Perspektive: Bei Ausweitung auf den gesamten Club (mehrere Altersklassen mit je 1-4 Mannschaften) wird die Kernmannschaft pro Altersklasse definiert.
