/**
 * Curated portrait URLs (Unsplash + Pexels) depicting Black people, for GiveBlack
 * donor placeholders when no `avatar_url` is stored. Licenses permit this use.
 * Index is deterministic from user id + name (see hash below).
 */

const pexels = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=256&h=256&fit=crop`;

const unsplash = (photoSlug: string) =>
  `https://images.unsplash.com/photo-${photoSlug}?auto=format&w=256&h=256&fit=crop&crop=faces&q=80`;

/** Women / femme-presenting portraits */
export const DONOR_PLACEHOLDER_PORTRAITS_WOMEN: readonly string[] = [
  unsplash("1531123897727-8f129e1688ce"),
  unsplash("1531384441138-2736e62e0919"),
  unsplash("1594744803329-e58b31de8bf5"),
  unsplash("1573496359142-b8d87734a5a2"),
  unsplash("1607746882042-944635dfe10e"),
  unsplash("1619895862022-09114b41f16f"),
  pexels(2379004),
  pexels(1181690),
  pexels(1181686),
  pexels(3771089),
  pexels(3785079),
  pexels(3785077),
  pexels(3785078),
  pexels(3783255),
  pexels(3783200),
  pexels(3783201),
  pexels(3783202),
  pexels(3783203),
  pexels(3783204),
];

/** Men / masc-presenting portraits */
export const DONOR_PLACEHOLDER_PORTRAITS_MEN: readonly string[] = [
  unsplash("1507003211169-0a1dd7228f2d"),
  unsplash("1506794778202-cad84cf45f1d"),
  unsplash("1560250097-0b93528c311a"),
  unsplash("1544723795-3fb6469f5b39"),
  pexels(2182970),
  pexels(1043471),
  pexels(1043474),
  pexels(1043473),
  pexels(7717425),
  pexels(7717025),
  pexels(5387290),
  pexels(5387285),
  pexels(5387295),
  pexels(5387310),
  pexels(5387312),
  pexels(5387315),
  pexels(5387330),
  pexels(5387332),
  pexels(5387335),
];

const FEMALE_FIRST = new Set(
  `mary,patricia,jennifer,linda,barbara,elizabeth,susan,jessica,sarah,karen,lisa,nancy,betty,margaret,sandra,ashley,kimberly,emily,donna,michelle,carol,amanda,melissa,deborah,stephanie,rebecca,laura,sharon,cynthia,kathleen,amy,angela,anna,brenda,emma,olivia,ava,sophia,isabella,mia,charlotte,amelia,harper,evelyn,abigail,sofia,avery,ella,scarlett,grace,chloe,victoria,riley,aria,luna,camila,penelope,layla,zoe,nora,lily,eleanor,hannah,lillian,addison,ellie,stella,natalie,lucy,naomi,elena,maria,rosa,ana,carmen,lucia,gabriela,isabel,valentina,nina,julia,claire,alice,ivy,sadie,skylar,genesis,quinn,piper,willow,everly,clara,violet,hazel,aubrey,aurora,emilia,taylor`
    .split(",")
    .map((s) => s.trim())
);

const MALE_FIRST = new Set(
  `james,john,robert,michael,william,david,richard,joseph,thomas,charles,christopher,daniel,matthew,anthony,mark,donald,steven,paul,andrew,joshua,kenneth,kevin,brian,george,timothy,ronald,jason,edward,jeffrey,ryan,jacob,gary,nicholas,eric,jonathan,stephen,larry,justin,scott,brandon,benjamin,samuel,gregory,frank,raymond,alexander,patrick,jack,dennis,jerry,tyler,aaron,jose,henry,adam,douglas,nathan,peter,zachary,walter,kyle,harold,carlos,ethan,mason,noah,liam,lucas,oliver,elijah,logan,jackson,owen,grayson,leo,julian,isaac,gabriel,dylan,lincoln,mateo,levi,asher`
    .split(",")
    .map((s) => s.trim())
);

function normalizeFirstToken(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/[^a-z\-]/g, "");
  if (!t) return "x";
  return t.split("-")[0] || "x";
}

function fnv1a32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function inferPortraitFolder(firstNameRaw: string, stableId: string): "men" | "women" {
  const first = normalizeFirstToken(firstNameRaw);
  if (FEMALE_FIRST.has(first)) return "women";
  if (MALE_FIRST.has(first)) return "men";
  let h = 0;
  const s = `${stableId}:${first}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? "women" : "men";
}

/** Public seed string (for debugging); portrait uses full hash including name. */
export function donorPlaceholderImageSeed(stableId: string, firstNameRaw: string): string {
  const id = String(stableId || "anonymous").trim() || "anonymous";
  const first = normalizeFirstToken(firstNameRaw);
  const h1 = fnv1a32(`${id}\0${first}`);
  const h2 = fnv1a32(`${first}\0${id}\0portrait`);
  return `gb${h1.toString(16)}${h2.toString(16)}`;
}

function normalizeLastToken(raw: string | null | undefined): string {
  if (raw == null) return "";
  const t = String(raw).trim().toLowerCase().replace(/[^a-z\-]/g, "");
  return t.split("-")[0] || "";
}

/** Placeholder portrait URL when the donor has no uploaded avatar. */
export function defaultDonorPlaceholderPortraitUrl(
  userId: string,
  firstNameRaw: string,
  lastNameRaw?: string | null
): string {
  const folder = inferPortraitFolder(firstNameRaw, userId);
  const pool = folder === "women" ? DONOR_PLACEHOLDER_PORTRAITS_WOMEN : DONOR_PLACEHOLDER_PORTRAITS_MEN;
  const seed = donorPlaceholderImageSeed(userId, firstNameRaw);
  const last = normalizeLastToken(lastNameRaw);
  const idx =
    fnv1a32(`${userId}|${normalizeFirstToken(firstNameRaw)}|${last}|${folder}|${seed}`) % pool.length;
  return pool[idx] ?? pool[0]!;
}

export function resolveDonorPlaceholderPortraitUrl(
  userId: string,
  firstName: string,
  storedAvatarUrl: string | null | undefined,
  lastName?: string | null
): string {
  const trimmed = storedAvatarUrl != null ? String(storedAvatarUrl).trim() : "";
  if (trimmed.length > 0) return trimmed;
  return defaultDonorPlaceholderPortraitUrl(userId, firstName, lastName);
}
