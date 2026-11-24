// Vse igralne konstante na enem mestu (enote: metri, sekunde, milisekunde).

export const SERVER_TICK_MS = 50; // 20 Hz
export const CLIENT_SEND_MS = 50; // 20 Hz

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const NAME_MAX_LEN = 16;
export const ROOM_CODE_LEN = 4;
/** Znaki za kodo sobe – brez zamenljivih O/0/I/1/L. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Gibanje
export const MOVE_SPEED = 4.5;
export const JUMP_SPEED = 6;
export const GRAVITY = 18;
export const STEP_HEIGHT = 0.3;
export const PHYSICS_DT = 1 / 60;

// Lovec
export const HUNTER_HALF = 0.3;
export const HUNTER_HEIGHT = 1.7;
export const HUNTER_EYE = 1.5;

// Življenje in lopata
export const HP_MAX = 100;
/** Lovec ima lopato: udarec iz bližine. */
export const SHOVEL_DAMAGE = 50; // dva udarca ujameta skrivalca
export const SHOVEL_INTERVAL_MS = 600;
/** Doseg udarca z lopato (m, od glave lovca). */
export const SHOVEL_RANGE = 2.6;
/** Lok zamaha: polovični kot (rad) in vodoravni doseg od lovca do roba skrivalca. */
export const SHOVEL_ARC = 0.75;
export const SHOVEL_SWEEP_REACH = 1.9;
/** Prikaz radarja na zaslonu (ms). */
export const RADAR_SHOW_MS = 5000;

// Skrivalci: samodejna sprememba in razkrivanje imen
/** Skrivalec se vsakih 25 s samodejno spremeni v naslednjo obliko. */
export const AUTO_SHAPE_MS = 25000;
/** Med lovom so imena skrivalcev v vsakem 30-sekundnem ciklu 10 s vidna vsem. */
export const REVEAL_PERIOD_MS = 30000;
export const REVEAL_DURATION_MS = 10000;
export const WRONG_PROP_PENALTY = 5;
/** Največja razdalja med izvorom udarca (kamera) in glavo lovca. */
export const SHOT_ORIGIN_TOLERANCE = 5;

/**
 * Pomoč pri merjenju: velja SAMO za skrivalca, ki ga je ta lovec že zadel.
 * Hitbox takega skrivalca je za toliko metrov večji, a samo če bi strel sicer
 * zadel steno/tla/nič – nikoli, če zadene pravi predmet (kavč ostane kavč).
 */
export const AIM_ASSIST_MARGIN = 0.3;
/** Kot (radiani), znotraj katerega kamera rahlo "prime" že zadetega skrivalca. */
export const AIM_ASSIST_ANGLE = 0.12;

// Skrivalec
export const TRANSFORM_RANGE = 4;
/** Po spremembi se lahko znova spremeniš šele čez 5 s. */
export const TRANSFORM_COOLDOWN_MS = 5000;
/** Vabe (lažne kopije skrivalca) na rundo. */
export const DECOYS_PER_ROUND = 2;
/** Radar lovca: doseg in čakanje med uporabami. */
export const RADAR_RANGE = 12;
export const RADAR_COOLDOWN_MS = 25000;
/** Lovec ob ulovu dobi nekaj življenja nazaj. */
export const KILL_HEAL = 20;

// Točke
export const SCORE_KILL = 100;
export const SCORE_SURVIVE_TICK = 10;
export const SCORE_SURVIVE_TICK_MS = 10000;
export const SCORE_SURVIVE_ROUND = 50;
/** Skrivalec dobi točke, ko lovec ustreli njegovo vabo. */
export const SCORE_DECOY = 20;

// Časi faz
export const ROUND_END_MS = 7000;
export const RECONNECT_GRACE_MS = 30000;

// Omrežje / preverjanje
export const MOVE_TOLERANCE_FACTOR = 1.6;
export const MOVE_TOLERANCE_SLACK = 0.6;
export const WALL_PENETRATION_TOLERANCE = 0.15;
export const RATE_LIMIT_PER_SEC = 60;
export const RATE_LIMIT_BURST = 120;

// Nastavitve sobe (dovoljene vrednosti)
export const HIDE_TIME_OPTIONS = [20, 30, 45] as const;
export const HUNT_TIME_OPTIONS = [120, 180, 300] as const;
export const HUNTER_COUNT_OPTIONS = [0, 1, 2, 3] as const; // 0 = samodejno
export const ROUND_OPTIONS = [3, 5, 8] as const;
