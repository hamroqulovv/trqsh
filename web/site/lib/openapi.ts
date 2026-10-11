import fs from "node:fs";
import yaml from "js-yaml";
import { openapiPath } from "./paths";

// The checked-in contract makes the reference build without a running backend.
// Deployed versions may differ; /openapi.yaml serves the deployed API contract.
type ObjectValue = Record<string, unknown>;
export interface ApiField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  constraints?: string;
}
export interface ApiSchema {
  name?: string;
  type: string;
  fields: ApiField[];
  definition: string;
}
export interface ApiParam extends ApiField {
  in: string;
}
export interface ApiResponse {
  status: string;
  description: string;
  mediaType?: string;
  schema?: ApiSchema;
}
export interface ApiOperation {
  id: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  auth: boolean;
  params: ApiParam[];
  requestBody?: { required: boolean; mediaType: string; schema?: ApiSchema };
  responses: ApiResponse[];
}
export interface ApiGroup {
  name: string;
  anchor: string;
  operations: ApiOperation[];
}
export interface ApiSpec {
  title: string;
  version: string;
  description?: string;
  servers: string[];
  groups: ApiGroup[];
  schemas: ApiSchema[];
}

const METHOD_ORDER = ["get", "post", "put", "patch", "delete"];
const GROUP_NAMES: Record<string, string> = {
  auth: "Authentication",
  account: "Account",
  me: "Profile & effective plan",
  "api-keys": "API keys",
  subdomains: "Reserved subdomains",
  domains: "Custom domains",
  usage: "Usage",
  orgs: "Organizations",
  tunnels: "Tunnel sessions",
  plans: "Plans",
  regions: "Regions",
  geo: "Location",
  remote: "QR remote control",
  billing: "Optional billing integration",
};
function object(value: unknown): ObjectValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue : {};
}
function resolve(value: unknown, doc: ObjectValue): ObjectValue {
  const schema = object(value);
  if (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/")) return schema;
  const target = schema.$ref.slice(2).split("/").reduce<unknown>(
    (node, key) => object(node)[key.replace(/~1/g, "/").replace(/~0/g, "~")], doc,
  );
  return { ...object(target), ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$ref")) };
}
function schemaType(value: unknown, doc: ObjectValue): string {
  const raw = object(value);
  const schema = resolve(value, doc);
  if (schema.type === "array") return schemaType(schema.items, doc) + "[]";
  if (typeof raw.$ref === "string") return raw.$ref.split("/").pop() ?? "object";
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (typeof schema.type === "string") return schema.type;
  if (schema.properties) return "object";
  if (schema.oneOf || schema.anyOf) return "union";
  return "any";
}
function constraints(schema: ObjectValue): string | undefined {
  const parts: string[] = [];
  if (schema.format) parts.push("format: " + String(schema.format));
  if (Array.isArray(schema.enum)) parts.push("values: " + schema.enum.map(String).join(", "));
  if ("default" in schema) parts.push("default: " + JSON.stringify(schema.default));
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "pattern"]) {
    if (key in schema) parts.push(key + ": " + String(schema[key]));
  }
  return parts.length ? parts.join("; ") : undefined;
}
// References in full definitions are preserved, avoiding recursion and making
// named schemas easy to identify. Top-level fields resolve their referenced type.
function shapeSchema(value: unknown, doc: ObjectValue): ApiSchema | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = object(value);
  const schema = resolve(raw, doc);
  const required = Array.isArray(schema.required) ? schema.required : [];
  const fields = Object.entries(object(schema.properties)).map(([name, value]) => {
    const field = resolve(value, doc);
    return {
      name, type: schemaType(value, doc), required: required.includes(name),
      description: typeof field.description === "string" ? field.description : undefined,
      constraints: constraints(field),
    };
  });
  return {
    name: typeof raw.$ref === "string" ? raw.$ref.split("/").pop() : undefined,
    type: schemaType(raw, doc), fields, definition: JSON.stringify(schema, null, 2),
  };
}
function contentShape(value: unknown, doc: ObjectValue) {
  const entries = Object.entries(object(value));
  const entry = entries.find(([type]) => type === "application/json") ?? entries[0];
  if (!entry) return undefined;
  const [mediaType, content] = entry;
  return { mediaType, schema: shapeSchema(object(content).schema, doc) };
}

export function loadOpenApi(): ApiSpec | null {
  let doc: ObjectValue;
  try {
    doc = object(yaml.load(fs.readFileSync(openapiPath, "utf8")));
  } catch {
    return null;
  }
  if (!Object.keys(doc).length) return null;
  const info = object(doc.info);
  const groups = new Map<string, ApiOperation[]>();

  for (const [path, value] of Object.entries(object(doc.paths))) {
    const methods = object(value);
    const segment = path.split("/").filter(Boolean)[0] ?? "misc";
    for (const method of METHOD_ORDER) {
      if (!methods[method]) continue;
      const op = object(methods[method]);
      const security = op.security ?? doc.security;
      const auth = Array.isArray(security) && security.length > 0;
      const parameterList = [
        ...(Array.isArray(methods.parameters) ? methods.parameters : []),
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ];
      const params: ApiParam[] = parameterList.map((value) => {
        const parameter = resolve(value, doc);
        return {
          name: String(parameter.name ?? ""),
          in: String(parameter.in ?? ""),
          required: Boolean(parameter.required),
          type: schemaType(parameter.schema, doc),
          description: typeof parameter.description === "string" ? parameter.description : undefined,
          constraints: constraints(resolve(parameter.schema, doc)),
        };
      });
      const body = resolve(op.requestBody, doc);
      const bodyContent = contentShape(body.content, doc);
      const responses = Object.entries(object(op.responses)).map(([status, value]) => {
        const response = resolve(value, doc);
        return {
          status, description: String(response.description ?? ""),
          ...contentShape(response.content, doc),
        };
      });
      const list = groups.get(segment) ?? [];
      list.push({
        id: (method + "-" + path).replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase(),
        method: method.toUpperCase(), path,
        summary: typeof op.summary === "string" ? op.summary : undefined,
        description: typeof op.description === "string" ? op.description : undefined,
        auth, params,
        requestBody: bodyContent ? { required: Boolean(body.required), ...bodyContent } : undefined,
        responses,
      });
      groups.set(segment, list);
    }
  }
  const keys = Object.keys(GROUP_NAMES).filter((key) => groups.has(key));
  for (const key of groups.keys()) if (!keys.includes(key)) keys.push(key);
  return {
    title: String(info.title ?? "trqsh Control API"),
    version: String(info.version ?? "1.0.0"),
    description: typeof info.description === "string" ? info.description : undefined,
    servers: Array.isArray(doc.servers) ? doc.servers.map((item) => String(object(item).url ?? "")).filter(Boolean) : [],
    groups: keys.map((key) => ({
      name: GROUP_NAMES[key] ?? key.replace(/-/g, " "),
      anchor: key, operations: groups.get(key) ?? [],
    })),
    schemas: Object.entries(object(object(doc.components).schemas)).flatMap(([name, value]) => {
      const schema = shapeSchema(value, doc);
      return schema ? [{ ...schema, name }] : [];
    }),
  };
}
