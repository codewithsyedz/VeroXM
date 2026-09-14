import { exampleBody, type ExampleCollection } from "./example-value";

// Builds a real Postman Collection Format v2.1 document
// (https://schema.getpostman.com/json/collection/v2.1.0/collection.json)
// from a project's actual content models and its actual public API
// routes -- both API generations this app really exposes, not a
// hypothetical one:
//
//   v2 (current, recommended): public/v2/projects/:uuid/collections/:slug/content
//     -- see V2ContentController. Has a real HTTP PATCH for updates.
//   v1 (legacy compatibility shim): public/v1/:uuid/:slug
//     -- see V1ContentController. No PATCH route exists here at all --
//     "update" is `POST :slug/update/:id`, a real POST on the wire, so it
//     is filed under the POST folder below, not PATCH. Getting this wrong
//     would make the exported collection lie about what v1 actually accepts.
//
// Every request inherits the collection-level Bearer auth via the
// `{{apiKey}}` variable, matching how this API is actually authenticated
// (see SdkDocsTab.tsx's own note: a plain bearer token, not an x-api-key
// header). IDs in example URLs ("/1") are placeholders for a real entry id.

export interface PostmanSourceCollection extends ExampleCollection {
  id: number;
  name: string;
}

interface BuildPostmanCollectionOptions {
  projectName: string;
  uuid: string;
  /** e.g. `https://host/public/v1/{uuid}` */
  endpointV1Base: string;
  /** e.g. `https://host/public/v2/projects/{uuid}` */
  endpointV2Base: string;
  collections: PostmanSourceCollection[];
}

// Minimal typed slice of the Postman v2.1 schema this file actually emits
// -- not the full spec, just the shape used below.
interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: Array<{ key: string; value: string }>;
}

// A Postman "Tests" script (runs after the response arrives) -- used only
// by the Auth folder's Login/Refresh requests below, to auto-populate the
// collection's own apiKey/refreshToken variables so every other request
// (already wired to Bearer {{apiKey}}) starts working immediately, no
// manual copy/paste. See buildPostmanCollection's Auth folder.
interface PostmanEvent {
  listen: "test" | "prerequest";
  script: { type: "text/javascript"; exec: string[] };
}

interface PostmanRequestItem {
  name: string;
  event?: PostmanEvent[];
  request: {
    method: string;
    header: Array<{ key: string; value: string }>;
    url: PostmanUrl;
    body?: {
      mode: "raw";
      raw: string;
      options: { raw: { language: "json" } };
    };
  };
}

interface PostmanFolder {
  name: string;
  description: string;
  item: PostmanRequestItem[];
}

// `raw` alone is technically enough per the Postman v2.1 schema, but the
// real Postman app's address bar reliably renders a request's URL only
// when it also gets the decomposed protocol/host/path/query fields --
// leaving them out is exactly what produced the reported bug (body and
// headers imported fine, the URL bar showed empty). Every URL this file
// builds is an absolute one (built from NEXTAUTH_URL), so `new URL(...)`
// always succeeds here; the try/catch is only a safety net, not the
// expected path.
function buildUrl(url: string): PostmanUrl {
  try {
    const parsed = new URL(url);
    const query = Array.from(parsed.searchParams.entries()).map(([key, value]) => ({ key, value }));
    return {
      raw: url,
      protocol: parsed.protocol.replace(/:$/, ""),
      host: parsed.hostname.split("."),
      ...(parsed.port ? { port: parsed.port } : {}),
      path: parsed.pathname.split("/").filter(Boolean),
      ...(query.length ? { query } : {}),
    };
  } catch {
    return { raw: url };
  }
}

function jsonBody(value: unknown): NonNullable<PostmanRequestItem["request"]["body"]> {
  return {
    mode: "raw",
    raw: JSON.stringify(value, null, 2),
    options: { raw: { language: "json" } },
  };
}

const JSON_HEADER = [{ key: "Content-Type", value: "application/json" }];

// Both Login and Refresh return the same {accessToken, refreshToken, ...}
// shape (see ApiAuthUsersService.issueSession) -- one shared test script
// keeps the two requests below from drifting on how they parse it.
const AUTH_CAPTURE_SCRIPT = [
  "const data = pm.response.json();",
  "if (data.accessToken) { pm.collectionVariables.set('apiKey', data.accessToken); }",
  "if (data.refreshToken) { pm.collectionVariables.set('refreshToken', data.refreshToken); }",
];

