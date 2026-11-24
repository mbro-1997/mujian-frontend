const api = require('../../services/trading'),
  ui = require('../../services/trading-page');
require('../../session/page')({
  data: { detail: null, busy: false, message: '' },
  onShow() {
    ui.show(this);
    return this.load();
  },
  onHide() {
    ui.hide(this);
  },
  onUnload() {
    ui.hide(this);
  },
  load() {
    return ui.run(this, async (current) => {
      const detail = await api.get('/api/me/factory-wechat-account');
      if (current())
        this.setData({
          detail: {
            ...detail,
            lastSyncedAtText: api.displayTime(detail.lastSyncedAt),
            label: api.labels[detail.accountStatus] || '待办理',
            profitLabel: {
              active: '已开通',
              pending: '开通中',
              restricted: '受限',
              unavailable: '未开通',
            }[detail.profitSharingStatus],
          },
        });
    });
  },
  async sync() {
    const result = await ui.run(this, () =>
      api.command('merchant-sync', '/api/me/factory-wechat-account/sync', {}),
    );
    if (result) return this.load();
  },
  async onboard() {
    if (!this.data.detail.onboardingAvailable) return;
    const result = await ui.run(this, () =>
      api.command('merchant-onboard', '/api/me/factory-wechat-account/onboarding', {
        expectedVersion: this.data.detail.version,
      }),
      '开户申请已提交',
    );
    if (result) return this.load();
  },
  copy() {
    const url = this.data.detail.actionUrl;
    if (url && /^https:\/\/pay\.weixin\.qq\.com\//.test(url)) wx.setClipboardData({ data: url });
  },
  recover() {
    return ui.run(this, async (current) => {
      for (const slot of ['merchant-sync', 'merchant-onboard'])
        if (api.pending.has(slot)) {
          await api.recover(slot);
          if (current()) this.tradeTimer = setTimeout(() => this.load(), 0);
          return;
        }
      throw new Error('没有待确认操作，请同步或刷新账户');
    });
  },
});
