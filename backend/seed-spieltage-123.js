const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
const TABLE = 'ClubApp';
const now = new Date().toISOString();

const SPIELTAGE = [
  // 1. Mannschaft (TC Bayer Dormagen 1)
  { nr: 554, datum: '2026-04-25', uhrzeit: '14:30', heim: 'TC GW Grossrotter Hof 2', gast: 'TC Bayer Dormagen 1', heimspiel: false, mannschaft: 1 },
  { nr: 557, datum: '2026-05-14', uhrzeit: '14:30', heim: 'Kölner KHT SW 3',         gast: 'TC Bayer Dormagen 1', heimspiel: false, mannschaft: 1 },
  { nr: 558, datum: '2026-06-20', uhrzeit: '14:30', heim: 'TC Bayer Dormagen 1',      gast: 'ESV Olympia 1',       heimspiel: true,  mannschaft: 1 },
  { nr: 560, datum: '2026-07-04', uhrzeit: '14:30', heim: 'TC Bayer Dormagen 1',      gast: 'TG Deckstein 2',      heimspiel: true,  mannschaft: 1 },
  // 2. Mannschaft (TC Bayer Dormagen 2)
  { nr: 547, datum: '2026-05-16', uhrzeit: '14:30', heim: 'TC Bayer Dormagen 2',      gast: 'Kölner KHT SW 4',     heimspiel: true,  mannschaft: 2 },
  { nr: 548, datum: '2026-06-06', uhrzeit: '14:30', heim: 'TC Lese GW Köln 3',        gast: 'TC Bayer Dormagen 2', heimspiel: false, mannschaft: 2 },
  { nr: 550, datum: '2026-07-04', uhrzeit: '14:30', heim: 'TC Bayer Dormagen 2',      gast: 'TC Köln-Worringen 2', heimspiel: true,  mannschaft: 2 },
  { nr: 552, datum: '2026-09-12', uhrzeit: '13:30', heim: 'TC Mülheim 1',             gast: 'TC Bayer Dormagen 2', heimspiel: false, mannschaft: 2 },
  // 3. Mannschaft (TC Bayer Dormagen 3)
  { nr: 564, datum: '2026-05-02', uhrzeit: '14:30', heim: 'TC Rodenkirchen 1',        gast: 'TC Bayer Dormagen 3', heimspiel: false, mannschaft: 3 },
  { nr: 569, datum: '2026-06-20', uhrzeit: '14:30', heim: 'TC Bayer Dormagen 3',      gast: 'TC Colonius 1',       heimspiel: true,  mannschaft: 3 },
  { nr: 570, datum: '2026-07-04', uhrzeit: '14:30', heim: 'KTC Weidenpescher Park 3', gast: 'TC Bayer Dormagen 3', heimspiel: false, mannschaft: 3 },
  { nr: 573, datum: '2026-09-05', uhrzeit: '13:30', heim: 'TC Bayer Dormagen 3',      gast: 'RTK Germania Köln 2', heimspiel: true,  mannschaft: 3 },
];

async function main() {
  console.log(`${SPIELTAGE.length} Spieltage anlegen...\n`);
  for (const st of SPIELTAGE) {
    const id = uuid();
    const gegner = st.heimspiel ? st.gast : st.heim;
    await doc.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `MEDEN_SPIELTAG#${id}`, SK: 'METADATA',
        id, nr: st.nr, datum: st.datum, uhrzeit: st.uhrzeit,
        gegner, heimspiel: st.heimspiel, mannschaft: st.mannschaft,
        heimmannschaft: st.heim, gastmannschaft: st.gast,
        entityType: 'MEDEN_SPIELTAG',
        createdAt: now, updatedAt: now,
      },
    }));
    console.log(`  ✓ M${st.mannschaft} Nr.${st.nr} ${st.datum} ${st.heimspiel ? '🏠' : '🚗'} vs ${gegner}`);
  }
  console.log(`\nFertig: ${SPIELTAGE.length} Spieltage`);
}
main().catch(console.error);
