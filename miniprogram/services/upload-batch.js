// 同时传两张。遇到错误停止取新任务，等待已发出的上传结束后交还表单。
module.exports = async function uploadBatch(jobs) {
  let cursor = 0,
    failure = null;
  async function work() {
    while (!failure && cursor < jobs.length) {
      const task = jobs[cursor++];
      try {
        await task();
      } catch (e) {
        failure = failure || e;
      }
    }
  }
  await Promise.all([work(), work()]);
  if (failure) throw failure;
};
