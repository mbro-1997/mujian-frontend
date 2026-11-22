const test = require("node:test"), assert = require("node:assert/strict");
const { fixture, tick } = require("./support/d2-page-fixture.cjs");
test("late phone-login response cannot restore an old credential or context", async () => {
  const f = fixture();
  const result = f.registration.login("phone-code", []);
  await tick();
  f.session.replace("owner-B");
  f.pending[0].resolve({ sessionToken: "late-A", context: { userId: "A" } });
  await assert.rejects(result, { name: "StaleSessionError" });
  assert.equal(f.session.token(), "owner-B");
  assert.equal(f.app.globalData.context, null);
});
for (const domain of ["realname", "student"]) {
  test(domain + " late upload is discarded on account switch", async () => {
    const f = fixture(domain);
    const result = f.verification.upload(
      domain,
      "fictional.png",
      domain + "-material-v1",
      "front",
    );
    f.session.replace("owner-B");
    f.uploads[0].success({
      statusCode: 200,
      data: JSON.stringify({ code: "OK", data: { uploadId: "1".repeat(32) } }),
    });
    await assert.rejects(result, { name: "StaleSessionError" });
  });
  test(
    domain +
      " pending submit does not restore inputs, private command or navigate after logout",
    async () => {
      const f = fixture(domain),
        p = f.page;
      p.userId = "user-A";
      Object.assign(p.data, {
        current: {
          canSubmit: true,
          consent: { version: domain + "-material-v1" },
        },
        name: "虚构样本",
        card: "11010519491231002X",
        photos: ["a.png", "b.png"],
        agreed: true,
      });
      const result = p.submit();
      for (let i = 0; i < 2; i++) {
        await tick();
        f.uploads[i].success({
          statusCode: 200,
          data: JSON.stringify({
            code: "OK",
            data: { uploadId: String(i + 1).repeat(32) },
          }),
        });
      }
      await tick();
      assert.ok(p.command);
      assert.equal(f.pending.length, 1);
      f.session.clear();
      assert.equal(p.command, null);
      f.pending[0].resolve({ outcome: "created" });
      await result;
      assert.equal(p.data.name, "");
      assert.equal(p.data.card, "");
      assert.equal(p.data.photos.length, 0);
      assert.equal(p.command, null);
      assert.equal(f.navigations.length, 0);
      assert.equal(p.data.busy, false);
    },
  );
  test(
    domain +
      " reload retains only recovery identifier and disables missing-body retry",
    async () => {
      const f = fixture(domain),
        p = f.page;
      f.verification.remember(domain, "user-A", "a".repeat(32));
      const load = p.load();
      await tick();
      f.pending[0].resolve({
        application: null,
        canSubmit: true,
        realnameStatus: "unverified",
        consent: { version: domain + "-material-v1" },
      });
      await tick();
      f.pending[1].reject(
        Object.assign(new Error("not found"), { status: 404 }),
      );
      await load;
      assert.equal(p.data.unknown, true);
      assert.equal(p.data.canRetryOriginal, false);
      assert.equal(p.data.requestId, "a".repeat(32));
      assert.equal(
        [...f.storage.values()].some((v) => typeof v === "object"),
        false,
      );
      await p.retryOriginal();
      assert.equal(f.pending.length, 2);
    },
  );
}
test("closing login sheet before phone HTTP response cannot install a credential", async () => {
  const f = fixture();
  let active = true;
  const result = f.registration.login("phone-code", [], () => active);
  await tick();
  active = false;
  f.pending[0].resolve({
    sessionToken: "closed-sheet",
    context: { userId: "A" },
  });
  await assert.rejects(result, { name: "StaleSessionError" });
  assert.equal(f.session.token(), "owner-A");
  assert.equal(f.app.globalData.context, null);
});
test("inactive login sheet aborts before sending a consumed login code to backend", async () => {
  const f = fixture();
  await assert.rejects(
    f.registration.login("phone-code", [], () => false),
    { name: "StaleSessionError" },
  );
  assert.equal(f.pending.length, 0);
  assert.equal(f.session.token(), "owner-A");
});
