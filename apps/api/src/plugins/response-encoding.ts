import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Bodies smaller than this go out as they are: the encoding overhead isn't worth it. */
export const MIN_COMPRESS_BYTES = 1024;
const COMPRESSIBLE_TYPE = /^(application\/(json|xml|javascript)|text\/)|\+json/i;

type Encoding = "br" | "gzip";

/** Picks br, then gzip, from an Accept-Encoding header; q=0 refuses a coding. */
export function pickEncoding(header: string | undefined): Encoding | null {
  if (!header) return null;
  const accepted = new Set<string>();
  for (const entry of header.split(",")) {
    const [name, ...params] = entry.trim().toLowerCase().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    if (q && !(Number(q.slice(2)) > 0)) continue;
    if (name) accepted.add(name);
  }
  if (accepted.has("br")) return "br";
  if (accepted.has("gzip") || accepted.has("*")) return "gzip";
  return null;
}

function etagFor(body: string | Buffer): string {
  return `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
}

function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const weak = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some((tag) => tag.trim() === "*" || weak(tag) === weak(etag));
}

/**
 * onSend for JSON and text bodies:
 * - successful GETs get a weak ETag (answered with 304 on a matching If-None-Match) and,
 *   unless the route set one, `Cache-Control: private, no-cache`, since responses are per user;
 * - bodies of MIN_COMPRESS_BYTES or more are brotli- or gzip-encoded when the client accepts it.
 * Streams and bodies that already have a Content-Encoding pass through untouched.
 */
async function encodeResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
): Promise<unknown> {
  if (typeof payload !== "string" && !Buffer.isBuffer(payload)) return payload;

  if (request.method === "GET" && reply.statusCode === 200) {
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "private, no-cache");
    if (!reply.hasHeader("etag")) reply.header("etag", etagFor(payload));
    if (etagMatches(request.headers["if-none-match"], String(reply.getHeader("etag")))) {
      reply.code(304);
      reply.removeHeader("content-length");
      return "";
    }
  }

  if (request.method === "HEAD" || reply.hasHeader("content-encoding")) return payload;
  if (Buffer.byteLength(payload) < MIN_COMPRESS_BYTES) return payload;
  if (!COMPRESSIBLE_TYPE.test(String(reply.getHeader("content-type") ?? ""))) return payload;

  const vary = reply.getHeader("vary");
  if (!vary) reply.header("vary", "accept-encoding");
  else if (!/accept-encoding/i.test(String(vary))) reply.header("vary", `${vary}, accept-encoding`);

  const encoding = pickEncoding(request.headers["accept-encoding"]);
  if (!encoding) return payload;

  const encoded =
    encoding === "br"
      ? await brotliAsync(payload, {
          params: {
            // Quality 4 compresses JSON close to gzip -9 at a fraction of the CPU.
            [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(payload),
          },
        })
      : await gzipAsync(payload, { level: 6 });
  reply.header("content-encoding", encoding);
  reply.removeHeader("content-length");
  return encoded;
}

export const responseEncodingPlugin = fp(
  async (app) => {
    app.addHook("onSend", encodeResponse);
  },
  { name: "worn-response-encoding" },
);
