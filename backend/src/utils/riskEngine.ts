export type RiskInput = {
  distanceKm: number;
  elevationGainM: number;
  estimatedDurationH: number;
  backpackWeightKg: number;
  startTime: string;
  soloHiker?: boolean | null;
  experienceLevel?: "beginner" | "intermediate" | "advanced" | "expert" | string | null;
  routeDifficulty?: "easy" | "moderate" | "hard" | "expert" | string | null;
  isolationScore?: number | null;
  maxAltitudeM?: number | null;
  surfaceType?: string | null;
  userLastHikeDaysAgo?: number | null;
  userAvgActualVsEstimatedRatio?: number | null;
  precipitationLast7DaysMm?: number | null;
  humidityPercent?: number | null;
  userHeightCm?: number | null;
  userWeightKg?: number | null;
  userAge?: number | null;
  recentLoad3DaysKm?: number | null;
  recentLoad3DaysElevationM?: number | null;
  recentLoad7DaysKm?: number | null;
  recentLoad7DaysElevationM?: number | null;
  recentLoad7DaysHikeCount?: number | null;
  recentLoad30DaysKm?: number | null;
  recentLoad30DaysHikeCount?: number | null;
  fitnessLevel?: string | null;
  now?: Date;
  sunriseTime?: string | null;
  sunsetTime?: string | null;
  precipitationProbability?: number | null;
  windspeedKmh?: number | null;
  temperatureC?: number | null;
  uvIndex?: number | null;
  weatherCode?: number | null;
  userCompletedHikesCount?: number;
  perceivedDifficultyBias?: number | null;
  userAvgPaceMinKm?: number | null;
  userAvgElevationGainM?: number | null;
  userAvgDistanceKm?: number | null;
  fatigueScore?: number | null;
  fatigueDescription?: string | null;
  fatigueLevel?: "rested" | "mild" | "moderate" | "high" | string | null;
  trailConditionReport?: {
    condition: "dry" | "muddy" | "snowy" | "overgrown" | "blocked";
    reportedAt: string;
    isTrailVerified: boolean;
    riskPoints: number;
    label: string;
  } | null;
  forecastDaysOut?: number;
  fitnessTrend?: "improving" | "stable" | "declining" | null;
  priorCompletionsOnRoute?: number;
  priorPartialsOnRoute?: number;
  routeMonthlyHikeCount?: number;
  hasEmergencyContact?: boolean | null;
  daysSinceLastHighAltitudeHike?: number | null;
  routeIsExposed?: boolean;
  groupSize?: number;
};

type RiskDomain = "terrain" | "weather" | "personal" | "conditions" | "timing";

export type RiskFactor = {
  factor: string;
  label: string;
  value: number;
  description: string;
  suggestion?: string;
  severity: "high" | "moderate" | "info";
  category: RiskDomain | "synergy";
};

export type RiskResult = {
  score: number;
  level: "Low" | "Moderate" | "High" | "Very High";
  counterfactuals: string[];
  factors: RiskFactor[];
  subScores: {
    terrain: number;
    weather: number;
    personal: number;
    conditions: number;
    timing: number;
  };
  dataCompleteness: {
    weather: boolean;
    personal: boolean;
    routeElevation: boolean;
    overall: "full" | "partial" | "limited";
  };
  confidence: {
    score: number;
    level: "high" | "medium" | "low";
    missing: string[];
  };
};

// Swiss Alpine Club SAC Hiking Scale T1-T6.
const SAC_GRADE = {
  easy: "T1 (drumeție)",
  moderate: "T2 (drumeție montană)",
  hard: "T3 (drumeție montană solicitantă)",
  expert: "T4-T5 (drumeție alpină)",
} as const;

