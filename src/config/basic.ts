/**
 * Basic mode: a handful of controls that each drive several INI keys.
 *
 * OptiScaler's real configuration is split across keys that only make sense
 * together — an upscaler choice is a backend id plus an FSR4 flag, frame
 * generation is an input plus an output. Basic mode presents the combination.
 */

import type { ConfigValues, GpuInfo, LiveStatus, OptionChange } from "../types";
import { UPSCALER_LABELS } from "./labels";
import { AUTO, isAuto } from "./values";

export interface Preset {
  id: string;
  label: string;
  description?: string;
  /** Written when the preset is chosen. */
  changes: OptionChange[];
  /** Recognises the preset from the current INI values. */
  matches: (values: ConfigValues) => boolean;
}

const get = (values: ConfigValues, section: string, key: string) =>
  (values[section]?.[key] ?? AUTO).toLowerCase();

const change = (section: string, key: string, value: string): OptionChange => ({
  section,
  key,
  value,
});

// -- Upscaler ---------------------------------------------------------------

/** Sets the same backend for every graphics API so the game gets it whichever it uses. */
function upscalerPreset(
  id: string,
  label: string,
  description: string,
  dx12: string,
  dx11: string,
  vulkan: string,
  fsr4?: "auto" | "int8-lite" | "off"
): Preset {
  const changes = [
    change("Upscalers", "Dx12Upscaler", dx12),
    change("Upscalers", "Dx11Upscaler", dx11),
    change("Upscalers", "VulkanUpscaler", vulkan),
  ];
  if (fsr4 === "auto") {
    // Let OptiScaler trust its own GPU detection (RDNA 3/4), and ask for the
    // FSR 4 backend where "auto" would otherwise stay on FSR 3.x.
    changes.push(change("FSR", "Fsr4GpuSupport", AUTO));
    changes.push(change("FSR", "Fsr4Model", AUTO));
    changes.push(change("FSR", "UpscalerIndex", "0"));
  } else if (fsr4 === "int8-lite") {
    // v10's switches: 4 marks the GPU as FSR 4 capable and limits it to INT8,
    // 3 picks the Lite model, and only the Vulkan driver DLL carries it.
    changes.push(change("FSR", "Fsr4GpuSupport", "4"));
    changes.push(change("FSR", "Fsr4Model", "3"));
    changes.push(change("FSR", "UpscalerIndex", "0"));
  } else if (fsr4 === "off") {
    // "No override": leave the GPU checks alone, and run FSR 3.1.5 in the
    // backend where the FSR 4 index is not being asked for.
    changes.push(change("FSR", "Fsr4GpuSupport", "0"));
    changes.push(change("FSR", "UpscalerIndex", "1"));
  }
  return {
    id,
    label,
    description,
    changes,
    matches: (values) => {
      if (get(values, "Upscalers", "Dx12Upscaler") !== dx12) return false;
      if (fsr4 === undefined) return true;
      if (fsr4 === "auto") {
        return isAuto(get(values, "FSR", "Fsr4GpuSupport"));
      }
      if (fsr4 === "int8-lite") {
        return (
          get(values, "FSR", "Fsr4GpuSupport") === "4" &&
          get(values, "FSR", "Fsr4Model") === "3"
        );
      }
      return get(values, "FSR", "Fsr4GpuSupport") === "0";
    },
  };
}

