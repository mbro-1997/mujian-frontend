// 精确路径优先，参数仅匹配一个非空路径段。两份契约独立建索引。
module.exports = function indexRoutes(paths) {
  const parameters = Object.keys(paths).filter(path => path.includes("{")).map(path => {
    const segments = path.split("/").map(segment =>
      segment.startsWith("{") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    return { pattern: new RegExp("^" + segments.join("/") + "$"), methods: paths[path] };
  });
  return function match(url) {
    const path = url.split("?")[0];
    return paths[path] || parameters.find(route => route.pattern.test(path))?.methods;
  };
};
