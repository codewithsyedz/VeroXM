import type { DocCollection } from "./actions";
import { exampleBody as exampleBodyObject } from "@/lib/example-value";

// Real per-collection reference docs, generated from this project's actual
// content models — same "derived from what's really there" approach as
// GeneratedContract on the content-model screen (see docs/PHASE-6-NOTES.md)
// rather than the reference design's Supabase-specific `@supabase/supabase-js`
// snippets, which don't apply to this stack: there is no first-party SDK
// here, only the plain REST v2 API, so the "SDK" this page documents is
// that API itself, called with a plain HTTP client. See docs/PHASE-7-NOTES.md.
//
// The actual example-value logic now lives in lib/example-value.ts, shared
// with the Postman collection export (AccessTokens.tsx) so the two never
// drift apart from each other.

function exampleBody(collection: DocCollection): string {
  return JSON.stringify(exampleBodyObject(collection), null, 2);
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="surface-inset overflow-x-auto rounded-lg p-4 font-mono-code text-[11px] leading-5 text-[#b8bfd8]">
      {children}
    </pre>
  );
}

function CollectionDocs({ endpointBase, collection }: { endpointBase: string; collection: DocCollection }) {
  const root = `${endpointBase}/collections/${collection.slug}/content`;

  return (
    <details className="surface-standard rounded-2xl p-6" open={false}>
      <summary className="cursor-pointer text-sm font-medium text-[#f2f3fb]">
        {collection.name}{" "}
        <span className="font-mono-code text-xs text-[#7680a3]">/{collection.slug}</span>
      </summary>

      <div className="mt-4 flex flex-col gap-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#7680a3]">Fields</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[#7680a3]">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 font-medium">Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {collection.fields.map((f) => (
                  <tr key={f.id}>
                    <td className="py-2 pr-4 font-mono-code text-[11px] text-[#f2f3fb]">{f.name}</td>
                    <td className="py-2 pr-4 text-[#b8bfd8]">{f.type}</td>
                    <td className="py-2 text-[#7680a3]">
                      {(f.validations as { required?: { status?: boolean } } | null | undefined)?.required
                        ?.status
                        ? "Yes"
                        : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#7680a3]">List entries</p>
          <CodeBlock>{`curl '${root}?limit=25' \\\n  -H 'Authorization: Bearer YOUR_API_KEY'`}</CodeBlock>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#7680a3]">Create an entry</p>
          <CodeBlock>{`curl -X POST '${root}' \\\n  -H 'Authorization: Bearer YOUR_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '${exampleBody(collection)}'`}</CodeBlock>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#7680a3]">
            Update an entry
          </p>
          <CodeBlock>{`curl -X PATCH '${root}/1' \\\n  -H 'Authorization: Bearer YOUR_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '${exampleBody(collection)}'`}</CodeBlock>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#7680a3]">
            Delete an entry
          </p>
          <CodeBlock>{`curl -X DELETE '${root}/1' \\\n  -H 'Authorization: Bearer YOUR_API_KEY'`}</CodeBlock>
        </div>
      </div>
    </details>
  );
}

export default function SdkDocsTab({
  endpointBase,
  collections,
}: {
  endpointBase: string;
  collections: DocCollection[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="surface-standard rounded-2xl p-6">
        <h3 className="text-sm font-medium text-[#f2f3fb]">Authentication</h3>
        <p className="mt-2 text-sm leading-6 text-[#b8bfd8]">
          Every request needs an API key from the API Keys tab, sent as a standard bearer
          token — not the <code className="font-mono-code text-xs">x-api-key</code> header
          some API docs use elsewhere. There&apos;s no official client SDK for this API yet, so
          every example below is a plain HTTP call any language&apos;s standard HTTP client can
          make.
        </p>
        <CodeBlock>{`Authorization: Bearer YOUR_API_KEY`}</CodeBlock>
        <p className="mt-4 text-xs text-[#7680a3]">Base URL for this project</p>
        <CodeBlock>{endpointBase}</CodeBlock>

        <p className="mt-6 text-sm leading-6 text-[#b8bfd8]">
          Prefer a login flow over a static key? Create a username/password credential on the{" "}
          <span className="font-medium text-[#f2f3fb]">Authentication</span> tab, then exchange it
          for a short-lived access token (plus a refresh token) instead:
        </p>
        <CodeBlock>{`curl -X POST '${endpointBase}/auth/token' \
  -H 'Content-Type: application/json' \
  -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}'

# -> { "accessToken": "...", "refreshToken": "...", "expiresIn": 3600 }

curl -X POST '${endpointBase}/auth/refresh' \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'`}</CodeBlock>
        <p className="mt-2 text-xs text-[#7680a3]">
          The returned <code className="font-mono-code text-xs">accessToken</code> is used exactly
          like an API key above (1-hour lifetime); the{" "}
          <code className="font-mono-code text-xs">refreshToken</code> (30 days) gets you a new
          access token without logging in again.
        </p>
      </div>

      {collections.length === 0 ? (
        <p className="text-sm text-[#7680a3]">
          This project has no content models yet — endpoint docs will appear here once you
          create one.
        </p>
      ) : (
        collections.map((c) => (
          <CollectionDocs key={c.id} endpointBase={endpointBase} collection={c} />
        ))
      )}
    </div>
  );
}