export const UPSCALER_PRESETS: Preset[] = [
  {
    id: "auto",
    label: "Auto (leave the game alone)",
    description: "OptiScaler picks its own default for each API.",
    changes: [
      change("Upscalers", "Dx12Upscaler", AUTO),
      change("Upscalers", "Dx11Upscaler", AUTO),
      change("Upscalers", "VulkanUpscaler", AUTO),
      change("FSR", "Fsr4GpuSupport", AUTO),
      change("FSR", "Fsr4Model", AUTO),
      change("FSR", "UpscalerIndex", AUTO),
    ],
    matches: (values) => isAuto(get(values, "Upscalers", "Dx12Upscaler")),
  },
  {
    // installer.install() writes exactly this preset on every install, so it is
    // also what this entry has to recognise. Listed here so the panel can show
    // which preset the folder is on and offer it back.
    id: "fsr4-int8",
    label: "FSR 4 Lite — Steam Deck",
    description:
      "INT8 Lite model, read from the bundled Vulkan driver DLL (amdvkffx64). "
      + "Runs on any GPU and needs no download.",
    changes: [
      change("Upscalers", "Dx12Upscaler", "ffx"),
      change("Upscalers", "Dx11Upscaler", "ffx_12"),
      change("Upscalers", "VulkanUpscaler", "ffx_12"),
      // v10's own words for this: Fsr4GpuSupport=4 "can enable FSR 4 on
      // unsupported GPUs or limit it to INT8", and INT8 Lite is the smaller
      // model meant for APUs. Fsr4Model=3 selects it; that model exists only in
      // the Vulkan driver DLL, which is why the payload ships amdvkffx64.dll.
      change("FSR", "Fsr4GpuSupport", "4"),
      change("FSR", "Fsr4Model", "3"),
      change("FSR", "UpscalerIndex", "0"),
      change("FSR", "Fsr4Preset", AUTO),
    ],
    matches: (values) =>
      get(values, "Upscalers", "Dx12Upscaler") === "ffx" &&
      get(values, "FSR", "Fsr4GpuSupport") === "4" &&
      get(values, "FSR", "Fsr4Model") === "3" &&
      get(values, "FSR", "UpscalerIndex") === "0",
  },
  upscalerPreset(
    "fsr4",
    "FSR 4",
    "OptiScaler's FidelityFX backend with FSR 4 turned on. Needs an RDNA 3 or RDNA 4 GPU.",
    "ffx", "ffx_12", "ffx_12", "auto"
  ),
  upscalerPreset(
    "fsr31",
    "FSR 3.X",
    "The same backend running FSR 3.1. Works on any GPU — the safe choice on a Steam Deck.",
    "ffx", "fsr31", "ffx", "off"
  ),
  upscalerPreset(
    "fsr22",
    "FSR 2.2.1",
    "Older FSR, most compatible.",
    "fsr22", "fsr22", "fsr22"
  ),
  upscalerPreset(
    "xess",
    "XeSS",
    "Intel's upscaler. Often the best image quality on AMD hardware.",
    "xess", "xess_12", "xess"
  ),
  upscalerPreset(
    "dlss",
    "DLSS",
    "Nvidia only — needs a real DLSS-capable GPU.",
    "dlss", "dlss", "dlss"
  ),
];

// -- Frame generation -------------------------------------------------------

function fgPreset(
  id: string,
  label: string,
  description: string,
  input: string,
  output: string
): Preset {
  return {
    id,
    label,
    description,
    changes: [
      change("FrameGen", "FGInput", input),
      change("FrameGen", "FGOutput", output),
    ],
    matches: (values) =>
      get(values, "FrameGen", "FGInput") === input &&
      get(values, "FrameGen", "FGOutput") === output,
  };
}

// Each preset is an FG Input and an FG Output together, and is named after the
// pair the way OptiScaler's own overlay names them, so that what is picked here
// is recognisable in the in-game FG Input / FG Output combos.
export const FG_PRESETS: Preset[] = [
  fgPreset(
    "fsrfg",
    "FSR FG",
    "FG Input “FSR 3.1 FG” into FG Output “FSR FG”. The most broadly compatible pair.",
    "fsrfg", "fsrfg"
  ),
  fgPreset(
    "xefg",
    "XeFG",
    "FG Input “FSR 3.1 FG” into FG Output “XeFG”. Supports 3X and 4X as well as 2X.",
    "fsrfg", "xefg"
  ),
  fgPreset(
    "nukems",
    "FSR3-FG via Nukem's",
    "FG Input “Nukem's DLSSG”. Uses the game's own DLSS-FG path — only for games that have it.",
    "nukems", "nukems"
  ),
  fgPreset(
    "dlssg",
    "DLSSG via Streamline",
    "FG Input “DLSSG via Streamline” into FG Output “FSR FG”. Only for games built on Streamline v2.",
    "dlssg", "fsrfg"
  ),
];

