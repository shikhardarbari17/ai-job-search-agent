import type { Config } from "@netlify/functions";
import { getDb } from "./_lib/db.js";
import { guardPasscode } from "./_lib/guard.js";

interface PostingRecord {
  sourceJobId: string;
  title: string;
  employer?: string;
  location?: string;
  country?: string | null;
  url?: string;
  descriptionText?: string;
  descriptionIsFull?: boolean;
  postedAt?: string | null;
  closesAt?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryPeriod?: string | null;
  employerIndustry?: string | null;
  raw?: unknown;
}

interface ImportBody {
  sourceKey: string;
  records: PostingRecord[];
}

const VALID_SOURCES = ["research_import", "workday_import"] as const;
type ValidSource = (typeof VALID_SOURCES)[number];

function json400(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const deny = guardPasscode(req);
  if (deny) return deny;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return json400("Invalid JSON body");
  }

  const { sourceKey, records } = body;

  if (!VALID_SOURCES.includes(sourceKey as ValidSource)) {
    return json400(`sourceKey must be one of: ${VALID_SOURCES.join(", ")}`);
  }
  if (!Array.isArray(records) || records.length === 0 || records.length > 200) {
    return json400("records must be an array of 1–200 items");
  }

  const db = getDb();

  try {
    await db.sql`
      INSERT INTO postings (
        source_key, source_job_id, fingerprint,
        title, employer, location, country, url,
        description_text, description_is_full,
        posted_at, closes_at,
        salary_min, salary_max, salary_period,
        employer_industry, raw_json
      )
      SELECT
        ${sourceKey},
        COALESCE(NULLIF(elem->>'sourceJobId', ''), elem->>'url'),
        lower(COALESCE(elem->>'employer', '')) || '|' ||
          lower(COALESCE(elem->>'title', '')) || '|' ||
          lower(trim(split_part(COALESCE(elem->>'location', ''), ',', 1))),
        COALESCE(elem->>'title', ''),
        COALESCE(elem->>'employer', ''),
        COALESCE(elem->>'location', ''),
        NULLIF(elem->>'country', ''),
        COALESCE(elem->>'url', ''),
        COALESCE(elem->>'descriptionText', ''),
        COALESCE((elem->>'descriptionIsFull')::boolean, false),
        CASE WHEN elem->>'postedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
             THEN LEFT(elem->>'postedAt', 10)::date END,
        CASE WHEN elem->>'closesAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
             THEN LEFT(elem->>'closesAt', 10)::date END,
        CASE WHEN elem->>'salaryMin' ~ '^[0-9]+([.][0-9]+)?$'
             THEN (elem->>'salaryMin')::numeric END,
        CASE WHEN elem->>'salaryMax' ~ '^[0-9]+([.][0-9]+)?$'
             THEN (elem->>'salaryMax')::numeric END,
        NULLIF(elem->>'salaryPeriod', ''),
        NULLIF(elem->>'employerIndustry', ''),
        elem
      FROM jsonb_array_elements(CAST(${JSON.stringify(records)} AS jsonb)) AS elem
      ON CONFLICT (source_key, source_job_id) DO UPDATE
        SET
          fingerprint         = EXCLUDED.fingerprint,
          title               = COALESCE(NULLIF(EXCLUDED.title, ''),             postings.title),
          employer            = COALESCE(NULLIF(EXCLUDED.employer, ''),          postings.employer),
          location            = COALESCE(NULLIF(EXCLUDED.location, ''),          postings.location),
          country             = COALESCE(EXCLUDED.country,                       postings.country),
          url                 = COALESCE(NULLIF(EXCLUDED.url, ''),               postings.url),
          description_text    = COALESCE(NULLIF(EXCLUDED.description_text, ''), postings.description_text),
          description_is_full = postings.description_is_full OR EXCLUDED.description_is_full,
          posted_at           = COALESCE(EXCLUDED.posted_at,                     postings.posted_at),
          closes_at           = COALESCE(EXCLUDED.closes_at,                     postings.closes_at),
          salary_min          = COALESCE(EXCLUDED.salary_min,                    postings.salary_min),
          salary_max          = COALESCE(EXCLUDED.salary_max,                    postings.salary_max),
          salary_period       = COALESCE(EXCLUDED.salary_period,                 postings.salary_period),
          employer_industry   = COALESCE(EXCLUDED.employer_industry,             postings.employer_industry),
          raw_json            = EXCLUDED.raw_json,
          last_seen_at        = now()
    `;

    return Response.json({ upserted: records.length });
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined;
    const message = (cause instanceof Error ? cause.message : err instanceof Error ? err.message : String(err)).slice(0, 300);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const config: Config = { path: "/api/import" };
