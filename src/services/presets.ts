import { getLocal, setLocal } from "../chrome/storage";
import type { PopupSettings } from "../types";

const DOMAIN_PRESETS_KEY = "domainPresets";
const INVALID_HOSTS = new Set(["", "-", "null", "undefined"]);

type DomainPresets = Record<string, Partial<PopupSettings>>;

export function normalizePresetHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const normalized = host.trim().toLowerCase();
  if (INVALID_HOSTS.has(normalized)) return null;
  return normalized;
}

/**
 * Load settings for the given host.
 * Returns domain-specific settings merged on top of global settings when
 * a domain preset exists, otherwise returns global settings alone.
 * Returns null when no settings are persisted at all.
 */
export async function loadPresetForHost(
  host: string | null,
): Promise<{ settings: Partial<PopupSettings>; source: "domain" | "global" } | null> {
  const normalizedHost = normalizePresetHost(host);
  if (!normalizedHost) {
    return null;
  }

  const stored = await getLocal([DOMAIN_PRESETS_KEY]);
  const presets = (stored[DOMAIN_PRESETS_KEY] ?? {}) as DomainPresets;

  const domainSettings = presets[normalizedHost] ?? null;

  if (domainSettings) {
    return { settings: domainSettings, source: "domain" };
  }

  return null;
}

/**
 * Persist current settings as a domain preset for the given host.
 * When host is null/empty, acts as a no-op for the domain bucket but
 * still resolves successfully.
 */
export async function savePresetForHost(
  host: string | null,
  settings: PopupSettings,
): Promise<"domain" | "none"> {
  const normalizedHost = normalizePresetHost(host);
  if (!normalizedHost) {
    return "none";
  }

  const stored = await getLocal([DOMAIN_PRESETS_KEY]);
  const presets = (stored[DOMAIN_PRESETS_KEY] ?? {}) as DomainPresets;
  presets[normalizedHost] = { ...settings };
  await setLocal({ [DOMAIN_PRESETS_KEY]: presets });
  return "domain";
}

/**
 * Remove the domain preset for the given host.
 */
export async function deletePresetForHost(host: string | null): Promise<void> {
  const normalizedHost = normalizePresetHost(host);
  if (!normalizedHost) return;

  const stored = await getLocal([DOMAIN_PRESETS_KEY]);
  const presets = (stored[DOMAIN_PRESETS_KEY] ?? {}) as DomainPresets;
  delete presets[normalizedHost];
  await setLocal({ [DOMAIN_PRESETS_KEY]: presets });
}