// -- The FFX frame generator ------------------------------------------------

/**
 * Which FidelityFX frame generator the FSR FG output runs.
 *
 * OptiScaler's overlay calls this "FFX FG" and changes it with a button
 * labelled "Change FG": it writes the index into its config and raises two
 * flags that make the FG context rebuild, which is the one part of frame
 * generation that genuinely does change mid-game. The list is not fixed — the
 * FFX SDK reports what it can offer to each game — so a running game is a
 * better source for it than the shipped INI, and `LiveStatus.ffx_fg_versions`
 * is that answer when there is one.
 */
export const FFX_FG_SECTION = "FSR";
export const FFX_FG_KEY = "FGIndex";
export const FFX_FG_ID = `${FFX_FG_SECTION}.${FFX_FG_KEY}`;

/**
 * Whether the FFX generator is the one in use. Nukem's and XeFG are other
 * implementations entirely and take no notice of this index; "auto" is included
 * because OptiScaler resolves it to FSR FG in the common case, and a running
 * game settles the question by reporting a version list or not.
 */
export function usesFfxFrameGen(values: ConfigValues): boolean {
  const output = get(values, "FrameGen", "FGOutput");
  return output === "fsrfg" || isAuto(output);
}

export function ffxFgChanges(index: string): OptionChange[] {
  return [change(FFX_FG_SECTION, FFX_FG_KEY, index)];
}

// -- The FFX upscaler version -----------------------------------------------

/**
 * Which version of FSR the FidelityFX backend runs.
 *
 * A different question from which backend runs, and the overlay asks both:
 * "Upscalers" picks fsr31 / xess / dlss, and the "FFX Upscaler" combo under
 * "FFX Settings" picks 4.1.1 / 3.1.5 / 2.3.4 within it. Only the FidelityFX
 * backend has versions to choose between — every other upscaler ignores the
 * index — and, as with the frame generator, the list belongs to the running
 * game rather than to the shipped INI: the FidelityFX SDK reports what it can
 * offer and OptiScaler stores the answer, which is what
 * `LiveStatus.ffx_upscaler_versions` carries.
 *
 * OptiScaler changes it with the same rebuild the upscaler switch uses, so it
 * applies without a restart wherever an upscaler switch would.
 */
export const FFX_UPSCALER_SECTION = "FSR";
export const FFX_UPSCALER_KEY = "UpscalerIndex";
export const FFX_UPSCALER_ID = `${FFX_UPSCALER_SECTION}.${FFX_UPSCALER_KEY}`;

/** The backend ids that run FidelityFX upscaling, and so have a version. */
export const FFX_BACKENDS = ["fsr31", "fsr31_12", "ffx", "ffx_12"];

export function isFfxBackend(code: string | null | undefined): boolean {
  return Boolean(code) && FFX_BACKENDS.includes(String(code).toLowerCase());
}

/**
 * Whether the FSR version is worth offering: the ini selects the FidelityFX
 * backend for some API, or "auto", which OptiScaler resolves to it on most of
 * the hardware this plugin runs on.
 */
export function usesFfxUpscaler(values: ConfigValues): boolean {
  const dx12 = get(values, "Upscalers", "Dx12Upscaler");
  return isFfxBackend(dx12) || isAuto(dx12);
}

/** Whether a FidelityFX version name — "4.1.1 *", "3.1.5" — is an FSR 4 one. */
export function isFsr4Version(name: string | null | undefined): boolean {
  const major = Number.parseInt(String(name ?? "").trim(), 10);
  return Number.isFinite(major) && major >= 4;
}

