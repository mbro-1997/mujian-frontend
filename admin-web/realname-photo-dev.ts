// 开发服务器代浏览器向 COS 取实名证件图。原签名由 COS 校验，仅转发图片字节。
import { get } from "node:https";
import type { Plugin } from "vite";

export function realnamePhotoResources(): Plugin {
  return {
    name: "realname-photo-resources",
    configureServer(server) {
      server.middlewares.use("/__realname-photo", (request, response) => {
        const match = /^\/([a-z0-9-]+-[0-9]+\.cos\.[a-z0-9-]+\.myqcloud\.com)(\/dev\/d2-a\/verification\/realname\/[a-f0-9]{32}\/[a-f0-9]{32})(\?[^#\s]+)$/.exec(request.url ?? "");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        function fail(status: number) {
          if (response.headersSent) return response.destroy();
          response.statusCode = status;
          response.end();
        }
        if (request.method !== "GET" || !match || !new URLSearchParams(match[3]).has("q-signature")) {
          fail(404);
          return;
        }
        const upstream = get({ hostname: match[1], path: match[2] + match[3], timeout: 10000 }, image => {
          const type = image.headers["content-type"];
          const size = Number(image.headers["content-length"]);
          if (image.statusCode !== 200 || !["image/jpeg", "image/png"].includes(type ?? "") ||
              !Number.isSafeInteger(size) || size < 1 || size > 5 * 1024 * 1024) {
            image.destroy();
            fail(image.statusCode === 403 || image.statusCode === 404 ? image.statusCode : 502);
            return;
          }
          response.setHeader("Content-Type", type!);
          response.setHeader("Content-Length", size);
          image.on("error", () => fail(502));
          image.pipe(response);
        });
        upstream.on("error", () => fail(502));
        upstream.on("timeout", () => upstream.destroy());
        response.on("close", () => upstream.destroy());
      });
    },
  };
}
