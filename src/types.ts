// Raw response from data.gov.lt Spinta API
export interface DokumentasRaw {
  _id: string;
  _type: string;
  dokumento_id: string;
  pavadinimas: string;
  tar_kodas: string;
  rusis: string;
  galioj_busena: string;
  priemusi_inst: string | null;
  atv_dok_nr: string | null;
  registracija: string | null;
  priimtas: string | null;
  paskelbta_tar: string | null;
  isigalioja: string | null;
  negalioja: string | null;
  tekstas_lt: string | null;
  nuoroda: string;
  _page: { next: string } | null;
}

// Raw consolidated version from data.gov.lt
export interface SuvestineRaw {
  _id: string;
  dokumento_id: string;
  suvestines_id: string;
  tekstas_lt: string;
  galioja_nuo: string;
  galioja_iki: string | null;
  nuoroda: string;
  _page: { next: string } | null;
}

// Normalized document type
export type ActType =
  | 'konstitucija'
  | 'konstitucinis_istatymas'
  | 'istatymas'
  | 'kodeksas'
  | 'seimo_nutarimas'
  | 'vyriausybes_nutarimas'
  | 'prezidento_dekretas'
  | 'ministro_isakymas'
  | 'institucijos_isakymas'
  | 'tarptautine_sutartis'
  | 'kitas';

// Validity status
export type ActStatus =
  | 'galioja'
  | 'negalioja'
  | 'dar_neisigaliojo'
  | 'galioja_is_dalies';

// Processed legal act for markdown generation
export interface LegalAct {
  tarId: string;
  dokumentoId: string;
  dokNr: string;
  pavadinimas: string;
  rusis: ActType;
  leidziantisOrganas: string;
  priemimoData: string;
  isigaliojimoData: string;
  paskelbimoData: string;
  paskutinioPakeitimoData?: string;
  statusas: ActStatus;
  etarUrl: string;
  tekstas?: string;
}

// Consolidated (amendment) version
export interface ConsolidatedVersion {
  dokumentoId: string;
  suvestinesId: string;
  tekstas: string;
  galiojaNuo: string;
  galiojaIki: string | null;
}

// Directory mapping for each act type
export const ACT_TYPE_DIRS: Record<ActType, string> = {
  konstitucija: 'konstitucija',
  konstitucinis_istatymas: 'konstituciniai-istatymai',
  istatymas: 'istatymai',
  kodeksas: 'kodeksai',
  seimo_nutarimas: 'seimo-nutarimai',
  vyriausybes_nutarimas: 'vyriausybes-nutarimai',
  prezidento_dekretas: 'prezidento-dekretai',
  ministro_isakymas: 'ministru-isakymai',
  institucijos_isakymas: 'instituciju-isakymai',
  tarptautine_sutartis: 'tarptautines-sutartys',
  kitas: 'kiti',
};
