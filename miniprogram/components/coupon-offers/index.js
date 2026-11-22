const offers = require("../../services/coupon-activities");
const session = require("../../session/storage");

Component({
  data: {
    visible: false,
    items: [],
    loading: false,
    claiming: "",
    message: "",
    more: false,
  },
  lifetimes: {
    attached() {
      this.round = 0;
      this.unsubscribe = session.subscribe(() => this.close());
    },
    detached() {
      this.round++;
      this.unsubscribe?.();
    },
  },
  pageLifetimes: {
    hide() {
      this.close();
    },
  },
  methods: {
    close() {
      this.round++;
      this.setData({
        visible: false,
        items: [],
        loading: false,
        claiming: "",
        message: "",
        more: false,
      });
    },
    async open(userId) {
      if (userId && offers.prompted.has(userId)) return;
      this.close();
      const round = this.round,
        owner = session.capture();
      if (!owner.token) return;
      this.setData({ visible: !userId, loading: true });
      try {
        const result = await offers.discover();
        if (round !== this.round || !session.isCurrent(owner)) return;
        if (userId && (!result.items.length || offers.prompted.has(userId)))
          return;
        if (userId) offers.prompted.add(userId);
        this.page = 1;
        this.setData({
          visible: true,
          items: result.items.map(offers.card),
          more: result.items.length < Number(result.total),
        });
      } catch (error) {
        if (!userId && round === this.round && session.isCurrent(owner))
          this.setData({ message: error.message });
      } finally {
        if (round === this.round && session.isCurrent(owner))
          this.setData({ loading: false });
      }
    },
    retry() {
      return this.open();
    },
    async more() {
      if (this.data.loading || this.data.claiming || !this.data.more) return;
      const round = this.round,
        owner = session.capture();
      this.setData({ loading: true, message: "" });
      try {
        const result = await offers.discover(this.page + 1);
        if (round !== this.round || !session.isCurrent(owner)) return;
        this.page++;
        const ids = new Set(this.data.items.map((x) => x.activityId));
        this.setData({
          items: this.data.items.concat(
            result.items.filter((x) => !ids.has(x.activityId)).map(offers.card),
          ),
          more: this.page * result.pageSize < Number(result.total),
        });
      } catch (error) {
        if (round === this.round && session.isCurrent(owner))
          this.setData({ message: error.message });
      } finally {
        if (round === this.round && session.isCurrent(owner))
          this.setData({ loading: false });
      }
    },
    async claim(e) {
      if (this.data.claiming || this.data.loading) return;
      const id = e.currentTarget.dataset.id,
        round = this.round,
        owner = session.capture();
      this.setData({ claiming: id, message: "" });
      try {
        await offers.claim(id);
        if (round !== this.round || !session.isCurrent(owner)) return;
        this.setData({
          items: this.data.items.map((x) =>
            x.activityId === id ? { ...x, claimed: true } : x,
          ),
        });
        this.triggerEvent("claimed");
        // 资格集合已收缩，后续从第一页重新合并，避免偏移分页漏券。
        if (this.data.more) this.page = 0;
      } catch (error) {
        if (round === this.round && session.isCurrent(owner))
          this.setData({
            message: error.message + "。可再次点击原活动核对领取结果。",
          });
      } finally {
        if (round === this.round && session.isCurrent(owner))
          this.setData({ claiming: "" });
      }
    },
  },
});
