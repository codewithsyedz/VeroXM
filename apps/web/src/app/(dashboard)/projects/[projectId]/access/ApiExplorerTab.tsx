"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Play } from "lucide-react";
import { executeExplorerRequest, type DocCollection, type ExplorerResponseResult } from "./actions";

type Operation = "list" | "search" | "getById" | "create" | "update" | "delete";

const OPERATIONS: Array<{ id: Operation; label: string; method: string; ability: string }> = [
  { id: "list", label: "List content", method: "GET", ability: "read" },
  { id: "search", label: "Search content", method: "POST", ability: "read" },
  { id: "getById", label: "Get by ID", method: "GET", ability: "read" },
  { id: "create", label: "Create content", method: "POST", ability: "create" },
  { id: "update", label: "Update content", method: "PATCH", ability: "update" },
  { id: "delete", label: "Delete content", method: "DELETE", ability: "delete" },
];

function exampleValue(type: string, options?: Record<string, unknown> | null): unknown {
  const enumeration = (options as { enumeration?: string[] } | null | undefined)?.enumeration;
  switch (type) {
    case "number":
      return 1;
    case "boolean":
      return true;
    case "date":
      return new Date().toISOString().slice(0, 10);
    case "time":
      return "12:00";
    case "json":
      return {};
    case "enumeration":
    case "multi_enumeration":
      return enumeration?.[0] ?? "option";
    case "media":
      return 1;
    case "relation":
      return 1;
    case "email":
      return "person@example.com";
    default:
      return "Example value";
  }
}

function buildExampleBody(collection: DocCollection | undefined): string {
  if (!collection) return "{}";
  const body: Record<string, unknown> = {};
  for (const field of collection.fields) {
    if ((field.options as { hiddenInAPI?: boolean } | null | undefined)?.hiddenInAPI) continue;
    body[field.name] = exampleValue(field.type, field.options);
  }
  return JSON.stringify(body, null, 2);
}

function buildUrl(base: string, slug: string, operation: Operation, recordId: string, query: string) {
  const root = `${base}/collections/${slug || ":slug"}/content`;
  switch (operation) {
    case "list":
      return query ? `${root}?${query}` : root;
    case "search":
      return `${root}/search`;
    case "getById":
    case "update":
    case "delete":
      return `${root}/${recordId || ":id"}`;
    case "create":
      return root;
  }
}

function generateSnippets(opts: {
  method: string;
  url: string;
  token: string;
  body?: string;
}): Record<string, string> {
  const { method, url, token, body } = opts;
  const hasBody = Boolean(body && (method === "POST" || method === "PATCH"));

  const curl = [
    `curl -X ${method} '${url}' \\`,
    `  -H 'Authorization: Bearer ${token || "YOUR_API_KEY"}' \\`,
    `  -H 'Content-Type: application/json'${hasBody ? " \\" : ""}`,
    ...(hasBody ? [`  -d '${body}'`] : []),
  ].join("\n");

  const javascript = `const res = await fetch('${url}', {
  method: '${method}',
  headers: {
    Authorization: 'Bearer ${token || "YOUR_API_KEY"}',
    'Content-Type': 'application/json',
  },${hasBody ? `\n  body: JSON.stringify(${body}),` : ""}
});
const data = await res.json();
console.log(data);`;

  const python = `import requests

response = requests.request(
    "${method}",
    "${url}",
    headers={
        "Authorization": "Bearer ${token || "YOUR_API_KEY"}",
        "Content-Type": "application/json",
    },${hasBody ? `\n    json=${body},` : ""}
)
print(response.json())`;

  const php = `<?php
$ch = curl_init('${url}');
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${method}');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ${token || "YOUR_API_KEY"}',
    'Content-Type: application/json',
]);${hasBody ? `\ncurl_setopt($ch, CURLOPT_POSTFIELDS, '${body}');` : ""}
$response = curl_exec($ch);
curl_close($ch);
echo $response;`;

  const go = `req, _ := http.NewRequest("${method}", "${url}", ${hasBody ? "bytes.NewBufferString(`" + (body ?? "") + "`)" : "nil"})
req.Header.Set("Authorization", "Bearer ${token || "YOUR_API_KEY"}")
req.Header.Set("Content-Type", "application/json")
resp, err := http.DefaultClient.Do(req)`;

  return { curl, javascript, python, php, go };
}