const suggestionByReason: Record<string, string> = {
  "Distanță foarte lungă": "Planifică apă, mâncare și ritm suplimentar pentru întreaga distanță.",
  "Traseu lung": "Începe cu un ritm constant și programează pauze scurte pe traseu.",
  "Diferență de nivel foarte mare": "Pregătește-te pentru urcare susținută și redu încărcătura unde este posibil.",
  "Diferență de nivel semnificativă": "Așteaptă-te la porțiuni de urcare mai dificile și abordează ascensiunea într-un ritm conservator.",
  "Durata foarte lungă a drumeției": "Ia suficiente provizii și lasă marjă pentru un efort de o zi întreagă.",
  "Efort de lungă durată": "Include opriri de odihnă ca efortul să rămână gestionabil.",
  "Rucsac foarte greu": "Scoate echipamentul neesențial pentru a reduce solicitarea înainte de plecare.",
  "Rucsac greu": "Rearanjează rucsacul mai ușor dacă poți și distribuie greutatea cu grijă.",
  "Încărcare metabolică susținută foarte ridicată pentru corp, rucsac și teren":
    "Redu greutatea rucsacului, încetinește ritmul pe urcare sau alege un traseu cu mai puțină urcare susținută.",
  "Încărcare metabolică susținută ridicată pentru corp, rucsac și teren":
    "Redu greutatea rucsacului, încetinește ritmul pe urcare sau alege un traseu cu mai puțină urcare susținută.",
  "Încărcare metabolică susținută moderată":
    "Ia în calcul să ușurezi rucsacul sau să reduci ritmul pe porțiunile abrupte.",
  "Pornire foarte târzie": "Pleacă mai devreme sau scurtează traseul ca să eviți o sosire prea târzie.",
  "Pornire târzie": "Ia în calcul o plecare mai devreme ca să păstrezi mai multă lumină naturală în rezervă.",
  "Durata planificată depășește nivelul tău de confort": "Alege un obiectiv mai scurt sau adaugă marje de timp mai mari.",
  "Diferența de nivel depășește nivelul tău de confort": "Alege un traseu cu mai puțină urcare sau planifică o ascensiune mai lentă.",
  "Drumeția se va încheia probabil după lăsarea întunericului": "Ia o sursă de lumină sau mută plecarea mai devreme pentru a termina pe lumină.",
  "Drumeția se poate încheia aproape de apus": "Păstrează o marjă de lumină plecând mai devreme sau scurtând planul.",
  "Probabilitate mare de ploaie": "Ia straturi impermeabile și verifică starea traseului înainte de plecare.",
  "Probabilitate moderată de ploaie": "Ia un strat pentru ploaie și urmărește actualizările meteo înainte de plecare.",
  "Expunere UV extremă": "Aplică SPF 50+ și acoperă pielea expusă.",
  "Expunere UV foarte ridicată": "Folosește cremă solară puternică și poartă îmbrăcăminte de protecție.",
  "Expunere UV ridicată": "Aplică protecție solară înainte de plecare.",
  "Vânt foarte puternic prognozat": "Adaugă protecție împotriva vântului și evită porțiunile expuse dacă vremea se înrăutățește.",
  "Vânt moderat prognozat": "Ia un strat exterior și fii deosebit de atent pe creste.",
  "Temperaturi sub zero prognozate": "Îmbracă straturi izolatoare și protejează-te de expunerea la frig.",
  "Temperaturi reci prognozate": "Ia straturi călduroase și mănuși pentru condițiile reci.",
  "Temperaturi ridicate prognozate": "Ia apă suplimentară și evită efortul cel mai greu în orele de căldură maximă.",
  "Terenul stâncos devine periculos de alunecos pe ploaie":
    "Amână drumeția până se usucă terenul sau folosește încălțăminte cu aderență bună și scurtează porțiunile expuse.",
  "Terenul stâncos are risc de gheață și zăpadă în sezonul rece":
    "Verifică rapoartele de zăpadă și gheață și ia echipament de tracțiune înainte de porțiunile stâncoase.",
  "Terenul stâncos necesită pași atenți":
    "Folosește încălțăminte stabilă și păstrează un ritm mai lent și atent pe teren stâncos.",
  "Terenul mixt devine alunecos când este ud":
    "Așteaptă-te la pași mai lenți pe teren mixt ud și alege încălțăminte cu aderență bună.",
  "Experiență de drumeție limitată pentru dificultatea acestui traseu":
    "Acumulează experiență pe trasee mai scurte înainte de a încerca acest traseu.",
  "Acest traseu necesită un ritm mai rapid decât media ta":
    "Antrenează-te pe trasee apropiate de ritmul tău obișnuit înainte de această încercare.",
  "Diferență de nivel semnificativ mai mare decât în drumețiile tale obișnuite":
    "Crește treptat diferența de nivel pe parcursul mai multor drumeții.",
  "Furtună cu tunete prognozată":
    "Nu porni pe acest traseu - furtunile cu tunete sunt periculoase pe teren expus.",
  "Ninsoare sau viscol prognozate": "Verifică starea traseului și pregătește-te pentru teren de iarnă.",
  "Averse de ploaie prognozate": "Ia straturi impermeabile.",
  "Risc de hipotermie din cauza frigului resimțit extrem": "Evită zonele expuse sau îmbunătățește izolația și protecția împotriva vântului.",
  "Frig resimțit semnificativ; îmbracă straturi călduroase": "Îmbracă-te pentru temperaturi resimțite mai reci și protejează pielea expusă.",
  "Indice de căldură periculos, risc de epuizare termică": "Redu intensitatea, crește aportul de apă și evită orele de căldură maximă.",
  "Indice de căldură ridicat, hidratează-te": "Hidratează-te serios și ia pauze la umbră în cele mai fierbinți porțiuni.",
  "Teren alpin extrem de tehnic SAC 4-5":
    "Încearcă acest traseu doar cu abilități alpine solide, orientare bună și echipament potrivit.",
  "Teren alpin solicitant SAC 3":
    "Așteaptă-te la pași expuși și solicitați și planifică prudent pentru teren tehnic.",
  "Teren de drumeție montană care necesită pas sigur SAC 2":
    "Poartă încălțăminte stabilă și pregătește-te pentru teren montan denivelat.",
  "Începător pe teren de nivel alpin":
    "Alege teren mai ușor sau acumulează experiență ghidată înainte de acest traseu.",
  "Traseu izolat fără partener, salvare dificilă":
    "Ia un partener sau o comunicare de urgență fiabilă pentru acest traseu izolat.",
  "Traseu îndepărtat cu acces limitat pentru salvare":
    "Ia navigație și provizii de urgență și așteaptă-te la ajutor întârziat dacă va fi nevoie.",
  "Altitudine foarte mare, risc de rău de altitudine peste 3000 m":
    "Aclimatizează-te înainte și urmărește atent simptomele răului de altitudine.",
  "Traseu la altitudine mare, aclimatizare recomandată":
    "Crește treptat expunerea la altitudine înainte de acest traseu.",
  "Drumeție solo pe traseu solicitant, fără partener pentru urgențe":
    "Redu dificultatea traseului sau evită să parcurgi singur acest obiectiv.",
  "Peste o lună de la ultima drumeție, condiția fizică poate fi scăzută":
    "Reconstruiește condiția fizică prin drumeții mai scurte înainte de acest efort.",
  "Două săptămâni de la ultima drumeție, reia treptat":
    "Reia treptat, cu ritm conservator și marjă suplimentară de recuperare.",
  "De obicei durezi cu 30 la sută mai mult decât estimarea, planifică timp suplimentar":
    "Adaugă o marjă de timp mai mare și nu te baza pe estimarea optimistă.",
  "Depășești des ușor timpul estimat":
    "Planifică o marjă de timp moderată peste estimarea traseului.",
  "Ploi recente abundente, traseu probabil noroios și traversări de râuri riscante":
    "Așteaptă-te la teren alunecos și reevaluează traversările de apă înainte de a continua.",
  "Ploi recente moderate, așteaptă-te la porțiuni ude și alunecoase":
    "Poartă încălțăminte cu aderență bună și așteaptă-te la progres mai lent pe traseu ud.",
  "Risc de viitură: furtuni, teren ud și traseu abrupt":
    "Evită văile înguste, scurgerile de apă și traversările expuse în condiții de furtună.",
  "Efect combinat: drumeție solo + vreme rea + traseu solicitant (x1.8)":
    "Schimbă cel puțin un factor: ia un partener, așteaptă vreme mai bună sau alege un traseu mai ușor.",
  "Efect combinat: drumeț neexperimentat pe teren alpin peste 2000 m (x2.0)":
    "Acumulează experiență progresiv înainte de a combina teren alpin cu altitudine mare.",
  "Efect combinat: sosire aproape de întuneric pe traseu izolat (x1.5)":
    "Pornește mai devreme sau scurtează obiectivul ca izolarea să nu se combine cu întunericul.",
  "Efect combinat: ploi recente abundente pe traseu izolat fără partener (x1.5)":
    "Așteaptă condiții mai uscate sau evită să faci singur acest traseu izolat.",
  "Traseu raportat recent ca blocat sau impracticabil, verifică înainte de plecare":
    "Contactează autoritățile locale sau drumeți recenți înainte de plecare și pregătește un obiectiv de rezervă.",
  "Traseu raportat cu zăpadă, așteaptă-te la porțiuni înghețate sau acoperite de zăpadă":
    "Ia colțari ușori și straturi pentru frig și așteaptă-te la deplasare mai lentă pe zăpadă.",
  "Traseu raportat noroios, potecile ude cresc riscul de alunecare și încetinesc ritmul":
    "Poartă parazăpezi și încălțăminte cu aderență bună și alocă timp suplimentar pentru porțiunile noroioase.",
  "Traseu raportat năpădit, vizibilitate redusă și posibile obstacole":
    "Așteaptă-te la claritate redusă a potecii și orientare mai lentă prin porțiuni obstrucționate.",
  "Condiții uscate pe traseu, condițiile sunt favorabile": "Condițiile traseului sunt bune.",
  "Tendință fizică în scădere, drumețiile recente sugerează un ritm mai lent":
    "Include zile de odihnă înainte de această drumeție și redu așteptările de ritm.",
  "Condiție fizică în îmbunătățire, drumețiile recente arată performanță mai bună":
    "Performanța ta recentă este în creștere.",
  "Grup de cel puțin 3 drumeți, siguranță mai bună":
    "Este mai sigur să mergi în grup, unde sprijinul și deciziile sunt mai solide.",
  "Drumeț expert pe teren ușor, provocare tehnică foarte redusă":
    "Acest traseu este clar în limitele nivelului tău.",
  "Finalizare anterioară a acestui traseu, cunoști poteca":
    "Experiența ta anterioară pe acest traseu ar trebui să ajute la ritm și orientare.",
  "Finalizări multiple ale acestui traseu, teren foarte familiar":
    "Cunoști bine această potecă și poți folosi familiaritatea pentru a gestiona eficient ziua.",
  "Traseu parcurs rar recent, pregătire suplimentară recomandată":
    "Verifică atent starea traseului, deoarece este parcurs rar.",
  "Traseu popular parcurs frecvent, condiții mai sigure":
    "Acest traseu este frecventat, ceea ce înseamnă condiții mai bine întreținute.",
  "Fără contact de urgență pe traseu izolat parcurs solo":
    "Anunță planul cuiva și stabilește o oră de verificare înainte de plecare.",
  "Furtună cu tunete prognozată pe teren expus, risc mare de fulgere":
    "Nu porni pe acest traseu - terenul expus în timpul unei furtuni cu tunete este extrem de periculos.",
  "Furtună cu tunete prognozată, caută adăpost și evită terenul deschis":
    "Planifică opțiuni de adăpost și evită crestele, vârfurile și terenul deschis.",
  "Furtună cu tunete pe traseu alpin înalt, risc foarte mare de fulgere":
    "Aceasta este una dintre cele mai periculoase combinații posibile. Nu încerca.",
  "Tendință fizică în scădere, traseu foarte lung și rucsac greu":
    "Ia în calcul împărțirea în două zile sau reducerea distanței și a greutății purtate.",
  "Oboseală ridicată, solo și traseu îndepărtat":
    "Oboseala combinată cu drumeția solo izolată creează risc serios și lasă puțină marjă de eroare.",
  "Pornire târzie, ritm istoric lent și traseu lung":
    "Ai risc foarte mare să termini după lăsarea întunericului dacă nu pornești mai devreme sau nu scurtezi planul.",
  "Altitudine mare, fără drumeție recentă la altitudine și vreme rea":
    "Altitudinea, condițiile nefamiliare și vremea rea formează o combinație foarte periculoasă.",
  "Efect combinat: furtună cu tunete + traseu peste 2000 m (x2.2)":
    "Aceasta este combinația cu cel mai mare risc. Nu încerca acest traseu cu furtună cu tunete prognozată.",
  "Traseu blocat sau înzăpezit, începător și drumeție solo":
    "Nu aborda singur condiții dificile de traseu ca începător. Ia un partener experimentat sau alege alt traseu.",
  "IMC ridicat crește solicitarea cardiovasculară pe urcări abrupte":
    "Ia în calcul un traseu cu diferență de nivel mai mică sau abordează urcarea foarte conservator.",
  "IMC foarte ridicat crește semnificativ riscul de efort":
    "Consultă un medic înainte de trasee solicitante și planifică un ritm foarte conservator.",
  "Greutate corporală scăzută poate limita rezistența pe trasee lungi":
    "Ia mâncare bogată în calorii și planifică pauze suplimentare pentru energie pe trasee lungi.",
  "Vârsta 65+ crește riscul la altitudine și cardiovascular":
    "Aclimatizează-te mai întâi la altitudini mai joase și urmărește atent simptomele cardiovasculare.",
  "Vârsta 65+ crește riscul de oboseală pe drumeții lungi":
    "Împarte traseele lungi în două zile sau alege o alternativă mai scurtă.",
  "Vârsta 70+ necesită prudență suplimentară pe teren solicitant":
    "Alege trasee potrivite condiției tale fizice actuale și mergi cu un partener.",
  "Încărcare recentă mare, peste 50 km în ultimele 3 zile, crește riscul de oboseală":
    "Prioritizează recuperarea sau alege un traseu mai scurt după o încărcare mare de trei zile.",
  "Încărcare recentă ridicată, peste 30 km în ultimele 3 zile, crește riscul de oboseală":
    "Păstrează un ritm conservator și adaugă marjă de recuperare după kilometrajul recent.",
  "Încărcare săptămânală foarte mare, crește riscul de suprasolicitare":
    "Ia în calcul o zi de odihnă sau un traseu cu intensitate mai mică pentru a reduce riscul de suprasolicitare.",
  "Încărcare săptămânală semnificativă poate crește oboseala":
    "Monitorizează oboseala devreme și scurtează planul dacă efortul pare neobișnuit de mare.",
  "Drumeții frecvente, 4+ în ultimele 7 zile, pot amplifica oboseala":
    "Include recuperare suplimentară și evită să adaugi încă o zi solicitantă.",
  "Încărcare lunară foarte mare, monitorizează semnele de supraantrenament":
    "Urmărește semnele de supraantrenament și programează recuperare după volum susținut.",
  "Fără drumeții recente, risc de decondiționare pe traseu solicitant":
    "Reia cu drumeții mai ușoare înainte de un profil de altitudine solicitant.",
  "Condiția fizică atletică compensează parțial solicitarea altitudinii mari":
    "Condiția ta fizică ajută, dar păstrează un ritm constant pe urcările lungi.",
  "Condiția fizică de elită compensează semnificativ terenul solicitant":
    "Baza ta fizică recentă reduce o parte din solicitare, dar terenul și vremea rămân importante.",
  "Sezon de iarnă: traseele de altitudine mare sunt de obicei inaccesibile și acoperite de zăpadă":
    "Nu încerca trasee la altitudine mare iarna fără pregătire specializată de alpinism.",
  "Condiții de iarnă: zăpadă și gheață probabile peste 1500 m":
    "Ia colțari ușori, straturi călduroase și verifică zăpada recentă înainte de plecare.",
  "Primăvara: traseele peste 2000 m sunt probabil încă acoperite de zăpadă - acces tipic din iunie":
    "Majoritatea traseelor de altitudine mare nu sunt accesibile în mod fiabil până în iunie sau mai târziu.",
  "Primăvară timpurie: strat de zăpadă probabil peste 1500 m":
    "Așteaptă-te la zăpadă pe alocuri și trasee ude peste 1500 m la început de primăvară.",
  "Sfârșit de mai: traseele la altitudine foarte mare pot avea încă zăpadă":
    "Traseele peste 2200 m pot avea încă zăpadă semnificativă la sfârșit de mai.",
  "Toamnă târzie: prima ninsoare sezonieră este probabilă peste 1800 m":
    "Prima ninsoare ajunge de obicei peste 1800 m în octombrie-noiembrie. Ia straturi suplimentare.",
  "Primăvară plus altitudine foarte mare plus începător înseamnă risc extrem de ridicat":
    "Nu încerca trasee la altitudine mare ca începător la început de primăvară. Acumulează experiență mai întâi.",
  "Traseele de altitudine mare iarna au risc combinat extrem":
    "Traseele de altitudine mare iarna necesită abilități și echipament de alpinism. Nu încerca fără pregătire adecvată.",
};

