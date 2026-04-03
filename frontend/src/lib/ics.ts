export interface ICSSpieltagData {
  id: string;
  nr: number;
  datum: string;
  uhrzeit: string;
  gegner: string;
  heimspiel: boolean;
  mannschaft?: number;
  heimmannschaft?: string;
  gastmannschaft?: string;
}

export function generateICS(spieltag: ICSSpieltagData): string {
  const [year, month, day] = spieltag.datum.split('-');
  const [hour, min] = spieltag.uhrzeit.split(':');
  const dtStart = `${year}${month}${day}T${hour}${min}00`;

  // Spiel dauert ca. 4 Stunden
  const endH = (parseInt(hour) + 4).toString().padStart(2, '0');
  const dtEnd = `${year}${month}${day}T${endH}${min}00`;

  const ort = spieltag.heimspiel ? 'TC Bayer Dormagen, Tennisanlage' : spieltag.gegner;
  const mLabel = spieltag.mannschaft ? `${spieltag.mannschaft}. Mannschaft` : 'Meden';
  const summary = spieltag.heimspiel
    ? `${mLabel} Heimspiel vs ${spieltag.gegner}`
    : `${mLabel} Auswärts bei ${spieltag.gegner}`;

  const desc = spieltag.heimmannschaft && spieltag.gastmannschaft
    ? `Spieltag Nr. ${spieltag.nr} - ${spieltag.heimmannschaft} vs ${spieltag.gastmannschaft}`
    : `Spieltag Nr. ${spieltag.nr} vs ${spieltag.gegner}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tc.club-app//DE',
    'BEGIN:VEVENT',
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `LOCATION:${ort}`,
    `DESCRIPTION:${desc}`,
    `UID:clubapp-meden-${spieltag.id}@dormagen`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadICS(spieltag: ICSSpieltagData) {
  const ics = generateICS(spieltag);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meden-spieltag-${spieltag.nr}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
