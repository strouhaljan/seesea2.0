/**
 * Records an event from upstream into server/fixtures/<slug>/ for offline replay.
 *
 *   npm --prefix server run record -- <slug> [--legs <id,id>]
 *
 * Defaults to all active legs. Re-running skips history hours already on disk
 * and merges leg ids into the existing manifest.
 */
import { HttpUpstream, getWindHistory } from "../upstream/http.js";
import { REGIONS, WIND_MODELS } from "../upstream/regions.js";
import {
  existsSync,
  fixturePaths,
  readJson,
  writeGzJson,
  writeJson,
  type Manifest,
} from "../upstream/fixtures.js";
import type { WindPoint } from "../upstream/types.js";
import { floorHour, sleep } from "../time.js";

const BATCH_SIZE = 4;
const WIND_LOOKAHEAD_S = 4 * 3600;

const toSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const utcDate = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

function parseArgs(argv: string[]) {
  const slug = argv[0];
  const legsIdx = argv.indexOf("--legs");
  const legIds = legsIdx >= 0 ? (argv[legsIdx + 1] ?? "").split(",").map(Number) : undefined;
  if (!slug || slug.startsWith("--") || legIds?.some((id) => !Number.isInteger(id))) {
    console.error("Usage: npm --prefix server run record -- <slug> [--legs <id,id>]");
    process.exit(1);
  }
  return { slug, legIds };
}

async function main() {
  const { slug, legIds } = parseArgs(process.argv.slice(2));
  const http = new HttpUpstream();
  const paths = fixturePaths(slug);
  const missing: string[] = [];

  console.log(`Recording ${slug} into ${paths.dir}`);
  const event = await http.getEvent(slug);
  const eventId = String(event.cc_event_id);
  const allLegs = event.cc_event_leg ?? [];
  const legs = legIds
    ? allLegs.filter((l) => legIds.includes(l.id))
    : allLegs.filter((l) => l.active === 1);
  if (legs.length === 0) {
    console.error(`No matching legs. Available: ${allLegs.map((l) => `${l.id} (${l.name})`).join(", ")}`);
    process.exit(1);
  }

  const previous = existsSync(paths.manifest) ? readJson<Manifest>(paths.manifest) : null;
  const recordedLegIds = [...new Set([...(previous?.legIds ?? []), ...legs.map((l) => l.id)])].sort((a, b) => a - b);
  const recordedLegs = allLegs.filter((l) => recordedLegIds.includes(l.id));

  writeJson(paths.event, event);
  for (const leg of legs) {
    writeJson(paths.leg(leg.id), await http.getLeg(eventId, String(leg.id)));
  }

  // History: every hour touched by a requested leg
  const hours = new Set<number>();
  for (const leg of legs) {
    for (let h = floorHour(toSeconds(leg.start)); h <= floorHour(toSeconds(leg.end)); h += 3600) {
      hours.add(h);
    }
  }
  const todo = [...hours].sort((a, b) => a - b).filter((h) => !existsSync(paths.dataHour(h)));
  console.log(`History: ${hours.size} hours, ${todo.length} to fetch`);

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (h) => {
        try {
          writeGzJson(paths.dataHour(h), await http.getDataHour(eventId, h));
        } catch (err) {
          console.error(`  hour ${h} failed:`, err);
          missing.push(`data2 ${h}`);
        }
      }),
    );
    console.log(`  ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
  }

  // Wind: whole UTC days spanning all recorded legs plus the 4 h forecast window
  const startDate = utcDate(Math.min(...recordedLegs.map((l) => toSeconds(l.start))));
  const endDate = utcDate(Math.max(...recordedLegs.map((l) => toSeconds(l.end))) + WIND_LOOKAHEAD_S);
  // Same legs as last time → same date range, so existing wind files are still valid
  const sameLegs = previous?.legIds.join() === recordedLegIds.join();
  for (const model of WIND_MODELS) {
    if (sameLegs && existsSync(paths.wind(model))) {
      console.log(`Wind ${model}: already recorded`);
      continue;
    }
    try {
      const byRegion: Record<string, WindPoint[]> = {};
      for (const region of REGIONS) {
        byRegion[region.name] = await getWindHistory(model, region, startDate, endDate);
        await sleep(300);
      }
      writeGzJson(paths.wind(model), byRegion);
      console.log(`Wind ${model}: ${startDate}..${endDate}`);
    } catch (err) {
      console.error(`Wind ${model} failed:`, err);
      missing.push(`wind ${model}`);
    }
  }

  const manifest: Manifest = {
    slug,
    eventId: event.cc_event_id,
    legIds: recordedLegIds,
    recordedAt: new Date().toISOString(),
  };
  writeJson(paths.manifest, manifest);

  if (missing.length > 0) {
    console.error(`Incomplete, missing: ${missing.join(", ")}. Re-run to retry.`);
    process.exit(1);
  }
  console.log(`Done: ${slug}, legs ${recordedLegIds.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
