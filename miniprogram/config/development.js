// 手机与电脑连接同一局域网。换网络时只需更新 lanHost，再编译和预览。
const network = {
  mode: "lan",
  lanHost: "192.168.1.4",
  apiPort: 18080,
  debugPort: 19431,
};
const origin = (host, port) => "http://" + host + ":" + port;
module.exports = {
  ...network,
  localBaseUrl: origin("127.0.0.1", network.apiPort),
  lanBaseUrl: origin(network.lanHost, network.apiPort),
  debugLocalUrl: origin("127.0.0.1", network.debugPort),
  debugLanUrl: origin(network.lanHost, network.debugPort),
};