export function buildPostmanCollection({
  projectName,
  uuid,
  endpointV1Base,
  endpointV2Base,
  collections,
}: BuildPostmanCollectionOptions) {
  const get: PostmanRequestItem[] = [];
  const post: PostmanRequestItem[] = [];
  const patch: PostmanRequestItem[] = [];
  const del: PostmanRequestItem[] = [];

  // Auth -- username/password login + refresh (ProjectApiAuthController).
  // Completes the full journey this collection is meant to demonstrate:
  // run "Login" once and its Tests script writes the access token straight
  // into the apiKey variable every other request already authenticates
  // with, so nothing needs to be pasted in by hand. Set the
  // apiUsername/apiPassword collection variables first (Collection >
  // Variables), or edit the Login request's body directly.
  const authFolder: PostmanFolder = {
    name: "Auth",
    description:
      "Username/password login, as an alternative to pasting a static API key into the " +
      "apiKey variable yourself. Both requests below write their response's accessToken / " +
      "refreshToken straight into this collection's own variables (via a Postman \"Tests\" " +
      "script), so every other request here keeps working with no manual copy/paste.",
    item: [
      {
        name: `Login (username/password)`,
        request: {
          method: "POST",
          header: JSON_HEADER,
          url: buildUrl(`${endpointV2Base}/auth/token`),
          body: jsonBody({ username: "{{apiUsername}}", password: "{{apiPassword}}" }),
        },
        event: [{ listen: "test", script: { type: "text/javascript", exec: AUTH_CAPTURE_SCRIPT } }],
      },
      {
        name: `Refresh token`,
        request: {
          method: "POST",
          header: JSON_HEADER,
          url: buildUrl(`${endpointV2Base}/auth/refresh`),
          body: jsonBody({ refreshToken: "{{refreshToken}}" }),
        },
        event: [{ listen: "test", script: { type: "text/javascript", exec: AUTH_CAPTURE_SCRIPT } }],
      },
    ],
  };

  for (const collection of collections) {
    const label = `${collection.name} (${collection.slug})`;
    const body = exampleBody(collection);

    // v2 -- the current, recommended API.
    const v2Root = `${endpointV2Base}/collections/${collection.slug}/content`;
    get.push({
      name: `v2 · ${label} · List entries`,
      request: { method: "GET", header: [], url: buildUrl(`${v2Root}?limit=25`) },
    });
    get.push({
      name: `v2 · ${label} · Get entry by ID`,
      request: { method: "GET", header: [], url: buildUrl(`${v2Root}/1`) },
    });
    post.push({
      name: `v2 · ${label} · Create entry`,
      request: { method: "POST", header: JSON_HEADER, url: buildUrl(v2Root), body: jsonBody(body) },
    });
    post.push({
      name: `v2 · ${label} · Search entries`,
      request: {
        method: "POST",
        header: JSON_HEADER,
        url: buildUrl(`${v2Root}/search`),
        body: jsonBody({ where: {}, sort: "-createdAt", limit: 25 }),
      },
    });
    patch.push({
      name: `v2 · ${label} · Update entry`,
      request: {
        method: "PATCH",
        header: JSON_HEADER,
        url: buildUrl(`${v2Root}/1`),
        body: jsonBody(body),
      },
    });
    del.push({
      name: `v2 · ${label} · Delete entry`,
      request: { method: "DELETE", header: [], url: buildUrl(`${v2Root}/1`) },
    });

    // v1 -- the legacy compatibility shim.
    const v1Root = `${endpointV1Base}/${collection.slug}`;
    get.push({
      name: `v1 · ${label} · List entries`,
      request: { method: "GET", header: [], url: buildUrl(v1Root) },
    });
    get.push({
      name: `v1 · ${label} · Get entry by ID`,
      request: { method: "GET", header: [], url: buildUrl(`${v1Root}/1`) },
    });
    post.push({
      name: `v1 · ${label} · Create entry`,
      request: { method: "POST", header: JSON_HEADER, url: buildUrl(v1Root), body: jsonBody(body) },
    });
    post.push({
      name: `v1 · ${label} · Update entry (POST, no PATCH route in v1)`,
      request: {
        method: "POST",
        header: JSON_HEADER,
        url: buildUrl(`${v1Root}/update/1`),
        body: jsonBody(body),
      },
    });
    del.push({
      name: `v1 · ${label} · Delete entry`,
      request: { method: "DELETE", header: [], url: buildUrl(`${v1Root}/1`) },
    });
  }

  const folders: PostmanFolder[] = [
    authFolder,
    {
      name: "GET",
      description: "Read-only requests across both API versions -- listing and fetching entries.",
      item: get,
    },
    {
      name: "POST",
      description:
        "Every request that is a real HTTP POST on the wire -- v1/v2 create, v2 search, and " +
        "v1's own POST-based update (v1 has no PATCH route).",
      item: post,
    },
    {
      name: "PATCH",
      description:
        "v2's real HTTP PATCH update route only. v1 has no PATCH route at all -- its update is " +
        "a POST, filed under the POST folder above.",
      item: patch,
    },
    {
      name: "DELETE",
      description: "Delete requests across both API versions.",
      item: del,
    },
  ];

  return {
    info: {
      name: `${projectName} — Public API`,
      description:
        `Generated from ${projectName}'s real content models and its actual public API routes ` +
        `(v1 legacy shim + v2). Every request inherits this collection's Bearer auth against the ` +
        `"apiKey" collection variable -- run the Auth folder's "Login" request first (set ` +
        `apiUsername/apiPassword, or paste a username/password credential's values there) and it ` +
        `fills that variable in for you, or paste a static project API key into it yourself ` +
        `(Collection > Variables, or the Authorization tab). IDs used in example URLs (e.g. "/1") ` +
        `are placeholders -- swap in a real entry ID from your own data.`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{apiKey}}", type: "string" }],
    },
    variable: [
      { key: "apiKey", value: "", type: "string" },
      { key: "projectUuid", value: uuid, type: "string" },
      { key: "apiUsername", value: "", type: "string" },
      { key: "apiPassword", value: "", type: "string" },
      { key: "refreshToken", value: "", type: "string" },
    ],
    item: folders,
  };
}