export default function ApiExplorerTab({ endpointBase, collections }: { endpointBase: string; collections: DocCollection[] }) {
  const [collectionSlug, setCollectionSlug] = useState(collections[0]?.slug ?? "");
  const [operation, setOperation] = useState<Operation>("list");
  const [recordId, setRecordId] = useState("1");
  const [query, setQuery] = useState("limit=25");
  const [token, setToken] = useState("");
  const [body, setBody] = useState("{}");
  const [language, setLanguage] = useState<"curl" | "javascript" | "python" | "php" | "go">("curl");
  const [result, setResult] = useState<ExplorerResponseResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedCollection = collections.find((c) => c.slug === collectionSlug);
  const op = OPERATIONS.find((o) => o.id === operation) ?? OPERATIONS[0];
  const usesBody = operation === "create" || operation === "update" || operation === "search";

  const url = useMemo(
    () => buildUrl(endpointBase, collectionSlug, operation, recordId, query),
    [endpointBase, collectionSlug, operation, recordId, query],
  );

  const effectiveBody = usesBody
    ? operation === "search"
      ? body
      : body === "{}"
        ? buildExampleBody(selectedCollection)
        : body
    : undefined;

  const snippets = useMemo(
    () => generateSnippets({ method: op.method, url, token, body: effectiveBody }),
    [op.method, url, token, effectiveBody],
  );

  function useExampleBody() {
    setBody(buildExampleBody(selectedCollection));
  }

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await executeExplorerRequest({
        method: op.method as "GET" | "POST" | "PATCH" | "DELETE",
        url,
        token,
        body: usesBody ? effectiveBody : undefined,
      });
      setResult(res);
    });
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippets[language]);
    } catch {
      // Clipboard blocked — the snippet stays visible to select manually.
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="surface-standard rounded-2xl p-6">
        <h3 className="text-sm font-medium text-[#f2f3fb]">Build a request</h3>
        <p className="mt-1 text-xs text-[#7680a3]">
          Calls the real public v2 API for this project. Nothing here is simulated — a
          successful create or delete really writes to this project&apos;s content.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs text-[#7680a3]">
            Collection
            <select
              value={collectionSlug}
              onChange={(e) => setCollectionSlug(e.target.value)}
              className="input-quiet h-10 px-3 text-sm"
            >
              {collections.length === 0 && <option value="">No collections yet</option>}
              {collections.map((c) => (
                <option key={c.id} value={c.slug} className="bg-[#0b0c22]">
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-[#7680a3]">
            Operation
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as Operation)}
              className="input-quiet h-10 px-3 text-sm"
            >
              {OPERATIONS.map((o) => (
                <option key={o.id} value={o.id} className="bg-[#0b0c22]">
                  {o.label} — {o.method}
                </option>
              ))}
            </select>
          </label>

          {(operation === "getById" || operation === "update" || operation === "delete") && (
            <label className="flex flex-col gap-1.5 text-xs text-[#7680a3]">
              Record ID
              <input
                value={recordId}
                onChange={(e) => setRecordId(e.target.value)}
                className="input-quiet h-10 px-3 text-sm"
              />
            </label>
          )}

          {operation === "list" && (
            <label className="flex flex-col gap-1.5 text-xs text-[#7680a3]">
              Query string
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="sort=-id&limit=25"
                className="input-quiet h-10 px-3 text-sm font-mono-code"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-xs text-[#7680a3] sm:col-span-2">
            API key
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste a key from the API Keys tab — it's only ever shown once at issuance"
              className="input-quiet h-10 px-3 text-sm font-mono-code"
            />
          </label>

          <div className="sm:col-span-2">
            <p className="font-mono-code text-[11px] text-[#7680a3]">
              <span className="text-[#4da3ff]">{op.method}</span> {url}
            </p>
          </div>

          {usesBody && (
            <label className="flex flex-col gap-1.5 text-xs text-[#7680a3] sm:col-span-2">
              <span className="flex items-center justify-between">
                Request body (JSON)
                {operation !== "search" && (
                  <button
                    type="button"
                    onClick={useExampleBody}
                    className="text-[11px] font-medium text-[#4da3ff] hover:text-white"
                  >
                    Fill from schema
                  </button>
                )}
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                className="input-quiet px-3 py-2 font-mono-code text-sm"
              />
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={run}
          disabled={isPending || !collectionSlug}
          className="button-primary mt-4 px-4"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Send request
        </button>
      </div>

      {result && (
        <div className="surface-standard rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <span
              className={`font-mono-code text-sm font-medium ${
                result.status >= 200 && result.status < 300
                  ? "text-[#5fce8f]"
                  : result.status === 0
                    ? "text-[#7680a3]"
                    : "text-[#ea6d76]"
              }`}
            >
              {result.status || "—"} {result.statusText}
            </span>
            <span className="text-xs text-[#7680a3]">{result.durationMs} ms</span>
          </div>
          <pre className="surface-inset mt-3 max-h-96 overflow-auto rounded-lg p-4 font-mono-code text-[11px] leading-5 text-[#b8bfd8]">
            {result.body}
          </pre>
        </div>
      )}

      <div className="surface-standard rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-[#f2f3fb]">Code for this request</h3>
          <button type="button" onClick={copySnippet} className="button-secondary px-3 py-1.5 text-xs">
            Copy
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["curl", "javascript", "python", "php", "go"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                language === lang
                  ? "bg-white/[0.08] text-[#f2f3fb]"
                  : "text-[#7680a3] hover:bg-white/[0.03] hover:text-[#b8bfd8]"
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
        <pre className="surface-inset mt-3 overflow-x-auto rounded-lg p-4 font-mono-code text-[11px] leading-5 text-[#b8bfd8]">
          {snippets[language]}
        </pre>
      </div>
    </div>
  );
}