/**
 * Whether FSR 4 on this device only runs through the forced INT8 model.
 *
 * `experimental` is RDNA 2, which OptiScaler reaches through the
 * `Fsr4GpuSupport` override rather than through its own GPU checks;
 * `unsupported` is everything AMD does not cover at all. Both are the devices the release notes warn about below.
 */
export function needsForcedInt8(gpu: GpuInfo | null | undefined): boolean {
  return gpu?.fsr4 === "experimental" || gpu?.fsr4 === "unsupported";
}

/**
 * Whether the FidelityFX upscaler in the folder is new enough for that override.
 *
 * This is not the same question as the GPU's, and it is the one that changes when
 * somebody swaps in a different build from the FSR 4 panel. The INT8 models
 * need an FSR 4.1.1-or-newer upscaler (menu_common.cpp), so with a 4.0.2 build
 * in place the INT8 preset would do nothing at all and the plain FSR 4 write is
 * the one that works.
 *
 * An unreadable version reads as yes: the file in an OptiScaler install is the
 * released 4.1.1 SDK unless somebody changed it, and the alternative is telling
 * every user of the bundled build to stop using the route that works for them.
 */
export function supportsInt8Override(ffx?: { version?: string | null } | null): boolean {
  const parts = String(ffx?.version ?? "").split(".");
  const major = Number.parseInt(parts[0] ?? "", 10);
  if (!Number.isFinite(major)) return true;
  const minor = Number.parseInt(parts[1] ?? "0", 10);
  return major > 4 || (major === 4 && (Number.isFinite(minor) ? minor : 0) >= 1);
}

/**
 * Pick a FidelityFX upscaler version, and make it reachable.
 *
 * Asking for FSR 4 is not enough on its own. OptiScaler only reaches it when
 * its own GPU checks say the device can run it, or when `Fsr4GpuSupport`
 * overrides that answer — so asking for an FSR 4 version from the FSR 3.X
 * backend would otherwise fall back to FSR 3 with nothing said about it. That
 * is the "(Potential FSR3 fallback)" the overlay prints.
 *
 * On a device the driver covers, the right write is to clear the override
 * ("no override") and leave the model to OptiScaler's detection. Where the INT8
 * route is what reaches FSR 4 — a Steam Deck is RDNA 2 — the override is the
 * option such a device needs, and `int8Route` (the device and the upscaler
 * build together, as `BasicPanel` works it out) turns this write off so the
 * preset that forces INT8 Lite is not undone.
 *
 * The reverse is deliberately not done: choosing an older version does not turn
 * anything off. `Fsr4GpuSupport` is what makes FSR 4 *available*, not a request
 * for it, and clearing it would be undoing a setting nobody asked about.
 */
export function ffxUpscalerChanges(
  index: string, version?: string | null, int8Route = false
): OptionChange[] {
  const changes = [change(FFX_UPSCALER_SECTION, FFX_UPSCALER_KEY, index)];
  if (isFsr4Version(version) && !int8Route) {
    changes.push(change("FSR", "Fsr4GpuSupport", AUTO));
    changes.push(change("FSR", "Fsr4Model", AUTO));
  }
  return changes;
}

/**
 * The running game's two frame rates, when frame generation means there are two.
 *
 * `total` is what reaches the screen and `base` what the game renders. Both are
 * shown whenever frame generation is switched on, because "how much is frame
 * generation buying me" is the question it is turned on to answer and one
 * number can only ever be half of it.
 *
 * `base` is null when the rendered interval has not been read — an in-game
 * plugin older than this one does not report it, and a generator that was
 * created but has never presented leaves its slot at zero. The second tile
 * still appears, showing nothing: the pair is the feature, and a tile that
 * quietly fails to exist is indistinguishable from one that was never built.
 * `LivePanel` prints both intervals, which is where the difference is visible.
 *
 * `generating` is the separate question of whether the generator is actually
 * running. The setting being on does not mean it is: OptiScaler reports FSR-FG
 * as off until the game selects frame generation in its own options, and the
 * two rates then measure the same frames and come out equal. That is worth
 * saying rather than hiding — equal numbers with nothing to explain them read
 * as a broken readout.
 */