function parseTimeToHours(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours + minutes / 60;
}

function toFactorKey(reason: string): string {
  return reason
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pointsToSeverity(points: number): RiskFactor["severity"] {
  if (points >= 20) {
    return "high";
  }

  if (points >= 10) {
    return "moderate";
  }

  return "info";
}

function heatIndexCelsius(tempC: number, humidityPercent: number): number {
  const tempF = (tempC * 9) / 5 + 32;
  const simple =
    0.5 * (tempF + 61 + (tempF - 68) * 1.2 + humidityPercent * 0.094);

  if ((simple + tempF) / 2 < 80) {
    return ((simple - 32) * 5) / 9;
  }

  let heatIndexF =
    -42.379 +
    2.04901523 * tempF +
    10.14333127 * humidityPercent -
    0.22475541 * tempF * humidityPercent -
    0.00683783 * tempF * tempF -
    0.05481717 * humidityPercent * humidityPercent +
    0.00122874 * tempF * tempF * humidityPercent +
    0.00085282 * tempF * humidityPercent * humidityPercent -
    0.00000199 * tempF * tempF * humidityPercent * humidityPercent;

  if (humidityPercent < 13 && tempF >= 80 && tempF <= 112) {
    heatIndexF -=
      ((13 - humidityPercent) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
  } else if (humidityPercent > 85 && tempF >= 80 && tempF <= 87) {
    heatIndexF += ((humidityPercent - 85) / 10) * ((87 - tempF) / 5);
  }

  return ((heatIndexF - 32) * 5) / 9;
}

function pandolfMetabolicWatts(
  bodyMassKg: number,
  loadKg: number,
  speedMps: number,
  gradePct: number,
  terrainFactor: number
): number {
  return (
    1.5 * bodyMassKg +
    2.0 * (bodyMassKg + loadKg) * Math.pow(loadKg / bodyMassKg, 2) +
    terrainFactor *
      (bodyMassKg + loadKg) *
      (1.5 * speedMps * speedMps + 0.35 * speedMps * gradePct)
  );
}

function rampPoints(x: number, knots: number[], pts: number[]): number {
  if (knots.length === 0 || pts.length !== knots.length + 1) {
    return 0;
  }

  const firstKnot = knots[0] ?? 0;

  if (x <= firstKnot) {
    return pts[0] ?? 0;
  }

  const lastKnot = knots[knots.length - 1] ?? 0;
  if (x >= lastKnot) {
    return pts[pts.length - 1] ?? 0;
  }

  for (let index = 1; index < knots.length; index += 1) {
    const leftKnot = knots[index - 1] ?? 0;
    const rightKnot = knots[index] ?? leftKnot;

    if (x <= rightKnot) {
      const leftPoint = pts[index - 1] ?? 0;
      const rightPoint = pts[index] ?? leftPoint;
      const t = rightKnot === leftKnot ? 1 : (x - leftKnot) / (rightKnot - leftKnot);

      return leftPoint + (rightPoint - leftPoint) * t;
    }
  }

  return pts[pts.length - 1] ?? 0;
}

export function calculateRisk(input: RiskInput): RiskResult {
  let score = 0;
  const factors: RiskFactor[] = [];

  const addRule = (
    condition: boolean,
    points: number,
    reason: string,
    category: RiskDomain,
    suggestionOverride?: string
  ) => {
    if (!condition) {
      return;
    }

    const suggestion =
      suggestionOverride ??
      suggestionByReason[reason] ??
      "Ajustează planul și pregătirea pentru acest factor de risc.";

    score += points;
    factors.push({
      factor: toFactorKey(reason),
      label: reason,
      value: points,
      description: reason,
      suggestion,
      severity: pointsToSeverity(points),
      category,
    });
  };

  const addContinuousRule = (
    points: number,
    reason: string,
    category: RiskDomain,
    suggestionOverride?: string
  ) => {
    const roundedPoints = Math.round(points);

    if (roundedPoints <= 0) {
      return;
    }

    addRule(true, roundedPoints, reason, category, suggestionOverride);
  };

  addContinuousRule(
    rampPoints(input.distanceKm, [6, 12, 18, 25], [0, 8, 18, 28, 34]),
    "Încărcare de risc dată de distanță",
    "terrain",
    "Planifică apa, mâncarea, ritmul și pauzele în funcție de întreaga distanță a traseului."
  );
  addContinuousRule(
    rampPoints(input.elevationGainM, [300, 600, 900, 1400], [0, 8, 18, 28, 38]),
    "Încărcare de risc dată de diferența de nivel",
    "terrain",
    "Așteaptă-te la urcare susținută și abordează ascensiunea într-un ritm conservator."
  );

  addRule(input.estimatedDurationH >= 7, 25, "Durata foarte lungă a drumeției", "timing");
  addRule(
    input.estimatedDurationH >= 4 && input.estimatedDurationH < 7,
    10,
    "Efort de lungă durată",
    "timing"
  );

  if (input.estimatedDurationH > 0 && input.distanceKm > 0) {
    const bodyMass = input.userWeightKg ?? 70;
    const rawSpeed = (input.distanceKm * 1000) / (input.estimatedDurationH * 3600);
    const speed = Math.min(2.2, Math.max(0.4, rawSpeed)); // clamp to Pandolf empirically valid range ~0.4-2.2 m/s
    const gradePct = Math.max(0, (input.elevationGainM / (input.distanceKm * 1000)) * 100);
    const terrainFactor =
      input.surfaceType === "paved"
        ? 1.0
        : input.surfaceType === "dirt"
          ? 1.1
          : input.surfaceType === "gravel"
            ? 1.2
            : input.surfaceType === "mixed"
              ? 1.3
              : input.surfaceType === "rocky"
                ? 1.5
                : 1.2;
    const metabolicWatts = pandolfMetabolicWatts(
      bodyMass,
      input.backpackWeightKg,
      speed,
      gradePct,
      terrainFactor
    );
    const mPerKg = metabolicWatts / bodyMass;

    // Thresholds are judgment applied to a physiologically-grounded quantity.
    if (mPerKg >= 12) {
      addRule(
        true,
        22,
        "Încărcare metabolică susținută foarte ridicată pentru corp, rucsac și teren",
        "terrain"
      );
    } else if (mPerKg >= 9) {
      addRule(
        true,
        12,
        "Încărcare metabolică susținută ridicată pentru corp, rucsac și teren",
        "terrain"
      );
    } else if (mPerKg >= 7) {
      addRule(true, 6, "Încărcare metabolică susținută moderată", "terrain");
    }
  }

  if (input.backpackWeightKg > 0) {
    const userMass = Math.max(40, input.userWeightKg ?? 70);
    const ratio = input.backpackWeightKg / userMass;
    const hrs = Math.max(0, input.estimatedDurationH);
    const climbKm = Math.max(0, input.elevationGainM) / 1000;
    const heat = Math.max(0, ((input.temperatureC ?? 15) - 22) / 10);
    const fatigue = Math.max(0, Math.min(1, input.fatigueScore ?? 0));
    const beginner =
      input.experienceLevel === "beginner" ||
      input.fitnessLevel === "Sedentary" ||
      input.fitnessLevel === "Casual"
        ? 0.5
        : 0;
    const experienceRelief =
      input.experienceLevel === "expert" ||
      input.fitnessLevel === "Athletic" ||
      input.fitnessLevel === "Elite"
        ? 0.45
        : input.experienceLevel === "advanced"
          ? 0.75
          : 1;
    const burden =
      60 *
      ratio *
      (1 + 0.15 * hrs) *
      (1 + 0.25 * climbKm) *
      (1 + 0.3 * heat) *
      (1 + 0.4 * fatigue) *
      (1 + beginner);
    const points = Math.max(0, Math.min(30, Math.round(burden * experienceRelief - 4)));

    addContinuousRule(
      points,
      "Greutate rucsac",
      "terrain",
      "Redu greutatea rucsacului, distribuie încărcătura cu grijă sau alege un obiectiv mai scurt dacă bagajul pare greu."
    );
  }

  const startHour = parseTimeToHours(input.startTime);
  if (startHour !== null) {
    addRule(startHour >= 15, 25, "Pornire foarte târzie", "timing");
    addRule(startHour >= 12 && startHour < 15, 10, "Pornire târzie", "timing");

    const sunsetHour = input.sunsetTime ? parseTimeToHours(input.sunsetTime) : null;
    const estimatedEndH = startHour + input.estimatedDurationH;

    if (sunsetHour !== null) {
      addRule(
        estimatedEndH > sunsetHour,
        30,
        "Drumeția se va încheia probabil după lăsarea întunericului",
        "timing"
      );
      addRule(
        estimatedEndH <= sunsetHour &&
          estimatedEndH > sunsetHour - 1,
        15,
        "Drumeția se poate încheia aproape de apus",
        "timing"
      );
    }
  }

  const bmi =
    input.userHeightCm != null && input.userWeightKg != null && input.userHeightCm > 0
      ? input.userWeightKg / Math.pow(input.userHeightCm / 100, 2)
      : null;

  if (bmi !== null && bmi >= 35) {
    addRule(true, 20, "IMC foarte ridicat crește semnificativ riscul de efort", "personal");
  } else if (bmi !== null && bmi >= 30 && (input.elevationGainM ?? 0) > 600) {
    addRule(true, 13, "IMC ridicat crește solicitarea cardiovasculară pe urcări abrupte", "personal");
  } else if (bmi !== null && bmi < 18.5) {
    addRule(true, 8, "Greutate corporală scăzută poate limita rezistența pe trasee lungi", "personal");
  }

  if (input.userAge != null && input.userAge >= 70) {
    addRule(true, 16, "Vârsta 70+ necesită prudență suplimentară pe teren solicitant", "personal");
  } else if (input.userAge != null && input.userAge >= 65) {
    addRule(
      (input.maxAltitudeM ?? 0) > 1800,
      14,
      "Vârsta 65+ crește riscul la altitudine și cardiovascular",
      "personal"
    );
    addRule(
      input.estimatedDurationH > 5,
      9,
      "Vârsta 65+ crește riscul de oboseală pe drumeții lungi",
      "personal"
    );
  }
  addRule(
    (input.recentLoad3DaysKm ?? 0) >= 50,
    25,
    "Încărcare recentă mare, peste 50 km în ultimele 3 zile, crește riscul de oboseală",
    "personal"
  );
  addRule(
    (input.recentLoad3DaysKm ?? 0) >= 30 && (input.recentLoad3DaysKm ?? 0) < 50,
    15,
    "Încărcare recentă ridicată, peste 30 km în ultimele 3 zile, crește riscul de oboseală",
    "personal"
  );
  addRule(
    (input.recentLoad7DaysKm ?? 0) >= 80,
    18,
    "Încărcare săptămânală foarte mare, crește riscul de suprasolicitare",
    "personal"
  );
  addRule(
    (input.recentLoad7DaysKm ?? 0) >= 50 && (input.recentLoad7DaysKm ?? 0) < 80,
    10,
    "Încărcare săptămânală semnificativă poate crește oboseala",
    "personal"
  );
  addRule(
    (input.recentLoad7DaysHikeCount ?? 0) >= 4,
    8,
    "Drumeții frecvente, 4+ în ultimele 7 zile, pot amplifica oboseala",
    "personal"
  );
  addRule(
    (input.recentLoad30DaysKm ?? 0) >= 150,
    5,
    "Încărcare lunară foarte mare, monitorizează semnele de supraantrenament",
    "personal"
  );
  addRule(
    input.recentLoad30DaysHikeCount === 0 && input.elevationGainM >= 600,
    12,
    "Fără drumeții recente, risc de decondiționare pe traseu solicitant",
    "personal"
  );
  addRule(
    input.fitnessLevel === "Athletic" && input.elevationGainM >= 1000,
    -10,
    "Condiția fizică atletică compensează parțial solicitarea altitudinii mari",
    "personal"
  );
  addRule(
    input.fitnessLevel === "Elite" && input.elevationGainM >= 800,
    -12,
    "Condiția fizică de elită compensează semnificativ terenul solicitant",
    "personal"
  );

  const now = input.now ?? new Date();
  const month = now.getMonth();
  const isWinter = month === 11 || month <= 1;
  const isEarlySpring = month >= 2 && month <= 3;
  const isLateSpring = month === 4;
  const isAutumn = month >= 9 && month <= 10;
  const maxAlt = input.maxAltitudeM ?? 0;

  addRule(
      input.precipitationProbability !== null &&
      input.precipitationProbability !== undefined &&
      input.precipitationProbability >= 70,
    20,
    "Probabilitate mare de ploaie",
    "weather"
  );
  addRule(
    input.precipitationProbability !== null &&
      input.precipitationProbability !== undefined &&
      input.precipitationProbability >= 40 &&
      input.precipitationProbability < 70,
    10,
    "Probabilitate moderată de ploaie",
    "weather"
  );

  addRule(
    input.uvIndex !== null && input.uvIndex !== undefined && input.uvIndex >= 11,
    20,
    "Expunere UV extremă",
    "weather"
  );
  addRule(
    input.uvIndex !== null &&
      input.uvIndex !== undefined &&
      input.uvIndex >= 8 &&
      input.uvIndex < 11,
    10,
    "Expunere UV foarte ridicată",
    "weather"
  );
  addRule(
    input.uvIndex !== null &&
      input.uvIndex !== undefined &&
      input.uvIndex >= 6 &&
      input.uvIndex < 8,
    5,
    "Expunere UV ridicată",
    "weather"
  );

  const isThunderstorm =
    input.weatherCode !== null &&
    input.weatherCode !== undefined &&
    [95, 96, 99].includes(input.weatherCode);

  if (isThunderstorm) {
    if (input.maxAltitudeM != null && input.maxAltitudeM > 2000) {
      addRule(true, 22, "Furtună cu tunete pe traseu alpin înalt, risc foarte mare de fulgere", "weather");
    } else if (input.routeIsExposed === true) {
      addRule(true, 18, "Furtună cu tunete prognozată pe teren expus, risc mare de fulgere", "weather");
    } else {
      addRule(true, 10, "Furtună cu tunete prognozată, caută adăpost și evită terenul deschis", "weather");
    }
  }
  addRule(
    input.weatherCode !== null &&
      input.weatherCode !== undefined &&
      [71, 73, 75, 77, 85, 86].includes(input.weatherCode),
    20,
    "Ninsoare sau viscol prognozate",
    "weather"
  );
  addRule(
    input.weatherCode !== null &&
      input.weatherCode !== undefined &&
      [80, 81, 82].includes(input.weatherCode) &&
      !(
        input.precipitationProbability !== null &&
        input.precipitationProbability !== undefined &&
        input.precipitationProbability >= 40
      ),
    10,
    "Averse de ploaie prognozate",
    "weather"
  );

  addRule(
      input.windspeedKmh !== null &&
      input.windspeedKmh !== undefined &&
      input.windspeedKmh >= 50,
    25,
    "Vânt foarte puternic prognozat",
    "weather"
  );
  addRule(
    input.windspeedKmh !== null &&
      input.windspeedKmh !== undefined &&
      input.windspeedKmh >= 30 &&
      input.windspeedKmh < 50,
    10,
    "Vânt moderat prognozat",
    "weather"
  );

  addRule(
      input.temperatureC !== null &&
      input.temperatureC !== undefined &&
      input.temperatureC <= 0,
    20,
    "Temperaturi sub zero prognozate",
    "weather"
  );
  addRule(
    input.temperatureC !== null &&
      input.temperatureC !== undefined &&
      input.temperatureC > 0 &&
      input.temperatureC <= 5,
    10,
    "Temperaturi reci prognozate",
    "weather"
  );
  addRule(
      input.temperatureC !== null &&
      input.temperatureC !== undefined &&
      input.temperatureC >= 32,
    10,
    "Temperaturi ridicate prognozate",
    "weather"
  );

  const surface = input.surfaceType ?? "dirt";
  const isWetWeather =
    (input.precipitationProbability ?? 0) >= 50 ||
    [51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99].includes(
      input.weatherCode ?? -1
    );
  addRule(
    surface === "rocky" && isWetWeather,
    12,
    "Terenul stâncos devine periculos de alunecos pe ploaie",
    "conditions"
  );
  addRule(
    surface === "rocky" && (isWinter || isEarlySpring),
    10,
    "Terenul stâncos are risc de gheață și zăpadă în sezonul rece",
    "conditions"
  );
  addRule(
    surface === "rocky" && !isWetWeather && !isWinter && !isEarlySpring,
    5,
    "Terenul stâncos necesită pași atenți",
    "terrain"
  );
  addRule(
    surface === "mixed" && isWetWeather,
    6,
    "Terenul mixt devine alunecos când este ud",
    "conditions"
  );

  // User hike history rules
  addRule(
    input.userCompletedHikesCount !== undefined &&
      input.userCompletedHikesCount < 5 &&
      (input.estimatedDurationH >= 5 || input.elevationGainM >= 600),
    20,
    "Experiență de drumeție limitată pentru dificultatea acestui traseu",
    "personal"
  );

  if (
    input.userAvgPaceMinKm != null &&
    input.distanceKm > 0
  ) {
    const routeExpectedPaceMinKm = (input.estimatedDurationH * 60) / input.distanceKm;
    addRule(
      routeExpectedPaceMinKm < input.userAvgPaceMinKm * 0.75,
      15,
      "Acest traseu necesită un ritm mai rapid decât media ta",
      "personal"
    );
  }

  addRule(
    input.userAvgElevationGainM != null &&
      input.elevationGainM > input.userAvgElevationGainM * 1.5,
    10,
    "Diferență de nivel semnificativ mai mare decât în drumețiile tale obișnuite",
    "personal"
  );

  if (
    input.temperatureC != null &&
    input.windspeedKmh != null &&
    input.temperatureC < 10 &&
    input.windspeedKmh > 0
  ) {
    const windFactor = Math.pow(input.windspeedKmh, 0.16);
    // North American wind chill index (Environment Canada / NWS, JAG-TI 2001).
    const apparentTempC =
      13.12 +
      0.6215 * input.temperatureC -
      11.37 * windFactor +
      0.3965 * input.temperatureC * windFactor;

    addRule(apparentTempC <= -10, 25, "Risc de hipotermie din cauza frigului resimțit extrem", "weather");
    addRule(
      apparentTempC > -10 && apparentTempC <= 0,
      15,
      "Frig resimțit semnificativ; îmbracă straturi călduroase",
      "weather"
    );
  }

  if (
    input.temperatureC != null &&
    input.humidityPercent != null &&
    input.temperatureC > 27 &&
    input.humidityPercent > 40
  ) {
    const heatIndex = heatIndexCelsius(input.temperatureC, input.humidityPercent);

    addRule(heatIndex > 40, 20, "Indice de căldură periculos, risc de epuizare termică", "weather");
    addRule(
      heatIndex > 32 && heatIndex <= 40,
      10,
      "Indice de căldură ridicat, hidratează-te",
      "weather"
    );
  }

  const experienceKey =
    input.experienceLevel === "beginner" ||
    input.experienceLevel === "intermediate" ||
    input.experienceLevel === "advanced" ||
    input.experienceLevel === "expert"
      ? input.experienceLevel
      : null;

  if (experienceKey != null && input.routeDifficulty != null) {
    const difficultyKey =
      input.routeDifficulty === "easy" ||
      input.routeDifficulty === "moderate" ||
      input.routeDifficulty === "hard" ||
      input.routeDifficulty === "expert"
        ? input.routeDifficulty
        : null;
    const diffPoints = {
      beginner: { easy: 0, moderate: 8, hard: 22, expert: 40 },
      intermediate: { easy: 0, moderate: 0, hard: 8, expert: 20 },
      advanced: { easy: 0, moderate: 0, hard: 0, expert: 8 },
      expert: { easy: 0, moderate: 0, hard: 0, expert: 0 },
    } as const;
    const diffPoint = difficultyKey != null ? diffPoints[experienceKey][difficultyKey] : 0;

    if (diffPoint > 0) {
      const diffReason =
        difficultyKey === "expert"
          ? `Dificultatea extremă a traseului necesită judecată avansată pe teren (SAC ${SAC_GRADE.expert})`
          : difficultyKey === "hard"
            ? `Dificultatea ridicată a traseului necesită experiență solidă de drumeție (SAC ${SAC_GRADE.hard})`
            : `Dificultatea moderată a traseului necesită ceva experiență de drumeție (SAC ${SAC_GRADE.moderate})`;

      addRule(
        true,
        diffPoint,
        diffReason,
        "terrain",
        suggestionByReason["Experiență de drumeție limitată pentru dificultatea acestui traseu"]
      );
    }
  }

  addRule(
    input.isolationScore != null &&
      input.isolationScore > 0.8 &&
      input.soloHiker === true,
    20,
    "Traseu izolat fără partener, salvare dificilă",
    "personal"
  );
  addRule(
    input.isolationScore != null && input.isolationScore > 0.6,
    10,
    "Traseu îndepărtat cu acces limitat pentru salvare",
    "personal"
  );

  addRule(
    input.maxAltitudeM != null && input.maxAltitudeM > 3000,
    25,
    "Altitudine foarte mare, risc de rău de altitudine peste 3000 m",
    "terrain"
  );
  addRule(
    input.maxAltitudeM != null &&
      input.maxAltitudeM > 2000 &&
      input.maxAltitudeM <= 3000,
    15,
    "Traseu la altitudine mare, aclimatizare recomandată",
    "terrain"
  );

  addRule(
    input.soloHiker === true &&
      (input.distanceKm >= 10 || input.elevationGainM >= 500),
    15,
    "Drumeție solo pe traseu solicitant, fără partener pentru urgențe",
    "personal"
  );

  addRule(
    input.userLastHikeDaysAgo != null && input.userLastHikeDaysAgo > 30,
    15,
    "Peste o lună de la ultima drumeție, condiția fizică poate fi scăzută",
    "personal"
  );
  addRule(
    input.userLastHikeDaysAgo != null &&
      input.userLastHikeDaysAgo > 14 &&
      input.userLastHikeDaysAgo <= 30,
    8,
    "Două săptămâni de la ultima drumeție, reia treptat",
    "personal"
  );

  addRule(
    input.userAvgActualVsEstimatedRatio != null &&
      input.userAvgActualVsEstimatedRatio > 1.3,
    15,
    "De obicei durezi cu 30 la sută mai mult decât estimarea, planifică timp suplimentar",
    "timing"
  );
  addRule(
    input.userAvgActualVsEstimatedRatio != null &&
      input.userAvgActualVsEstimatedRatio > 1.15 &&
      input.userAvgActualVsEstimatedRatio <= 1.3,
    8,
    "Depășești des ușor timpul estimat",
    "timing"
  );

  addRule(
    input.precipitationLast7DaysMm != null && input.precipitationLast7DaysMm > 50,
    20,
    "Ploi recente abundente, traseu probabil noroios și traversări de râuri riscante",
    "conditions"
  );
  addRule(
    input.precipitationLast7DaysMm != null &&
      input.precipitationLast7DaysMm > 20 &&
      input.precipitationLast7DaysMm <= 50,
    10,
    "Ploi recente moderate, așteaptă-te la porțiuni ude și alunecoase",
    "conditions"
  );

  addRule(
    input.precipitationProbability != null &&
      input.precipitationProbability > 40 &&
      input.weatherCode != null &&
      [95, 96, 99].includes(input.weatherCode) &&
      (input.elevationGainM >= 500 ||
        (input.precipitationLast7DaysMm != null && input.precipitationLast7DaysMm > 20)),
    20,
    "Risc de viitură: furtuni, teren ud și traseu abrupt",
    "weather"
  );

  if (
    input.fatigueScore != null &&
    input.fatigueScore > 0 &&
    input.fatigueDescription
  ) {
    const fatiguePoints = Math.round(input.fatigueScore * 35);
    const fatigueSuggestion =
      input.fatigueLevel === "high"
        ? "Încărcarea recentă este ridicată. Scurtează planul sau prioritizează recuperarea înainte de această drumeție."
        : input.fatigueLevel === "moderate"
          ? "Kilometrajul recent adaugă solicitare. Menține un ritm conservator sau alege un traseu mai ușor."
          : "Activitatea recentă poate afecta recuperarea. Adaugă o marjă de ritm și monitorizează efortul de la început.";

    score += fatiguePoints;
    factors.push({
      factor: "fatigue",
      label: "Încărcare recentă de activitate",
      value: fatiguePoints,
      description: input.fatigueDescription,
      suggestion: fatigueSuggestion,
      severity:
        input.fatigueLevel === "high" || input.fatigueLevel === "moderate"
          ? "moderate"
          : "info",
      category: "personal",
    });
  }

  if (input.userCompletedHikesCount !== undefined && input.userCompletedHikesCount >= 30) {
    addRule(
      true,
      -15,
      "Experiență vastă de drumeție, cu cel puțin 30 de trasee finalizate",
      "personal",
      "Istoricul tău de drumeții sugerează judecată și rezistență mai bune pentru acest tip de zi."
    );
  } else if (input.userCompletedHikesCount !== undefined && input.userCompletedHikesCount >= 20) {
    addRule(
      true,
      -10,
      "Experiență solidă de drumeție, cu cel puțin 20 de trasee finalizate",
      "personal",
      "Experiența ta reduce o parte din incertitudine, dar nu elimină pericolele specifice traseului."
    );
  }

  const perceivedBias = input.perceivedDifficultyBias;
  if (perceivedBias != null && perceivedBias >= 1.5) {
    addRule(
      true,
      14,
      "Evaluările anterioare arată că ți se par traseele mult mai grele decât gradul lor",
      "personal",
      "Evaluările tale de dificultate sunt mult peste nivelul obiectiv al traseelor, deci planifică timp și marjă suplimentare."
    );
  } else if (perceivedBias != null && perceivedBias >= 0.75) {
    addRule(
      true,
      8,
      "Evaluările anterioare arată că ți se par traseele mai grele decât gradul lor",
      "personal",
      "Evaluările tale de dificultate sunt peste nivelul obiectiv al traseelor, deci tratează această estimare conservator."
    );
  } else if (perceivedBias != null && perceivedBias <= -1) {
    addRule(
      true,
      -6,
      "Evaluările anterioare arată că ți se par traseele mai ușoare decât gradul lor",
      "personal",
      "Evaluările tale de dificultate sunt sub nivelul obiectiv al traseelor, sugerând o marjă confortabilă pe acest teren."
    );
  }

  addRule(
    input.groupSize !== undefined && input.groupSize >= 3,
    -6,
    "Grup de cel puțin 3 drumeți, siguranță mai bună",
    "personal"
  );

  addRule(
    input.experienceLevel === "expert" && (input.routeDifficulty === "easy" || input.routeDifficulty === "moderate"),
    -12,
    "Drumeț expert pe teren ușor, provocare tehnică foarte redusă",
    "terrain"
  );

  addRule(
    input.fitnessTrend === "declining",
    8,
    "Tendință fizică în scădere, drumețiile recente sugerează un ritm mai lent",
    "personal"
  );
  addRule(
    input.fitnessTrend === "improving",
    -5,
    "Condiție fizică în îmbunătățire, drumețiile recente arată performanță mai bună",
    "personal"
  );

  if ((input.priorCompletionsOnRoute ?? 0) >= 3) {
    addRule(
      true,
      -10,
      "Finalizări multiple ale acestui traseu, teren foarte familiar",
      "conditions"
    );
  } else if ((input.priorCompletionsOnRoute ?? 0) >= 1) {
    addRule(
      true,
      -6,
      "Finalizare anterioară a acestui traseu, cunoști poteca",
      "conditions"
    );
  } else if ((input.priorPartialsOnRoute ?? 0) >= 1) {
    addRule(
      true,
      -3,
      "Familiaritate parțială cu acest traseu dintr-o încercare anterioară",
      "conditions",
      "Cunoașterea parțială anterioară ajută, dar tratează traseul ca pe un obiectiv nou."
    );
  }

  if (input.routeMonthlyHikeCount != null) {
    addRule(
      input.routeMonthlyHikeCount <= 2,
      6,
      "Traseu parcurs rar recent, pregătire suplimentară recomandată",
      "conditions"
    );
    addRule(
      input.routeMonthlyHikeCount >= 12,
      -5,
      "Traseu popular parcurs frecvent, condiții mai sigure",
      "conditions"
    );
  }

  addRule(
    input.hasEmergencyContact === false &&
      input.soloHiker === true &&
      input.isolationScore != null &&
      input.isolationScore > 0.6,
    10,
    "Fără contact de urgență pe traseu izolat parcurs solo",
    "personal"
  );

  addRule(
    input.forecastDaysOut != null && input.forecastDaysOut >= 4,
    0,
    "Prognoza este la câteva zile distanță și se poate schimba",
    "weather",
    "Verifică din nou vremea aproape de plecare, deoarece prognozele montane se pot schimba rapid."
  );

  if (input.trailConditionReport) {
    const reportDate = new Date(input.trailConditionReport.reportedAt);
    const reportAgeDays = Number.isNaN(reportDate.getTime())
      ? null
      : (Date.now() - reportDate.getTime()) / (1000 * 60 * 60 * 24);
    const reportVerifiedText = input.trailConditionReport.isTrailVerified
      ? "Raport de traseu verificat."
      : "Raport de traseu neverificat.";
    const reportMetaSuggestion = `${reportVerifiedText} ${input.trailConditionReport.label}`;

    const trailConditionReason =
      input.trailConditionReport.condition === "blocked"
        ? "Traseu raportat recent ca blocat sau impracticabil, verifică înainte de plecare"
        : input.trailConditionReport.condition === "snowy"
          ? "Traseu raportat cu zăpadă, așteaptă-te la porțiuni înghețate sau acoperite de zăpadă"
          : input.trailConditionReport.condition === "muddy"
            ? "Traseu raportat noroios, potecile ude cresc riscul de alunecare și încetinesc ritmul"
            : input.trailConditionReport.condition === "overgrown"
              ? "Traseu raportat năpădit, vizibilitate redusă și posibile obstacole"
              : "Condiții uscate pe traseu, condițiile sunt favorabile";

    addRule(
      true,
      input.trailConditionReport.riskPoints,
      trailConditionReason,
      "conditions",
      `${suggestionByReason[trailConditionReason]} ${reportMetaSuggestion}`
    );

    addRule(
      reportAgeDays != null && reportAgeDays > 21,
      4,
      "Raportul de traseu are peste trei săptămâni și poate fi învechit",
      "conditions",
      "Tratează rapoartele vechi cu prudență și verifică starea traseului mai aproape de plecare."
    );
  }

  // Seasonal risk rules
  addRule(
    isWinter && maxAlt > 2000,
    30,
    "Sezon de iarnă: traseele de altitudine mare sunt de obicei inaccesibile și acoperite de zăpadă",
    "conditions"
  );
  addRule(
    isWinter && maxAlt > 1500 && maxAlt <= 2000,
    18,
    "Condiții de iarnă: zăpadă și gheață probabile peste 1500 m",
    "conditions"
  );
  addRule(
    isEarlySpring && maxAlt > 2000,
    22,
    "Primăvara: traseele peste 2000 m sunt probabil încă acoperite de zăpadă - acces tipic din iunie",
    "conditions"
  );
  addRule(
    isEarlySpring && maxAlt > 1500 && maxAlt <= 2000,
    12,
    "Primăvară timpurie: strat de zăpadă probabil peste 1500 m",
    "conditions"
  );
  addRule(
    isLateSpring && maxAlt > 2200,
    14,
    "Sfârșit de mai: traseele la altitudine foarte mare pot avea încă zăpadă",
    "conditions"
  );
  addRule(
    isAutumn && maxAlt > 1800,
    12,
    "Toamnă târzie: prima ninsoare sezonieră este probabilă peste 1800 m",
    "conditions"
  );

  let synergyLoad = 0;

  const applySynergy = (condition: boolean, multiplier: number, reason: string) => {
    if (!condition) {
      return;
    }

    const suggestion =
      suggestionByReason[reason] ?? "Ajustează planul și pregătirea pentru acest factor de risc.";

    const value = Math.round((multiplier - 1) * 20);
    synergyLoad += (multiplier - 1) * 20;
    factors.push({
      factor: toFactorKey(reason),
      label: "Risc combinat",
      value,
      description: reason,
      suggestion,
      severity: "high",
      category: "synergy",
    });
  };

  const sunsetHour = input.sunsetTime ? parseTimeToHours(input.sunsetTime) : null;
  const startHourForSynergy = parseTimeToHours(input.startTime);
  const estimatedEndH =
    startHourForSynergy !== null ? startHourForSynergy + input.estimatedDurationH : null;

  applySynergy(
    input.soloHiker === true &&
      ((input.precipitationProbability != null && input.precipitationProbability >= 50) ||
        (input.weatherCode != null && [95, 96, 99].includes(input.weatherCode))) &&
      (input.distanceKm >= 10 || input.elevationGainM >= 600),
    1.8,
    "Efect combinat: drumeție solo + vreme rea + traseu solicitant (x1.8)"
  );

  applySynergy(
    input.experienceLevel === "beginner" &&
      (input.routeDifficulty === "hard" || input.routeDifficulty === "expert") &&
      input.maxAltitudeM != null &&
      input.maxAltitudeM > 2000,
    2,
    "Efect combinat: drumeț neexperimentat pe teren alpin peste 2000 m (x2.0)"
  );

  applySynergy(
    estimatedEndH != null &&
      sunsetHour != null &&
      estimatedEndH > sunsetHour - 0.5 &&
      input.isolationScore != null &&
      input.isolationScore > 0.6,
    1.5,
    "Efect combinat: sosire aproape de întuneric pe traseu izolat (x1.5)"
  );

  applySynergy(
    input.precipitationLast7DaysMm != null &&
      input.precipitationLast7DaysMm > 30 &&
      input.soloHiker === true &&
      input.isolationScore != null &&
      input.isolationScore > 0.5,
    1.5,
    "Efect combinat: ploi recente abundente pe traseu izolat fără partener (x1.5)"
  );

  const noRecentHighAltitudeHike =
    input.daysSinceLastHighAltitudeHike == null || input.daysSinceLastHighAltitudeHike > 60;
  const badWeather =
    isThunderstorm ||
    (input.precipitationProbability != null && input.precipitationProbability >= 70) ||
    (input.weatherCode != null && [71, 73, 75, 77, 85, 86].includes(input.weatherCode)) ||
    (input.windspeedKmh != null && input.windspeedKmh >= 50);
  const historicallySlow = input.userAvgActualVsEstimatedRatio != null && input.userAvgActualVsEstimatedRatio > 1.15;
  const trailCondition = input.trailConditionReport?.condition ?? null;

  applySynergy(
    input.fatigueScore != null &&
      input.fatigueScore > 0.6 &&
      input.soloHiker === true &&
      input.isolationScore != null &&
      input.isolationScore > 0.6,
    1.6,
    "Oboseală ridicată, solo și traseu îndepărtat"
  );

  applySynergy(
    (trailCondition === "blocked" || trailCondition === "snowy") &&
      input.experienceLevel === "beginner" &&
      input.soloHiker === true,
    1.8,
    "Traseu blocat sau înzăpezit, începător și drumeție solo"
  );

  applySynergy(
    startHourForSynergy != null &&
      startHourForSynergy >= 12 &&
      historicallySlow &&
      input.distanceKm >= 15,
    2,
    "Pornire târzie, ritm istoric lent și traseu lung"
  );

  applySynergy(
    input.maxAltitudeM != null &&
      input.maxAltitudeM >= 2000 &&
      noRecentHighAltitudeHike &&
      badWeather,
    1.7,
    "Altitudine mare, fără drumeție recentă la altitudine și vreme rea"
  );

  applySynergy(
    input.fitnessTrend === "declining" &&
      input.distanceKm >= 20 &&
      input.backpackWeightKg >= 12,
    1.4,
    "Tendință fizică în scădere, traseu foarte lung și rucsac greu"
  );

  applySynergy(
    isThunderstorm && input.maxAltitudeM != null && input.maxAltitudeM > 2000,
    2.2,
    "Efect combinat: furtună cu tunete + traseu peste 2000 m (x2.2)"
  );

  applySynergy(
    isEarlySpring && maxAlt > 2000 && input.experienceLevel === "beginner",
    1.8,
    "Primăvară plus altitudine foarte mare plus începător înseamnă risc extrem de ridicat"
  );

  applySynergy(
    isWinter && maxAlt > 1800,
    1.6,
    "Traseele de altitudine mare iarna au risc combinat extrem"
  );

  const domainRaw: Record<RiskDomain, number> = {
    terrain: 0,
    weather: 0,
    personal: 0,
    conditions: 0,
    timing: 0,
  };

  for (const factor of factors) {
    if (factor.category !== "synergy") {
      domainRaw[factor.category] += factor.value;
    }
  }

  const weatherHasData =
    input.precipitationProbability != null ||
    input.windspeedKmh != null ||
    input.temperatureC != null ||
    input.humidityPercent != null ||
    input.uvIndex != null ||
    input.weatherCode != null;
  const personalHasData =
    input.userAge != null ||
    input.userHeightCm != null ||
    input.userWeightKg != null ||
    input.experienceLevel != null ||
    input.userCompletedHikesCount !== undefined ||
    input.userAvgPaceMinKm != null ||
    input.userAvgElevationGainM != null ||
    input.userAvgDistanceKm != null ||
    input.userLastHikeDaysAgo != null ||
    input.fitnessLevel != null ||
    input.fatigueScore != null;
  const routeElevationHasData = input.maxAltitudeM != null;

  const addConservativeFloor = (
    factor: string,
    label: string,
    value: number,
    description: string,
    suggestion: string,
    category: RiskDomain
  ) => {
    factors.push({
      factor,
      label,
      value,
      description,
      suggestion,
      severity: pointsToSeverity(value),
      category,
    });
    domainRaw[category] += value;
  };

  if (!weatherHasData) {
    addConservativeFloor(
      "missing_weather_data",
      "Date meteo lipsă",
      30,
      "Datele de prognoză meteo lipsesc, așa că riscul include o marjă conservatoare de incertitudine.",
      "Verifică o prognoză meteo montană actuală înainte de a te angaja în această drumeție.",
      "weather"
    );
  }

  if (!personalHasData) {
    addConservativeFloor(
      "missing_personal_data",
      "Date personale lipsă",
      20,
      "Datele de profil personal și activitate recentă lipsesc, așa că riscul include o marjă conservatoare de incertitudine.",
      "Completează profilul de drumeție și istoricul activității recente pentru o evaluare mai bine calibrată.",
      "personal"
    );
  }

  if (!routeElevationHasData) {
    addConservativeFloor(
      "missing_route_elevation_data",
      "Date de altitudine ale traseului lipsă",
      8,
      "Datele de altitudine ale traseului lipsesc, așa că riscul terenului include o marjă conservatoare de incertitudine.",
      "Verifică profilul de altitudine al traseului înainte de plecare.",
      "terrain"
    );
  }

  const normalizeDomain = (raw: number) =>
    Math.round(100 * (1 - Math.exp(-Math.max(0, raw) / 60)));

  const subScores: RiskResult["subScores"] = {
    terrain: normalizeDomain(domainRaw.terrain),
    weather: normalizeDomain(domainRaw.weather),
    personal: normalizeDomain(domainRaw.personal),
    conditions: normalizeDomain(domainRaw.conditions),
    timing: normalizeDomain(domainRaw.timing),
  };

  const weightedAvg =
    subScores.terrain * 0.28 +
    subScores.weather * 0.26 +
    subScores.personal * 0.2 +
    subScores.conditions * 0.14 +
    subScores.timing * 0.12;
  const maxDomain = Math.max(
    subScores.terrain,
    subScores.weather,
    subScores.personal,
    subScores.conditions,
    subScores.timing
  );

  const baseScore = 0.6 * weightedAvg + 0.4 * maxDomain;
  const SYNERGY_MAX_BONUS = 30;
  const SYNERGY_K = 22;
  const synergyBonus =
    synergyLoad > 0
      ? SYNERGY_MAX_BONUS *
        (1 - Math.exp(-synergyLoad / SYNERGY_K)) *
        ((100 - baseScore) / 100)
      : 0;

  score = Math.max(0, Math.min(100, Math.round(baseScore + synergyBonus)));

  const missingCount = [weatherHasData, personalHasData, routeElevationHasData].filter(
    (hasData) => !hasData
  ).length;
  const dataCompleteness: RiskResult["dataCompleteness"] = {
    weather: weatherHasData,
    personal: personalHasData,
    routeElevation: routeElevationHasData,
    overall: missingCount === 0 ? "full" : missingCount === 1 ? "partial" : "limited",
  };
  const confidenceMissing: string[] = [];
  let confidenceScore = 1;

  if (!weatherHasData) {
    confidenceScore -= 0.3;
    confidenceMissing.push("weather");
  }

  if (!personalHasData) {
    confidenceScore -= 0.25;
    confidenceMissing.push("personal_profile");
  }

  if (!routeElevationHasData) {
    confidenceScore -= 0.1;
    confidenceMissing.push("route_elevation");
  }

  if (input.userCompletedHikesCount != null && input.userCompletedHikesCount < 3) {
    confidenceScore -= 0.1;
    confidenceMissing.push("history_insufficient");
  }

  if (input.forecastDaysOut != null && input.forecastDaysOut >= 4) {
    confidenceScore -= 0.1;
    confidenceMissing.push("forecast_far");
  }

  if (input.trailConditionReport) {
    const reportDate = new Date(input.trailConditionReport.reportedAt);
    const reportAgeDays = Number.isNaN(reportDate.getTime())
      ? null
      : ((input.now ?? new Date()).getTime() - reportDate.getTime()) / (1000 * 60 * 60 * 24);

    if (reportAgeDays != null && reportAgeDays > 21) {
      confidenceScore -= 0.05;
      confidenceMissing.push("trail_report_stale");
    }
  }

  if (input.surfaceType == null) {
    confidenceScore -= 0.05;
    confidenceMissing.push("surface_unknown");
  }

  confidenceScore = Math.max(0, Math.min(1, confidenceScore));
  const confidence: RiskResult["confidence"] = {
    score: Number(confidenceScore.toFixed(2)),
    level: confidenceScore >= 0.85 ? "high" : confidenceScore >= 0.6 ? "medium" : "low",
    missing: confidenceMissing,
  };

  const counterfactuals: string[] = [];

  if (input.soloHiker === true) {
    counterfactuals.push("Mergi cu un partener — drumeția solo pe acest traseu crește semnificativ riscul");
  }
  if (startHourForSynergy != null && startHourForSynergy >= 12) {
    counterfactuals.push("Pornește mai devreme pentru a avea o marjă de lumină naturală");
  }
  if (input.backpackWeightKg >= 8) {
    counterfactuals.push("Redu greutatea rucsacului — un echipament mai ușor scade efortul fizic");
  }
  if (input.precipitationProbability != null && input.precipitationProbability >= 40) {
    counterfactuals.push("Alege o zi cu probabilitate mai mică de precipitații");
  }
  if (
    (input.routeDifficulty === "hard" || input.routeDifficulty === "expert") &&
    input.experienceLevel === "beginner"
  ) {
    counterfactuals.push("Acumulează experiență pe trasee mai ușoare înainte de a aborda teren dificil sau alpin");
  }
  if (
    input.maxAltitudeM != null &&
    input.maxAltitudeM > 2000 &&
    input.userLastHikeDaysAgo != null &&
    input.userLastHikeDaysAgo > 14
  ) {
    counterfactuals.push("Fă drumeții regulate la altitudine mai joasă pentru a te aclimatiza înainte de acest traseu");
  }

  const level: RiskResult["level"] =
    score >= 75 ? "Very High" : score >= 50 ? "High" : score >= 25 ? "Moderate" : "Low";

  return {
    score,
    level,
    counterfactuals: counterfactuals.slice(0, 3),
    factors,
    subScores,
    dataCompleteness,
    confidence,
  };
}



