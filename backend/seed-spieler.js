/**
 * Seed: Spieler aus Mannschaftsmeldung Winter 2025/2026 + Trainings-Spieler
 * in ClubApp-Tabelle anlegen.
 *
 * Matching: Name aus Trainings-App → Verbands-ID aus Meldeliste
 * Trainings-App Passwort-Hashes werden übernommen wo vorhanden.
 * Abgänge (in Trainings-App aber nicht in Meldeliste) werden übersprungen.
 *
 * Usage: node seed-spieler.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const SOURCE_TABLE = 'TennisTrainingsRunden';
const TARGET_TABLE = 'ClubApp';
const INITIAL_PASSWORD = 'Dormagen2026!';

// Meldeliste Winter 2025/2026 — ID-Nr. = Verbands-Spieler-ID
const MELDELISTE = [
  // Herren 50 1 (Ra. 1-28)
  { ra: 1,  nachname: 'Zinkler',             vorname: 'Sebastian',    id: '17601724', lk: 7.4  },
  { ra: 2,  nachname: 'Stürtz',              vorname: 'Michael',      id: '15151480', lk: 9.0  },
  { ra: 3,  nachname: 'Doderer',             vorname: 'Sascha',       id: '17601596', lk: 9.1  },
  { ra: 4,  nachname: 'Essing',              vorname: 'Danny',        id: '17500611', lk: 10.3 },
  { ra: 5,  nachname: 'Dr. Falke',           vorname: 'Till',         id: '17280605', lk: 11.5 },
  { ra: 6,  nachname: 'Dr. aus der Fünten',  vorname: 'Jörg',        id: '16751628', lk: 12.7 },
  { ra: 7,  nachname: 'Sunderdiek',          vorname: 'Stephen',      id: '16803238', lk: 13.3 },
  { ra: 8,  nachname: 'Hall',                vorname: 'James',        id: '17159598', lk: 13.6 },
  { ra: 9,  nachname: 'Weber',               vorname: 'Patrick',      id: '17001961', lk: 14.1 },
  { ra: 10, nachname: 'Nikolic-Schönewald',  vorname: 'Nebojsa',      id: '16202670', lk: 15.4 },
  { ra: 11, nachname: 'Krieger',             vorname: 'Achim',        id: '16905216', lk: 16.3 },
  { ra: 12, nachname: 'Bartels',             vorname: 'Thomas',       id: '16503307', lk: 16.6 },
  { ra: 13, nachname: 'Dr. Böckmann',        vorname: 'Mark',         id: '16102438', lk: 17.3 },
  { ra: 14, nachname: 'Schielke',            vorname: 'Uwe',          id: '17102281', lk: 17.6 },
  { ra: 15, nachname: 'Foerster',            vorname: 'Lothar',       id: '16802737', lk: 17.7 },
  { ra: 16, nachname: 'Missbach',            vorname: 'Peter',        id: '15702848', lk: 18.5 },
  { ra: 17, nachname: 'Förster',             vorname: 'Stefan',       id: '16652644', lk: 18.6 },
  { ra: 18, nachname: 'Brinkmann',           vorname: 'Bernd',        id: '16502238', lk: 18.6 },
  { ra: 19, nachname: 'Reiterberger',        vorname: 'Stefan',       id: '17651449', lk: 19.0 },
  { ra: 20, nachname: 'Habrich',             vorname: 'Markus',       id: '16702255', lk: 17.6 },
  { ra: 21, nachname: 'Künzel',              vorname: 'Michael',      id: '16205866', lk: 19.3 },
  { ra: 22, nachname: 'Conrad',              vorname: 'Michael',      id: '17301760', lk: 19.6 },
  { ra: 23, nachname: 'Hermes',              vorname: 'Dirk',         id: '17161249', lk: 19.6 },
  { ra: 24, nachname: 'Rentergent',          vorname: 'Peter',        id: '17101984', lk: 20.6 },
  { ra: 25, nachname: 'Pelko',               vorname: 'Peter',        id: '16995636', lk: 24.0 },
  { ra: 26, nachname: 'Riedel',              vorname: 'Christian',    id: '16856897', lk: 20.9 },
  { ra: 27, nachname: 'Bartel',              vorname: 'Jonny',        id: '16502223', lk: 21.1 },
  { ra: 28, nachname: 'Bisping',             vorname: 'Dirk',         id: '17000931', lk: 23.7 },
  // Herren 50 2 (Ra. 29-63)
  { ra: 29, nachname: 'Wendt',               vorname: 'Carsten',      id: '16904991', lk: 23.9 },
  { ra: 30, nachname: 'Ritter',              vorname: 'Frank',        id: '16754973', lk: 21.1 },
  { ra: 31, nachname: 'Mirschenz',           vorname: 'Klaus',        id: '16703015', lk: 21.6 },
  { ra: 32, nachname: 'Bresser',             vorname: 'Frank',        id: '16602269', lk: 21.6 },
  { ra: 33, nachname: 'Golf',                vorname: 'Stefan',       id: '17285811', lk: 24.0 },
  { ra: 34, nachname: 'Keutmann',            vorname: 'Peter',        id: '16502859', lk: 21.9 },
  { ra: 35, nachname: 'Hansen',              vorname: 'Christian',    id: '16593101', lk: 23.1 },
  { ra: 36, nachname: 'Raabe',               vorname: 'Stefan',       id: '16802780', lk: 21.2 },
  { ra: 37, nachname: 'Brand',               vorname: 'Oliver',       id: '16604054', lk: 21.3 },
  { ra: 38, nachname: 'Frackowiak',          vorname: 'Peter',        id: '16352742', lk: 22.3 },
  { ra: 39, nachname: 'Döring',              vorname: 'Thomas',       id: '16990046', lk: 21.6 },
  { ra: 40, nachname: 'Richrath',            vorname: 'Bernd',        id: '17101989', lk: 25.0 },
  { ra: 41, nachname: 'Fischer',             vorname: 'Jörg',         id: '16656176', lk: 24.3 },
  { ra: 42, nachname: 'Michels',             vorname: 'Stefan',       id: '17355800', lk: 23.7 },
  { ra: 43, nachname: 'Köpp',                vorname: 'Andreas',      id: '16853745', lk: 20.7 },
  { ra: 44, nachname: 'Jenal-Brakelsberg',   vorname: 'Michael',      id: '17159395', lk: 23.9 },
  { ra: 45, nachname: 'Yesil',               vorname: 'Murat',        id: '17556325', lk: 23.4 },
  { ra: 46, nachname: 'Yildiz',              vorname: 'Hakan',        id: '17557368', lk: 24.0 },
  { ra: 47, nachname: 'Holtmann',            vorname: 'Ulrich',       id: '16404192', lk: 24.3 },
  { ra: 48, nachname: 'Weber',               vorname: 'Peter',        id: '16403502', lk: 23.6 },
  { ra: 49, nachname: 'Wages',               vorname: 'Markus',       id: '16702455', lk: 23.0 },
  { ra: 50, nachname: 'Bittel',              vorname: 'Frank',        id: '16453114', lk: 22.9 },
  { ra: 51, nachname: 'Franzmann',           vorname: 'Gregor',       id: '16202537', lk: 22.6 },
  { ra: 52, nachname: 'von der Linden',      vorname: 'Holger',       id: '16591837', lk: 24.1 },
  { ra: 53, nachname: 'Feltgen',             vorname: 'Christian',    id: '16653304', lk: 25.0 },
  { ra: 54, nachname: 'Zacheja',             vorname: 'Manfred',      id: '16202789', lk: 22.2 },
  { ra: 55, nachname: 'Lemke',               vorname: 'Stefan',       id: '17051982', lk: 25.0 },
  { ra: 56, nachname: 'Deutzmann',           vorname: 'Manfred',      id: '16103218', lk: 25.0 },
  { ra: 57, nachname: 'Schreiber',           vorname: 'Daniel',       id: '17203912', lk: 24.6 },
  { ra: 58, nachname: 'Thiel',               vorname: 'Sascha',       id: '17163126', lk: 25.0 },
  { ra: 59, nachname: 'Kartschewski',        vorname: 'Michael',      id: '16453522', lk: 25.0 },
  { ra: 60, nachname: 'Brimmers',            vorname: 'Stefan',       id: '16403071', lk: 25.0 },
  { ra: 61, nachname: 'Soltek',              vorname: 'Daniel',       id: '15703259', lk: 25.0 },
  { ra: 62, nachname: 'Wünsche',             vorname: 'Bernhard',     id: '16302741', lk: 23.2 },
  { ra: 63, nachname: 'Thönneßen',           vorname: 'Johannes',     id: '15702951', lk: 25.0 },
  // Weitere (Ra. 64-68)
  { ra: 64, nachname: 'Köpp',                vorname: 'Karl Josef',   id: '15752473', lk: 25.0 },
  { ra: 65, nachname: 'Kümpel',              vorname: 'Thomas',       id: '17552506', lk: 25.0 },
  { ra: 66, nachname: 'Zwick',               vorname: 'Horst',        id: '16302751', lk: 25.0 },
  { ra: 67, nachname: 'Zindl',               vorname: 'Ralph',        id: '16652651', lk: 25.0 },
  { ra: 68, nachname: 'Grutz',               vorname: 'Uwe',          id: '17054783', lk: 24.0 },
];

// Trainings-only Spieler (keine Verbands-ID)
const TRAINING_ONLY = [
  { nachname: 'Steiger',  vorname: 'Roland', id: 'T-STEIGER',  lk: 99 },
  { nachname: 'Weber',    vorname: 'Werner', id: 'T-WEBER',    lk: 99 },
];

// Name-Matching: Trainings-App "Vorname Name" → Meldeliste "Nachname, Vorname"
const NAME_ALIASES = {
  'Stefan Reitenberger': 'Reiterberger, Stefan',
  'Johannes Thoenissen': 'Thönneßen, Johannes',
};

function trainingNameToKey(vorname, name) {
  const full = `${vorname} ${name}`;
  if (NAME_ALIASES[full]) return NAME_ALIASES[full];
  return `${name}, ${vorname}`;
}

async function scanAll(tableName, filterExpr, exprValues) {
  const items = [];
  let lastKey;
  do {
    const result = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: filterExpr,
      ExpressionAttributeValues: exprValues,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  console.log('=== Spieler-Seed: Meldeliste + Trainings-App Matching ===\n');

  // 1. Trainings-App Spieler + User lesen
  console.log('Lese TennisTrainingsRunden...');
  const tSpieler = await scanAll(SOURCE_TABLE, 'entityType = :t', { ':t': 'TRAINING_SPIELER' });
  const tUsers = await scanAll(SOURCE_TABLE, 'entityType = :t', { ':t': 'TRAINING_USER' });
  console.log(`  ${tSpieler.length} Spieler, ${tUsers.length} Users`);

  // User-Map: Spieler-ID → Auth-Daten
  const userMap = new Map();
  for (const u of tUsers) userMap.set(u.id, u);

  // Trainings-Spieler-Map: "Nachname, Vorname" → Trainings-Daten
  const trainingMap = new Map();
  for (const s of tSpieler) {
    if (s.rolle === 'admin' && s.name === 'Admin') continue; // System-Admin überspringen
    const key = trainingNameToKey(s.vorname, s.name);
    trainingMap.set(key, s);
  }

  // 2. Meldeliste + Training-Only durchgehen
  const allSpieler = [
    ...MELDELISTE.map(s => ({ ...s, key: `${s.nachname}, ${s.vorname}` })),
    ...TRAINING_ONLY.map(s => ({ ...s, ra: 0, key: `${s.nachname}, ${s.vorname}` })),
  ];

  const now = new Date().toISOString();
  const defaultHash = await bcrypt.hash(INITIAL_PASSWORD, 10);
  let matched = 0, unmatched = 0, created = 0;

  console.log(`\nSpieler anlegen (${allSpieler.length})...\n`);

  for (const s of allSpieler) {
    const training = trainingMap.get(s.key);
    let passwordHash = defaultHash;
    let email = `${s.id}@import.local`;
    let rolle = 'spieler';

    if (training) {
      matched++;
      const user = userMap.get(training.id);
      if (user && user.password) passwordHash = user.password;
      if (training.email && !training.email.endsWith('@training.de')) email = training.email;
      if (training.rolle && training.rolle !== 'spieler') rolle = training.rolle;
      console.log(`  ✓ ${s.vorname} ${s.nachname} (${s.id}) ← matched ${training.vorname} ${training.name}`);
    } else {
      unmatched++;
      console.log(`  + ${s.vorname} ${s.nachname} (${s.id}) — neu (kein Match in Trainings-App)`);
    }

    // Spieler-Datensatz (Trainings-App Format)
    await docClient.send(new PutCommand({
      TableName: TARGET_TABLE,
      Item: {
        PK: `TRAINING_SPIELER#${s.id}`, SK: 'METADATA',
        GSI1PK: `TRAINING_EMAIL#${email.toLowerCase()}`, GSI1SK: 'TRAINING_SPIELER',
        id: s.id, name: s.nachname, vorname: s.vorname, email: email.toLowerCase(),
        rolle, aktiv: true, lk: s.lk, setzlistePosition: s.ra || undefined,
        createdAt: now, updatedAt: now, entityType: 'TRAINING_SPIELER',
      },
    }));

    // User-Datensatz (Auth)
    await docClient.send(new PutCommand({
      TableName: TARGET_TABLE,
      Item: {
        PK: `TRAINING_USER#${s.id}`, SK: 'AUTH',
        GSI1PK: `TRAINING_EMAIL#${email.toLowerCase()}`, GSI1SK: 'TRAINING_USER',
        id: s.id, email: email.toLowerCase(), password: passwordHash,
        rolle, passwordChangeRequired: !training, aktiv: true,
        createdAt: now, updatedAt: now, entityType: 'TRAINING_USER',
      },
    }));
    created++;
  }

  // Abgänge loggen
  console.log('\n--- Abgänge (in Trainings-App, nicht in Meldeliste) ---');
  for (const [key, s] of trainingMap) {
    if (!allSpieler.find(a => a.key === key)) {
      console.log(`  ⚠ ${s.vorname} ${s.name} — nicht in Meldeliste (Abgang)`);
    }
  }

  console.log(`\n=== Fertig: ${created} angelegt, ${matched} gematcht, ${unmatched} neu ===`);
}

main().catch(console.error);