export function liveFrameRates(live: LiveStatus | null | undefined) {
  if (!live?.fg_enabled) return null;
  const number = (value: number | null | undefined) =>
    typeof value === "number" && value > 0 ? value : null;
  // The counter alone does not say which of the two rates it counted, so the
  // total comes from the derived pair when there is one and only falls back to
  // the raw count when there is not — where nothing has been generated and the
  // two are the same number anyway.
  const total = number(live.total_fps) ?? number(live.fps);
  const base = number(live.base_fps);
  if (total === null) return null;
  return { total, base, generating: base !== null && base < total * 0.95 };
}

/** The backend the running game ended up with, in the order it reports them. */
export function runningBackend(live: LiveStatus | null | undefined): string | null {
  return live?.upscaler?.dx12 ?? live?.upscaler?.vulkan ?? live?.upscaler?.dx11 ?? null;
}

/**
 * What to call the upscaler the running game ended up with.
 *
 * The backend id alone cannot be specific — "fsr31" is FSR 2.3.4 through 4.1.1
 * and OptiScaler names it "FSR 3.X/4" for exactly that reason. The version the
 * game actually built is in its own reported list, at the index Config holds,
 * and OptiScaler's overlay prints it the same way: "FSR " and the SDK's own
 * name. Falls back to the backend's name when there is no list to read, which
 * is every non-FidelityFX upscaler and any game that has not queried the SDK.
 */
export function liveUpscalerLabel(live: LiveStatus | null | undefined): string | null {
  const backend = runningBackend(live);
  if (!backend) return null;
  const versions = live?.ffx_upscaler_versions ?? [];
  const index = live?.ffx_upscaler_index;
  if (isFfxBackend(backend) && typeof index === "number" && versions[index]) {
    return `FSR ${versions[index]}`;
  }
  return UPSCALER_LABELS[backend] ?? backend;
}

/** The multiplier control only does anything on the XeSS FG output. */
export const MULTIPLIER_SECTION = "XeFG";
export const MULTIPLIER_KEY = "InterpolationCount";

export function frameGenEnabled(values: ConfigValues): boolean {
  return get(values, "FrameGen", "Enabled") === "true";
}

export function activeFgPreset(values: ConfigValues): Preset | undefined {
  return FG_PRESETS.find((preset) => preset.matches(values));
}

export function activeUpscalerPreset(values: ConfigValues): Preset | undefined {
  return UPSCALER_PRESETS.find((preset) => preset.matches(values));
}

export function supportsMultiplier(values: ConfigValues): boolean {
  return get(values, "FrameGen", "FGOutput") === "xefg";
}

/**
 * Turning frame generation on has to pick an input and an output too, or
 * OptiScaler comes up with FG "enabled" but doing nothing.
 */
export function enableFrameGenChanges(values: ConfigValues): OptionChange[] {
  const changes = [change("FrameGen", "Enabled", "true")];
  if (!activeFgPreset(values)) {
    changes.push(...FG_PRESETS[0].changes);
  }
  return changes;
}

export function disableFrameGenChanges(): OptionChange[] {
  return [change("FrameGen", "Enabled", "false")];
}

/**
 * Turn frame generation on with a named input and output pair.
 *
 * Automatic mode uses this instead of the preset list: the wiki names the pair
 * the game can actually feed, which is a stronger statement than any default
 * this plugin could pick, and it can be a combination no preset covers.
 */
export function enableFrameGenWith(input: string, output: string): OptionChange[] {
  return [
    change("FrameGen", "Enabled", "true"),
    change("FrameGen", "FGInput", input),
    change("FrameGen", "FGOutput", output),
  ];
}
