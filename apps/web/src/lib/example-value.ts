// Shared "what does a real value for this field type look like" helper --
// used anywhere a content model's fields need to become realistic example
// JSON: the SDK Docs tab's curl examples, and the Postman collection
// export. One source of truth, so the two never drift apart from each
// other the way format.ts's duplicated date logic once did.

export interface ExampleField {
  name: string;
  type: string;
  options?: Record<string, unknown> | null;
}

export interface ExampleCollection {
  slug: string;
  fields: ExampleField[];
}

export function exampleValue(type: string, options?: Record<string, unknown> | null): unknown {
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
    case "relation":
      return 1;
    case "email":
      return "person@example.com";
    default:
      return "Example value";
  }
}

export function exampleBody(collection: ExampleCollection): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of collection.fields) {
    if ((field.options as { hiddenInAPI?: boolean } | null | undefined)?.hiddenInAPI) continue;
    body[field.name] = exampleValue(field.type, field.options);
  }
  return body;
}
