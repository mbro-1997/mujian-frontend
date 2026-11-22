const session = require('../session/storage');

// 同身份、同操作的并发提交共用第一次调用；失败重试仍交由业务服务恢复原请求编号。
module.exports = function originalCommand(send, identify) {
  const active = new Map();
  session.subscribe(() => active.clear());
  return function submit(...args) {
    const { slot, fingerprint } = identify(...args);
    const current = active.get(slot);
    if (current) {
      if (current.fingerprint === fingerprint) return current.promise;
      return Promise.reject(new Error('上次提交尚未结束，请等待原操作结果'));
    }
    const promise = send(...args).finally(() => {
      if (active.get(slot)?.promise === promise) active.delete(slot);
    });
    active.set(slot, { fingerprint, promise });
    return promise;
  };
};
